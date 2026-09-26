using System.Security.Claims;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Authorization;

namespace Aplifyr.Api.Security;

[AttributeUsage(AttributeTargets.Method)]
public sealed class AiGenerationAttribute : Attribute;

public static class RequestLimits
{
    private static string Category(HttpContext context) =>
        context.GetEndpoint()?.Metadata.GetMetadata<AiGenerationAttribute>() != null ? "generation" :
        context.GetEndpoint()?.Metadata.GetMetadata<IAllowAnonymous>() != null ? "public" : "documents";

    public static PartitionedRateLimiter<HttpContext> Create() => PartitionedRateLimiter.CreateChained(
        PartitionedRateLimiter.Create<HttpContext, string>(context => {
            var category = Category(context);
            // Never trust caller-supplied forwarding headers. Authenticated users get independent budgets.
            var owner = context.User.Identity?.IsAuthenticated == true
                ? context.User.FindFirstValue(ClaimTypes.NameIdentifier) : context.Connection.RemoteIpAddress?.ToString() ?? "unknown-peer";
            return RateLimitPartition.GetFixedWindowLimiter(category + ":" + owner, _ => new FixedWindowRateLimiterOptions {
                PermitLimit = category == "generation" ? 6 : 120, Window = TimeSpan.FromMinutes(1), QueueLimit = 0,
            });
        }),
        PartitionedRateLimiter.Create<HttpContext, string>(context => {
            var category = Category(context);
            var owner = context.User.FindFirstValue(ClaimTypes.NameIdentifier) ?? context.Connection.RemoteIpAddress?.ToString() ?? "unknown-peer";
            return RateLimitPartition.GetConcurrencyLimiter(category + ":" + owner,
                _ => new ConcurrencyLimiterOptions { PermitLimit = category == "generation" ? 1 : 2, QueueLimit = 0 });
        }),
        PartitionedRateLimiter.Create<HttpContext, string>(context => {
            var category = Category(context);
            // Slow public searches and AI calls cannot occupy document-read capacity.
            return RateLimitPartition.GetConcurrencyLimiter(category,
                _ => new ConcurrencyLimiterOptions { PermitLimit = category == "documents" ? 8 : 4, QueueLimit = 0 });
        }));
}
