import type { IncomingMessage, ServerResponse } from 'http';
import { serverSupabase } from './serverSupabase';

/** Exchange only bounded PKCE input. Outcomes contain no credentials or provider text. */
export async function exchangeAuthCallback(req: IncomingMessage, res: ServerResponse,
  query: Record<string, string | string[] | undefined>): Promise<'confirmed' | 'sign-in' | 'invalid' | 'unavailable'> {
  const code = typeof query.code === 'string' && query.code.length > 0 && query.code.length <= 4096 ? query.code : null;
  const flowId = typeof query.sb_flow_id === 'string' ? query.sb_flow_id : undefined;
  const validFlow = query.sb_flow_id === undefined || (flowId !== undefined && /^[a-zA-Z0-9_-]{8,64}$/.test(flowId));
  if (!code || !validFlow || query.error || query.error_code) return 'invalid';
  try {
    const { data, error } = await serverSupabase(req, res, { fetchTimeoutMs: 10000 }).auth.exchangeCodeForSession(
      code, flowId ? { flowId } : undefined,
    );
    if (!error && data.session && data.user?.email_confirmed_at) return 'confirmed';
    if (error?.code === 'pkce_code_verifier_not_found') return 'sign-in';
    if (error && (error.status === 0 || (error.status ?? 0) >= 500 || error.name === 'AuthRetryableFetchError')) return 'unavailable';
  } catch { return 'unavailable'; }
  return 'invalid';
}
