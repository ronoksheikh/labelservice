// Secrets are not in wrangler.jsonc, so `wrangler types` cannot see them.
interface Env {
  /** Signs admin and student session cookies. Any long random string. */
  SESSION_SECRET?: string;
  /** Admin panel password. */
  ADMIN_PASSWORD?: string;
  /** Resend API key. Without it, emails are printed to the Worker log instead of sent. */
  RESEND_API_KEY?: string;
  /** EPS merchant login and hash key. EPS_MODE, EPS_MERCHANT_ID and EPS_STORE_ID are vars in wrangler.jsonc. */
  EPS_USERNAME?: string;
  EPS_PASSWORD?: string;
  EPS_HASH_KEY?: string;
}
