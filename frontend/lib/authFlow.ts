import { safeReturnTo } from './guestAccess';

export function confirmationHref(returnTo: unknown, locale?: string): string {
  const prefix = locale === 'sv' ? '/sv' : '';
  return `${prefix}/auth/confirm?returnTo=${encodeURIComponent(safeReturnTo(returnTo))}`;
}

/** Map codes only: provider messages may contain private or implementation details. */
export function authErrorKey(error: unknown, operation: 'signup' | 'login' | 'resend'): string {
  const value = error as { code?: string; status?: number } | null;
  if (value?.status === 429 || ['over_request_rate_limit', 'over_email_send_rate_limit'].includes(value?.code ?? ''))
    return 'auth.errors.rateLimited';
  switch (value?.code) {
    case 'user_already_exists': case 'email_exists': return 'auth.errors.emailAlreadyRegistered';
    case 'email_not_confirmed': return 'auth.errors.emailNotConfirmed';
    case 'invalid_credentials': return 'auth.errors.invalidCredentials';
    case 'weak_password': return 'auth.errors.weakPassword';
    case 'email_address_invalid': case 'validation_failed': return 'auth.errors.invalidDetails';
    default: return operation === 'signup' ? 'auth.errors.signupUnavailable' : 'auth.errors.unavailable';
  }
}

/** Auth already succeeded. A route failure must not turn it into an auth failure. */
export async function navigateAfterAuth(replace: () => Promise<boolean>): Promise<boolean> {
  try { return await replace(); } catch { return false; }
}
