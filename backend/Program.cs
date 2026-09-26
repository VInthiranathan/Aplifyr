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
builder.Services.AddHttpClient("supabase-auth", client => {
    client.Timeout = TimeSpan.FromSeconds(10);
    client.MaxResponseContentBufferSize = 32768;
})
    .ConfigurePrimaryHttpMessageHandler(() => new HttpClientHandler { AllowAutoRedirect = false });
builder.Services.AddRateLimiter(options => {
    options.RejectionStatusCode = 429;
    options.GlobalLimiter = RequestLimits.Create();
    options.OnRejected = (context, _) => {
        context.HttpContext.Response.Headers.RetryAfter = "60";
        return ValueTask.CompletedTask;
    };
});
builder.Services.AddAuthorization(options => options.FallbackPolicy =
    new Microsoft.AspNetCore.Authorization.AuthorizationPolicyBuilder().RequireAuthenticatedUser().Build());
// Opt in only after the hosting proxy addresses have been verified. Never trust arbitrary X-Forwarded-For.
var trustedProxies = (builder.Configuration["TRUSTED_PROXY_ADDRESSES"] ?? "")
    .Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries)
    .Select(value => System.Net.IPAddress.Parse(value)).ToArray();
if (trustedProxies.Length > 0) builder.Services.Configure<ForwardedHeadersOptions>(options => {
    options.ForwardedHeaders = Microsoft.AspNetCore.HttpOverrides.ForwardedHeaders.XForwardedFor;
    options.ForwardLimit = 1;
    options.KnownIPNetworks.Clear();
    options.KnownProxies.Clear();
    foreach (var address in trustedProxies) options.KnownProxies.Add(address);
});
builder.Services.AddMemoryCache(options => options.SizeLimit = 32);
builder.Services.AddHttpClient("privacy-db", client => { client.Timeout = TimeSpan.FromSeconds(5); client.MaxResponseContentBufferSize = 32768; })
    .ConfigurePrimaryHttpMessageHandler(() => new HttpClientHandler { AllowAutoRedirect = false });
builder.Services.AddSingleton<AiPrivacyGate>();
builder.Services.AddControllers();
builder.Services.AddRequestTimeouts(options => options.AddPolicy("job-search", TimeSpan.FromSeconds(30)));
builder.Services.AddHostedService<Aplifyr.Api.Cv.AiProviderDiagnostics>();

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
if (trustedProxies.Length > 0) app.UseForwardedHeaders();
app.UseRouting();
app.UseRequestTimeouts();
app.UseCors("AllowFrontend");
app.UseMiddleware<AiAuthenticationMiddleware>();
app.UseAuthorization();
app.UseRateLimiter();
app.MapControllers();
app.MapGet("/", () => Results.Ok(new { status = "OK", service = "Aplifyr.Api" })).AllowAnonymous();
app.Run();
