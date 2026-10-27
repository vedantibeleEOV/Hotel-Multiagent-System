using HotelConcierge.Models;
using System.Text.RegularExpressions;

namespace HotelConcierge.Service
{
    public enum GuestIntent
    {
        Emergency,
        OtherRoomOrCancel,
        UnarrangedItem,
        InvalidQuantity,
        MaintenanceRequest,
        HousekeepingRequest,
        FrontDeskRequest,
        EarlyCheckIn,
        NoiseComplaint,
        Greeting,
        SecurityOrInjection,
        LocalAttractions,
        HotelInfo,
        GeneralQuery,
        Unknown
    }

    public class IntentService
    {
        private readonly IOllamaService _ollamaService;

        private static readonly Regex EmergencyRegex = new Regex(
            @"\b(fire|smoke|gas\s*leak|medical\s*emergency|doctor|ambulance|police|someone\s*in\s*my\s*room|intruder|unsafe|threat(ened)?|injur(ed|y|ies)|can't\s*breathe|cannot\s*breathe|heart\s*attack|unconscious|bleeding|emergency)\b",
            RegexOptions.IgnoreCase | RegexOptions.Compiled);

        private static readonly Regex OtherRoomRegex = new Regex(
            @"\broom\s*(\d+)\b|\b(other|another|different)\s+room\b",
            RegexOptions.IgnoreCase | RegexOptions.Compiled);

        private static readonly Regex CancelOrChangeRegex = new Regex(
            @"\b(cancel|cancelling|cancellation|change|changing|modify|modifying)\b",
            RegexOptions.IgnoreCase | RegexOptions.Compiled);

        private static readonly Regex UnarrangedItemRegex = new Regex(
            @"\b(pillow\s*cases?|pillowcases?|pillow\s*covers?|towel\s*racks?|towel\s*rails?|towel\s*holders?|towel\s*bars?|towel\s*rings?|towel\s*stands?|bed\s*sheets?|bedsheets?|mattress(es)?)\b",
            RegexOptions.IgnoreCase | RegexOptions.Compiled);

        private static readonly Regex InvalidQuantityRegex = new Regex(
            @"(?<=^|\s)(?:0|zero|-\s*\d+)\b",
            RegexOptions.IgnoreCase | RegexOptions.Compiled);

        private static readonly Regex TemperatureRegex = new Regex(
            @"\b(too\s*hot|too\s*cold|temperature|not\s*cooling|cooling|air\s*con|ac|a/c|heat(ing)?|thermostat|freezing|chilly|warm)\b",
            RegexOptions.IgnoreCase | RegexOptions.Compiled);

        private static readonly Regex NoiseRegex = new Regex(
            @"\b(noise|noisy|loud|music|construction|disturb(ing|ance)?|can't\s*sleep|cannot\s*sleep|shouting|screaming|sound)\b",
            RegexOptions.IgnoreCase | RegexOptions.Compiled);

        private static readonly Regex FrontDeskRegex = new Regex(
            @"\b(extend\s*(my\s*)?stay|extension|bill|billing|invoice|folio|lost\s*key|lost\s*and\s*found|luggage|baggage|bags|taxi|cab|transport(ation)?|late\s*check-?out|valet|parking\s*pass|deposit|payment\s*issue)\b",
            RegexOptions.IgnoreCase | RegexOptions.Compiled);

        private static readonly Regex EarlyCheckInRegex = new Regex(
            @"\b(early[\s-]*check[\s-]*in|check[\s-]*in[\s-]*early|arrive[\s-]*early|arriving[\s-]*early|is\s*(my\s*)?room\s*ready|room\s*ready)\b|\b(can|could|may|want\s+to|would\s+like\s+to|like\s+to|request|possible\s+to)\s+(i\s+)?check[\s-]*in\b|\bcheck[\s-]*in\s+(at|by|around)\s+\d",
            RegexOptions.IgnoreCase | RegexOptions.Compiled);

        private static readonly Regex CheckInInfoRegex = new Regex(
            @"\b(what(\s+time|\s+is|\s+are)?|when(\s+is)?)\b.*\bcheck[- ]?in\b|\bcheck[- ]?in\s+tim(e|ings?|es)\b",
            RegexOptions.IgnoreCase | RegexOptions.Compiled);

        private static readonly Regex GreetingRegex = new Regex(
            @"^\s*(hello|hi|hey|greetings|good\s*(morning|afternoon|evening|day)|thanks|thank\s*you)(\s+(there|assistant|concierge))?[!.,\s]*$",
            RegexOptions.IgnoreCase | RegexOptions.Compiled);

        private static readonly Regex SecurityRegex = new Regex(
            @"\b(system\s*prompt|ignore\s*(all\s*)?instructions|developer\s*mode|prompt\s*injection|jailbreak)\b",
            RegexOptions.IgnoreCase | RegexOptions.Compiled);

