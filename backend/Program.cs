using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.DependencyInjection;
using DotNetEnv;

// Ladda .env-filen om den finns
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

builder.Services.AddControllers();
builder.Services.AddCors(options =>
    options.AddPolicy("AllowFrontend", policy =>
        policy.WithOrigins("http://localhost:3000", "http://127.0.0.1:3000")
              .AllowAnyMethod()
              .AllowAnyHeader()));

var app = builder.Build();
app.UseCors("AllowFrontend");
app.MapControllers();
app.MapGet("/", () => Results.Ok(new { status = "OK", service = "Examensarbete.Api" }));
app.Run();
