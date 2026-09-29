namespace Aplifyr.Api.Jobs;

public class MatchProfileRequest
{
    public string[]? Roles { get; set; }
    public string? Title { get; set; }
    public string[]? Tags { get; set; }
    public string? Location { get; set; }
    public string[]? LocationPreferences { get; set; }
}
