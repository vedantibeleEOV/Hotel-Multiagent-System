namespace HotelConcierge.Models
{
    public class Conversation
    {
        public int HotelId { get; set; }
        public string SessionId { get; set; } = string.Empty; // ← NEW

        public int ConversationId { get; set; }

        public string UserMessage { get; set; } = string.Empty;

        public string BotResponse { get; set; } = string.Empty;

        public string Intent { get; set; } = string.Empty;
        public bool IsFirstMessage { get; set; } =true;     // ← NEW

        public DateTime CreatedDate { get; set; }
        public string RoomNo { get; internal set; }
    }
}
