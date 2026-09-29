namespace Aplifyr.Api.Jobs;

public sealed class JobSearchFailure(int status, string code) : Exception(code)
{
    public int Status { get; } = status;
    public string Code { get; } = code;
}
