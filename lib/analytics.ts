// Lightweight product analytics. Fire-and-forget only: a failure here must never
// surface to the player or affect gameplay, and it must never force a sign-in on
// its own — by the time anything here fires, the app's own gate/onboarding flow
// has already resolved a session, or there isn't one yet and we just stay quiet.
import {currentSession, supabaseConfigured} from './account';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '';

let id: string | null = null;
// One id per page load/tab, not persisted — a reload starts a new session, same
// convention most lightweight analytics setups use.
export function getSessionId() {
  if (!id) id = crypto.randomUUID();
  return id;
}

async function send(body: Record<string, unknown>) {
  if (!supabaseConfigured()) return;
  try {
    const session = await currentSession();
    if (!session) return;
    await fetch(`${URL}/functions/v1/lotus-game`, {
      method: 'POST',
      headers: {apikey: KEY, Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json'},
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });
  } catch {}
}

/** Logs one funnel event (solo game_start/game_end are the only calls the client
 *  makes directly — everything for online play is logged server-side, since the
 *  edge function already sees every room lifecycle transition authoritatively). */
export function track(event: string | null, extra: Record<string, unknown> = {}) {
  send({command: 'track', session: getSessionId(), event, ...extra});
}

/** Starts the session heartbeat: an immediate session_start, then a bare ping
 *  roughly every 90s while the tab is actually visible, so idle-in-background
 *  time doesn't inflate session length. Returns a cleanup function. */
export function startHeartbeat() {
  track('session_start');
  const interval = setInterval(() => {
    if (typeof document !== 'undefined' && !document.hidden) track(null);
  }, 90_000);
  return () => clearInterval(interval);
}
