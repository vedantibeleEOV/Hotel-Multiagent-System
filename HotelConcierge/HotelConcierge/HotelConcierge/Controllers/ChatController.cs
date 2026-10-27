using HotelConcierge.API.Data;
using HotelConcierge.DTOs;
using HotelConcierge.Models;
using HotelConcierge.Repositories;
using HotelConcierge.Service;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Text.RegularExpressions;

namespace HotelConcierge.Controllers
{
    [ApiController]
    [Route("api/chat")]
    public class ChatController : ControllerBase
    {
        private readonly IChatService _chatService;
        private readonly IHotelRepository _hotelRepository;
        private readonly HotelDbContext _context;
        private readonly IntentService _intentService;
        private readonly IOllamaService _ollamaService;
        private readonly IVoyageOpsClient _voyageOpsClient;
        private readonly IConfiguration _configuration;
        private readonly ILogger<ChatController> _logger;

        public ChatController(
            IChatService chatService,
            IHotelRepository hotelRepository,
            HotelDbContext context,
            IntentService intentService,
            IOllamaService ollamaService,
            IVoyageOpsClient voyageOpsClient,
            IConfiguration configuration,
            ILogger<ChatController> logger)
        {
            _chatService = chatService;
            _hotelRepository = hotelRepository;
            _context = context;
            _intentService = intentService;
            _ollamaService = ollamaService;
            _voyageOpsClient = voyageOpsClient;
            _configuration = configuration;
            _logger = logger;
        }

        // ─── Main Chat ────────────────────────────────────────────
        [HttpPost]
        public async Task<IActionResult> Chat(ChatRequestDto request)
        {
            // 1. Input Validation First
            if (string.IsNullOrWhiteSpace(request.Message))
            {
                return Ok(new ChatResponseDto
                {
                    Reply = "Please enter a message so I can assist you."
                });
            }

            var trimmedMessage = request.Message.Trim();

            if (trimmedMessage.Length > 500)
            {
                return Ok(new ChatResponseDto
                {
                    Reply = "Your message is too long. Please keep your request under 500 characters, or contact the front desk (Dial 0)."
                });
            }

            var roomNo = request.RoomNo ?? "";

            // 2. EMERGENCIES (highest priority, checked FIRST across entire message before every other rule)
            if (_intentService.IsEmergency(trimmedMessage))
            {
                var ticketCreated = await CreateEscalatedTicketAsync(request.HotelId, roomNo, trimmedMessage, "FrontDesk", "High");
                var emergencyReply = ticketCreated
                    ? "This sounds urgent. Please call the front desk right now on Dial 0. I have also alerted them."
                    : "Please call the front desk right now on Dial 0.";

                await SaveConversationAsync(request.SessionId, request.HotelId, roomNo, request.Message, emergencyReply, "Emergency");
                return Ok(new ChatResponseDto { Reply = emergencyReply });
            }

            var hotelInfo = await _hotelRepository.GetHotelInfoByIdAsync(request.HotelId);
            if (hotelInfo == null)
                return NotFound("Hotel not found.");

            // 3. Multi-request handling
            var subRequests = SplitSubRequests(trimmedMessage);

            // If the message is purely a hotel info inquiry (e.g. "What are the check-in and check-out timings?")
            // and contains no operational keywords, keep as a single request so Llama3.2 answers it as a whole
            if (subRequests.Count > 1 && _intentService.IsHotelInfoTopic(trimmedMessage) &&
                !_intentService.IsHousekeepingRequest(trimmedMessage) && !_intentService.IsMaintenanceRequest(trimmedMessage) &&
                !_intentService.IsFrontDeskRequest(trimmedMessage))
            {
                subRequests = new List<string> { trimmedMessage };
            }

            var replies = new List<string>();
            foreach (var sub in subRequests)
            {
                var subReply = await ProcessSubRequestAsync(request.HotelId, roomNo, sub, hotelInfo);
                if (!string.IsNullOrWhiteSpace(subReply))
                {
                    replies.Add(FixGrammar(subReply));
                }
            }

            if (replies.Count == 0)
            {
                replies.Add(OllamaService.SafeFallbackMessage);
            }

            var combinedReply = string.Join("\n", replies);

            await SaveConversationAsync(request.SessionId, request.HotelId, roomNo, request.Message, combinedReply, subRequests.Count > 1 ? "MultiRequest" : "SingleRequest");

            return Ok(new ChatResponseDto { Reply = combinedReply });
        }

