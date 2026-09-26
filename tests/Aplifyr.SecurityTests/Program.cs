using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.AspNetCore.Authorization;
using System.Security.Claims;
using System.Net;
using Aplifyr.Api.Security;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;

var passed = 0;
async Task Check(string name, string? token, string? url, HttpStatusCode remoteStatus, string body, int expected, bool proceeds = false)
{
    foreach (var protectedPath in new[] { "/api/coverletters/generate-all", "/api/cvs/123/generate", "/api/future-private-feature" })
    {
    var context = new DefaultHttpContext();
    context.Request.Path = protectedPath;
    if (token != null) context.Request.Headers.Authorization = token;
    var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> {
        ["SUPABASE_URL"] = url, ["SUPABASE_ANON_KEY"] = "public-test-key"
    }).Build();
    var factory = new FakeFactory(remoteStatus, body);
    var called = false;
    var middleware = new AiAuthenticationMiddleware(_ => { called = true; return Task.CompletedTask; });
    await middleware.InvokeAsync(context, factory, config);
    if (context.Response.StatusCode != expected || called != proceeds) throw new Exception(name);
    if (proceeds && context.User.Identity?.IsAuthenticated != true) throw new Exception("Unverified principal");
    if (context.Response.Headers.CacheControl != "private, no-store") throw new Exception("Missing cache guard");
    if (factory.Handler.Request != null && factory.Handler.Request != "https://example.supabase.co/auth/v1/user") throw new Exception("Unexpected auth destination");
    passed++;
    }
}
await Check("missing configuration", "Bearer x", null, HttpStatusCode.OK, "{}", 503);
await Check("insecure auth origin", "Bearer x", "http://example.supabase.co", HttpStatusCode.OK, "{}", 503);
await Check("missing token", null, "https://example.supabase.co", HttpStatusCode.OK, "{}", 401);
await Check("wrong scheme", "Basic x", "https://example.supabase.co", HttpStatusCode.OK, "{}", 401);
await Check("expired/forged token", "Bearer x", "https://example.supabase.co", HttpStatusCode.Unauthorized, "{}", 401);
await Check("auth outage", "Bearer x", "https://example.supabase.co", HttpStatusCode.ServiceUnavailable, "{}", 503);
await Check("malformed auth response", "Bearer x", "https://example.supabase.co", HttpStatusCode.OK, "not json", 503);
await Check("invalid subject", "Bearer x", "https://example.supabase.co", HttpStatusCode.OK, "{\"id\":\"no-id\"}", 401);
await Check("verified identity", "Bearer x", "https://example.supabase.co", HttpStatusCode.OK, "{\"id\":\"11111111-1111-4111-8111-111111111111\"}", 200, true);
Console.WriteLine($"PASS: {passed} AI authentication boundary tests");

var privacyContext=new DefaultHttpContext();
privacyContext.User=new System.Security.Claims.ClaimsPrincipal(new System.Security.Claims.ClaimsIdentity(
 [new System.Security.Claims.Claim(System.Security.Claims.ClaimTypes.NameIdentifier,"11111111-1111-4111-8111-111111111111")],"test"));
var privacyConfig=new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string,string?>{
 ["SUPABASE_URL"]="https://example.supabase.co",["SUPABASE_SERVICE_ROLE_KEY"]="fixture-key"}).Build();
var privacyFactory=new PrivacyFactory();var gate=new AiPrivacyGate(privacyFactory,privacyConfig);
if(await gate.Reserve(new DefaultHttpContext(),"gemini") is not null || privacyFactory.Calls!=0)throw new Exception("Unauthenticated reservation");
if(await gate.Reserve(privacyContext,"gemini") is not null)throw new Exception("Missing consent allowed");
privacyFactory.Enabled=true;
var lease=await gate.Reserve(privacyContext,"groq") ?? throw new Exception("Valid reservation denied");
await lease.DisposeAsync();if(privacyFactory.Releases!=1)throw new Exception("Missing lease release");
privacyFactory.Fail=true;
if(await gate.Reserve(privacyContext,"gemini") is not null)throw new Exception("Privacy outage allowed");
Console.WriteLine("PASS: AI privacy reservations require identity, consent response and healthy DB; leases release");

