using System.Collections.Concurrent;
using System.Globalization;
using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;

namespace HotelConcierge.Service
{
    public class VoyageOpsClient : IVoyageOpsClient
    {
        private readonly HttpClient _httpClient;
        private readonly IConfiguration _configuration;
        private readonly ILogger<VoyageOpsClient> _logger;

        private static string? _cachedToken;
        private static readonly SemaphoreSlim _authLock = new(1, 1);
        private static readonly ConcurrentDictionary<string, int> _roomToIdCache = new(StringComparer.OrdinalIgnoreCase);

        public VoyageOpsClient(
            HttpClient httpClient,
            IConfiguration configuration,
            ILogger<VoyageOpsClient> logger)
        {
            _httpClient = httpClient;
            _configuration = configuration;
            _logger = logger;
        }

        public async Task<VoyageOpsResult?> ReportMaintenanceIssueAsync(string roomNo, string guestMessage)
        {
            try
            {
                var enabled = _configuration.GetValue<bool?>("VoyageOps:Enabled") ?? true;
                if (!enabled)
                {
                    _logger.LogWarning("VoyageOps integration is disabled in configuration.");
                    return null;
                }

                var cleanRoomNo = roomNo?.Trim() ?? string.Empty;
                if (string.IsNullOrWhiteSpace(cleanRoomNo))
                {
                    _logger.LogWarning("Cannot report maintenance issue to VoyageOps: Room number is empty.");
                    return null;
                }

                // 1. Resolve room number to room ID (with caching)
                var roomId = await GetRoomIdAsync(cleanRoomNo);
                if (!roomId.HasValue)
                {
                    _logger.LogWarning("Cannot report maintenance issue to VoyageOps: Could not resolve room ID for '{RoomNo}'.", cleanRoomNo);
                    return null;
                }

                // 2. Format description: only the guest message, trimmed (no prefix, no room number)
                var description = guestMessage?.Trim() ?? string.Empty;
                if (description.Length < 5)
                {
                    _logger.LogWarning("Cannot report maintenance issue to VoyageOps: Description is shorter than 5 characters ('{Description}').", description);
                    return null;
                }

                if (description.Length > 500)
                {
                    description = description.Substring(0, 500);
                }

                // 3. Obtain authentication token
                var token = await GetTokenAsync();
                if (string.IsNullOrEmpty(token))
                {
                    _logger.LogWarning("Cannot report maintenance issue to VoyageOps: Authentication token is unavailable.");
                    return null;
                }

                // 4. POST maintenance issue
                var payload = new
                {
                    room_id = roomId.Value,
                    description = description
                };

                var postResult = await SendMaintenanceIssueAsync(payload, token);

                // Auto-retry once on 401 Unauthorized
                if (postResult.StatusCode == HttpStatusCode.Unauthorized)
                {
                    _logger.LogWarning("VoyageOps returned 401 on maintenance issue submission. Re-authenticating and retrying once...");
                    token = await GetTokenAsync(forceRefresh: true);
                    if (string.IsNullOrEmpty(token))
                    {
                        _logger.LogWarning("VoyageOps re-login failed after 401 on maintenance issue submission.");
                        return null;
                    }

                    postResult = await SendMaintenanceIssueAsync(payload, token);
                }

                if (postResult.StatusCode != HttpStatusCode.Accepted)
                {
                    _logger.LogWarning(
                        "VoyageOps maintenance issue report failed with HTTP {StatusCode}. Body: {Body}",
                        (int)postResult.StatusCode,
                        postResult.Body);
                    return null;
                }

                // 5. Parse 202 Accepted response
                return ParseMaintenanceResult(postResult.Body);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Unexpected error in VoyageOps ReportMaintenanceIssueAsync for Room {RoomNo}.", roomNo);
                return null;
            }
        }