        private async Task<string> ProcessSubRequestAsync(int hotelId, string roomNo, string subMessage, HotelInfo hotelInfo)
        {
            var trimmed = subMessage.Trim();
            if (string.IsNullOrWhiteSpace(trimmed)) return string.Empty;

            // 1. Emergency (if inside sub-request)
            if (_intentService.IsEmergency(trimmed))
            {
                var ticketCreated = await CreateEscalatedTicketAsync(hotelId, roomNo, trimmed, "FrontDesk", "High");
                return ticketCreated
                    ? "This sounds urgent. Please call the front desk right now on Dial 0. I have also alerted them."
                    : "Please call the front desk right now on Dial 0.";
            }

            // 2. Other room request ("cancel the request of room 406", "clean room 406")
            if (_intentService.IsOtherRoomRequest(trimmed, roomNo))
            {
                return "I can only help with requests for your own room, and I can't cancel requests here. Please contact the front desk (Dial 0).";
            }

            // 3. Cancel or change guest's OWN request ("cancel my towels", "change my request")
            if (_intentService.IsCancelOrChangeRequest(trimmed))
            {
                await CreateEscalatedTicketAsync(hotelId, roomNo, trimmed, "FrontDesk", "Medium");
                return "I can only help with requests for your own room, and I can't cancel requests here. Please contact the front desk (Dial 0).";
            }

            // 4. Unarranged items ("pillow case", "towel rack", etc.)
            if (_intentService.IsUnarrangedItem(trimmed))
            {
                return "Sorry, I can't arrange that item. Please contact the front desk (Dial 0).";
            }

            // 5. Invalid quantity (<= 0, e.g. "-3 pillows", "0 pillows")
            if (_intentService.IsInvalidQuantity(trimmed))
            {
                return "Please specify a valid quantity greater than 0.";
            }

            // 6. Noise or comfort complaints
            if (_intentService.IsNoiseComplaint(trimmed))
            {
                if (await HasOpenNoiseTaskAsync(roomNo))
                {
                    return "We are already working on this. Our team will assist you shortly.";
                }
                await CreateEscalatedTicketAsync(hotelId, roomNo, trimmed, "FrontDesk", "Medium");
                return "I'm sorry for the disturbance. I've informed our front desk and they will contact you shortly.";
            }

            // 7. Early check-in requests ("can I check in at 12", "I want to check in at 12 PM", "early check-in", "is my room ready")
            if (_intentService.IsEarlyCheckinRequest(trimmed))
            {
                return await HandleEarlyCheckinRequestAsync(hotelId, roomNo, trimmed);
            }

            // 8. Hotel-related but front desk requests (extend stay, bill, invoice, luggage, taxi, lost key, late checkout)
            if (_intentService.IsFrontDeskRequest(trimmed))
            {
                await CreateEscalatedTicketAsync(hotelId, roomNo, trimmed, "FrontDesk", "Medium");
                return "I've passed your request to our front desk. They will contact you shortly.";
            }

            // 8. Temperature / HVAC ("too hot", "too cold", "temperature", "not cooling")
            if (_intentService.IsTemperatureRequest(trimmed))
            {
                return await HandleMaintenanceRequestAsync(hotelId, roomNo, trimmed);
            }

            // 9. Greeting ("hello", "hi", "thanks")
            if (_intentService.IsGreeting(trimmed))
            {
                return "Hello! How can I help you today?";
            }

            // 10. Security / Prompt injection
            if (_intentService.IsSecurityOrInjection(trimmed))
            {
                return "Sorry, I can only help with room issues, housekeeping items and front desk requests.";
            }

            // 11. Local attractions ("nearby places to visit?")
            if (_intentService.IsLocalAttractions(trimmed))
            {
                return GetNearbyPlacesReply();
            }

            // 12. Housekeeping request (towels, pillows, water, etc.)
            if (_intentService.IsHousekeepingRequest(trimmed))
            {
                if (await IsRecentHousekeepingDuplicateAsync(roomNo, trimmed))
                {
                    return "I've already received this request.";
                }

                var normalized = IntentService.NormalizeQuantityWords(trimmed);
                return await HandleHousekeepingRequestAsync(hotelId, roomNo, normalized);
            }

            // 13. Maintenance request (repairs, plumbing, electrical, etc.)
            if (_intentService.IsMaintenanceRequest(trimmed))
            {
                return await HandleMaintenanceRequestAsync(hotelId, roomNo, trimmed);
            }

            // 14. Hotel info topics (wifi, breakfast, lunch, pool, gym, etc.) -> direct fixed text from HotelInfos
            if (_intentService.IsHotelInfoTopic(trimmed))
            {
                var directAnswer = OllamaService.GetFixedHotelInfoAnswer(trimmed, hotelInfo);
                if (!string.IsNullOrEmpty(directAnswer))
                {
                    return directAnswer;
                }

                var nearbyList = _configuration.GetSection("NearbyPlaces").Get<List<string>>() ?? new List<string>();
                return await _ollamaService.AnswerGeneralQuestionAsync(trimmed, hotelInfo, nearbyList);
            }

            // 15. Off-topic (cricket, jokes, general knowledge, gibberish, emoji)
            return "Sorry, I can only help with room issues, housekeeping items and front desk requests.";
        }

