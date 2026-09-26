using System.Text.Json;

namespace Aplifyr.Api.Letters;

// Read only supported advertisement fields; never interpret source text as instructions.
public static class LetterJobFacts
{
    public static string ReadJobTitle(JsonElement job) =>
        TryReadString(job, "title", out var title) ? title :
        TryReadString(job, "headline", out var headline) ? headline : "";

    public static string ReadEmployer(JsonElement job)
    {
        if (job.TryGetProperty("employer", out var employer) && TryReadString(employer, "name", out var name))
            return name;
        return TryReadString(job, "advertiser", out var advertiser) ? advertiser : "";
    }

    public static string ReadDescription(JsonElement job)
    {
        if (!job.TryGetProperty("description", out var description)) return "";
        if (description.ValueKind == JsonValueKind.String) return description.GetString() ?? "";
        return TryReadString(description, "text", out var text) ? text : "";
    }

    public static string ReadLocation(JsonElement job)
    {
        if (!job.TryGetProperty("workplace_address", out var address)) return "";
        var parts = new List<string>();
        if (TryReadString(address, "municipality", out var municipality)) parts.Add(municipality);
        if (TryReadString(address, "region", out var region)) parts.Add(region);
        return string.Join(", ", parts);
    }

    public static bool TryReadString(JsonElement element, string propertyName, out string value)
    {
        value = "";
        if (element.ValueKind != JsonValueKind.Object || !element.TryGetProperty(propertyName, out var property) ||
            property.ValueKind != JsonValueKind.String) return false;
        value = property.GetString() ?? "";
        return true;
    }
}
