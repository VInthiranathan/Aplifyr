using System.Net.Http.Headers;
using System.Security.Claims;
using System.Text.Json;

namespace Aplifyr.Api.Security;

public sealed class AiPrivacyGate(IHttpClientFactory clients, IConfiguration configuration)
{
    private async Task<JsonElement?> Rpc(string name, object body, CancellationToken cancellation)
    {
        var key = configuration["SUPABASE_SERVICE_ROLE_KEY"];
        if (string.IsNullOrWhiteSpace(key) || !Uri.TryCreate(configuration["SUPABASE_URL"], UriKind.Absolute, out var origin) || origin.Scheme != "https") return null;
        using var request = new HttpRequestMessage(HttpMethod.Post, new Uri(origin, "/rest/v1/rpc/" + name));
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", key);
        request.Headers.Add("apikey", key);
        request.Content = JsonContent.Create(body);
        using var response = await clients.CreateClient("privacy-db").SendAsync(request, cancellation);
        if (!response.IsSuccessStatusCode) return null;
        var text = await response.Content.ReadAsStringAsync(cancellation);
        if (string.IsNullOrWhiteSpace(text)) return null;
        using var doc = JsonDocument.Parse(text);
        return doc.RootElement.Clone();
    }

    public async Task<Lease?> Reserve(HttpContext context, string provider)
    {
        if (context.User.Identity?.IsAuthenticated != true || !Guid.TryParse(context.User.FindFirstValue(ClaimTypes.NameIdentifier), out var user)) return null;
        try
        {
            var result = await Rpc("reserve_ai_call", new { p_user = user, p_provider = provider }, context.RequestAborted);
            return result is { ValueKind: JsonValueKind.String } value && Guid.TryParse(value.GetString(), out var ticket)
                ? new Lease(this, user, ticket) : null;
        }
        catch (Exception e) when (e is HttpRequestException or TaskCanceledException or JsonException) { return null; }
    }

    public sealed class Lease(AiPrivacyGate gate, Guid user, Guid ticket) : IAsyncDisposable
    {
        public async ValueTask DisposeAsync()
        {
            // Release even when browser disconnected. Failed releases expire after 60 seconds.
            using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(5));
            try { await gate.Rpc("release_ai_call", new { p_user = user, p_ticket = ticket }, timeout.Token); }
            catch (Exception e) when (e is HttpRequestException or TaskCanceledException or JsonException) { }
        }
    }
}
