using Microsoft.AspNetCore.Mvc;

namespace Aplifyr.Api.Controllers;

[Microsoft.AspNetCore.Authorization.AllowAnonymous]
[ApiController]
[Route("api/[controller]")]
public class UploadController : ControllerBase
{
    [HttpGet("health")]
    public IActionResult Health() => Ok(new { status = "ok" });

}
