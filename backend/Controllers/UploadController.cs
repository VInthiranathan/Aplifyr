using Microsoft.AspNetCore.Mvc;

namespace Aplifyr.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class UploadController : ControllerBase
{
    [HttpGet("health")]
    public IActionResult Health() => Ok(new { status = "ok" });

    [HttpPost("upload")]
    public async Task<IActionResult> Upload(IFormFile? file)
    {
        if (file == null) return BadRequest(new { error = "No file provided" });

        var tempPath = Path.GetTempFileName();
        await using (var fs = System.IO.File.Create(tempPath))
        {
            await file.CopyToAsync(fs);
        }

        return Ok(new { filename = file.FileName, size = file.Length });
    }
}
