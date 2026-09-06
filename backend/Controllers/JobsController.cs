using Microsoft.AspNetCore.Mvc;
using System.Text.Json;

namespace Aplifyr.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class JobsController : ControllerBase
{
    private readonly IWebHostEnvironment _env;

    public JobsController(IWebHostEnvironment env)
    {
        _env = env;
    }

    [HttpGet]
    public IActionResult GetJobs()
    {
        var path = Path.Combine(_env.ContentRootPath, "Data", "jobs.json");
        if (!System.IO.File.Exists(path))
            return NotFound(new { error = "jobs.json not found" });

        var json = System.IO.File.ReadAllText(path);
        var data = JsonSerializer.Deserialize<object>(json);
        return Ok(data);
    }
}
