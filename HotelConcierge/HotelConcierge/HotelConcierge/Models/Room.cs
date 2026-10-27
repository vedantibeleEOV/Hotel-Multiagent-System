namespace HotelConcierge.Models
{
    public class Room
    {
        public int RoomId {  get; set; }
        public int HotelId { get; set; }
        public string RoomNo { get; set; } = string .Empty;
        public string RoomType { get; set; } = string.Empty;
        public HotelInfo Hotel { get; set; } = null!;
    }
}