        public async Task<VoyageOpsResult?> ReportHousekeepingRequestAsync(string roomNo, string guestMessage)
        {
            try
            {
                var enabled = _configuration.GetValue<bool?>("VoyageOps:Enabled") ?? true;
                if (!enabled)
                {
                    _logger.LogWarning("VoyageOps integration is disabled in configuration.");
                    return null;
                }

                var cleanRoomNo = roomNo?.Trim() ?? string.Empty;
                if (string.IsNullOrWhiteSpace(cleanRoomNo))
                {
                    _logger.LogWarning("Cannot report housekeeping request to VoyageOps: Room number is empty.");
                    return null;
                }

                // 1. Resolve room number to room ID (with caching)
                var roomId = await GetRoomIdAsync(cleanRoomNo);
                if (!roomId.HasValue)
                {
                    _logger.LogWarning("Cannot report housekeeping request to VoyageOps: Could not resolve room ID for '{RoomNo}'.", cleanRoomNo);
                    return null;
                }

                // 2. Format description: only the guest message, trimmed (no prefix, no room number)
                var description = guestMessage?.Trim() ?? string.Empty;
                if (description.Length < 3)
                {
                    _logger.LogWarning("Cannot report housekeeping request to VoyageOps: Description is shorter than 3 characters ('{Description}').", description);
                    return null;
                }

                if (description.Length > 500)
                {
                    description = description.Substring(0, 500);
                }

                // 3. Obtain authentication token
                var token = await GetTokenAsync();
                if (string.IsNullOrEmpty(token))
                {
                    _logger.LogWarning("Cannot report housekeeping request to VoyageOps: Authentication token is unavailable.");
                    return null;
                }

                // 4. POST housekeeping request
                var payload = new
                {
                    room_id = roomId.Value,
                    description = description
                };

                var postResult = await SendHousekeepingRequestAsync(payload, token);

                // Auto-retry once on 401 Unauthorized
                if (postResult.StatusCode == HttpStatusCode.Unauthorized)
                {
                    _logger.LogWarning("VoyageOps returned 401 on housekeeping request submission. Re-authenticating and retrying once...");
                    token = await GetTokenAsync(forceRefresh: true);
                    if (string.IsNullOrEmpty(token))
                    {
                        _logger.LogWarning("VoyageOps re-login failed after 401 on housekeeping request submission.");
                        return null;
                    }

                    postResult = await SendHousekeepingRequestAsync(payload, token);
                }

                if (postResult.StatusCode != HttpStatusCode.Accepted)
                {
                    _logger.LogWarning(
                        "VoyageOps housekeeping request report failed with HTTP {StatusCode}. Body: {Body}",
                        (int)postResult.StatusCode,
                        postResult.Body);
                    return null;
                }

                // 5. Parse 202 Accepted response
                return ParseHousekeepingResult(postResult.Body);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Unexpected error in VoyageOps ReportHousekeepingRequestAsync for Room {RoomNo}.", roomNo);
                return null;
            }
        }

