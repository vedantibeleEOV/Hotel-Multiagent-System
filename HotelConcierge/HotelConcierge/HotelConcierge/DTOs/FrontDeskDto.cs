namespace HotelConcierge.DTOs
{
    public class SendFrontDeskMessageDto
    {
        public int HotelId { get; set; }
        public string RoomNo { get; set; } = string.Empty;
        public string Message { get; set; } = string.Empty;
    }

    public class ReplyFrontDeskDto
    {
        public string Reply { get; set; } = string.Empty;
    }

    public class FrontDeskMessageDto
    {
        public int Id { get; set; }
        public int HotelId { get; set; }
        public string RoomNo { get; set; } = string.Empty;
        public string GuestMessage { get; set; } = string.Empty;
        public string StaffReply { get; set; } = string.Empty;
        public bool IsRead { get; set; }
        public bool IsReplied { get; set; }
        public DateTime CreatedDate { get; set; }
        public DateTime? RepliedDate { get; set; }
    }
}