        // ─── Operational Handlers ─────────────────────────────────

        private async Task<string> HandleMaintenanceRequestAsync(int hotelId, string roomNo, string message)
        {
            var openStatuses = new[] { "Pending", "Assigned", "InProgress", "In Progress", "Escalated", "OnHold" };
            var cutoff = DateTime.UtcNow.AddHours(-12);
            var openTasks = await _context.Tasks
                .Where(t => t.RoomNo == roomNo && t.Department == "Maintenance" && openStatuses.Contains(t.Status) && t.CreatedDate >= cutoff)
                .ToListAsync();

            var matchingTasks = openTasks.Where(t =>
            {
                var tType = t.TaskType.ToLowerInvariant();
                var msg = message.ToLowerInvariant();
                if (tType == msg) return true;
                if ((tType.Contains("tap") || tType.Contains("leak") || tType.Contains("faucet")) &&
                    (msg.Contains("tap") || msg.Contains("leak") || msg.Contains("faucet"))) return true;
                if ((tType.Contains("ac") || tType.Contains("air") || tType.Contains("hot") || tType.Contains("cold") || tType.Contains("temperature") || tType.Contains("cooling")) &&
                    (msg.Contains("ac") || msg.Contains("air") || msg.Contains("hot") || msg.Contains("cold") || msg.Contains("temperature") || msg.Contains("cooling"))) return true;
                return false;
            }).ToList();

            foreach (var openTask in matchingTasks)
            {
                // Must have ExternalTaskId and still exist in Voyage Ops
                if (string.IsNullOrWhiteSpace(openTask.ExternalTaskId))
                {
                    continue; // A ticket with no ExternalTaskId must not block
                }

                var externalStatus = await _voyageOpsClient.GetTaskStatusAsync(openTask.ExternalTaskId);
                if (externalStatus == null || string.Equals(externalStatus.Status, "NOT_FOUND", StringComparison.OrdinalIgnoreCase))
                {
                    continue; // A 404 task must not block
                }

                return "We are already working on this. Our team will assist you shortly.";
            }

            var localTask = await CreateTaskAsync(hotelId, "Maintenance", message, roomNo);
            _logger.LogInformation("Sending maintenance issue to VoyageOps for RoomNo: {RoomNo}", roomNo);

            try
            {
                var voyageOpsResult = await _voyageOpsClient.ReportMaintenanceIssueAsync(roomNo, message);
                if (voyageOpsResult != null)
                {
                    _logger.LogInformation(
                        "Reported maintenance issue to Voyage Ops: IncidentId={IncidentId}, Category={Category}, Severity={Severity}, TechnicianName={TechnicianName}, SlaMinutes={SlaMinutes}",
                        voyageOpsResult.IncidentId,
                        voyageOpsResult.Category,
                        voyageOpsResult.Severity,
                        voyageOpsResult.TechnicianName,
                        voyageOpsResult.SlaMinutes);

                    localTask.ExternalTaskId = voyageOpsResult.OperationalTaskId;
                    localTask.ExternalIncidentId = voyageOpsResult.IncidentId;
                    await _context.SaveChangesAsync();

                    return "I'm sorry to hear that. Our maintenance team has been notified and will assist you shortly.";
                }

                localTask.Status = "Failed";
                await _context.SaveChangesAsync();
                return "Unable to report maintenance request to hotel system. Please contact the front desk (Dial 0).";
            }
            catch (Exception ex)
            {
                _logger.LogWarning("Error reporting maintenance issue to VoyageOps for Room {RoomNo}: {Message}", roomNo, ex.Message);
                return "Unable to reach hotel system. Please contact the front desk (Dial 0).";
            }
        }

