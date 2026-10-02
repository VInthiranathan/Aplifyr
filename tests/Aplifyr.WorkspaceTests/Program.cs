using System.Net;
using System.Security.Claims;
using System.Text.Json;
using Aplifyr.Api.Cv;
using Aplifyr.Api.Jobs;
using Aplifyr.Api.Security;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;

Environment.SetEnvironmentVariable("AI_ALLOWED_PROVIDERS","gemini");
Environment.SetEnvironmentVariable("GEMINI_MODEL","synthetic");
Environment.SetEnvironmentVariable("GEMINI_CV_API_KEY","synthetic-cv");
Environment.SetEnvironmentVariable("GEMINI_API_KEY","synthetic-letter");
var config=new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string,string?> {
 ["SUPABASE_URL"]="https://example.supabase.co",["SUPABASE_ANON_KEY"]="synthetic-anon",["SUPABASE_SERVICE_ROLE_KEY"]="synthetic-service"
}).Build();
var context=new DefaultHttpContext();
context.User=new ClaimsPrincipal(new ClaimsIdentity(new[]{new Claim(ClaimTypes.NameIdentifier,"11111111-1111-4111-8111-111111111111")},"synthetic"));
context.Request.Headers.Authorization="Bearer synthetic-owner";
JsonElement Json(object body)=>JsonSerializer.SerializeToElement(body);
object Request(string kind="cv",string text="I built APIs.",string section="professionalSummary",int index=0)=>new {kind,text,section,entry=0,index,mode="tailor",updatedAt=Fixture.Revision};
DocumentRewriteService Service(Fixture fixture)=>new(config,new CanonicalJobClient(new HttpClient(fixture)),new AiPrivacyGate(fixture,config),NullLogger<DocumentRewriteService>.Instance,fixture);
int checks=0;
void Check(bool value,string message){if(!value)throw new Exception(message);checks++;}
async Task Failure(Fixture f,int status,string code,object? request=null){try{await Service(f).Suggest(context,"job",Json(request??Request()));throw new Exception("Expected failure");}catch(CvFailure e){Check(e.Status==status&&e.Code==code,"Wrong failure: "+e.Code);}}
var normal=new Fixture();var proposed=Json(await Service(normal).Suggest(context,"job",Json(Request())));
Check(proposed.GetProperty("text").GetString()=="I implemented APIs using C#.","Wrong suggestion");
Check(normal.ProviderCalls==2&&normal.Reservations==2&&normal.Releases==2,"Calls must reserve and release independently");
Check(normal.Writes==0,"Suggestion must never save a document");
Check(normal.Keys.All(k=>k=="synthetic-cv"),"CV key separation");
var letter=new Fixture();await Service(letter).Suggest(context,"job",Json(Request("letter","I built APIs.","paragraph")));
Check(letter.Keys.All(k=>k=="synthetic-letter"),"Letter key separation");
var stale=new Fixture();await Failure(stale,409,"editConflict",Request(text:"Unsaved draft"));Check(stale.ProviderCalls==0,"Stale text must be rejected before provider");
var badIndex=new Fixture();await Failure(badIndex,400,"invalidEdit",Request(index:99));Check(badIndex.ProviderCalls==0,"Index must be bounded");
await Failure(new Fixture{Supported=false},502,"unsupportedFact");
await Failure(new Fixture{ProfileChanged=true},409,"profileChanged");
await Failure(new Fixture{RevisionChanged=true},409,"editConflict");
var noConsent=new Fixture{Allowed=false};await Failure(noConsent,429,"consentOrQuota");Check(noConsent.ProviderCalls==0,"No consent means no provider call");
var refusedReview=new Fixture{AllowReview=false};await Failure(refusedReview,429,"consentOrQuota");Check(refusedReview.ProviderCalls==1,"Review must independently reserve");
foreach(var invalid in new[]{"<script>x</script>","https://example.test",new string('a',601)}){
 try{DocumentRewriteService.ValidateText(invalid,600);throw new Exception("Invalid text passed");}catch(CvFailure e){Check(e.Code=="invalidOutput","Output bounds");}
}
var storeTransport=new Fixture();var store=new CvStore(context,config,new HttpClient(storeTransport));await store.UpdateLetter("job",Fixture.Revision,"Updated letter");Check(storeTransport.Writes==1,"Owner-bound CAS update");
Console.WriteLine($"{checks} workspace checks passed.");

