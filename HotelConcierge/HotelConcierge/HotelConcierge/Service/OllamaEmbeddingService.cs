using HotelConcierge.Service;
using System.Text;
using System.Text.Json;

public class OllamaEmbeddingService : IEmbeddingService
{
    private readonly HttpClient _httpClient;

    public OllamaEmbeddingService(HttpClient httpClient)
    {
        _httpClient = httpClient;
    }

    //accepts a text string that needs to be converted into an embedding vector.
    public async Task<List<float>> GenerateEmbeddingAsync(string text)
    {
        //nomic-embed-text = converts text into list of numbers(vectors)
        var request = new
        {
            model = "nomic-embed-text",
            prompt = text
        };

        //The request object is converted into JSON format before being sent to the API.
        var json = JsonSerializer.Serialize(request);

        var response = await _httpClient.PostAsync(
            "http://localhost:11434/api/embeddings",
            new StringContent(json, Encoding.UTF8, "application/json"));

        response.EnsureSuccessStatusCode();

        //The JSON response received from the Ollama API is read as a string.
        var result = await response.Content.ReadAsStringAsync();

        //JSON response is Parsed using JSONDocument
        using var doc = JsonDocument.Parse(result);

        //retrieves the embedding array, converts each value into a float, and stores the values in a list.
        return doc.RootElement
            .GetProperty("embedding")
            .EnumerateArray()
            .Select(x => x.GetSingle())
            .ToList();
    }
}