        private async Task<string> HandleHousekeepingRequestAsync(int hotelId, string roomNo, string message)
        {
            var localHkTask = await CreateTaskAsync(hotelId, "Housekeeping", message, roomNo);
            var reply = "Our housekeeping team has been informed and will attend to your request shortly.";

            try
            {
                var voyageOpsResult = await _voyageOpsClient.ReportHousekeepingRequestAsync(roomNo, message);
                if (voyageOpsResult != null)
                {
                    if (!string.IsNullOrWhiteSpace(voyageOpsResult.GuestMessage))
                    {
                        reply = voyageOpsResult.GuestMessage;
                    }

                    var isEscalate = string.Equals(voyageOpsResult.Decision, "ESCALATE", StringComparison.OrdinalIgnoreCase);
                    var isReject = string.Equals(voyageOpsResult.Decision, "REJECT", StringComparison.OrdinalIgnoreCase);
                    var isApprove = string.Equals(voyageOpsResult.Decision, "APPROVE", StringComparison.OrdinalIgnoreCase)
                                    || !string.IsNullOrEmpty(voyageOpsResult.OperationalTaskId);

                    if (isEscalate)
                    {
                        localHkTask.Status = "Escalated";
                        localHkTask.ExternalTaskId = null;

                        var frontDeskMsg = new FrontDeskMessage
                        {
                            HotelId = hotelId,
                            RoomNo = roomNo,
                            GuestMessage = message,
                            StaffReply = "",
                            IsRead = false,
                            IsReplied = false,
                            CreatedDate = DateTime.UtcNow
                        };
                        _context.FrontDeskMessages.Add(frontDeskMsg);
                        await _context.SaveChangesAsync();

                        _logger.LogInformation(
                            "Housekeeping request decision: Decision={Decision}, Item={Item}, Quantity={Quantity}. Action on local task: Marked local TaskItem {TaskId} as Escalated for Front Desk queue.",
                            voyageOpsResult.Decision,
                            voyageOpsResult.Item ?? "N/A",
                            voyageOpsResult.Quantity,
                            localHkTask.TaskItemId);
                    }
                    else if (isReject)
                    {
                        _context.Tasks.Remove(localHkTask);
                        await _context.SaveChangesAsync();

                        _logger.LogInformation(
                            "Housekeeping request decision: Decision={Decision}, Item={Item}, Quantity={Quantity}. Action on local task: Removed local TaskItem {TaskId} from database.",
                            voyageOpsResult.Decision,
                            voyageOpsResult.Item ?? "N/A",
                            voyageOpsResult.Quantity,
                            localHkTask.TaskItemId);
                    }
                    else if (isApprove)
                    {
                        localHkTask.ExternalTaskId = voyageOpsResult.OperationalTaskId;
                        await _context.SaveChangesAsync();

                        _logger.LogInformation(
                            "Housekeeping request decision: Decision={Decision}, Item={Item}, Quantity={Quantity}. Action on local task: Updated local TaskItem {TaskId} with ExternalTaskId={ExternalTaskId}.",
                            voyageOpsResult.Decision ?? "APPROVE",
                            voyageOpsResult.Item ?? "N/A",
                            voyageOpsResult.Quantity,
                            localHkTask.TaskItemId,
                            voyageOpsResult.OperationalTaskId);

                        _logger.LogInformation(
                            "Reported housekeeping request to Voyage Ops: TaskId={TaskId}, AssignedStaffName={AssignedStaffName}, TaskStatus={TaskStatus}",
                            voyageOpsResult.OperationalTaskId,
                            voyageOpsResult.AssignedStaffName ?? voyageOpsResult.TechnicianName,
                            voyageOpsResult.TaskStatus);
                    }

                    return reply;
                }

                localHkTask.Status = "Failed";
                await _context.SaveChangesAsync();
                return "Unable to report housekeeping request to hotel system. Please contact the front desk (Dial 0).";
            }
            catch (Exception ex)
            {
                _logger.LogWarning("Error reporting housekeeping request to VoyageOps for Room {RoomNo}: {Message}", roomNo, ex.Message);
                return "Unable to reach hotel system. Please contact the front desk (Dial 0).";
            }
        }

