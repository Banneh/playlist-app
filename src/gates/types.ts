/** A gate adapter: one platform's HTTP walk from gate URL to a file in the downloads folder.
 *
 *  Every gate authorizes through `secure.soundcloud.com/authorize` with its own client_id, so the
 *  OAuth token is not transferable — but the app's SoundCloud *session cookies* are, and with a
 *  warm session the authorize page renders the consent button directly. The walk therefore runs
 *  in a hidden window on the app's own partition and only escalates to a visible one when a human
 *  is genuinely needed (see attention.ts). */
import type { Session } from "electron";
import type { WalkWindow } from "./oauth";

/** The app's own SoundCloud session (Discover, the player view, `sc.token()`). Never a second one. */
export const SC_PARTITION = "persist:soundcloud";

export type AttentionReason =
  | "soundcloud_login"   // consent page rendered a login form: the app session is cold
  | "captcha"            // Turnstile / hCaptcha / reCAPTCHA widget present
  | "provider_login"     // Spotify, Instagram, Facebook, Google, X — own account required
  | "unknown";           // adapter cannot classify the page

export interface WalkContext {
  /** the gate URL as found in the playlist */
  url: string;
  /** from settings, already validated */
  email: string;
  /** from settings, default "fire" */
  comment: string;
  /** the browser user agent the adapters send */
  ua: string;
  /** the app's own SoundCloud session */
  session: Session;
  /** the hidden walk window on that session (consent, in-page writes) */
  window: WalkWindow;
  log: (msg: string) => void;
  signal: AbortSignal;
  /** Escalate to a visible window. Adapters call this only when the page really needs a human. */
  needAttention(reason: AttentionReason): Promise<void>;
}

export interface WalkResult {
  filePath: string;
  bytes: number;
  mime: string;
  /** Actions the gate really performed, for the undo log. */
  performed: Array<{ kind: "repost" | "like" | "follow" | "comment"; id: string | number }>;
}

export interface GateAdapter {
  id: string;
  /** Hosts this adapter answers for. Mirrors `match` and is what the UI uses to decide whether a
   *  link is fetched in the app instead of opened in the browser. */
  hosts: RegExp;
  match(url: URL): boolean;
  walk(ctx: WalkContext): Promise<WalkResult>;
}
