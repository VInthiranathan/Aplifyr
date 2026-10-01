using System.Text.Json;
namespace Aplifyr.Api.Cv;

public sealed class GenerationProfile(HttpClient http, IConfiguration configuration)
{
    public static void Require(JsonElement profile, JsonElement[] career)
    {
        if (string.IsNullOrWhiteSpace(CvContent.Text(profile, "full_name")) ||
            (string.IsNullOrWhiteSpace(CvContent.Text(profile, "bio")) &&
             !CvContent.Strings(profile, "tech_stack").Any(s => !string.IsNullOrWhiteSpace(s)) &&
             !career.Any(e => !string.IsNullOrWhiteSpace(CvContent.Text(e, "title")))))
            throw new CvFailure(422, "profileEmpty");
    }
    public async Task Require(HttpContext context)
    {
        var (profile, career) = await new CvStore(context, configuration, http).Profile();
        Require(profile, career);
    }
}