        private async Task<bool> CreateEscalatedTicketAsync(int hotelId, string roomNo, string message, string department = "FrontDesk", string priority = "Medium")
        {
            try
            {
                var localTask = new TaskItem
                {
                    HotelId = hotelId,
                    RoomNo = roomNo,
                    Department = department,
                    TaskType = message,
                    Status = "Escalated",
                    Priority = priority,
                    CreatedDate = DateTime.UtcNow
                };
                _context.Tasks.Add(localTask);

                var frontDeskMsg = new FrontDeskMessage
                {
                    HotelId = hotelId,
                    RoomNo = roomNo,
                    GuestMessage = message,
                    StaffReply = "",
                    IsRead = false,
                    IsReplied = false,
                    CreatedDate = DateTime.UtcNow
                };
                _context.FrontDeskMessages.Add(frontDeskMsg);

                await _context.SaveChangesAsync();
                return true;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to create escalated ticket for Room {RoomNo}", roomNo);
                return false;
            }
        }

        private async Task<bool> HasOpenNoiseTaskAsync(string roomNo)
        {
            var openStatuses = new[] { "Pending", "Assigned", "InProgress", "In Progress", "Escalated", "OnHold" };
            var cutoff = DateTime.UtcNow.AddHours(-12);
            var openTasks = await _context.Tasks
                .Where(t => t.RoomNo == roomNo && openStatuses.Contains(t.Status) && t.CreatedDate >= cutoff)
                .ToListAsync();

            var matchingTasks = openTasks.Where(t =>
                Regex.IsMatch(t.TaskType, @"\b(noise|noisy|loud|music|construction|disturb)\b", RegexOptions.IgnoreCase))
                .ToList();

            foreach (var openTask in matchingTasks)
            {
                if (string.Equals(openTask.Department, "Maintenance", StringComparison.OrdinalIgnoreCase) && string.IsNullOrWhiteSpace(openTask.ExternalTaskId))
                {
                    continue; // Maintenance noise ticket without ExternalTaskId is stale
                }

                if (!string.IsNullOrWhiteSpace(openTask.ExternalTaskId))
                {
                    var externalStatus = await _voyageOpsClient.GetTaskStatusAsync(openTask.ExternalTaskId);
                    if (externalStatus == null || string.Equals(externalStatus.Status, "NOT_FOUND", StringComparison.OrdinalIgnoreCase))
                    {
                        continue; // A 404 task must not block
                    }
                }

                return true;
            }

            return false;
        }

