using Aplifyr.Api.Cv;
using Aplifyr.Api.Jobs;
using Aplifyr.Api.Letters;

namespace Aplifyr.Api;

public static class ApplicationServices
{
    public static IServiceCollection AddApplicationServices(this IServiceCollection services)
    {
        services.AddHttpClient<CanonicalJobClient>(client => {
            client.Timeout = TimeSpan.FromSeconds(15);
            client.MaxResponseContentBufferSize = 1024 * 1024;
        }).ConfigurePrimaryHttpMessageHandler(() => new HttpClientHandler { AllowAutoRedirect = false });
        services.AddHttpClient<LetterProvider>(client => {
            client.Timeout = TimeSpan.FromSeconds(30);
            client.MaxResponseContentBufferSize = 128 * 1024;
        }).ConfigurePrimaryHttpMessageHandler(() => new HttpClientHandler { AllowAutoRedirect = false });
        services.AddHttpClient<JobMatchingService>(client => {
            client.Timeout = TimeSpan.FromSeconds(20);
            client.MaxResponseContentBufferSize = 4 * 1024 * 1024;
        });
        services.AddScoped<CvApplicationService>();
        services.AddScoped<LetterApplicationService>();
        return services;
    }
}
