namespace HotelConcierge.Service
{
    public interface IEmbeddingService
    {
        Task<List<float>> GenerateEmbeddingAsync(string text);
    }
}
