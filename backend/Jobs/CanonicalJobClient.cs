using System.Text.Json;
using Aplifyr.Api.Cv;

namespace Aplifyr.Api.Jobs;

public sealed class CanonicalJobClient(HttpClient http)
{
    public async Task<JsonElement> Get(string id, CancellationToken cancellation)
    {
        using var response = await http.GetAsync("https://jobsearch.api.jobtechdev.se/ad/" + Uri.EscapeDataString(id), cancellation);
        if ((int)response.StatusCode is 404 or 410) throw new CvFailure(410, "jobUnavailable");
        if (!response.IsSuccessStatusCode) throw new CvFailure(502, "jobUnavailable");
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync(cancellation));
        if (CvContent.Text(doc.RootElement, "id") != id) throw new CvFailure(502, "jobUnavailable");
        return doc.RootElement.Clone();
    }
}