        private async Task<bool> IsRecentHousekeepingDuplicateAsync(string roomNo, string message)
        {
            var cutoff = DateTime.UtcNow.AddSeconds(-60);
            var recentConvs = await _context.Conversations
                .Where(c => c.RoomNo == roomNo && c.CreatedDate >= cutoff)
                .ToListAsync();

            var cleanMsg = message.Trim().ToLowerInvariant();
            return recentConvs.Any(c =>
            {
                var prevMsg = c.UserMessage.Trim().ToLowerInvariant();
                return prevMsg == cleanMsg || prevMsg.Contains(cleanMsg) || cleanMsg.Contains(prevMsg);
            });
        }

        private async Task<string> HandleEarlyCheckinRequestAsync(int hotelId, string roomNo, string message)
        {
            // B4: The same message within 60 seconds gets "I've already received this request."
            if (await IsRecentEarlyCheckinMessageDuplicateAsync(roomNo, message))
            {
                return "I've already received this request.";
            }

            // B4: An open early check-in ticket for the same room gets "We are already working on this. Our team will assist you shortly."
            if (await HasOpenEarlyCheckinTicketAsync(roomNo))
            {
                return "We are already working on this. Our team will assist you shortly.";
            }

            // B2: Call VoyageOpsClient.PostEarlyCheckInAsync
            var result = await _voyageOpsClient.PostEarlyCheckInAsync(roomNo, message);

            // B3: FastAPI unreachable or error -> create Escalated ticket and return offline message
            if (result == null)
            {
                await CreateEscalatedTicketAsync(hotelId, roomNo, message, "FrontDesk", "Medium");
                return "I couldn't check this right now, so I've passed your early check-in request to our front desk. They will contact you shortly.";
            }

            var decision = result.Decision?.ToUpperInvariant();

            if (decision == "APPROVE")
            {
                return !string.IsNullOrWhiteSpace(result.GuestMessage)
                    ? result.GuestMessage
                    : "Your room will be ready for check-in.";
            }

            if (decision == "ESCALATE")
            {
                var priority = (!string.IsNullOrWhiteSpace(result.Reason) &&
                                result.Reason.Contains("VIP guest", StringComparison.OrdinalIgnoreCase))
                    ? "High"
                    : "Medium";

                await CreateEscalatedTicketAsync(hotelId, roomNo, message, "FrontDesk", priority);

                return !string.IsNullOrWhiteSpace(result.GuestMessage)
                    ? result.GuestMessage
                    : "I've passed your early check-in request to our front desk. They will contact you shortly.";
            }

            if (decision == "REJECT")
            {
                return !string.IsNullOrWhiteSpace(result.GuestMessage)
                    ? result.GuestMessage
                    : "I couldn't find a reservation for your room. Please contact the front desk (Dial 0).";
            }

            await CreateEscalatedTicketAsync(hotelId, roomNo, message, "FrontDesk", "Medium");
            return !string.IsNullOrWhiteSpace(result.GuestMessage)
                ? result.GuestMessage
                : "I couldn't check this right now, so I've passed your early check-in request to our front desk. They will contact you shortly.";
        }

        private async Task<bool> HasOpenEarlyCheckinTicketAsync(string roomNo)
        {
            var openStatuses = new[] { "Pending", "Assigned", "InProgress", "In Progress", "Escalated", "OnHold" };
            var openTasks = await _context.Tasks
                .Where(t => t.RoomNo == roomNo && openStatuses.Contains(t.Status))
                .ToListAsync();

            return openTasks.Any(t =>
                _intentService.IsEarlyCheckinRequest(t.TaskType) ||
                Regex.IsMatch(t.TaskType, @"\b(early[\s-]*check[\s-]*in|check[\s-]*in[\s-]*early|arrive[\s-]*early|room\s*ready|check[- ]?in)\b", RegexOptions.IgnoreCase));
        }

