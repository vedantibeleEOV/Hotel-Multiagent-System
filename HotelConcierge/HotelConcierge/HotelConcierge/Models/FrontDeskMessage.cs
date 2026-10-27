namespace HotelConcierge.Models
{
    public class FrontDeskMessage
    {
        public int Id { get; set; }
        public int HotelId { get; set; }
        public string RoomNo { get; set; } = string.Empty;
        public string GuestMessage { get; set; } = string.Empty;
        public string StaffReply { get; set; } = string.Empty;
        public bool IsRead { get; set; } = false;
        public bool IsReplied { get; set; } = false;
        public DateTime CreatedDate { get; set; } = DateTime.UtcNow;
        public DateTime? RepliedDate { get; set; }
    }
}
