using System.Net;
using Aplifyr.Api.Security;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;

var passed = 0;
async Task Check(string name, string? token, string? url, HttpStatusCode remoteStatus, string body, int expected, bool proceeds = false)
{
    foreach (var protectedPath in new[] { "/api/coverletters/generate-all", "/api/cvs/123/generate" })
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

sealed class PrivacyFactory : HttpMessageHandler,IHttpClientFactory
{
 public int Calls;public int Releases;public bool Enabled;public bool Fail;
 public HttpClient CreateClient(string name)=>new(this,false);
 protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request,CancellationToken token)
 {
  Calls++;
  if(request.RequestUri?.Host!="example.supabase.co")throw new Exception("Unexpected destination");
  var body=await request.Content!.ReadAsStringAsync(token);
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