sealed class Fixture:HttpMessageHandler,IHttpClientFactory {
 public const string Revision="2026-10-02T08:00:00+00:00";
 public int ProviderCalls,Reservations,Releases,Writes,ProfileReads;
 public bool Supported=true,ProfileChanged,RevisionChanged,Allowed=true,AllowReview=true;
 public List<string> Keys=new();
 public HttpClient CreateClient(string name)=>new(this,false);
 static HttpResponseMessage Ok(object body)=>new(HttpStatusCode.OK){Content=new StringContent(JsonSerializer.Serialize(body))};
 protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request,CancellationToken token){
  var uri=request.RequestUri!;
  if(uri.Host=="jobsearch.api.jobtechdev.se")return Ok(new {id="job",headline="API Developer",description=new {text="We are looking for a developer with C# and SQL experience."}});
  if(uri.Host=="generativelanguage.googleapis.com"){
   ProviderCalls++;Keys.Add(request.Headers.GetValues("x-goog-api-key").Single());
   using var prompt=JsonDocument.Parse(await request.Content!.ReadAsStringAsync(token));
   var text=prompt.RootElement.GetProperty("contents")[0].GetProperty("parts")[0].GetProperty("text").GetString()!;
   if(text.Contains("synthetic-owner")||text.Contains("contact_email")||text.Contains("Private notes"))throw new Exception("Unnecessary data sent");
   if(ProviderCalls==2&&(text.Contains("externalJob")||text.Contains("description")))throw new Exception("Review received ad");
   var output=ProviderCalls==1?JsonSerializer.Serialize(new {text="I implemented APIs using C#."}):JsonSerializer.Serialize(new {decisions=new[]{new{id="0",supported=Supported}}});
   return Ok(new {candidates=new[]{new {finishReason="STOP",content=new {parts=new[]{new {text=output}}}}}});
  }
  if(uri.Host!="example.supabase.co")throw new Exception("Unexpected host");
  if(uri.AbsolutePath.EndsWith("reserve_ai_call_v2")){
   Reservations++;var body=await request.Content!.ReadAsStringAsync(token);
   if(!body.Contains(AiPrivacyGate.DocumentNoticeVersion)||!body.Contains("11111111-1111-4111-8111-111111111111"))throw new Exception("Wrong consent version or owner");
   return Ok(Allowed&&(AllowReview||Reservations==1)?"22222222-2222-4222-8222-222222222222":null!);
  }
  if(uri.AbsolutePath.EndsWith("release_ai_call")){Releases++;return Ok(null!);}
  var query=Uri.UnescapeDataString(uri.Query);
  if(uri.AbsolutePath.EndsWith("profiles")){
   ProfileReads++;if(!query.Contains("id=eq.11111111-1111-4111-8111-111111111111"))throw new Exception("Profile owner");
   return Ok(new[]{new{full_name="Synthetic",title="Developer",bio=ProfileChanged&&ProfileReads>1?"Changed facts":"I implemented APIs using C#.",tech_stack=new[]{"C#"},contact_email="never-disclose@example.test"}});
  }
  if(uri.AbsolutePath.EndsWith("profile_career_entries"))return Ok(Array.Empty<object>());
  if(!query.Contains("user_id=eq.11111111-1111-4111-8111-111111111111")||!query.Contains("job_id=eq.job")||!query.Contains("expires_at=gt."))throw new Exception("Document owner or expiry");
  if(request.Method==HttpMethod.Patch){
   Writes++;if(!query.Contains("updated_at=eq."+Revision))throw new Exception("Revision guard missing");
   using var body=JsonDocument.Parse(await request.Content!.ReadAsStringAsync(token));
   if(body.RootElement.EnumerateObject().Any(p=>p.Name is not ("content" or "updated_at")))throw new Exception("Protected fields changed");
   return Ok(Array.Empty<object>());
  }
  var revision=RevisionChanged&&ProviderCalls>0?"2026-10-02T08:01:00+00:00":Revision;
  if(uri.AbsolutePath.EndsWith("generated_cover_letters"))return Ok(new[]{new{job_id="job",content="I built APIs.",updated_at=revision}});
  return Ok(new[]{new{job_id="job",updated_at=revision,content=new{language="en",professionalSummary=new[]{new{text="I built APIs.",sourceFactIds=new[]{"profile:bio:0"}}},experience=Array.Empty<object>(),education=Array.Empty<object>()}}});
 }
}
