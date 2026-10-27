using HotelConcierge.Models;

namespace HotelConcierge.Repositories
{
    public interface IHotelRepository
    {
        Task<HotelInfo?> GetHotelInfoAsync();
        Task<HotelInfo?> GetHotelInfoByIdAsync(int hotelId);
        Task<List<HotelInfo>> GetAllHotelsAsync();
    }
}
