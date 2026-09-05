// hCaptcha token provider for Supabase Auth.
//
// Supabase verifies the token server-side with the hCaptcha SECRET, which lives
// only in the Supabase dashboard and must never reach this bundle. The sitekey
// below is public by design — it is visible in the widget markup anyway.
//
// The script is loaded lazily, on the first online sign-in only, so solo play
// and first paint never pull in a third-party script.
const SITE_KEY = process.env.NEXT_PUBLIC_HCAPTCHA_SITEKEY || '';

let loading: Promise<any> | null = null;
let widget: string | null = null;

function load(): Promise<any> {
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const existing = (window as any).hcaptcha;
    if (existing) return resolve(existing);
    const script = document.createElement('script');
    script.src = 'https://js.hcaptcha.com/1/api.js?render=explicit';
    script.async = true;
    script.defer = true;
    script.onload = () => {
      const api = (window as any).hcaptcha;
      api ? resolve(api) : reject(Error('The CAPTCHA failed to start.'));
    };
    script.onerror = () => {
      loading = null; // let a later attempt retry the network
      reject(Error('Could not load the CAPTCHA. Check your connection or ad blocker.'));
    };
    document.head.appendChild(script);
  });
  return loading;
}

export const captchaConfigured = () => !!SITE_KEY;

/** Resolves to a fresh hCaptcha token, or undefined when no sitekey is configured. */
export async function captchaToken(): Promise<string | undefined> {
  if (!SITE_KEY) return undefined;
  const hcaptcha = await load();
  if (widget === null) {
    const host = document.createElement('div');
    host.setAttribute('aria-hidden', 'true');
    document.body.appendChild(host);
    widget = hcaptcha.render(host, { sitekey: SITE_KEY, size: 'invisible' });
  }
  hcaptcha.reset(widget);
  // Tokens are single use, so this runs per sign-in attempt, not per session.
  // hCaptcha rejects with a bare error-code string, not an Error, so normalise it
  // or the real reason is lost behind a generic network message upstream.
  try {
    const result = await hcaptcha.execute(widget, { async: true });
    if (!result?.response) throw Error("the CAPTCHA returned no token");
    return result.response;
  } catch (err: any) {
    const code = typeof err === "string" ? err : err?.message || JSON.stringify(err);
    throw Error(`CAPTCHA could not be completed (${code}).`);
  }
}
