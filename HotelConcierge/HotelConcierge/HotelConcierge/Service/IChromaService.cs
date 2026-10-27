using HotelConcierge.Models;

namespace HotelConcierge.Service
{
    public interface IChromaService
    {
        Task SyncHotelAsync(HotelInfo hotel);
        Task CreateCollectionAsync();
        Task<string> GetCollectionsAsync();
        Task<string> GetCollectionDataAsync();
        Task<string> SearchAsync(string query, int hotelId);
        Task DeleteCollectionAsync();
        Task UpdateMetadataAsync(HotelInfo hotel);
    }
}
