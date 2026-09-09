using System.Net;
using System.Net.Http.Headers;
using System.Security.Claims;
using System.Text.Json;

namespace Aplifyr.Api.Security;

public sealed class AiAuthenticationMiddleware(RequestDelegate next)
{
    public async Task InvokeAsync(HttpContext context, IHttpClientFactory clients, IConfiguration configuration)
    {
        if (!context.Request.Path.StartsWithSegments("/api/coverletters"))
        {
            await next(context);
            return;
        }
        context.Response.Headers.CacheControl = "private, no-store";
        var url = configuration["SUPABASE_URL"];
        var key = configuration["SUPABASE_ANON_KEY"];
        if (!Uri.TryCreate(url, UriKind.Absolute, out var baseUri) ||
            baseUri.Scheme != Uri.UriSchemeHttps || string.IsNullOrWhiteSpace(key))
        {
            context.Response.StatusCode = 503;
            return;
        }
        if (!AuthenticationHeaderValue.TryParse(context.Request.Headers.Authorization, out var header) ||
            !string.Equals(header.Scheme, "Bearer", StringComparison.OrdinalIgnoreCase) ||
            string.IsNullOrWhiteSpace(header.Parameter) || header.Parameter.Length > 16384)
        {
            context.Response.StatusCode = 401;
            return;
        }
        try
        {
            using var request = new HttpRequestMessage(HttpMethod.Get, new Uri(baseUri, "/auth/v1/user"));
            request.Headers.Authorization = header;
            request.Headers.Add("apikey", key);
            using var response = await clients.CreateClient("supabase-auth").SendAsync(request, context.RequestAborted);
            if (!response.IsSuccessStatusCode)
            {
                context.Response.StatusCode = response.StatusCode is HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden ? 401 : 503;
                return;
            }
            using var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync(context.RequestAborted));
            if (!body.RootElement.TryGetProperty("id", out var id) ||
                id.ValueKind != JsonValueKind.String || !Guid.TryParse(id.GetString(), out var userId))
            {
                context.Response.StatusCode = 401;
                return;
            }
            context.User = new ClaimsPrincipal(new ClaimsIdentity(
                [new Claim(ClaimTypes.NameIdentifier, userId.ToString())], "Supabase"));
        }
        catch (Exception error) when (error is HttpRequestException or TaskCanceledException or JsonException)
        {
            context.Response.StatusCode = 503;
            return;
        }
        await next(context);
    }
}
