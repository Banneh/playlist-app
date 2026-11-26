/** Decides whether the page in the walk window needs a human, and why.
 *
 *  The rule is silent-first: with the app's own SoundCloud session the authorize page renders the
 *  consent button directly, so nothing is shown. A window becomes visible only for a login form, a
 *  captcha, a provider login, or a page that stays unrecognised for 3 s. */
import type { WebContents } from "electron";
import type { AttentionReason } from "./types";

export interface PageState {
  /** a password field: the SoundCloud (or provider) login form */
  login: boolean;
  /** Turnstile / hCaptcha / reCAPTCHA widget */
  captcha: boolean;
  /** a provider's own login page */
  providerLogin: boolean;
  /** a consent / allow button is on the page */
  consent: boolean;
}

const PROVIDER_LOGIN =
  /accounts\.spotify\.com\/(?:[a-z-]+\/)?login|instagram\.com\/accounts\/login|facebook\.com\/(?:login|r\.php)|accounts\.google\.com\/(?:v3\/)?signin|x\.com\/(?:i\/flow\/login|login)|twitter\.com\/(?:i\/flow\/login|login)/i;

const CLASSIFY_JS = `(() => {
  const pw = !!document.querySelector('input[type=password]');
  const captcha = !!document.querySelector('[data-sitekey], iframe[src*=turnstile], iframe[src*=hcaptcha], iframe[src*=recaptcha]');
  const labels = [...document.querySelectorAll('button, a, div[role=button], input[type=submit]')]
    .map((e) => ((e.textContent || '') + ' ' + (e.getAttribute('aria-label') || '')).trim());
  const consent = labels.some((t) => /^(Zezwól|Allow|Authorize|Autoryzuj|Connect|Połącz|Continue|Kontynuuj)\\b/i.test(t));
  return { pw, captcha, consent, href: location.href };
})()`;

export async function classify(wc: WebContents): Promise<PageState> {
  const r = await wc.executeJavaScript(CLASSIFY_JS).catch(() => null);
  if (!r) return { login: false, captcha: false, providerLogin: false, consent: false };
  return {
    login: !!r.pw,
    captcha: !!r.captcha,
    consent: !!r.consent,
    providerLogin: !!r.pw && PROVIDER_LOGIN.test(String(r.href || "")),
  };
}

/** The reason to escalate for this page, or null when it can stay hidden. */
export function reasonFor(s: PageState): AttentionReason | null {
  if (s.providerLogin) return "provider_login";
  if (s.captcha) return "captcha";
  if (s.login) return "soundcloud_login";
  return null;
}

/** A page with none of the above and no consent button is unrecognised. */
export const isKnown = (s: PageState) => s.login || s.captcha || s.providerLogin || s.consent;
