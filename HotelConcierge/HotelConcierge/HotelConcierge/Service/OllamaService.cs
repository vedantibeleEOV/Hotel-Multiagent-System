using HotelConcierge.Models;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace HotelConcierge.Service
{
    public class OllamaService : IOllamaService
    {
        private readonly HttpClient _httpClient;
        private readonly IConfiguration _configuration;
        private readonly ILogger<OllamaService> _logger;

        public const string SafeFallbackMessage =
            "Sorry, I can only help with room issues, housekeeping items and front desk requests.";

        public OllamaService(
            HttpClient httpClient,
            IConfiguration configuration,
            ILogger<OllamaService> logger)
        {
            _httpClient = httpClient;
            _configuration = configuration;
            _logger = logger;

            _httpClient.Timeout = TimeSpan.FromSeconds(60);
        }

        private string GetBaseUrl()
        {
            var url = _configuration["Ollama:BaseUrl"] ?? _configuration["OLLAMA_BASE_URL"];
            if (string.IsNullOrWhiteSpace(url))
            {
                var isContainer = string.Equals(
                    Environment.GetEnvironmentVariable("DOTNET_RUNNING_IN_CONTAINER"),
                    "true",
                    StringComparison.OrdinalIgnoreCase);

                url = isContainer ? "http://host.docker.internal:11434" : "http://localhost:11434";
            }
            return url.TrimEnd('/');
        }

        private string GetModel()
        {
            return _configuration["Ollama:Model"] ?? "llama3.2";
        }

        public async Task<string> GenerateResponseAsync(string prompt)
        {
            return await GenerateResponseAsync(prompt, false);
        }

        public async Task<string> GenerateResponseAsync(string prompt, bool jsonFormat = false)
        {
            var baseUrl = GetBaseUrl();
            var model = GetModel();
            var endpoint = $"{baseUrl}/api/generate";

            var payload = new Dictionary<string, object>
            {
                ["model"] = model,
                ["prompt"] = prompt,
                ["stream"] = false,
                ["keep_alive"] = "30m",
                ["options"] = new Dictionary<string, object>
                {
                    ["temperature"] = 0
                }
            };

            if (jsonFormat)
            {
                payload["format"] = "json";
            }

            try
            {
                var jsonPayload = JsonSerializer.Serialize(payload);
                using var content = new StringContent(jsonPayload, Encoding.UTF8, "application/json");

                using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(60));
                var response = await _httpClient.PostAsync(endpoint, content, cts.Token);

                if (!response.IsSuccessStatusCode)
                {
                    _logger.LogWarning("Ollama service call failed with HTTP status {StatusCode}.", (int)response.StatusCode);
                    return SafeFallbackMessage;
                }

                var responseString = await response.Content.ReadAsStringAsync(cts.Token);
                using var document = JsonDocument.Parse(responseString);

                if (document.RootElement.TryGetProperty("response", out var respProp))
                {
                    var text = respProp.GetString()?.Trim();
                    return string.IsNullOrEmpty(text) ? SafeFallbackMessage : text;
                }

                return SafeFallbackMessage;
            }
            catch (Exception ex)
            {
                // Log single warning without stack trace
                _logger.LogWarning("Ollama service call failed: {Message}", ex.Message);
                return SafeFallbackMessage;
            }
        }

        public async Task<string> ClassifyIntentAsync(string message)
        {
            var prompt = $@"You are an intent classifier for a hotel guest concierge.
Classify the guest's message into exactly ONE of the following categories:
- MAINTENANCE: Requests to fix broken items, room repairs, AC/heating issues, plumbing, electrical problems, TV/appliances not working.
- HOUSEKEEPING_REQUEST: Requests for physical items or room cleaning, such as pillows, towels, blankets, toiletries, water, or cleaning service.
- GENERAL_QUESTION: Inquiries about hotel amenities, timings (breakfast, lunch, gym, pool, restaurant), wifi password, check-in/out times, nearby attractions, greetings, or general information.
- UNKNOWN: Gibberish, random letters, unintelligible text, or requests completely unrelated to a hotel stay.

Guest message: ""{message}""

Respond ONLY with valid JSON in this exact format:
{{""intent"": ""MAINTENANCE"" | ""HOUSEKEEPING_REQUEST"" | ""GENERAL_QUESTION"" | ""UNKNOWN""}}";

            try
            {
                var rawResult = await GenerateResponseAsync(prompt, true);
                if (string.IsNullOrWhiteSpace(rawResult) || rawResult == SafeFallbackMessage)
                {
                    return "UNKNOWN";
                }

                var cleaned = rawResult.Trim();
                if (cleaned.Contains("```"))
                {
                    var parts = cleaned.Split("```", StringSplitOptions.RemoveEmptyEntries);
                    if (parts.Length > 0)
                    {
                        cleaned = parts[0];
                        if (cleaned.StartsWith("json", StringComparison.OrdinalIgnoreCase))
                        {
                            cleaned = cleaned.Substring(4).Trim();
                        }
                    }
                }

                using var doc = JsonDocument.Parse(cleaned);
                if (doc.RootElement.TryGetProperty("intent", out var intentProp))
                {
                    var intent = intentProp.GetString()?.Trim().ToUpperInvariant();
                    return intent switch
                    {
                        "MAINTENANCE" => "MAINTENANCE",
                        "HOUSEKEEPING_REQUEST" => "HOUSEKEEPING_REQUEST",
                        "GENERAL_QUESTION" => "GENERAL_QUESTION",
                        _ => "UNKNOWN"
                    };
                }

                return "UNKNOWN";
            }
            catch (Exception ex)
            {
                _logger.LogWarning("Ollama service call failed: {Message}", ex.Message);
                return "UNKNOWN";
            }
        }

        public async Task<string> AnswerGeneralQuestionAsync(
            string message,
            HotelInfo hotelInfo,
            IEnumerable<string>? nearbyPlaces = null)
        {
            var prompt = $@"You are the hotel concierge assistant at {hotelInfo.HotelName}.
Answer the guest's inquiry using ONLY the following verified hotel information:

HOTEL INFORMATION:
- Hotel Name: {hotelInfo.HotelName}
- Wi-Fi Password: {hotelInfo.WifiPassword}
- Check-in Time: {hotelInfo.CheckInTime}
- Check-out Time: {hotelInfo.CheckOutTime}
- Breakfast Timing: {hotelInfo.BreakfastTime}
- Lunch Timing: {hotelInfo.LunchTime}
- Restaurant Timing: {hotelInfo.RestaurantTiming}
- Pool Timing: {hotelInfo.PoolTiming}
- Gym Timing: {hotelInfo.GymTiming}

STRICT RULES:
1. Answer ONLY using the facts above.
2. Answer in exactly one or two short sentences.
3. NEVER use greeting words (e.g., do NOT say 'Good morning', 'Good afternoon', 'Good evening', 'Hello', 'Hi', 'Welcome').
4. NEVER offer actions, services, room bookings, or events that are not in the data.
5. If the requested information is not in the facts above, reply exactly: 'I don't have that information. Please contact the front desk (Dial 0).'

Guest inquiry: {message}

Answer:";

            var response = await GenerateResponseAsync(prompt, false);
            if (string.IsNullOrWhiteSpace(response) || response == SafeFallbackMessage)
            {
                var fallback = GetFixedHotelInfoAnswer(message, hotelInfo);
                if (!string.IsNullOrEmpty(fallback))
                {
                    return fallback;
                }
                return "I don't have that information. Please contact the front desk (Dial 0).";
            }

            // Strip any leading greetings if the model generated them
            response = Regex.Replace(response, @"^(good\s*(morning|afternoon|evening|day)[!.,\s]*|hello[!.,\s]*|hi[!.,\s]*|welcome[!.,\s]*)", "", RegexOptions.IgnoreCase).Trim();
            return response;
        }

        public static string? GetFixedHotelInfoAnswer(string message, HotelInfo hotelInfo)
        {
            if (string.IsNullOrWhiteSpace(message) || hotelInfo == null)
                return null;

            var hotelName = string.IsNullOrWhiteSpace(hotelInfo.HotelName) ? "our hotel" : hotelInfo.HotelName;

            bool hasCheckIn = Regex.IsMatch(message, @"\bcheck[- ]?in\b", RegexOptions.IgnoreCase);
            bool hasCheckOut = Regex.IsMatch(message, @"\bcheck[- ]?out\b", RegexOptions.IgnoreCase);

            // Both check-in and check-out
            if (hasCheckIn && hasCheckOut)
            {
                return $"Check-in time at {hotelName} is {hotelInfo.CheckInTime}, and check-out time is {hotelInfo.CheckOutTime}.";
            }

            // Check-in only
            if (hasCheckIn)
            {
                return $"Check-in time at {hotelName} is {hotelInfo.CheckInTime}.";
            }

            // Check-out only
            if (hasCheckOut)
            {
                return $"Check-out time at {hotelName} is {hotelInfo.CheckOutTime}.";
            }

            // Wi-Fi / Internet password
            if (Regex.IsMatch(message, @"\b(wifi|wi-fi|internet|password)\b", RegexOptions.IgnoreCase))
            {
                return $"The Wi-Fi password for {hotelName} is {hotelInfo.WifiPassword}.";
            }

            // Breakfast
            if (Regex.IsMatch(message, @"\b(breakfast)\b", RegexOptions.IgnoreCase))
            {
                return $"Breakfast at {hotelName} is served from {hotelInfo.BreakfastTime}.";
            }

            // Lunch
            if (Regex.IsMatch(message, @"\b(lunch)\b", RegexOptions.IgnoreCase))
            {
                return $"Lunch at {hotelName} is served from {hotelInfo.LunchTime}.";
            }

            // Restaurant / Dinner / Dining
            if (Regex.IsMatch(message, @"\b(restaurant|dinner|dining)\b", RegexOptions.IgnoreCase))
            {
                return $"The restaurant at {hotelName} is open from {hotelInfo.RestaurantTiming}.";
            }

            // Pool / Swimming
            if (Regex.IsMatch(message, @"\b(pool|swimming)\b", RegexOptions.IgnoreCase))
            {
                return $"The pool at {hotelName} is open from {hotelInfo.PoolTiming}.";
            }

            // Gym / Fitness
            if (Regex.IsMatch(message, @"\b(gym|fitness|workout)\b", RegexOptions.IgnoreCase))
            {
                return $"The gym at {hotelName} is open from {hotelInfo.GymTiming}.";
            }

            return null;
        }
    }
}
