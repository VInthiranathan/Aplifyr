using Microsoft.AspNetCore.Mvc;
using Aplifyr.Api.Jobs;
using static Aplifyr.Api.Jobs.JobSearchCatalog;

namespace Aplifyr.Api.Controllers;

public partial class ExternalJobsController
{
    [HttpPost("match")]
    public async Task<IActionResult> Match([FromBody] MatchProfileRequest? profile, [FromQuery] int limit = DEFAULT_MATCH_RESPONSE_LIMIT, [FromQuery] int seed = 0)
    {
        try { return Content(await _matching.Match(profile, limit, seed, HttpContext.RequestAborted), "application/json"); }
        catch (JobSearchFailure failure) { return MatchFailure(failure); }
    }

    [HttpPost("match/continue")]
    public async Task<IActionResult> MatchContinue([FromBody] MatchProfileRequest? profile)
    {
        try { return Ok(await _matching.MatchContinue(profile, HttpContext.RequestAborted)); }
        catch (JobSearchFailure failure) { return MatchFailure(failure); }
    }

    private IActionResult MatchFailure(JobSearchFailure failure) => failure.Status == 400
        ? BadRequest(new {error = failure.Code}) : StatusCode(failure.Status, new {error = failure.Code});
}
