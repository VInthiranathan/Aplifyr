export async function signOut() {
  const response = await fetch('/api/auth/signout', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin', body: '{}',
  });
  if (response.ok) {
    // Legacy unscoped favorites must not survive an account change.
    try { localStorage.removeItem('applifyr_favorites'); } catch { /* Storage may be unavailable. */ }
    window.location.assign('/auth');
  }
}
