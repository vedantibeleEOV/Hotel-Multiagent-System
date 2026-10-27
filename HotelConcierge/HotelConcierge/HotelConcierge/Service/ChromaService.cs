using HotelConcierge.Models;
using System.Text.Json;

namespace HotelConcierge.Service
{
    public class ChromaService : IChromaService
    {
        private readonly HttpClient _httpClient;
        private readonly IEmbeddingService _embeddingService;
        private string? _cachedCollectionId;

        private const string BaseUrl = "http://localhost:8001/api/v2/tenants/default_tenant/databases/default_database";

        public ChromaService(HttpClient httpClient, IEmbeddingService embeddingService)
        {
            _httpClient = httpClient;
            _embeddingService = embeddingService;
        }
 
        // Resolves collection ID dynamically by name - no more hardcoded GUIDs
        private async Task<string> GetCollectionIdAsync()
        {
            //The method first checks whether the collection ID has already been retrieved and stored in the _cachedCollectionId variable.
            if (_cachedCollectionId != null)
                return _cachedCollectionId;

            //If the collection ID is not cached, the method sends an HTTP GET request to the ChromaDB Collections API.
            var response = await _httpClient.GetAsync(
                $"{BaseUrl}/collections");

            //This JSON contains details of all collections stored in ChromaDB.
            var json = await response.Content.ReadAsStringAsync();

            //The JSON string is parsed using the JsonDocument class.
            using var doc = JsonDocument.Parse(json);

            //The method iterates through the collection list and searches for the collection whose name is hotel_info.
            var collection = doc.RootElement
                .EnumerateArray()
                .FirstOrDefault(c => c.GetProperty("name").GetString() == "hotel_info");

            //Once the required collection is found, its unique identifier (id) is extracted and stored in the cache.
            _cachedCollectionId = collection.GetProperty("id").GetString()
                ?? throw new Exception("Collection 'hotel_info' not found in ChromaDB. Call /create-collection first.");

            //the cached collection ID is returned to the caller
            return _cachedCollectionId;
        }

        public async Task CreateCollectionAsync()
        {
            // Reset cache when creating a new collection
            _cachedCollectionId = null;

            var request = new { name = "hotel_info" };

            var response = await _httpClient.PostAsJsonAsync(
                $"{BaseUrl}/collections", request);

            var result = await response.Content.ReadAsStringAsync();
            Console.WriteLine(result);
        }

        public async Task SyncHotelAsync(HotelInfo hotel)
        {
            var collectionId = await GetCollectionIdAsync();

            var documents = new List<(string Id, string Text)>
            {
                ($"hotel_{hotel.Id}_lunch",      $"Hotel: {hotel.HotelName}. Lunch Time: {hotel.LunchTime}"),
                ($"hotel_{hotel.Id}_breakfast",  $"Hotel: {hotel.HotelName}. Breakfast Time: {hotel.BreakfastTime}"),
                ($"hotel_{hotel.Id}_gym",        $"Hotel: {hotel.HotelName}. Gym Timing: {hotel.GymTiming}"),
                ($"hotel_{hotel.Id}_pool",       $"Hotel: {hotel.HotelName}. Pool Timing: {hotel.PoolTiming}"),
                ($"hotel_{hotel.Id}_checkin",    $"Hotel: {hotel.HotelName}. Check-In Time: {hotel.CheckInTime}"),
                ($"hotel_{hotel.Id}_checkout",   $"Hotel: {hotel.HotelName}. Check-Out Time: {hotel.CheckOutTime}"),
                ($"hotel_{hotel.Id}_wifi",       $"Hotel: {hotel.HotelName}. WiFi Password: {hotel.WifiPassword}"),
                ($"hotel_{hotel.Id}_restaurant", $"Hotel: {hotel.HotelName}. Restaurant Timing: {hotel.RestaurantTiming}")
            };

            foreach (var doc in documents)
            {
                var embedding = await _embeddingService.GenerateEmbeddingAsync(doc.Text);

                var request = new
                {
                    ids = new[] { doc.Id },
                    documents = new[] { doc.Text },
                    embeddings = new[] { embedding },
                    metadatas = new[]
                    {
                        new Dictionary<string, object>
                        {
                            { "hotelId", hotel.Id.ToString() },
                            { "hotelName", hotel.HotelName }
                        }
                    }
                };

                var response = await _httpClient.PostAsJsonAsync(
                    $"{BaseUrl}/collections/{collectionId}/add", // dynamic
                    request);

                var responseBody = await response.Content.ReadAsStringAsync();
                Console.WriteLine($"[Sync] {doc.Id} → Status: {response.StatusCode} | {responseBody}");
            }
        }

