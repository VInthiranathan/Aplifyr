using System.Text.Json;
using Aplifyr.Api.Cv;
namespace Aplifyr.Api.Jobs;
public sealed class JobInsightsService(CanonicalJobClient jobs,IConfiguration configuration) {
 public async Task<object> Get(HttpContext context,string jobId) {
  if(!Letters.LetterApplicationService.ValidJobId(jobId))throw new CvFailure(400,"invalidJob");
  var job=await jobs.Get(jobId,context.RequestAborted);var (profile,career)=await new CvStore(context,configuration).Profile();
  var skills=CvContent.Strings(profile,"tech_stack").Concat(career.SelectMany(c=>CvContent.Strings(c,"skills"))).Distinct(StringComparer.OrdinalIgnoreCase).ToArray();
  var matched=JobMatchingRules.CvMatchedSkills(job,skills);
  var mentioned=JobMatchingRules.MentionedTechnologies(job);
  var missing=mentioned.Where(s=>!skills.Any(p=>JobMatchingRules.NormalizeTech(p)==s)).Take(12).ToArray();
  var relevant=career.Where(c=>JobMatchingRules.CvMatchedSkills(job,CvContent.Strings(c,"skills")).Length>0)
   .Take(8).Select(c=>new {title=CvContent.Text(c,"title"),kind=CvContent.Text(c,"kind"),skills=JobMatchingRules.CvMatchedSkills(job,CvContent.Strings(c,"skills"))});
  return new {matchedSkills=matched.Take(20),mentionedNotInProfile=missing,relevantExperience=relevant};
 }
}
