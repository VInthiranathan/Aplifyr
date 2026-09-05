using Microsoft.AspNetCore.Mvc;
using System.Text.Json;

namespace Aplifyr.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class UserController : ControllerBase
{
    private readonly IWebHostEnvironment _env;

    public UserController(IWebHostEnvironment env)
    {
        _env = env;
    }

    [HttpGet]
    public IActionResult GetUser()
    {
        var path = Path.Combine(_env.ContentRootPath, "Data", "user.json");
        if (!System.IO.File.Exists(path))
            return NotFound(new { error = "user.json not found" });

        var json = System.IO.File.ReadAllText(path);
        var user = JsonSerializer.Deserialize<object>(json);
        return Ok(user);
    }
}
