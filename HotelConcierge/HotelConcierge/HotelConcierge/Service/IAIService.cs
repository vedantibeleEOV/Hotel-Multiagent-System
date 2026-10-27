namespace HotelConcierge.Service
{
    public interface IAIService
    {
        Task<string> GenerateResponseAsync(string prompt);
    }
} 
