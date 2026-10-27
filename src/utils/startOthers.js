// The Role page's Continue tells the server to start preparing the Others list in the background
// (POST /api/onboarding/start-others). Fire and forget: navigation never waits for it and a failure
// is silent. The profile is saved first and the signal sent after that save lands, so the server
// scores against the answers just given (the onboarding context saves the same profile on its own
// a moment later; the write is identical and idempotent).
export function startOthersAfterRole(profile) {
  const body = { ...profile };
  delete body.resumeFile; // a local File, not part of the server-side profile
  try {
    fetch('/api/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      keepalive: true,
    })
      .then((res) => {
        if (!res.ok) return null;
        return fetch('/api/onboarding/start-others', { method: 'POST', keepalive: true });
      })
      .catch(() => {});
  } catch {
    // nothing to do
  }
}
