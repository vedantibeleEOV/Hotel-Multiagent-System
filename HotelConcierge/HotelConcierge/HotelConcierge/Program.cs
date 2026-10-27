using HotelConcierge.API.Data;
using HotelConcierge.Repositories;
using HotelConcierge.Service;
using HotelConcierge.Models;
using Microsoft.EntityFrameworkCore;


var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

//builder.Services.AddDbContext<HotelDbContext>(options =>
//{
//    options.UseSqlServer(
//        builder.Configuration.GetConnectionString("DefaultConnection"));
//});

builder.Services.AddDbContext<HotelDbContext>(options =>
    options.UseNpgsql(builder.Configuration.GetConnectionString("DefaultConnection")));

builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowFrontend", policy =>
    {
        policy.WithOrigins(
                "http://localhost:5173",
                "https://localhost:5173",
                "http://localhost:5174",
                "https://localhost:5174",
                "http://localhost:5176")
              .AllowAnyHeader()
              .AllowAnyMethod();
    });
});

builder.Services.AddScoped<IChatService, ChatService>();
builder.Services.AddHttpClient();
builder.Services.AddHttpClient<IOllamaService, OllamaService>(client =>
{
    client.Timeout = TimeSpan.FromSeconds(60);
});
builder.Services.AddScoped<IAIService>(sp => sp.GetRequiredService<IOllamaService>());
builder.Services.AddScoped<IntentService>();
builder.Services.AddScoped<IHotelRepository, HotelRepository>();
builder.Services.AddHttpClient<IEmbeddingService, OllamaEmbeddingService>();
builder.Services.AddHttpClient<IChromaService, ChromaService>();
builder.Services.AddHttpClient<IVoyageOpsClient, VoyageOpsClient>(client =>
{
    var baseUrl = builder.Configuration["VoyageOps:BaseUrl"] ?? "http://localhost:8000";
    if (!baseUrl.EndsWith("/"))
    {
        baseUrl += "/";
    }
    client.BaseAddress = new Uri(baseUrl);
    client.Timeout = TimeSpan.FromSeconds(30);
});

builder.Services.AddHostedService<TaskStatusSyncWorker>();

var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    try
    {
        var db = scope.ServiceProvider.GetRequiredService<HotelDbContext>();
        if (!db.Rooms.Any(r => r.HotelId == 1 && r.RoomNo == "406"))
        {
            db.Rooms.Add(new Room { HotelId = 1, RoomNo = "406", RoomType = "Deluxe" });
            db.SaveChanges();
        }
    }
    catch (Exception ex)
    {
        app.Logger.LogWarning(ex, "Failed to ensure room 406 exists on startup.");
    }
}

app.UseCors("AllowFrontend");

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

// app.UseHttpsRedirection();
app.UseAuthorization();
app.MapControllers();

app.Run();