        public async Task<string> SearchAsync(string query, int hotelId)
        {
            var collectionId = await GetCollectionIdAsync(); 
            var embedding = await _embeddingService.GenerateEmbeddingAsync(query);

            var request = new
            {
                query_embeddings = new[] { embedding },
                n_results = 1,
                where = new Dictionary<string, object>
                {
                    {
                        "hotelId", new Dictionary<string, object>
                        {
                            { "$eq", hotelId.ToString() }
                        }
                    }
                }
            };

            var response = await _httpClient.PostAsJsonAsync(
                $"{BaseUrl}/collections/{collectionId}/query", 
                request); //dynamic

            var result = await response.Content.ReadAsStringAsync();
            Console.WriteLine($"[Search] Status: {response.StatusCode} | {result}");

            return result;
        }

        public async Task<string> GetCollectionsAsync()
        {
            var response = await _httpClient.GetAsync($"{BaseUrl}/collections");
            return await response.Content.ReadAsStringAsync();
        }

        public async Task<string> GetCollectionDataAsync()
        {
            var collectionId = await GetCollectionIdAsync(); //used correctly

            var request = new
            {
                limit = 100,
                include = new[] { "documents", "metadatas" }
            };

            var response = await _httpClient.PostAsJsonAsync(
                $"{BaseUrl}/collections/{collectionId}/get", //dynamic
                request);

            return await response.Content.ReadAsStringAsync();
        }

        public async Task DeleteCollectionAsync()
        {
            var collectionId = await GetCollectionIdAsync(); // ✅ dynamic

            // Reset cache after deletion
            _cachedCollectionId = null;

            await _httpClient.DeleteAsync(
                $"{BaseUrl}/collections/{collectionId}");
        }

        public async Task UpdateMetadataAsync(HotelInfo hotel)
        {
            var collectionId = await GetCollectionIdAsync();

            var documents = new List<(string Id, string Text)>
    {
        ($"hotel_{hotel.Id}_lunch",     $"Hotel: {hotel.HotelName}. Lunch Time: {hotel.LunchTime}"),
        ($"hotel_{hotel.Id}_breakfast", $"Hotel: {hotel.HotelName}. Breakfast Time: {hotel.BreakfastTime}"),
        ($"hotel_{hotel.Id}_gym",       $"Hotel: {hotel.HotelName}. Gym Timing: {hotel.GymTiming}"),
        ($"hotel_{hotel.Id}_pool",      $"Hotel: {hotel.HotelName}. Pool Timing: {hotel.PoolTiming}")
    };

            foreach (var doc in documents)
            {
                var embedding = await _embeddingService.GenerateEmbeddingAsync(doc.Text);

                var request = new
                {
                    ids = new[] { doc.Id },
                    documents = new[] { doc.Text },
                    embeddings = new[] { embedding },
                    metadatas = new[]
                    {
                new Dictionary<string, object>
                {
                    { "hotelId", hotel.Id.ToString() },
                    { "hotelName", hotel.HotelName }
                }
            }
                };

                // Use /upsert instead of /add — updates existing documents
                var response = await _httpClient.PostAsJsonAsync(
                    $"{BaseUrl}/collections/{collectionId}/upsert",
                    request);

                var responseBody = await response.Content.ReadAsStringAsync();
                Console.WriteLine($"[Upsert] {doc.Id} → Status: {response.StatusCode} | {responseBody}");
            }
        }
    }
}