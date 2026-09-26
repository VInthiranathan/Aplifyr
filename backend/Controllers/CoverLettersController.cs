using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using System.Text.Json;
using System.Text.RegularExpressions;
using Aplifyr.Api.Security;
using Aplifyr.Api.Cv;
using Aplifyr.Api.Letters;

namespace Aplifyr.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public sealed class CoverLettersController(LetterApplicationService service, IConfiguration configuration) : ControllerBase
{
    [HttpGet("{jobId}")]
    public async Task<IActionResult> GetSaved(string jobId)
    {
        Response.Headers.CacheControl = "private, no-store";
        if (User.Identity?.IsAuthenticated != true) return Unauthorized(new { error = "authentication" });
        if (!LetterApplicationService.ValidJobId(jobId)) return BadRequest(new { error = "invalidJob" });
        try
        {
            var store = new CvStore(HttpContext, configuration);
            var saved = await store.Request($"generated_cover_letters?user_id=eq.{store.UserId}&job_id=eq.{Uri.EscapeDataString(jobId)}&expires_at=gt.{Uri.EscapeDataString(DateTimeOffset.UtcNow.ToString("O"))}&select=job_id,content,job_context,metadata,created_at,updated_at,expires_at&limit=1");
            return Ok(new { letter = saved.GetArrayLength() == 1 ? saved[0] : (JsonElement?)null });
        }
        catch (CvFailure failure)
        {
            return StatusCode(failure.Status, new { error = failure.Code });
        }
    }

    [HttpDelete("{jobId}")]
    public async Task<IActionResult> DeleteSaved(string jobId)
    {
        Response.Headers.CacheControl = "private, no-store";
        if (User.Identity?.IsAuthenticated != true) return Unauthorized(new { error = "authentication" });
        if (!LetterApplicationService.ValidJobId(jobId)) return BadRequest(new { error = "invalidJob" });
        try
        {
            var store = new CvStore(HttpContext, configuration);
            await store.DeleteLetter(jobId);
            return Ok(new { deleted = true });
        }
        catch (CvFailure failure)
        {
            return StatusCode(failure.Status, new { error = failure.Code });
        }
    }

    [AiGeneration]
    [HttpPost("generate-all")]
    [RequestSizeLimit(64 * 1024)]
    public async Task<IActionResult> GenerateAll([FromBody] JsonElement request)
    {
        Response.Headers.CacheControl = "private, no-store";
        if (User.Identity?.IsAuthenticated != true) return Unauthorized(new { error = "authentication" });
        try { return Ok(await service.GenerateAll(HttpContext, request)); }
        catch (CvFailure failure) { return StatusCode(failure.Status, new { error = failure.Code }); }
        catch (OperationCanceledException) { return StatusCode(504, new { error = "timeout" }); }
    }
}