        private async Task<bool> IsRecentEarlyCheckinMessageDuplicateAsync(string roomNo, string message)
        {
            var cutoff = DateTime.UtcNow.AddSeconds(-60);
            var recentConvs = await _context.Conversations
                .Where(c => c.RoomNo == roomNo && c.CreatedDate >= cutoff)
                .ToListAsync();

            var cleanMsg = message.Trim().ToLowerInvariant();
            return recentConvs.Any(c =>
            {
                var prevMsg = c.UserMessage.Trim().ToLowerInvariant();
                return prevMsg == cleanMsg || prevMsg.Contains(cleanMsg) || cleanMsg.Contains(prevMsg);
            });
        }

        private static string FixGrammar(string text)
        {
            if (string.IsNullOrEmpty(text)) return text;
            text = Regex.Replace(text, @"\b1\s+pillows\b", "1 pillow", RegexOptions.IgnoreCase);
            text = Regex.Replace(text, @"\b1\s+towels\b", "1 towel", RegexOptions.IgnoreCase);
            text = Regex.Replace(text, @"\b1\s+blankets\b", "1 blanket", RegexOptions.IgnoreCase);
            text = Regex.Replace(text, @"\b1\s+bottles\b", "1 bottle", RegexOptions.IgnoreCase);
            return text;
        }

        private async Task SaveConversationAsync(string? sessionId, int hotelId, string roomNo, string userMessage, string botResponse, string intent)
        {
            try
            {
                _context.Conversations.Add(new Conversation
                {
                    SessionId = sessionId ?? "",
                    HotelId = hotelId,
                    RoomNo = roomNo,
                    UserMessage = userMessage,
                    BotResponse = botResponse,
                    Intent = intent,
                    IsFirstMessage = false,
                    CreatedDate = DateTime.UtcNow
                });
                await _context.SaveChangesAsync();
            }
            catch (Exception ex)
            {
                _logger.LogWarning("Failed to save conversation: {Message}", ex.Message);
            }
        }

        private string GetNearbyPlacesReply()
        {
            var nearby = _configuration.GetSection("NearbyPlaces").Get<List<string>>() ?? new List<string>();
            var filtered = nearby.Where(p => !string.IsNullOrWhiteSpace(p)).ToList();

            if (filtered.Count == 0)
            {
                return "For recommendations on nearby places to visit, please contact the front desk (Dial 0).";
            }

            var placesFormatted = string.Join("\n", filtered.Select(p => $"• {p}"));
            return $"Here are some recommended nearby places to visit:\n{placesFormatted}\nFor directions or further assistance, please contact the front desk (Dial 0).";
        }

        private static List<string> SplitSubRequests(string message)
        {
            if (string.IsNullOrWhiteSpace(message)) return new List<string>();

            var protectedMsg = Regex.Replace(message, @"\blost\s+and\s+found\b", "lost_and_found", RegexOptions.IgnoreCase);

            var parts = Regex.Split(protectedMsg, @"\s+and\s+|,\s*|\s*;\s*", RegexOptions.IgnoreCase);
            var results = new List<string>();
            foreach (var p in parts)
            {
                var restored = p.Replace("lost_and_found", "lost and found").Trim();
                if (restored.Length > 0)
                {
                    results.Add(restored);
                }
            }
            return results;
        }

        private async Task<TaskItem> CreateTaskAsync(
            int hotelId, string department,
            string message, string roomNo)
        {
            var task = new TaskItem
            {
                HotelId = hotelId,
                RoomNo = roomNo,
                Department = department,
                TaskType = message,
                Status = "Pending",
                Priority = "Medium",
                CreatedDate = DateTime.UtcNow
            };
            _context.Tasks.Add(task);
            await _context.SaveChangesAsync();
            return task;
        }

