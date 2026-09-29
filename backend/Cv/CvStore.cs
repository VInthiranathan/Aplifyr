using System.Net.Http.Headers;
using System.Text.Json;
using System.Security.Claims;

namespace Aplifyr.Api.Cv;

public sealed class CvStore(HttpContext context, IConfiguration configuration, HttpClient? transport = null)
{
    private static readonly HttpClient Http = new(new HttpClientHandler { AllowAutoRedirect = false })
        { Timeout = TimeSpan.FromSeconds(10), MaxResponseContentBufferSize = 5 * 1024 * 1024 };
    public string UserId => context.User.Identity?.IsAuthenticated == true &&
        Guid.TryParse(context.User.FindFirstValue(ClaimTypes.NameIdentifier), out var id)
        ? id.ToString() : throw new CvFailure(401, "authentication");
    public Task<JsonElement> Request(string path) => Send(path);
    private async Task<JsonElement> Send(string path, HttpMethod? method = null, object? body = null, bool service = false)
    {
        var key = configuration[service ? "SUPABASE_SERVICE_ROLE_KEY" : "SUPABASE_ANON_KEY"];
        if (string.IsNullOrWhiteSpace(key) || !Uri.TryCreate(configuration["SUPABASE_URL"], UriKind.Absolute, out var url) || url.Scheme != "https") throw new CvFailure(503, "configuration");
        using var request = new HttpRequestMessage(method ?? HttpMethod.Get, new Uri(url, "/rest/v1/" + path));
        request.Headers.Add("apikey", key);
        request.Headers.Authorization = service ? new AuthenticationHeaderValue("Bearer", key) : AuthenticationHeaderValue.Parse(context.Request.Headers.Authorization.ToString());
        if (body != null) request.Content = JsonContent.Create(body);
        request.Headers.TryAddWithoutValidation("Prefer", "return=representation");
        using var response = await (transport ?? Http).SendAsync(request, context.RequestAborted);
        if (!response.IsSuccessStatusCode) throw new CvFailure(503, "storage");
        var text = await response.Content.ReadAsStringAsync(context.RequestAborted);
        using var json = JsonDocument.Parse(string.IsNullOrWhiteSpace(text) ? "null" : text);
        return json.RootElement.Clone();
    }
    private string DocumentPath(string table, string jobId)
    {
        if (!System.Text.RegularExpressions.Regex.IsMatch(jobId, "^[A-Za-z0-9_-]{1,100}$")) throw new CvFailure(400, "invalidJob");
        return $"{table}?user_id=eq.{UserId}&job_id=eq.{Uri.EscapeDataString(jobId)}";
    }
    public Task<JsonElement> DeleteCv(string jobId) => Send(DocumentPath("generated_cvs", jobId), HttpMethod.Delete, service: true);
    public Task<JsonElement> DeleteLetter(string jobId) => Send(DocumentPath("generated_cover_letters", jobId), HttpMethod.Delete, service: true);
    public Task<JsonElement> UpdateCv(string jobId, string revision, object content) => Send(
        DocumentPath("generated_cvs", jobId) + "&expires_at=gt." + Uri.EscapeDataString(DateTimeOffset.UtcNow.ToString("O")) +
        "&updated_at=eq." + Uri.EscapeDataString(revision) + "&select=job_id,content,job_context,metadata,created_at,updated_at,expires_at",
        HttpMethod.Patch, new { content, updated_at = DateTimeOffset.UtcNow }, service: true);
    public Task<JsonElement> SaveCv(string jobId, object content, object jobContext, object metadata) => Send(
        "rpc/save_generated_cv_v3", HttpMethod.Post,
        new { p_user = UserId, p_job = jobId, p_content = content, p_context = jobContext, p_metadata = metadata }, service: true);
    public Task<JsonElement> SaveLetter(string jobId, string content, object jobContext, object metadata) => Send(
        "rpc/save_generated_cover_letter", HttpMethod.Post,
        new { p_user = UserId, p_job = jobId, p_content = content, p_context = jobContext, p_metadata = metadata }, service: true);
    public async Task<(JsonElement Profile, JsonElement[] Career)> Profile()
    {
        var profiles = await Request($"profiles?id=eq.{UserId}&select=full_name,title,location,contact_email,phone,website_url,linkedin_url,bio,tech_stack,updated_at&limit=1");
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
