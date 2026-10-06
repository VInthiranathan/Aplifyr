import type { GetServerSideProps } from 'next';
import { safeReturnTo } from '../../lib/guestAccess';
import { serverSupabase } from '../../lib/serverSupabase';

/** Consume the PKCE code once, write session cookies, then remove it from the URL. */
export const getServerSideProps: GetServerSideProps = async ({ req, res, query, locale }) => {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  const returnTo = safeReturnTo(query.returnTo);
  let result = 'invalid';
  const code = typeof query.code === 'string' && query.code.length > 0 && query.code.length <= 4096 ? query.code : null;
  const flowId = typeof query.sb_flow_id === 'string' ? query.sb_flow_id : undefined;
  // Arrays/oversized parameters cannot fall back to another flow's verifier.
  const validFlow = query.sb_flow_id === undefined || (flowId !== undefined && /^[a-zA-Z0-9_-]{8,64}$/.test(flowId));
  if (code && validFlow && !query.error && !query.error_code) {
    try {
      const { data, error } = await serverSupabase(req, res, { fetchTimeoutMs: 10000 }).auth.exchangeCodeForSession(
        code, flowId ? { flowId } : undefined,
      );
      if (!error && data.session && data.user?.email_confirmed_at) {
        result = 'confirmed';
      } else if (error?.code === 'pkce_code_verifier_not_found') {
        result = 'sign-in';
      } else if (error && (error.status === 0 || (error.status ?? 0) >= 500 || error.name === 'AuthRetryableFetchError')) {
        result = 'unavailable';
      }
    } catch {
      result = 'unavailable';
    }
  }
  // The empty fragment also prevents browser inheritance of Supabase error hashes.
  return { redirect: {
    destination: `${locale === 'sv' ? '/sv' : ''}/auth/verify-email?result=${result}&returnTo=${encodeURIComponent(returnTo)}#`,
    permanent: false,
  } };
};

export default function ConfirmEmailPage() { return null; }
