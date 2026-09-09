using System.Threading.RateLimiting;
using Microsoft.AspNetCore.RateLimiting;
using Aplifyr.Api.Security;
using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Configuration;
using DotNetEnv;

// Load .env when present
try
{
    Env.Load();
}
catch
{
    // Local dev can run against the JSON-backed endpoints without a .env file.
}

var builder = WebApplication.CreateBuilder(args);

var supabaseUrl = Environment.GetEnvironmentVariable("SUPABASE_URL");
var supabaseKey = Environment.GetEnvironmentVariable("SUPABASE_SERVICE_ROLE_KEY");

if (!string.IsNullOrWhiteSpace(supabaseUrl) && !string.IsNullOrWhiteSpace(supabaseKey))
{
    try
    {
        var supabaseOptions = new Supabase.SupabaseOptions { AutoConnectRealtime = false };
        var supabaseClient = new Supabase.Client(supabaseUrl, supabaseKey, supabaseOptions);
        await supabaseClient.InitializeAsync();
        builder.Services.AddSingleton(supabaseClient);
    }
    catch (Exception)
    {
        Console.WriteLine("[Startup] Supabase initialization skipped.");
    }
}
else
{
    Console.WriteLine("[Startup] Supabase credentials not configured. Running with local JSON/API-only features.");
}

builder.WebHost.ConfigureKestrel(options => options.Limits.MaxRequestBodySize = 128 * 1024);
builder.Services.AddHttpClient("supabase-auth", client => client.Timeout = TimeSpan.FromSeconds(10))
    .ConfigurePrimaryHttpMessageHandler(() => new HttpClientHandler { AllowAutoRedirect = false });
// Fixed process-wide partitions bound anonymous traffic and AI costs without trusting forwarded IPs.
builder.Services.AddRateLimiter(options => {
    options.RejectionStatusCode = 429;
    options.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(context => {
        var ai = context.Request.Path.StartsWithSegments("/api/coverletters") || context.Request.Path.StartsWithSegments("/api/cvs");
        return RateLimitPartition.GetFixedWindowLimiter(ai ? "ai" : "api", _ => new FixedWindowRateLimiterOptions {
            PermitLimit = ai ? 10 : 120, Window = TimeSpan.FromMinutes(1), QueueLimit = 0,
        });
    });
    options.GlobalLimiter = PartitionedRateLimiter.CreateChained(options.GlobalLimiter,
        PartitionedRateLimiter.Create<HttpContext, string>(_ => RateLimitPartition.GetConcurrencyLimiter("requests",
            _ => new ConcurrencyLimiterOptions { PermitLimit = 8, QueueLimit = 0 })));
});
builder.Services.AddMemoryCache(options => options.SizeLimit = 32);
builder.Services.AddHttpClient("privacy-db", client => { client.Timeout = TimeSpan.FromSeconds(5); client.MaxResponseContentBufferSize = 32768; })
    .ConfigurePrimaryHttpMessageHandler(() => new HttpClientHandler { AllowAutoRedirect = false });
builder.Services.AddSingleton<AiPrivacyGate>();
builder.Services.AddControllers();

var configuredOrigins = builder.Configuration
    .GetSection("AllowedOrigins")
    .Get<string[]>()
    ?.Where(origin => !string.IsNullOrWhiteSpace(origin))
    .Select(origin => origin.Trim().Trim('"', '\'', '[', ']'))
    .Where(origin => !string.IsNullOrWhiteSpace(origin))
    .Distinct(StringComparer.OrdinalIgnoreCase)
    .ToArray();

if (configuredOrigins == null || configuredOrigins.Length == 0)
{
    var rawOrigins = builder.Configuration["AllowedOrigins"]
        ?? builder.Configuration["CORS_ALLOWED_ORIGINS"];

    configuredOrigins = (rawOrigins ?? string.Empty)
        .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
        .Where(origin => !string.IsNullOrWhiteSpace(origin))
        .Select(origin => origin.Trim().Trim('"', '\'', '[', ']'))
        .Where(origin => !string.IsNullOrWhiteSpace(origin))
        .Distinct(StringComparer.OrdinalIgnoreCase)
        .ToArray();
}

if (configuredOrigins == null || configuredOrigins.Length == 0)
{
    configuredOrigins = new[]
    {
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    };
}

builder.Services.AddCors(options =>
    options.AddPolicy("AllowFrontend", policy =>
        policy.WithOrigins(configuredOrigins)
              .AllowAnyMethod()
              .AllowAnyHeader()));

var app = builder.Build();
app.UseCors("AllowFrontend");
app.UseRateLimiter();
app.UseMiddleware<AiAuthenticationMiddleware>();
app.MapControllers();
app.MapGet("/", () => Results.Ok(new { status = "OK", service = "Aplifyr.Api" }));
app.Run();
