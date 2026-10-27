namespace HotelConcierge.DTOs
{
    public class QRValidationResponseDto
    {
        public bool IsValid { get; set; }
        public int HotelId { get; set; }
        public string HotelName { get; set; } = string.Empty;
        public string RoomNo { get; set; } = string.Empty;
        public string RoomType { get; set; } = string.Empty;
        public string Message { get; set; } = string.Empty;
    }
}
