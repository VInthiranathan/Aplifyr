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
    catch (Exception ex)
    {
        Console.WriteLine($"[Startup] Supabase initialization skipped: {ex.Message}");
    }
}
else
{
    Console.WriteLine("[Startup] Supabase credentials not configured. Running with local JSON/API-only features.");
}

builder.Services.AddMemoryCache();
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
        "https://nice-ground-071fe1e03.7.azurestaticapps.net",
    };
}

builder.Services.AddCors(options =>
    options.AddPolicy("AllowFrontend", policy =>
        policy.WithOrigins(configuredOrigins)
              .AllowAnyMethod()
              .AllowAnyHeader()));

var app = builder.Build();
app.UseCors("AllowFrontend");
app.MapControllers();
app.MapGet("/", () => Results.Ok(new { status = "OK", service = "Aplifyr.Api" }));
app.Run();
