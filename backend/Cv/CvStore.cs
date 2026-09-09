using System.Net.Http.Headers;
using System.Text.Json;
using System.Security.Claims;

namespace Aplifyr.Api.Cv;

public sealed class CvStore(HttpContext context, IConfiguration configuration)
{
    private static readonly HttpClient Http = new(new HttpClientHandler { AllowAutoRedirect = false })
        { Timeout = TimeSpan.FromSeconds(10), MaxResponseContentBufferSize = 5 * 1024 * 1024 };
    public string UserId => context.User.FindFirstValue(ClaimTypes.NameIdentifier) ?? throw new CvFailure(401, "authentication");
    public async Task<JsonElement> Request(string path, HttpMethod? method = null, object? body = null, bool service = false)
    {
        var key = configuration[service ? "SUPABASE_SERVICE_ROLE_KEY" : "SUPABASE_ANON_KEY"];
        if (string.IsNullOrWhiteSpace(key) || !Uri.TryCreate(configuration["SUPABASE_URL"], UriKind.Absolute, out var url) || url.Scheme != "https") throw new CvFailure(503, "configuration");
        using var request = new HttpRequestMessage(method ?? HttpMethod.Get, new Uri(url, "/rest/v1/" + path));
        request.Headers.Add("apikey", key);
        request.Headers.Authorization = service ? new AuthenticationHeaderValue("Bearer", key) : AuthenticationHeaderValue.Parse(context.Request.Headers.Authorization.ToString());
        if (body != null) request.Content = JsonContent.Create(body);
        request.Headers.TryAddWithoutValidation("Prefer", "return=representation");
        using var response = await Http.SendAsync(request, context.RequestAborted);
        if (!response.IsSuccessStatusCode) throw new CvFailure(503, "storage");
        var text = await response.Content.ReadAsStringAsync(context.RequestAborted);
        using var json = JsonDocument.Parse(string.IsNullOrWhiteSpace(text) ? "null" : text);
        return json.RootElement.Clone();
    }
    public async Task<JsonElement?> Saved(string jobId)
    {
        var rows = await Request($"generated_cvs?user_id=eq.{UserId}&job_id=eq.{Uri.EscapeDataString(jobId)}&select=job_id,content,job_context,metadata,created_at,updated_at&limit=1");
        return rows.GetArrayLength() == 0 ? null : rows[0];
    }
    public async Task<(JsonElement Profile, JsonElement[] Career)> Profile()
    {
        var profiles = await Request($"profiles?id=eq.{UserId}&select=full_name,title,location,bio,tech_stack,updated_at&limit=1");
        if (profiles.GetArrayLength() == 0) throw new CvFailure(422, "profileEmpty");
        var career = new List<JsonElement>();
        var cursor = "";
        for (var page = 0; page < 202; page++)
        {
            var rows = await Request($"profile_career_entries?user_id=eq.{UserId}&select=id,kind,title,organization,qualification,start_month,end_month,is_current,description,achievements,learned,strengths,skills,updated_at&order=id&limit=100" + (cursor.Length == 0 ? "" : "&id=gt." + cursor));
            if (rows.GetArrayLength() == 0) return (profiles[0], career.ToArray());
            career.AddRange(rows.EnumerateArray());
            if (career.Count > 200 || JsonSerializer.Serialize(career).Length > 4 * 1024 * 1024) throw new CvFailure(422, "profileLarge");
            var next = CvContent.Text(career[^1], "id");
            if (!Guid.TryParse(next, out _) || next == cursor) throw new CvFailure(503, "storage");
            cursor = next;
        }
        throw new CvFailure(422, "profileLarge");
    }
}
