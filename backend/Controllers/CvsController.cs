using Microsoft.AspNetCore.Mvc;
using System.Text.Json;
using Aplifyr.Api.Cv;
using Aplifyr.Api.Security;

namespace Aplifyr.Api.Controllers;

[ApiController]
[Route("api/cvs")]
public sealed class CvsController(CvApplicationService service, ILogger<CvsController> logger) : ControllerBase
{
    [HttpGet("{jobId}")]
    public Task<IActionResult> Get(string jobId) => Run(async () => Ok(await service.Get(HttpContext, jobId)));

    [HttpPatch("{jobId}")]
    [RequestSizeLimit(65536)]
    public Task<IActionResult> Edit(string jobId, [FromBody] JsonElement body) => Run(async () => Ok(await service.Edit(HttpContext, jobId, body)));

    [HttpDelete("{jobId}")]
    public Task<IActionResult> Delete(string jobId) => Run(async () => Ok(await service.Delete(HttpContext, jobId)));

    [AiGeneration]
    [HttpPost("{jobId}/generate")]
    [RequestSizeLimit(1024)]
    public Task<IActionResult> Generate(string jobId) => Run(async () => Ok(await service.Generate(HttpContext, jobId)));

    private async Task<IActionResult> Run(Func<Task<IActionResult>> action)
    {
        Response.Headers.CacheControl = "private, no-store";
        if (User.Identity?.IsAuthenticated != true) return Unauthorized(new { error = "authentication" });
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(HttpContext.RequestAborted);
        timeout.CancelAfter(TimeSpan.FromSeconds(90));
        var originalCancellation = HttpContext.RequestAborted;
        HttpContext.RequestAborted = timeout.Token;
        try { return await action(); }
        catch (CvFailure e) {
            logger.LogWarning("CV generation failed: code={Code}, status={Status}", e.Code, e.Status);
            return StatusCode(e.Status, new { error = e.Code });
        }
        catch (OperationCanceledException) { return StatusCode(504, new { error = "timeout" }); }
        catch (Exception e) when (e is HttpRequestException or JsonException or InvalidOperationException or KeyNotFoundException)
        { return StatusCode(503, new { error = "unavailable" }); }
        finally { HttpContext.RequestAborted = originalCancellation; }
    }
}
