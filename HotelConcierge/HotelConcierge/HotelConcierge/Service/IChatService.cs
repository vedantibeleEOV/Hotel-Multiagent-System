using HotelConcierge.DTOs;
using HotelConcierge.Models;

namespace HotelConcierge.Service
{
    public interface IChatService
    {
        //Task<string> ProcessMessage(string message, HotelInfo hotelInfo, string ragContext);    
        Task<string> ProcessMessage(
         string message,
         HotelInfo hotelInfo,
         string ragContext,
         List<ConversationMessage> history,
         bool isFirstMessage);
        //Task<string> ProcessMessage(string message, HotelInfo hotelInfo, string empty, List<ConversationMessage> history, bool isFirstMessage);
    }
}
