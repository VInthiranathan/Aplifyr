using System.Text.Json;

namespace Aplifyr.Api.Cv;

public static class CvGeneration
{
    public static async Task<object> Generate(string data, JsonElement profile, JsonElement[] career,
        List<CvContent.Fact> facts, string[] skills, Func<string, string, object, Task<string>> call)
    {
        try
        {
            var output = await call(CvContent.Instructions, data, CvContent.Schema);
            var content = CvContent.Validate(output, profile, career, facts, skills);
            var claims = CvGrounding.Claims(content, facts);
            if (claims.GetArrayLength() > 0)
            {
                // No ad or generation conversation reaches this independent factual check.
                var reviewData = JsonSerializer.Serialize(new { claims });
                if (reviewData.Length > 90000) throw new CvFailure(422, "profileLarge");
                var review = await call(CvGrounding.Instructions, reviewData, CvGrounding.Schema);
                CvGrounding.Validate(review, claims);
            }
            return content;
        }
        catch (JsonException) { throw new CvFailure(502, "invalidOutput"); }
    }
}
