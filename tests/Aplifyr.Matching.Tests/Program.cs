using Aplifyr.Api.Controllers;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging.Abstractions;
using System.Text.Json;

static class Program
{
    static void Equal<T>(T expected, T actual)
    {
        if (!EqualityComparer<T>.Default.Equals(expected, actual)) throw new Exception($"Expected {expected}, got {actual}");
    }
    static string Page(int total, params object[] hits) => JsonSerializer.Serialize(new { total = new { value = total }, hits });
    static object Job(string id, string headline = "Backend developer", string city = "Stockholm", bool remote = false, string text = "", string? region = "Stockholms län") =>
        new { id, headline, remote, description = new { text }, workplace_address = new { municipality = city, region, country = "Sverige" } };
    static async Task<JsonElement> Match(Fake controller, MatchProfileRequest? profile = null, int limit = 1, int seed = 0)
    {
        controller.ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext() };
        var result = await controller.Match(profile ?? new() { Roles = ["Backend developer"] }, limit, seed);
        if (result is not ContentResult content) throw new Exception($"Unexpected result {JsonSerializer.Serialize(result)}");
        using var doc = JsonDocument.Parse(content.Content!);
        return doc.RootElement.Clone();
    }
    static JsonElement Jobs(JsonElement result) => result.GetProperty("matched");
    static async Task Main()
    {
        var tests = new (string Name, Func<Task> Run)[] {
            ("Empty profile and zero-hit responses include complete stats", async () => {
                var c = new Fake((q,o) => Page(0));
                var empty = await Match(c, new());
                Equal("none", empty.GetProperty("profileUsed").GetProperty("desiredRolesSource").GetString());
                Equal(true, empty.GetProperty("stats").GetProperty("fetchComplete").GetBoolean());
                Equal(0, c.Calls.Count);
                Equal(true, (await Match(c)).GetProperty("stats").GetProperty("fetchComplete").GetBoolean());
                await c.MatchContinue(new() { Roles = ["Backend developer"] });
                Equal(1, c.Calls.Count);
            }),
            ("Two points is B, and local plus skill ranks above local alone", async () => {
                var c = new Fake((q,o) => Page(3, Job("z", text:"SQL"), Job("a"), Job("b", city:"Solna")));
                var r = await Match(c, new() { Roles=["Backend developer"], Location="Stockholm", LocationPreferences=["region"], Tags=["SQL"] }, 10);
                Equal("z", Jobs(r)[0].GetProperty("id").GetString());
                Equal("A", Jobs(r)[1].GetProperty("matchGrade").GetString());
                Equal("B", Jobs(r)[2].GetProperty("matchGrade").GetString());
            }),
            ("Role specialization is required and unrelated word fragments do not match", async () => {
                var c = new Fake((q,o) => Page(4, Job("1","Frontend developer"), Job("2","Backend developer"), Job("3","Backendutvecklare"), Job("4","Backend development manager")));
                var r = await Match(c, limit:10);
                Equal(2, Jobs(r).GetArrayLength());
                Equal("2", Jobs(r)[0].GetProperty("id").GetString());
                Equal("3", Jobs(r)[1].GetProperty("id").GetString());
            }),
            ("Technical role punctuation is preserved", async () => {
                var c = new Fake((q,o) => Page(3,Job("1","C++ developer"),Job("2","C# developer"),Job("3","C developer")));
                Equal("1",Jobs(await Match(c,new(){Roles=["C++ developer"]},10))[0].GetProperty("id").GetString());
                Equal(1,Jobs(await Match(c,new(){Roles=["C# developer"]},10)).GetArrayLength());
            }),
            ("Every desired role has its own search and duplicate ads appear once", async () => {
                var c = new Fake((q,o) => q == "Teacher" ? Page(2, Job("2","Teacher"),Job("2","Teacher")) : Page(1,Job("1")));
                var r = await Match(c,new(){Roles=["Teacher","Backend developer"]},10);
                Equal(2,Jobs(r).GetArrayLength());
                Equal(2,c.Calls.Count);
            }),
            ("Continuation keeps score order and deduplicates within and across pages", async () => {
                var c = new Fake((q,o) => o == 0 ? Page(3,Job("b")) : Page(3,Job("a",text:"SQL"),Job("a",text:"SQL")));
                var p = new MatchProfileRequest { Roles=["Backend developer"], Tags=["SQL"], Location="Stockholm", LocationPreferences=["onlyMyLocation"] };
                await Match(c,p);
                await c.MatchContinue(p);
                var r = await Match(c,p,10);
                Equal(2,Jobs(r).GetArrayLength());
                Equal("a",Jobs(r)[0].GetProperty("id").GetString());
                Equal(true,r.GetProperty("stats").GetProperty("fetchComplete").GetBoolean());
            }),
            ("Failed or malformed pages do not advance the cursor and can be retried", async () => {
                var fail=true;
                var c = new Fake((q,o) => o==0 ? Page(2,Job("1")) : fail ? "{}" : Page(2,Job("2")));
                var p = new MatchProfileRequest {Roles=["Backend developer"]};
                await Match(c,p);
                Equal(502,((ObjectResult)await c.MatchContinue(p)).StatusCode);
                fail=false;
                await c.MatchContinue(p);
                Equal(1,c.Calls[^2].Offset); Equal(1,c.Calls[^1].Offset);
                Equal(2,Jobs(await Match(c,p,10)).GetArrayLength());
            }),
            ("Concurrent continuations serialize cursor changes", async () => {
                var c = new Fake((q,o) => Page(3,Job(o.ToString()))) { Delay = true };
                var p = new MatchProfileRequest {Roles=["Backend developer"]};
                await Match(c,p);
                await Task.WhenAll(c.MatchContinue(p),c.MatchContinue(p));
                Equal("0,1,2",string.Join(',',c.Calls.Select(call=>call.Offset)));
            }),
            ("Concurrent initial requests share one cached search", async () => {
                var c = new Fake((q,o) => Page(1,Job("1"))) { Delay=true };
                await Task.WhenAll(Match(c),Match(c)); Equal(1,c.Calls.Count);
            }),
            ("Skill aliases, phrases, C++ and terms after 2000 characters match without Java/JavaScript confusion", async () => {
                var c = new Fake((q,o) => Page(1,Job("1",text:new string(' ',2200)+"ASP.NET Core, C++, project management and JavaScript.")));
                var r = await Match(c,new(){Roles=["Backend developer"],Tags=[".NET","C++","project management","Java"]});
                var terms=Jobs(r)[0].GetProperty("matchDebug").GetProperty("matchedTechTerms");
                Equal("c++,dotnet,project management",string.Join(',',terms.EnumerateArray().Select(x=>x.GetString())));
            }),
            ("Remote-only does not reward local office work; no preference is neutral", async () => {
                var c = new Fake((q,o) => Page(2,Job("office"),Job("remote",city:"Malmö",remote:true)));
                var r=await Match(c,new(){Roles=["Backend developer"],Location="Stockholm",LocationPreferences=["remote"]},10);
                Equal("remote",Jobs(r)[0].GetProperty("id").GetString());
                Equal("C",Jobs(r)[1].GetProperty("matchGrade").GetString());
                Equal("B",Jobs(await Match(c,new(){Roles=["Backend developer"],Location="Stockholm"},10))[0].GetProperty("matchGrade").GetString());
            }),
            ("Cache keys are case/order stable and delimiter-safe", async () => {
                var c=new Fake((q,o)=>Page(1,Job("1")));
                await Match(c,new(){Roles=["Backend developer"],Tags=["SQL","C#"]});
                await Match(c,new(){Roles=["backend DEVELOPER"],Tags=["c#","sql"]});
                Equal(1,c.Calls.Count);
                await Match(c,new(){Roles=["Backend developer"],Tags=["sql|csharp"]}); Equal(2,c.Calls.Count);
            }),
            ("Missing optional and malformed nested fields do not crash matching", async () => {
                var c=new Fake((q,o)=>Page(1,new{id="1",headline="Backend developer",occupation="bad",workplace_address="bad",description=12}));
                Equal(1,Jobs(await Match(c)).GetArrayLength());
            }),
            ("Invalid request arrays and lengths are rejected before upstream calls", async () => {
                var c=new Fake((q,o)=>Page(0));
                Equal(400,((BadRequestObjectResult)await c.Match(new(){Roles=new string[21]})).StatusCode);
                Equal(400,((BadRequestObjectResult)await c.Match(new(){Tags=[null!]})).StatusCode);
                Equal(0,c.Calls.Count);
            }),
        };
        foreach(var test in tests) { await test.Run(); Console.WriteLine($"PASS {test.Name}"); }
        Console.WriteLine($"{tests.Length} matching regression tests passed.");
    }
    sealed class Fake(Func<string,int,string> respond) : ExternalJobsController(new MemoryCache(new MemoryCacheOptions()), NullLogger<ExternalJobsController>.Instance)
    {
        public List<(string Query,int Offset)> Calls {get;}=new();
        public bool Delay {get;init;}
        protected override async Task<string> FetchAfSearchPageRawAsync(string searchTerm,int offset,int limit)
        {
            Calls.Add((searchTerm,offset));
            if(Delay) await Task.Delay(20);
            return respond(searchTerm,offset);
        }

    }
}
