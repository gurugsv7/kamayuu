// Google sign-in via Google Identity Services, deliberately NOT Supabase's
// redirect flow.
//
// The redirect flow sends the browser to <ref>.supabase.co/auth/v1/callback, and
// Google's consent screen then names that host. Here the ID token is obtained in
// the page and handed to Supabase directly, so Google only ever shows this app's
// own name and origin. It also needs no client secret and costs nothing, whereas
// rebranding the redirect flow needs a paid Supabase custom domain.
const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '';

export const googleConfigured = () => !!CLIENT_ID;

let loading: Promise<any> | null = null;

function load(): Promise<any> {
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const existing = (window as any).google?.accounts?.id;
    if (existing) return resolve(existing);
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => {
      const api = (window as any).google?.accounts?.id;
      api ? resolve(api) : reject(Error('Google sign-in failed to start.'));
    };
    script.onerror = () => {
      loading = null;
      reject(Error('Could not reach Google. Check your connection or ad blocker.'));
    };
    document.head.appendChild(script);
  });
  return loading;
}

/** A nonce must reach Google hashed and Supabase raw, so it cannot be replayed. */
async function makeNonce() {
  const raw = crypto.randomUUID() + crypto.randomUUID();
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
  const hashed = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
  return { raw, hashed };
}

/**
 * Renders Google's own button into `host`. Google requires a real button click,
 * so a plain "call this on click" helper is not possible for the popup flow.
 * `onToken` receives the ID token and the raw nonce for signInWithIdToken.
 */
export async function mountGoogleButton(
  host: HTMLElement,
  onToken: (token: string, nonce: string) => void,
  onError: (message: string) => void,
) {
  if (!CLIENT_ID) return onError('Google sign-in is not configured yet.');
  let api: any;
  try {
    api = await load();
  } catch (err: any) {
    return onError(err?.message || 'Could not load Google sign-in.');
  }
  const { raw, hashed } = await makeNonce();
  try {
    api.initialize({
      client_id: CLIENT_ID,
      nonce: hashed,
      auto_select: false,
      cancel_on_tap_outside: true,
      callback: (response: any) => {
        if (response?.credential) onToken(response.credential, raw);
        else onError('Google did not return a sign-in token.');
      },
    });
    host.innerHTML = '';
    api.renderButton(host, {
      type: 'standard',
      theme: 'filled_black',
      size: 'large',
      shape: 'pill',
      text: 'continue_with',
      logo_alignment: 'left',
      width: 260,
    });
  } catch (err: any) {
    onError(err?.message || 'Google sign-in could not start.');
  }
}