        public async Task<VoyageOpsTaskStatus?> GetTaskStatusAsync(string externalTaskId)
        {
            try
            {
                var enabled = _configuration.GetValue<bool?>("VoyageOps:Enabled") ?? true;
                if (!enabled)
                {
                    _logger.LogWarning("VoyageOps integration is disabled in configuration.");
                    return null;
                }

                var cleanTaskId = externalTaskId?.Trim() ?? string.Empty;
                if (string.IsNullOrWhiteSpace(cleanTaskId))
                {
                    _logger.LogWarning("Cannot get task status from VoyageOps: ExternalTaskId is empty.");
                    return null;
                }

                var token = await GetTokenAsync();
                if (string.IsNullOrEmpty(token))
                {
                    _logger.LogWarning("Cannot get task status from VoyageOps: Authentication token is unavailable.");
                    return null;
                }

                var endpoint = GetEndpointUri($"api/tasks/{Uri.EscapeDataString(cleanTaskId)}/detail");

                using var request = new HttpRequestMessage(HttpMethod.Get, endpoint);
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

                var response = await _httpClient.SendAsync(request);

                // Re-login once automatically on 401
                if (response.StatusCode == HttpStatusCode.Unauthorized)
                {
                    _logger.LogWarning("VoyageOps returned 401 on task detail for Task {TaskId}. Re-authenticating and retrying once...", cleanTaskId);
                    token = await GetTokenAsync(forceRefresh: true);
                    if (string.IsNullOrEmpty(token))
                    {
                        _logger.LogWarning("VoyageOps re-login failed during task detail lookup.");
                        return null;
                    }

                    using var retryRequest = new HttpRequestMessage(HttpMethod.Get, endpoint);
                    retryRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
                    response = await _httpClient.SendAsync(retryRequest);
                }

                if (!response.IsSuccessStatusCode)
                {
                    if (response.StatusCode == HttpStatusCode.NotFound)
                    {
                        _logger.LogInformation("VoyageOps task detail for Task {TaskId} returned HTTP 404 (Not Found).", cleanTaskId);
                        return new VoyageOpsTaskStatus { Status = "NOT_FOUND" };
                    }

                    var error = await response.Content.ReadAsStringAsync();
                    _logger.LogWarning(
                        "VoyageOps task detail request for Task {TaskId} failed with HTTP {StatusCode}. Body: {Body}",
                        cleanTaskId,
                        (int)response.StatusCode,
                        error);
                    return null;
                }

                var responseBody = await response.Content.ReadAsStringAsync();
                using var doc = JsonDocument.Parse(responseBody);
                var root = doc.RootElement;

                if (!root.TryGetProperty("status", out var statusProp) || statusProp.ValueKind == JsonValueKind.Null)
                {
                    _logger.LogWarning("VoyageOps task detail for Task {TaskId} did not contain 'status'. Response: {Body}", cleanTaskId, responseBody);
                    return null;
                }

                var taskStatus = new VoyageOpsTaskStatus
                {
                    Status = statusProp.GetString() ?? string.Empty
                };

                if (root.TryGetProperty("assigned_staff", out var staffProp) && staffProp.ValueKind == JsonValueKind.Object)
                {
                    if (staffProp.TryGetProperty("name", out var nameProp) && nameProp.ValueKind == JsonValueKind.String)
                    {
                        taskStatus.AssignedStaffName = nameProp.GetString();
                    }
                }

                if (root.TryGetProperty("started_at", out var startedProp) && startedProp.ValueKind != JsonValueKind.Null)
                {
                    var startedAtStr = startedProp.ValueKind == JsonValueKind.String
                        ? startedProp.GetString()
                        : startedProp.ToString();

                    if (!string.IsNullOrWhiteSpace(startedAtStr) &&
                        DateTimeOffset.TryParse(startedAtStr, CultureInfo.InvariantCulture, out var startedOffset))
                    {
                        taskStatus.StartedAt = startedOffset.UtcDateTime;
                    }
                }

                return taskStatus;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Unexpected error in VoyageOps GetTaskStatusAsync for Task {TaskId}.", externalTaskId);
                return null;
            }
        }

        private async Task<(HttpStatusCode StatusCode, string Body)> SendMaintenanceIssueAsync(object payload, string token)
        {
            var json = JsonSerializer.Serialize(payload);
            using var request = new HttpRequestMessage(HttpMethod.Post, GetEndpointUri("api/events/maintenance-issue"));
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            request.Content = new StringContent(json, Encoding.UTF8, "application/json");

            var response = await _httpClient.SendAsync(request);
            var body = await response.Content.ReadAsStringAsync();
            return (response.StatusCode, body);
        }

        private async Task<(HttpStatusCode StatusCode, string Body)> SendHousekeepingRequestAsync(object payload, string token)
        {
            var json = JsonSerializer.Serialize(payload);
            using var request = new HttpRequestMessage(HttpMethod.Post, GetEndpointUri("api/events/housekeeping-request"));
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            request.Content = new StringContent(json, Encoding.UTF8, "application/json");

            var response = await _httpClient.SendAsync(request);
            var body = await response.Content.ReadAsStringAsync();
            return (response.StatusCode, body);
        }

