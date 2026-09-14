using System.Text.Json;

namespace Aplifyr.Api.Cv;

public static class CvGeneration
{
    public static async Task<object> Generate(string data, JsonElement profile, JsonElement[] career,
        List<CvContent.Fact> facts, string[] skills, Func<string, string, object, Task<string>> call, string language = "en")
    {
        try
        {
            var output = await call(CvContent.Instructions + "\n" + JobLanguage.Instructions(language), data, CvContent.Schema);
            var content = CvContent.Validate(output, profile, career, facts, skills, omitUnsupported: true);
            var claims = CvGrounding.Claims(content, facts);
            if (claims.GetArrayLength() > 0)
            {
                // No ad or generation conversation reaches this independent factual check.
                var reviewData = JsonSerializer.Serialize(new { claims });
                if (reviewData.Length > 90000) throw new CvFailure(422, "profileLarge");
                var review = await call(CvGrounding.Instructions, reviewData, CvGrounding.Schema);
                content = CvGrounding.Filter(review, claims, content);
            }
            // Trusted document language is assigned by the server, never accepted from model JSON.
            var document = System.Text.Json.Nodes.JsonNode.Parse(JsonSerializer.Serialize(content))!;
            document["language"] = language == "en" ? "en" : "sv";
            return JsonSerializer.SerializeToElement(document);
        }
        catch (JsonException) { throw new CvFailure(502, "invalidOutput"); }
    }
}
