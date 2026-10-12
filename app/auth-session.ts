export type AuthSession = {
  access_token: string;
  refresh_token?: string;
  expires_at?: number;
  user: { id: string; email?: string };
};

export function needsSessionRefresh(session: AuthSession, now = Date.now()) {
  let expiry = session.expires_at;
  if (!expiry) {
    try {
      const payload = session.access_token.split(".")[1];
      expiry = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))).exp;
    } catch {
      return true;
    }
  }
  return !expiry || expiry * 1000 <= now + 60_000;
}

export class SessionExpiredError extends Error {
  constructor() {
    super("Your login has expired. Please sign in again.");
  }
}

export function createSessionRefresher(
  config: { url: string; anonKey: string },
  request: typeof fetch = fetch,
) {
  let pending: Promise<AuthSession> | null = null;
  return (session: AuthSession): Promise<AuthSession> => {
    if (pending) return pending;
    pending = (async () => {
      if (!session.refresh_token) throw new SessionExpiredError();
      const response = await request(`${config.url}/auth/v1/token?grant_type=refresh_token`, {
        method: "POST",
        headers: { apikey: config.anonKey, "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: session.refresh_token }),
      });
      if ([400, 401, 403].includes(response.status)) throw new SessionExpiredError();
      if (!response.ok) throw new Error("Unable to renew login. Check your internet connection and try again.");
      const next = await response.json() as AuthSession;
      if (!next.access_token || !next.refresh_token || !next.user?.id) {
        throw new Error("The login server returned an incomplete session. Please try again.");
      }
      return next;
    })().finally(() => { pending = null; });
    return pending;
  };
}