        // ─── QR Validation ────────────────────────────────────────
        [HttpPost("validate-qr")]
        public async Task<IActionResult> ValidateQR(QRScanDto request)
        {
            var hotel = await _context.HotelInfos
                .FirstOrDefaultAsync(h =>
                    h.HotelName.ToLower() == request.HotelName.ToLower());

            if (hotel == null)
                return Ok(new QRValidationResponseDto
                {
                    IsValid = false,
                    Message = "Hotel not found."
                });

            var room = await _context.Rooms
                .FirstOrDefaultAsync(r =>
                    r.HotelId == hotel.Id &&
                    r.RoomNo == request.RoomNo);

            if (room == null)
                return Ok(new QRValidationResponseDto
                {
                    IsValid = false,
                    Message = "Room not found."
                });

            return Ok(new QRValidationResponseDto
            {
                IsValid = true,
                HotelId = hotel.Id,
                HotelName = hotel.HotelName,
                RoomNo = room.RoomNo,
                RoomType = room.RoomType,
                Message = "Valid"
            });
        }

        // ─── Hotels ───────────────────────────────────────────────
        [HttpGet("hotels")]
        public async Task<IActionResult> GetHotels()
        {
            var hotels = await _hotelRepository.GetAllHotelsAsync();
            return Ok(hotels);
        }

        // ─── Admin / Debug ────────────────────────────────────────
        [HttpGet("embedding-test")]
        public async Task<IActionResult> TestEmbedding(
            [FromServices] IEmbeddingService embeddingService)
        {
            var vector = await embeddingService
                .GenerateEmbeddingAsync("Lunch timing");
            return Ok(new { Dimensions = vector.Count });
        }

        [HttpGet("chroma-test")]
        public async Task<IActionResult> ChromaTest()
        {
            using var client = new HttpClient();
            var response = await client.GetAsync(
                "http://localhost:8001/api/v2/heartbeat");
            return Ok(await response.Content.ReadAsStringAsync());
        }

        [HttpGet("create-collection")]
        public async Task<IActionResult> CreateCollection(
            [FromServices] IChromaService chromaService)
        {
            await chromaService.CreateCollectionAsync();
            return Ok("Collection Created");
        }

        [HttpGet("sync-hotel/{hotelId}")]
        public async Task<IActionResult> SyncHotel(
            int hotelId,
            [FromServices] IChromaService chromaService)
        {
            var hotel = await _hotelRepository
                .GetHotelInfoByIdAsync(hotelId);
            if (hotel == null) return NotFound();
            await chromaService.SyncHotelAsync(hotel);
            return Ok("Hotel Synced");
        }

        [HttpGet("collections")]
        public async Task<IActionResult> Collections(
            [FromServices] IChromaService chromaService)
        {
            return Ok(await chromaService.GetCollectionsAsync());
        }

        [HttpGet("collection-data")]
        public async Task<IActionResult> CollectionData(
            [FromServices] IChromaService chromaService)
        {
            return Ok(await chromaService.GetCollectionDataAsync());
        }

        [HttpGet("search")]
        public async Task<IActionResult> Search(
            string query, int hotelId,
            [FromServices] IChromaService chromaService)
        {
            return Ok(await chromaService.SearchAsync(query, hotelId));
        }

        [HttpDelete("delete-collection")]
        public async Task<IActionResult> DeleteCollection(
            [FromServices] IChromaService chromaService)
        {
            await chromaService.DeleteCollectionAsync();
            return Ok("Collection deleted");
        }

        [HttpGet("upsert-hotel/{hotelId}")]
        public async Task<IActionResult> UpsertHotel(
            int hotelId,
            [FromServices] IChromaService chromaService)
        {
            var hotel = await _hotelRepository
                .GetHotelInfoByIdAsync(hotelId);
            if (hotel == null) return NotFound();
            await chromaService.UpdateMetadataAsync(hotel);
            return Ok("Hotel Upserted");
        }
    }
}