// Secrets are not in wrangler.jsonc, so `wrangler types` cannot see them.
interface Env {
  /** Signs admin and student session cookies. Any long random string. */
  SESSION_SECRET?: string;
  /** Admin panel password. */
  ADMIN_PASSWORD?: string;
  /** Resend API key. Without it, emails are printed to the Worker log instead of sent. */
  RESEND_API_KEY?: string;
}
