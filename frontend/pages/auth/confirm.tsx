import type { GetServerSideProps } from 'next';
import { safeReturnTo } from '../../lib/guestAccess';
import { exchangeAuthCallback } from '../../lib/authCallback';

/** Consume the PKCE code once, write session cookies, then remove it from the URL. */
export const getServerSideProps: GetServerSideProps = async ({ req, res, query, locale }) => {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  const returnTo = safeReturnTo(query.returnTo);
  const result = await exchangeAuthCallback(req, res, query);
  // The empty fragment also prevents browser inheritance of Supabase error hashes.
  return { redirect: {
    destination: `${locale === 'sv' ? '/sv' : ''}/auth/verify-email?result=${result}&returnTo=${encodeURIComponent(returnTo)}#`,
    permanent: false,
  } };
};

export default function ConfirmEmailPage() { return null; }