        private async Task<int?> GetRoomIdAsync(string roomNo)
        {
            if (_roomToIdCache.TryGetValue(roomNo, out var cachedId))
            {
                return cachedId;
            }

            var token = await GetTokenAsync();
            if (string.IsNullOrEmpty(token))
            {
                _logger.LogWarning("VoyageOps room resolution skipped: Authentication token is null.");
                return null;
            }

            var endpoint = GetEndpointUri($"api/rooms/{Uri.EscapeDataString(roomNo)}/details");

            using var request = new HttpRequestMessage(HttpMethod.Get, endpoint);
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

            var response = await _httpClient.SendAsync(request);

            // Re-login once automatically on 401
            if (response.StatusCode == HttpStatusCode.Unauthorized)
            {
                _logger.LogWarning("VoyageOps returned 401 on room details for Room {RoomNo}. Re-authenticating and retrying once...", roomNo);
                token = await GetTokenAsync(forceRefresh: true);
                if (string.IsNullOrEmpty(token))
                {
                    _logger.LogWarning("VoyageOps re-login failed during room details resolution.");
                    return null;
                }

                using var retryRequest = new HttpRequestMessage(HttpMethod.Get, endpoint);
                retryRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
                response = await _httpClient.SendAsync(retryRequest);
            }

            if (!response.IsSuccessStatusCode)
            {
                var error = await response.Content.ReadAsStringAsync();
                _logger.LogWarning(
                    "VoyageOps room details request for Room {RoomNo} failed with HTTP {StatusCode}. Body: {Body}",
                    roomNo,
                    (int)response.StatusCode,
                    error);
                return null;
            }

            var responseBody = await response.Content.ReadAsStringAsync();
            using var doc = JsonDocument.Parse(responseBody);
            if (doc.RootElement.TryGetProperty("id", out var idProp) && idProp.TryGetInt32(out var resolvedId))
            {
                _roomToIdCache[roomNo] = resolvedId;
                return resolvedId;
            }

            _logger.LogWarning("VoyageOps room details for Room {RoomNo} did not contain integer 'id'. Response: {Body}", roomNo, responseBody);
            return null;
        }

        private async Task<string?> GetTokenAsync(bool forceRefresh = false)
        {
            if (!forceRefresh && !string.IsNullOrEmpty(_cachedToken))
            {
                return _cachedToken;
            }

            await _authLock.WaitAsync();
            try
            {
                if (!forceRefresh && !string.IsNullOrEmpty(_cachedToken))
                {
                    return _cachedToken;
                }

                var username = _configuration["VoyageOps:Username"];
                var password = _configuration["VoyageOps:Password"];

                if (string.IsNullOrWhiteSpace(username) || string.IsNullOrWhiteSpace(password))
                {
                    _logger.LogWarning("VoyageOps credentials (Username/Password) are not configured.");
                    _cachedToken = null;
                    return null;
                }

                var loginPayload = new
                {
                    username = username,
                    password = password
                };

                var json = JsonSerializer.Serialize(loginPayload);
                using var request = new HttpRequestMessage(HttpMethod.Post, GetEndpointUri("api/auth/login"))
                {
                    Content = new StringContent(json, Encoding.UTF8, "application/json")
                };

                var response = await _httpClient.SendAsync(request);
                var responseBody = await response.Content.ReadAsStringAsync();

                if (!response.IsSuccessStatusCode)
                {
                    _logger.LogWarning(
                        "VoyageOps login failed with HTTP {StatusCode}. Body: {Body}",
                        (int)response.StatusCode,
                        responseBody);
                    _cachedToken = null;
                    return null;
                }

                using var doc = JsonDocument.Parse(responseBody);
                if (doc.RootElement.TryGetProperty("access_token", out var tokenProp))
                {
                    _cachedToken = tokenProp.GetString();
                    return _cachedToken;
                }

                _logger.LogWarning("VoyageOps login response missing 'access_token'. Response: {Body}", responseBody);
                _cachedToken = null;
                return null;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Exception during VoyageOps login.");
                _cachedToken = null;
                return null;
            }
            finally
            {
                _authLock.Release();
            }
        }

        private VoyageOpsResult? ParseMaintenanceResult(string json)
        {
            try
            {
                using var doc = JsonDocument.Parse(json);
                var root = doc.RootElement;

                if (!root.TryGetProperty("maintenance", out var maint))
                {
                    _logger.LogWarning("VoyageOps response did not contain 'maintenance' property. Response: {Body}", json);
                    return null;
                }

                var result = new VoyageOpsResult();

                if (maint.TryGetProperty("incident_id", out var incProp) && incProp.ValueKind != JsonValueKind.Null)
                {
                    result.IncidentId = incProp.ValueKind == JsonValueKind.String ? incProp.GetString() : incProp.ToString();
                }

                if (maint.TryGetProperty("operational_task_id", out var taskIdProp) && taskIdProp.ValueKind != JsonValueKind.Null)
                {
                    result.OperationalTaskId = taskIdProp.ValueKind == JsonValueKind.String ? taskIdProp.GetString() : taskIdProp.ToString();
                }

                if (maint.TryGetProperty("category", out var catProp) && catProp.ValueKind != JsonValueKind.Null)
                {
                    result.Category = catProp.GetString();
                }

                if (maint.TryGetProperty("severity", out var sevProp) && sevProp.ValueKind != JsonValueKind.Null)
                {
                    result.Severity = sevProp.GetString();
                }

                if (maint.TryGetProperty("assigned_technician_name", out var techProp) && techProp.ValueKind != JsonValueKind.Null)
                {
                    result.TechnicianName = techProp.GetString();
                }

                if (maint.TryGetProperty("sla_minutes", out var slaProp) && slaProp.ValueKind == JsonValueKind.Number && slaProp.TryGetInt32(out var sla))
                {
                    result.SlaMinutes = sla;
                }

                return result;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to parse VoyageOps maintenance response JSON. Response: {Body}", json);
                return null;
            }
        }

