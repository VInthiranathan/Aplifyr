using System.Net;
using System.Net.Http.Headers;
using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using System.Threading.RateLimiting;

namespace Aplifyr.Api.Security;

public sealed class AiAuthenticationMiddleware(RequestDelegate next)
{
    private static readonly PartitionedRateLimiter<HttpContext> AuthenticationRequests = PartitionedRateLimiter.CreateChained(
        PartitionedRateLimiter.Create<HttpContext, string>(context => RateLimitPartition.GetFixedWindowLimiter(
            context.Connection.RemoteIpAddress?.ToString() ?? "unknown-peer",
            _ => new FixedWindowRateLimiterOptions { PermitLimit = 120, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 })),
        PartitionedRateLimiter.Create<HttpContext, string>(context => RateLimitPartition.GetConcurrencyLimiter(
            context.Connection.RemoteIpAddress?.ToString() ?? "unknown-peer",
            _ => new ConcurrencyLimiterOptions { PermitLimit = 2, QueueLimit = 0 })),
        PartitionedRateLimiter.Create<HttpContext, string>(_ => RateLimitPartition.GetConcurrencyLimiter("authentication",
            _ => new ConcurrencyLimiterOptions { PermitLimit = 8, QueueLimit = 0 })));
    public async Task InvokeAsync(HttpContext context, IHttpClientFactory clients, IConfiguration configuration)
    {
        // Protect new endpoints by default. Public access must be explicit endpoint metadata.
        if (context.GetEndpoint()?.Metadata.GetMetadata<IAllowAnonymous>() != null)
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
        using var admission = AuthenticationRequests.AttemptAcquire(context);
        if (!admission.IsAcquired)
        {
            context.Response.StatusCode = 429;
            context.Response.Headers.RetryAfter = "1";
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
        // Release auth-only capacity before running slower application/AI work.
        admission.Dispose();
        await next(context);
    }
}
