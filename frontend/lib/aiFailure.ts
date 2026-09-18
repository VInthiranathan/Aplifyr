/** Only controlled error identifiers may select user-facing translations. */
export function aiFailureCode(body: unknown, status: number): string {
  const result = Array.isArray(body) ? body[0] : body;
  const code = result && typeof result === 'object' && 'error' in result ? result.error : undefined;
  if (typeof code === 'string' && ['configuration', 'authentication', 'quota', 'consentOrQuota', 'timeout', 'invalidOutput', 'provider', 'storage'].includes(code)) return code;
  if (status === 401) return 'authentication';
  if (status === 429) return 'quota';
  if (status === 504) return 'timeout';
  return 'provider';
}