        private VoyageOpsResult? ParseHousekeepingResult(string json)
        {
            try
            {
                using var doc = JsonDocument.Parse(json);
                var root = doc.RootElement;

                string? decision = null;
                string? guestMessage = null;
                string? item = null;
                int? quantity = null;

                if (root.TryGetProperty("guest_operations", out var guestOps) && guestOps.ValueKind == JsonValueKind.Object)
                {
                    if (guestOps.TryGetProperty("decision", out var decProp) && decProp.ValueKind == JsonValueKind.String)
                    {
                        decision = decProp.GetString();
                    }

                    if (guestOps.TryGetProperty("guest_message", out var msgProp) && msgProp.ValueKind == JsonValueKind.String)
                    {
                        guestMessage = msgProp.GetString();
                    }

                    if (guestOps.TryGetProperty("item", out var itemProp) && itemProp.ValueKind == JsonValueKind.String)
                    {
                        item = itemProp.GetString();
                    }

                    if (guestOps.TryGetProperty("quantity", out var qtyProp))
                    {
                        if (qtyProp.ValueKind == JsonValueKind.Number && qtyProp.TryGetInt32(out var q))
                        {
                            quantity = q;
                        }
                        else if (qtyProp.ValueKind == JsonValueKind.String && int.TryParse(qtyProp.GetString(), out var qStr))
                        {
                            quantity = qStr;
                        }
                    }
                }

                var isEscalateOrReject = string.Equals(decision, "ESCALATE", StringComparison.OrdinalIgnoreCase) ||
                                         string.Equals(decision, "REJECT", StringComparison.OrdinalIgnoreCase);

                if (isEscalateOrReject)
                {
                    return new VoyageOpsResult
                    {
                        Decision = decision,
                        GuestMessage = guestMessage,
                        Item = item,
                        Quantity = quantity,
                        OperationalTaskId = null
                    };
                }

                if (!root.TryGetProperty("housekeeping", out var hk) || hk.ValueKind != JsonValueKind.Object)
                {
                    _logger.LogWarning("VoyageOps response did not contain 'housekeeping' property. Response: {Body}", json);
                    return null;
                }

                var result = new VoyageOpsResult
                {
                    Decision = decision,
                    GuestMessage = guestMessage,
                    Item = item,
                    Quantity = quantity
                };

                if (hk.TryGetProperty("task_id", out var taskIdProp) && taskIdProp.ValueKind != JsonValueKind.Null)
                {
                    result.OperationalTaskId = taskIdProp.ValueKind == JsonValueKind.String ? taskIdProp.GetString() : taskIdProp.ToString();
                }

                if (hk.TryGetProperty("assigned_staff_name", out var staffProp) && staffProp.ValueKind != JsonValueKind.Null)
                {
                    var staffName = staffProp.GetString();
                    result.AssignedStaffName = staffName;
                    result.TechnicianName = staffName;
                }

                if (hk.TryGetProperty("task_status", out var taskStatusProp) && taskStatusProp.ValueKind != JsonValueKind.Null)
                {
                    result.TaskStatus = taskStatusProp.GetString();
                }

                return result;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to parse VoyageOps housekeeping response JSON. Response: {Body}", json);
                return null;
            }
        }

        private Uri GetEndpointUri(string relativePath)
        {
            var baseUri = _httpClient.BaseAddress;
            if (baseUri == null)
            {
                var configuredBaseUrl = _configuration["VoyageOps:BaseUrl"] ?? "http://localhost:8000";
                if (!configuredBaseUrl.EndsWith("/"))
                    configuredBaseUrl += "/";
                baseUri = new Uri(configuredBaseUrl);
            }

            return new Uri(baseUri, relativePath.TrimStart('/'));
        }

