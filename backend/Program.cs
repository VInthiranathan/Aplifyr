using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.DependencyInjection;
using DotNetEnv;

// Ladda .env-filen om den finns
Env.Load();

var builder = WebApplication.CreateBuilder(args);

// Supabase-konfiguration från .env / miljövariabler
var supabaseUrl = Environment.GetEnvironmentVariable("SUPABASE_URL")
    ?? throw new InvalidOperationException("SUPABASE_URL saknas i .env");
var supabaseKey = Environment.GetEnvironmentVariable("SUPABASE_SERVICE_ROLE_KEY")
    ?? throw new InvalidOperationException("SUPABASE_SERVICE_ROLE_KEY saknas i .env");

var supabaseOptions = new Supabase.SupabaseOptions { AutoConnectRealtime = false };
var supabaseClient = new Supabase.Client(supabaseUrl, supabaseKey, supabaseOptions);
await supabaseClient.InitializeAsync();

builder.Services.AddSingleton(supabaseClient);
builder.Services.AddControllers();
builder.Services.AddCors(options =>
    options.AddPolicy("AllowFrontend", policy =>
        policy.WithOrigins("http://localhost:3000")
              .AllowAnyMethod()
              .AllowAnyHeader()));

var app = builder.Build();
app.UseCors("AllowFrontend");
app.MapControllers();
app.MapGet("/", () => Results.Ok(new { status = "OK", service = "Examensarbete.Api" }));
app.Run();
