// Secrets are not in wrangler.jsonc, so `wrangler types` cannot see them.
interface Env {
  ARVONO_API_KEY?: string;
  DASHBOARD_PASSWORD?: string;
}
