using HotelConcierge.Models;
using Microsoft.EntityFrameworkCore;

namespace HotelConcierge.API.Data;

public class HotelDbContext : DbContext
{
    public HotelDbContext(DbContextOptions<HotelDbContext> options)
        : base(options)
    {
    }

    public DbSet <Guest> Guests { get; set; }

    public DbSet <Conversation> Conversations { get; set; }

    public DbSet <TaskItem> Tasks { get; set; }
    public DbSet<Room> Rooms { get; set; }
    public DbSet<HotelInfo> HotelInfos { get; set; }

    public DbSet<FrontDeskMessage> FrontDeskMessages { get; set; }
}