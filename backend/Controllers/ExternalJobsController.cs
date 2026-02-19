using Microsoft.AspNetCore.Mvc;

namespace Examensarbete.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ExternalJobsController : ControllerBase
{
    private static readonly HttpClient _http = new();
    private const string AF_BASE = "https://jobsearch.api.jobtechdev.se/search";

    [HttpGet]
    public async Task<IActionResult> Search(
        [FromQuery] string? q,
        [FromQuery] string? municipality,
        [FromQuery] string? region,
        [FromQuery] bool? remote,
        [FromQuery] string? workingHoursType,  // "FULL_TIME" | "PART_TIME"
        [FromQuery] int limit = 20,
        [FromQuery] int offset = 0)
    {
        var qs = System.Web.HttpUtility.ParseQueryString(string.Empty);
        if (!string.IsNullOrWhiteSpace(q))            qs["q"]             = q;
        if (!string.IsNullOrWhiteSpace(municipality)) qs["municipality"]  = municipality;
        if (!string.IsNullOrWhiteSpace(region))       qs["region"]        = region;
        if (remote.HasValue)                          qs["remote"]        = remote.Value.ToString().ToLower();
        if (!string.IsNullOrWhiteSpace(workingHoursType)) qs["working_hours_type"] = workingHoursType;
        qs["limit"]  = limit.ToString();
        qs["offset"] = offset.ToString();

        var url = $"{AF_BASE}?{qs}";

        try
        {
            var response = await _http.GetAsync(url);
            var content  = await response.Content.ReadAsStringAsync();
            return Content(content, "application/json");
        }
        catch (Exception ex)
        {
            return StatusCode(502, new { error = "Could not reach Arbetsförmedlingen API", detail = ex.Message });
        }
    }
}
