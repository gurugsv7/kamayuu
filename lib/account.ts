// Session and profile handling, shared by the sign-in screen and the game.
// Deliberately independent of MultiplayerService: solo play must work with no
// account at all, and the guest path must not need the network until the player
// actually goes online.
import {createClient, type SupabaseClient} from '@supabase/supabase-js';
import {captchaToken} from './captcha';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '';
const REF = URL.match(/https:\/\/([^.]+)\./)?.[1] || 'local';

export type Profile = {
  id: string;
  display_name: string;
  avatar: string;
  matches_played: number;
  matches_won: number;
};

export const AVATARS = ['lotus','spade','heart','club','diamond','moon','sun','star'];
export const AVATAR_GLYPH: Record<string,string> = {
  lotus:'✧', spade:'♠', heart:'♥', club:'♣', diamond:'♦', moon:'☾', sun:'☀', star:'★',
};

/** profiles.name is capped at 16 characters and profiles.avatar is constrained to
 *  AVATARS by the database, so both are narrowed here before any upsert. */
export const NAME_LIMIT = 16;
const BADGE_AVATAR: Record<string,string> = {
  compass:'star', wolf:'spade', dragon:'club', lotus:'lotus', mountain:'diamond', tree:'heart',
};
export const avatarForBadge = (badge: string) =>
  AVATARS.includes(badge) ? badge : BADGE_AVATAR[badge] || 'lotus';

export const supabaseConfigured = () => !!(URL && KEY);

let client: SupabaseClient | null = null;
export function auth(): SupabaseClient {
  if (!client) {
    if (!supabaseConfigured()) throw Error('Online play is not configured yet.');
    // Scoped per project so a session can never leak across Supabase projects.
    client = createClient(URL, KEY, {
      auth: {storageKey: 'lotus-guest-' + REF, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false},
    });
  }
  return client;
}

export async function currentSession() {
  if (!supabaseConfigured()) return null;
  const {data} = await auth().auth.getSession();
  return data.session ?? null;
}

export async function signInWithGoogle(token: string, nonce: string) {
  const {data, error} = await auth().auth.signInWithIdToken({provider: 'google', token, nonce});
  if (error) throw Error(error.message);
  return data.session;
}

/** Anonymous fallback. Supabase enforces CAPTCHA on this endpoint. */
export async function signInAsGuest() {
  const captcha = await captchaToken();
  const {data, error} = await auth().auth.signInAnonymously(
    captcha ? {options: {captchaToken: captcha}} : undefined,
  );
  if (error) {
    const detail = error.message.toLowerCase();
    throw Error(
      detail.includes('disabled') ? 'Guest sign-in needs to be enabled in Supabase.'
      : detail.includes('captcha') ? 'The CAPTCHA check did not pass. Try again.'
      : error.message,
    );
  }
  return data.session;
}

export async function signOut() {
  if (supabaseConfigured()) await auth().auth.signOut({scope: 'local'}).catch(() => {});
}

/** Upgrades the current anonymous account to Google, keeping the same id and stats. */
export async function linkGoogle() {
  const {data, error} = await auth().auth.linkIdentity({provider: 'google'});
  if (error) throw Error(
    error.message.toLowerCase().includes('manual linking')
      ? 'Enable "Allow manual linking" in Supabase to connect a Google account.'
      : error.message,
  );
  return data;
}

export async function loadProfile(): Promise<Profile | null> {
  const session = await currentSession();
  if (!session) return null;
  const {data, error} = await auth().from('profiles').select('*').eq('id', session.user.id).maybeSingle();
  if (error) throw Error(error.message);
  return (data as Profile) ?? null;
}

/** Creates the profile on first sign-in, or renames/restyles an existing one. */
export async function saveProfile(display_name: string, avatar: string): Promise<Profile> {
  const session = await currentSession();
  if (!session) throw Error('Sign in before saving a profile.');
  const {data, error} = await auth()
    .from('profiles')
    .upsert({id: session.user.id, display_name, avatar}, {onConflict: 'id'})
    .select()
    .single();
  // matches_played/matches_won are frozen by a database trigger for non-service
  // roles, so they are safe to omit here and impossible to forge from the client.
  if (error) throw Error(error.message);
  return data as Profile;
}

export const isGuest = (session: any) => !!session?.user?.is_anonymous;
