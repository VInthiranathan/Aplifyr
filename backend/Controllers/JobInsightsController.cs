using Microsoft.AspNetCore.Mvc;
using Aplifyr.Api.Jobs;
using Aplifyr.Api.Cv;
namespace Aplifyr.Api.Controllers;
[ApiController]
[Route("api/jobinsights")]
public sealed class JobInsightsController(JobInsightsService service):ControllerBase {
 [HttpGet("{jobId}")]
 public async Task<IActionResult> Get(string jobId) {
  Response.Headers.CacheControl="private, no-store";
  if(User.Identity?.IsAuthenticated!=true)return Unauthorized(new {error="authentication"});
  try{return Ok(await service.Get(HttpContext,jobId));}
  catch(CvFailure e){return StatusCode(e.Status,new {error=e.Code});}
  catch(OperationCanceledException){return StatusCode(504,new {error="timeout"});}
  catch(Exception e) when(e is System.Text.Json.JsonException or HttpRequestException or InvalidOperationException){return StatusCode(503,new {error="unavailable"});}
 }
}