// Single-job letter failures must be HTTP errors rather than successful empty letters.
Environment.SetEnvironmentVariable("AI_ALLOWED_PROVIDERS", "gemini");
Environment.SetEnvironmentVariable("GEMINI_API_KEY", "letter-fixture");
Environment.SetEnvironmentVariable("GEMINI_MODEL", null);
var letters = new Aplifyr.Api.Controllers.CoverLettersController(
 Microsoft.Extensions.Logging.Abstractions.NullLogger<Aplifyr.Api.Controllers.CoverLettersController>.Instance, gate, privacyConfig) {
 ControllerContext = new Microsoft.AspNetCore.Mvc.ControllerContext { HttpContext = privacyContext }
};
using var letterRequest = System.Text.Json.JsonDocument.Parse("{\"jobs\":[{\"id\":\"synthetic-job\",\"title\":\"Synthetic role\",\"description\":\"Synthetic job\"}]}");
var missingModel = (Microsoft.AspNetCore.Mvc.ObjectResult)await letters.GenerateAll(letterRequest.RootElement);
if(missingModel.StatusCode != 503 || !System.Text.Json.JsonSerializer.Serialize(missingModel.Value).Contains("configuration")) throw new Exception("Letter configuration failure hidden");
Environment.SetEnvironmentVariable("GEMINI_MODEL", "fixture-model");
privacyFactory.Enabled=false;privacyFactory.Fail=false;
var deniedLetter = (Microsoft.AspNetCore.Mvc.ObjectResult)await letters.GenerateAll(letterRequest.RootElement);
if(deniedLetter.StatusCode != 429 || !System.Text.Json.JsonSerializer.Serialize(deniedLetter.Value).Contains("consentOrQuota")) throw new Exception("Letter reservation failure hidden");
Console.WriteLine("PASS: Letter configuration and reservation failures return explicit HTTP errors");

// Exercise routing + fallback authorization + authentication over real local HTTP.
var hostBuilder = WebApplication.CreateBuilder();
hostBuilder.Logging.ClearProviders();
hostBuilder.Configuration.AddInMemoryCollection(new Dictionary<string,string?> {
 ["SUPABASE_URL"]="https://example.supabase.co",["SUPABASE_ANON_KEY"]="fixture"
});
hostBuilder.Services.AddSingleton<IHttpClientFactory>(new FakeFactory(HttpStatusCode.OK,"{\"id\":\"11111111-1111-4111-8111-111111111111\"}"));
hostBuilder.Services.AddAuthorization(options=>options.FallbackPolicy=new AuthorizationPolicyBuilder().RequireAuthenticatedUser().Build());
await using(var host=hostBuilder.Build()) {
 host.Urls.Add("http://127.0.0.1:0");
 host.UseRouting();
 host.UseMiddleware<AiAuthenticationMiddleware>();
 host.UseAuthorization();
 host.MapGet("/future-private",()=>"private");
 host.MapGet("/health",()=>"ok").AllowAnonymous();
 await host.StartAsync();
 using var client=new HttpClient {BaseAddress=new Uri(host.Urls.Single())};
 if((await client.GetAsync("/health")).StatusCode!=HttpStatusCode.OK)throw new Exception("Public health blocked");
 if((await client.GetAsync("/future-private")).StatusCode!=HttpStatusCode.Unauthorized)throw new Exception("New route public by default");
 client.DefaultRequestHeaders.Authorization=new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer","fixture");
 if((await client.GetAsync("/future-private")).StatusCode!=HttpStatusCode.OK)throw new Exception("Verified user rejected");
 await host.StopAsync();
}
Console.WriteLine("PASS: Real HTTP protects new endpoints by default and preserves explicit public access");

HttpContext RateContext(string owner, bool generate) {
 var ctx=new DefaultHttpContext();
 ctx.User=new ClaimsPrincipal(new ClaimsIdentity([new Claim(ClaimTypes.NameIdentifier,owner)],"fixture"));
 if(generate)ctx.SetEndpoint(new Endpoint(_=>Task.CompletedTask,new EndpointMetadataCollection(new AiGenerationAttribute()),"generation"));
 return ctx;
}
using(var limiter=RequestLimits.Create()) {
 var a=RateContext("owner-a",true);var b=RateContext("owner-b",true);
 for(var i=0;i<6;i++){using var allowed=limiter.AttemptAcquire(a);if(!allowed.IsAcquired)throw new Exception("Premature user rate limit");}
 using var rejected=limiter.AttemptAcquire(a);if(rejected.IsAcquired)throw new Exception("User rate cap not applied");
 using var other=limiter.AttemptAcquire(b);if(!other.IsAcquired)throw new Exception("One owner blocked another");
 using var read=limiter.AttemptAcquire(RateContext("owner-a",false));if(!read.IsAcquired)throw new Exception("Generation blocked document read");
}
Console.WriteLine("PASS: User rate limits and document capacity are isolated");

// Verify owner-bound storage transport and preserve the database revision byte-for-byte.
var storeContext = new DefaultHttpContext();
storeContext.User = new ClaimsPrincipal(new ClaimsIdentity(
 [new Claim(ClaimTypes.NameIdentifier,"11111111-1111-4111-8111-111111111111")],"fixture"));
