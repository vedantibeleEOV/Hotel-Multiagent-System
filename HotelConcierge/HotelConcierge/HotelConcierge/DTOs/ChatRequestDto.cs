namespace HotelConcierge.DTOs
{
    public class ChatRequestDto
    {
        public string Message { get; set; } = string.Empty;
        public int HotelId { get; set; }
        public string SessionId { get; set; } = string.Empty; // ← NEW
        public List<ConversationMessage> History { get; set; } = new();
        public string? RoomNo { get; set; }
    }

    public class ConversationMessage
    {
        public string Role { get; set; } = string.Empty;
        public string Content { get; set; } = string.Empty;
    }
}