        private static readonly Regex LocalAttractionsRegex = new Regex(
            @"\b(nearby|places\s*to\s*visit|sightseeing|attractions?|where\s*to\s*go|things\s*to\s*do|visit\s*places?)\b",
            RegexOptions.IgnoreCase | RegexOptions.Compiled);

        private static readonly Regex HotelInfoRegex = new Regex(
            @"\b(wifi|wi-fi|internet|password|breakfast|lunch|dinner|restaurant|dining|food\s*timing|pool|swimming|gym|fitness|workout|check[- ]?in|check[- ]?out|timings?|hours?)\b",
            RegexOptions.IgnoreCase | RegexOptions.Compiled);

        private static readonly Regex HousekeepingRegex = new Regex(
            @"\b(pillow|pillows|towel|towels|bath\s*towel|bath\s*towels|blanket|blankets|linen|linens|toiletries|soap|soaps|shampoo|shampoos|conditioner|dental\s*kit|toothbrush|toothbrushes|toothpaste|ice\s*bucket|water\s*bottle|water\s*bottles|water|slippers?|bath\s*robes?|robes?|clean(ing)?\s*(my)?\s*room|housekeeping|room\s*service)\b",
            RegexOptions.IgnoreCase | RegexOptions.Compiled);

        private static readonly Regex MaintenanceRegex = new Regex(
            @"\b(ac|a/c|air\s*condition(ing|er)?|tv|television|remote|not\s*working|broken|repair|fix|leak(ing|s|age)?|clog(ged)?|burst|flood|plumbing|drain|faucet|tap|shower\s*(leak|issue|broken)|electricity|power\s*cut|blackout|spark(s|ing)?|electric\s*shock|short\s*circuit|heater|heating|geyser|door\s*lock|keycard|key\s*card|jammed)\b",
            RegexOptions.IgnoreCase | RegexOptions.Compiled);

        public IntentService(IOllamaService ollamaService)
        {
            _ollamaService = ollamaService;
        }

        public bool IsEmergency(string message) =>
            !string.IsNullOrWhiteSpace(message) && EmergencyRegex.IsMatch(message);

        public bool IsOtherRoomRequest(string message, string currentRoomNo)
        {
            if (string.IsNullOrWhiteSpace(message)) return false;

            if (Regex.IsMatch(message, @"\b(other|another|different)\s+room\b", RegexOptions.IgnoreCase))
                return true;

            var match = Regex.Match(message, @"\broom\s*(\d+)\b", RegexOptions.IgnoreCase);
            if (match.Success)
            {
                var targetRoom = match.Groups[1].Value;
                if (!string.IsNullOrEmpty(currentRoomNo) && !string.Equals(targetRoom, currentRoomNo, StringComparison.OrdinalIgnoreCase))
                {
                    return true;
                }
            }

            return false;
        }

        public bool IsCancelOrChangeRequest(string message) =>
            !string.IsNullOrWhiteSpace(message) && CancelOrChangeRegex.IsMatch(message);

        public bool IsUnarrangedItem(string message) =>
            !string.IsNullOrWhiteSpace(message) && UnarrangedItemRegex.IsMatch(message);

        public bool IsInvalidQuantity(string message) =>
            !string.IsNullOrWhiteSpace(message) && InvalidQuantityRegex.IsMatch(message);

        public bool IsTemperatureRequest(string message) =>
            !string.IsNullOrWhiteSpace(message) && TemperatureRegex.IsMatch(message);

        public bool IsNoiseComplaint(string message) =>
            !string.IsNullOrWhiteSpace(message) && NoiseRegex.IsMatch(message);

        public bool IsFrontDeskRequest(string message) =>
            !string.IsNullOrWhiteSpace(message) && FrontDeskRegex.IsMatch(message);

        public bool IsEarlyCheckinRequest(string message)
        {
            if (string.IsNullOrWhiteSpace(message)) return false;
            if (CheckInInfoRegex.IsMatch(message)) return false;
            return EarlyCheckInRegex.IsMatch(message);
        }

        public bool IsGreeting(string message) =>
            !string.IsNullOrWhiteSpace(message) && GreetingRegex.IsMatch(message);

        public bool IsSecurityOrInjection(string message) =>
            !string.IsNullOrWhiteSpace(message) && SecurityRegex.IsMatch(message);

        public bool IsLocalAttractions(string message) =>
            !string.IsNullOrWhiteSpace(message) && LocalAttractionsRegex.IsMatch(message);

        public bool IsHotelInfoTopic(string message) =>
            !string.IsNullOrWhiteSpace(message) && HotelInfoRegex.IsMatch(message);

        public bool IsHousekeepingRequest(string message)
        {
            if (string.IsNullOrWhiteSpace(message)) return false;
            if (IsUnarrangedItem(message)) return false;
            return HousekeepingRegex.IsMatch(message);
        }

