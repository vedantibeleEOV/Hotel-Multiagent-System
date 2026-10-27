using HotelConcierge.API.Data;
using HotelConcierge.Models;
using Microsoft.EntityFrameworkCore;

namespace HotelConcierge.Repositories
{
    public class HotelRepository: IHotelRepository
    {
        private readonly HotelDbContext _context;

        public HotelRepository(HotelDbContext context)
        {
            _context = context;
        }

        public async Task<HotelInfo?> GetHotelInfoAsync()
        {
            return await _context.HotelInfos.FirstOrDefaultAsync();
        }

        public async Task<HotelInfo?> GetHotelInfoByIdAsync(int hotelId)
        {
            return await _context.HotelInfos
                .FirstOrDefaultAsync(h => h.Id == hotelId);
        }
  
        public async Task<List<HotelInfo>> GetAllHotelsAsync()
        {
            return await _context.HotelInfos.ToListAsync();
        }

    }
}
