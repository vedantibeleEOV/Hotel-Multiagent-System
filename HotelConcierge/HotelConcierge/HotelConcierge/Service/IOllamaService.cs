using HotelConcierge.Models;

namespace HotelConcierge.Service
{
    public interface IOllamaService : IAIService
    {
        Task<string> GenerateResponseAsync(string prompt, bool jsonFormat = false);
        Task<string> ClassifyIntentAsync(string message);
        Task<string> AnswerGeneralQuestionAsync(string message, HotelInfo hotelInfo, IEnumerable<string>? nearbyPlaces = null);
    }
}
