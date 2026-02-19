using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.DependencyInjection;

var builder = WebApplication.CreateBuilder(args);
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
