namespace HotelConcierge.Models
{
    public class HotelInfo
    {
      public int Id { get; set; }
      public string HotelName { get; set; } = string.Empty;
      public string CheckInTime { get; set; } = string.Empty;
      public string CheckOutTime { get; set; } = string.Empty;           
      public string WifiPassword { get; set; } = string.Empty;
      public string BreakfastTime { get; set; } = string.Empty;
      public string LunchTime { get; set; } = string.Empty;
      public string RestaurantTiming { get; set; } = string.Empty;
      public string PoolTiming { get; set; } = string.Empty;
      public string GymTiming { get; set; } = string.Empty;

    }
}
