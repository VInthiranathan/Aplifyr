using System.Text.Json;
using Aplifyr.Api.Cv;
using Aplifyr.Api.Security;
using Microsoft.AspNetCore.Mvc;
namespace Aplifyr.Api.Controllers;
[ApiController]
[Route("api/documentrewrites")]
public sealed class DocumentRewritesController(DocumentRewriteService service):ControllerBase {
 [AiGeneration]
 [HttpPost("{jobId}")]
 [RequestSizeLimit(16384)]
 public async Task<IActionResult> Suggest(string jobId,[FromBody]JsonElement request) {
  Response.Headers.CacheControl="private, no-store";
  if(User.Identity?.IsAuthenticated!=true)return Unauthorized(new {error="authentication"});
  using var timeout=CancellationTokenSource.CreateLinkedTokenSource(HttpContext.RequestAborted);timeout.CancelAfter(TimeSpan.FromSeconds(90));
  var original=HttpContext.RequestAborted;HttpContext.RequestAborted=timeout.Token;
  try{return Ok(await service.Suggest(HttpContext,jobId,request));}
  catch(CvFailure e){return StatusCode(e.Status,new {error=e.Code});}
  catch(OperationCanceledException){return StatusCode(504,new {error="timeout"});}
  catch(Exception e) when(e is JsonException or HttpRequestException or InvalidOperationException or KeyNotFoundException){return StatusCode(503,new {error="unavailable"});}
  finally{HttpContext.RequestAborted=original;}
 }
}