        public async Task<EarlyCheckInResult?> PostEarlyCheckInAsync(string roomNo, string message)
        {
            try
            {
                var enabled = _configuration.GetValue<bool?>("VoyageOps:Enabled") ?? true;
                if (!enabled)
                {
                    _logger.LogWarning("VoyageOps integration is disabled in configuration.");
                    return null;
                }

                var cleanRoomNo = roomNo?.Trim() ?? string.Empty;
                var cleanMessage = message?.Trim() ?? string.Empty;

                var token = await GetTokenAsync();
                if (string.IsNullOrEmpty(token))
                {
                    _logger.LogWarning("Cannot submit early check-in to VoyageOps: Authentication token is unavailable.");
                    return null;
                }

                var payload = new
                {
                    room_number = cleanRoomNo,
                    message = cleanMessage
                };

                var postResult = await SendEarlyCheckInRequestAsync(payload, token);

                // Auto-retry once on 401 Unauthorized
                if (postResult.StatusCode == HttpStatusCode.Unauthorized)
                {
                    _logger.LogWarning("VoyageOps returned 401 on early check-in submission. Re-authenticating and retrying once...");
                    token = await GetTokenAsync(forceRefresh: true);
                    if (string.IsNullOrEmpty(token))
                    {
                        _logger.LogWarning("VoyageOps re-login failed after 401 on early check-in submission.");
                        return null;
                    }

                    postResult = await SendEarlyCheckInRequestAsync(payload, token);
                }

                if (postResult.StatusCode != HttpStatusCode.OK)
                {
                    _logger.LogWarning(
                        "VoyageOps early check-in request failed with HTTP {StatusCode}. Body: {Body}",
                        (int)postResult.StatusCode,
                        postResult.Body);
                    return null;
                }

                return ParseEarlyCheckInResult(postResult.Body);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Unexpected error in VoyageOps PostEarlyCheckInAsync for Room {RoomNo}.", roomNo);
                return null;
            }
        }

        private async Task<(HttpStatusCode StatusCode, string Body)> SendEarlyCheckInRequestAsync(object payload, string token)
        {
            var json = JsonSerializer.Serialize(payload);
            using var request = new HttpRequestMessage(HttpMethod.Post, GetEndpointUri("api/events/early-checkin"));
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            request.Content = new StringContent(json, Encoding.UTF8, "application/json");

            var response = await _httpClient.SendAsync(request);
            var body = await response.Content.ReadAsStringAsync();
            return (response.StatusCode, body);
        }

        private EarlyCheckInResult? ParseEarlyCheckInResult(string json)
        {
            try
            {
                using var doc = JsonDocument.Parse(json);
                var root = doc.RootElement;

                var result = new EarlyCheckInResult();

                if (root.TryGetProperty("decision", out var decProp) && decProp.ValueKind == JsonValueKind.String)
                {
                    result.Decision = decProp.GetString();
                }

                if (root.TryGetProperty("reason", out var reasonProp) && reasonProp.ValueKind == JsonValueKind.String)
                {
                    result.Reason = reasonProp.GetString();
                }

                if (root.TryGetProperty("guest_message", out var msgProp) && msgProp.ValueKind == JsonValueKind.String)
                {
                    result.GuestMessage = msgProp.GetString();
                }

                if (root.TryGetProperty("requested_time", out var reqTimeProp) && reqTimeProp.ValueKind != JsonValueKind.Null)
                {
                    result.RequestedTime = reqTimeProp.ValueKind == JsonValueKind.String ? reqTimeProp.GetString() : reqTimeProp.ToString();
                }

                if (root.TryGetProperty("ready_by", out var readyByProp) && readyByProp.ValueKind != JsonValueKind.Null)
                {
                    result.ReadyBy = readyByProp.ValueKind == JsonValueKind.String ? readyByProp.GetString() : readyByProp.ToString();
                }

                if (root.TryGetProperty("room_number", out var roomNumProp) && roomNumProp.ValueKind != JsonValueKind.Null)
                {
                    result.RoomNumber = roomNumProp.ValueKind == JsonValueKind.String ? roomNumProp.GetString() : roomNumProp.ToString();
                }

                return result;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to parse VoyageOps early check-in response JSON. Response: {Body}", json);
                return null;
            }
        }
    }
}