        public bool IsMaintenanceRequest(string message)
        {
            if (string.IsNullOrWhiteSpace(message)) return false;
            return MaintenanceRegex.IsMatch(message) || TemperatureRegex.IsMatch(message);
        }

        public static string NormalizeQuantityWords(string text)
        {
            if (string.IsNullOrWhiteSpace(text)) return text;

            text = Regex.Replace(text, @"\b(?:one\s+)?hundred\b", "100", RegexOptions.IgnoreCase);
            text = Regex.Replace(text, @"\b(?:a\s+)?hundred\b", "100", RegexOptions.IgnoreCase);
            text = Regex.Replace(text, @"\b(?:a\s+)?dozen\b", "12", RegexOptions.IgnoreCase);
            text = Regex.Replace(text, @"\btwenty\b", "20", RegexOptions.IgnoreCase);
            text = Regex.Replace(text, @"\bnineteen\b", "19", RegexOptions.IgnoreCase);
            text = Regex.Replace(text, @"\beighteen\b", "18", RegexOptions.IgnoreCase);
            text = Regex.Replace(text, @"\bseventeen\b", "17", RegexOptions.IgnoreCase);
            text = Regex.Replace(text, @"\bsixteen\b", "16", RegexOptions.IgnoreCase);
            text = Regex.Replace(text, @"\bfifteen\b", "15", RegexOptions.IgnoreCase);
            text = Regex.Replace(text, @"\bfourteen\b", "14", RegexOptions.IgnoreCase);
            text = Regex.Replace(text, @"\bthirteen\b", "13", RegexOptions.IgnoreCase);
            text = Regex.Replace(text, @"\btwelve\b", "12", RegexOptions.IgnoreCase);
            text = Regex.Replace(text, @"\beleven\b", "11", RegexOptions.IgnoreCase);
            text = Regex.Replace(text, @"\bten\b", "10", RegexOptions.IgnoreCase);
            text = Regex.Replace(text, @"\bnine\b", "9", RegexOptions.IgnoreCase);
            text = Regex.Replace(text, @"\beight\b", "8", RegexOptions.IgnoreCase);
            text = Regex.Replace(text, @"\bseven\b", "7", RegexOptions.IgnoreCase);
            text = Regex.Replace(text, @"\bsix\b", "6", RegexOptions.IgnoreCase);
            text = Regex.Replace(text, @"\bfive\b", "5", RegexOptions.IgnoreCase);
            text = Regex.Replace(text, @"\bfour\b", "4", RegexOptions.IgnoreCase);
            text = Regex.Replace(text, @"\bthree\b", "3", RegexOptions.IgnoreCase);
            text = Regex.Replace(text, @"\btwo\b", "2", RegexOptions.IgnoreCase);
            text = Regex.Replace(text, @"\bone\b", "1", RegexOptions.IgnoreCase);

            return text;
        }

        public GuestIntent? DetectByKeywords(string message)
        {
            if (string.IsNullOrWhiteSpace(message))
                return GuestIntent.Unknown;

            if (IsEmergency(message))
                return GuestIntent.Emergency;

            if (IsCancelOrChangeRequest(message))
                return GuestIntent.OtherRoomOrCancel;

            if (IsUnarrangedItem(message))
                return GuestIntent.UnarrangedItem;

            if (IsInvalidQuantity(message))
                return GuestIntent.InvalidQuantity;

            if (IsLocalAttractions(message))
                return GuestIntent.LocalAttractions;

            if (IsGreeting(message))
                return GuestIntent.Greeting;

            if (IsSecurityOrInjection(message))
                return GuestIntent.SecurityOrInjection;

            if (IsNoiseComplaint(message))
                return GuestIntent.NoiseComplaint;

            if (IsEarlyCheckinRequest(message))
                return GuestIntent.EarlyCheckIn;

            if (IsFrontDeskRequest(message))
                return GuestIntent.FrontDeskRequest;

            var hasHk = IsHousekeepingRequest(message);
            var hasMnt = IsMaintenanceRequest(message);

            if (hasHk && !hasMnt)
                return GuestIntent.HousekeepingRequest;

            if (hasMnt && !hasHk)
                return GuestIntent.MaintenanceRequest;

            if (IsHotelInfoTopic(message))
                return GuestIntent.HotelInfo;

            return null;
        }

        public async Task<GuestIntent> DetectAsync(string message)
        {
            var keywordIntent = DetectByKeywords(message);
            if (keywordIntent.HasValue)
            {
                return keywordIntent.Value;
            }

            var classification = await _ollamaService.ClassifyIntentAsync(message);

            return classification switch
            {
                "MAINTENANCE" => GuestIntent.MaintenanceRequest,
                "HOUSEKEEPING_REQUEST" => GuestIntent.HousekeepingRequest,
                "GENERAL_QUESTION" => IsHotelInfoTopic(message) ? GuestIntent.HotelInfo : GuestIntent.Unknown,
                _ => GuestIntent.Unknown
            };
        }
    }
}