storeContext.Request.Headers.Authorization = "Bearer fixture-user-token";
var storeConfig = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string,string?> {
 ["SUPABASE_URL"]="https://example.supabase.co", ["SUPABASE_ANON_KEY"]="fixture-anon",
 ["SUPABASE_SERVICE_ROLE_KEY"]="fixture-service"
}).Build();
using(var handler = new StoreHandler())
using(var transport = new HttpClient(handler)) {
 var store = new Aplifyr.Api.Cv.CvStore(storeContext,storeConfig,transport);
 var saved = await store.SaveCv("synthetic-job",new {schemaVersion=1},new {id="synthetic-job"},new {});
 var revision = saved.GetProperty("updated_at").GetString()!;
 if(revision != StoreHandler.Revision)throw new Exception("Database revision altered");
 await store.UpdateCv("synthetic-job",revision,new {schemaVersion=1});
 await store.DeleteCv("synthetic-job");
 await store.DeleteLetter("synthetic-job");
 if(handler.Calls!=4)throw new Exception("Storage boundary not exercised");
 storeContext.User = new ClaimsPrincipal();
 try { await store.DeleteCv("synthetic-job"); throw new Exception("Anonymous privileged write accepted"); }
 catch(Aplifyr.Api.Cv.CvFailure error) when(error.Status==401) { }
}
Console.WriteLine("PASS: Document storage binds privileged writes to verified owner and retains exact revisions");

sealed class StoreHandler : HttpMessageHandler
{
 public const string Revision="2026-09-26T12:34:56.123456+00:00";
 public int Calls;
 protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request,CancellationToken token) {
  Calls++;
  if(request.Headers.Authorization?.Parameter!="fixture-service")throw new Exception("Wrong storage credential");
  var uri=request.RequestUri!;
  if(request.Method==HttpMethod.Post) {
   if(uri.AbsolutePath!="/rest/v1/rpc/save_generated_cv_v3")throw new Exception("Wrong save RPC");
   using var body=System.Text.Json.JsonDocument.Parse(await request.Content!.ReadAsStringAsync(token));
   if(body.RootElement.GetProperty("p_user").GetString()!="11111111-1111-4111-8111-111111111111")throw new Exception("Unbound save owner");
   return new HttpResponseMessage(HttpStatusCode.OK){Content=new StringContent("{\"job_id\":\"synthetic-job\",\"updated_at\":\""+Revision+"\"}")};
  }
  var query=Uri.UnescapeDataString(uri.Query);
  if(!query.Contains("user_id=eq.11111111-1111-4111-8111-111111111111") || !query.Contains("job_id=eq.synthetic-job"))throw new Exception("Unbound mutation");
  if(request.Method==HttpMethod.Patch) {
   if(!query.Contains("updated_at=eq."+Revision) || !query.Contains("expires_at=gt."))throw new Exception("Missing revision/expiry guard");
   using var body=System.Text.Json.JsonDocument.Parse(await request.Content!.ReadAsStringAsync(token));
   if(body.RootElement.TryGetProperty("expires_at",out _) || body.RootElement.TryGetProperty("user_id",out _))throw new Exception("Edit modifies protected fields");
  }
  return new HttpResponseMessage(HttpStatusCode.OK){Content=new StringContent("[]")};
 }
}

sealed class PrivacyFactory : HttpMessageHandler,IHttpClientFactory
{
 public int Calls;public int Releases;public bool Enabled;public bool Fail;
 public HttpClient CreateClient(string name)=>new(this,false);
 protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request,CancellationToken token)
 {
  Calls++;
  if(request.RequestUri?.Host!="example.supabase.co")throw new Exception("Unexpected destination");
  var body=await request.Content!.ReadAsStringAsync(token);
  if(request.RequestUri.AbsolutePath.EndsWith("reserve_ai_call_v2") && !body.Contains(AiPrivacyGate.DocumentNoticeVersion))throw new Exception("Missing processing version");
  if(!body.Contains("11111111-1111-4111-8111-111111111111"))throw new Exception("Unverified owner");
  if(request.RequestUri.AbsolutePath.EndsWith("release_ai_call"))Releases++;
  return new HttpResponseMessage(Fail?HttpStatusCode.ServiceUnavailable:HttpStatusCode.OK){Content=new StringContent(Enabled?"\"22222222-2222-4222-8222-222222222222\"":"null")};
 }
}

sealed class FakeFactory(HttpStatusCode status, string body) : IHttpClientFactory
{
    public FakeHandler Handler { get; } = new(status, body);
    public HttpClient CreateClient(string name) => new(Handler);
}
sealed class FakeHandler(HttpStatusCode status, string body) : HttpMessageHandler
{
    public string? Request { get; private set; }
    protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        Request = request.RequestUri?.ToString();
        if (request.Headers.Authorization?.Scheme != "Bearer" || !request.Headers.Contains("apikey")) throw new Exception("Auth headers missing");
        return Task.FromResult(new HttpResponseMessage(status) { Content = new StringContent(body) });
    }
}
