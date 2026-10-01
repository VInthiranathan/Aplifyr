/** Only known app destinations may be used after authentication/profile editing. */
export function safeReturnTo(value: unknown): string {
  if (typeof value === 'string') value = value.replace(/^\/(en|sv)(?=\/|$)/, '') || '/';
  return typeof value === 'string' && /^\/(?:jobs(?:\/[A-Za-z0-9_-]{1,100}(?:\/cv)?)?|user|applications|favorites|support)\/?$/.test(value)
    ? value : '/';
}
export function signInHref(destination: string): string {
  return `/auth?returnTo=${encodeURIComponent(safeReturnTo(destination))}`;
}
export function isPublicPage(pathname: string): boolean {
  const path = pathname.replace(/^\/(en|sv)(?=\/|$)/, '') || '/';
  return path === '/' || path === '/jobs' || path === '/support' ||
    /^\/jobs\/[A-Za-z0-9_-]{1,100}$/.test(path);
}
export function hasGenerationProfile(profile: any, career: any[]): boolean {
  return typeof profile?.full_name === 'string' && !!profile.full_name.trim() && (
    typeof profile?.bio === 'string' && !!profile.bio.trim() ||
    Array.isArray(profile?.tech_stack) && profile.tech_stack.some((s: unknown) => typeof s === 'string' && !!s.trim()) ||
    career.some(e => typeof e?.title === 'string' && !!e.title.trim())
  );
}
