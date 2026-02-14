export interface Env {
  DB: D1Database;
  MEDIA: R2Bucket;
  ASSETS: Fetcher;
}

export interface AuthResult {
  keyId: string;
  channelId: string;
  label: string;
}

async function hashKey(key: string): Promise<string> {
  const encoded = new TextEncoder().encode(key);
  const hash = await crypto.subtle.digest("SHA-256", encoded);
  return btoa(String.fromCharCode(...new Uint8Array(hash)));
}

export async function authenticate(
  request: Request,
  env: Env
): Promise<AuthResult | null> {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const apiKey = authHeader.slice(7);
  const keyHash = await hashKey(apiKey);

  const row = await env.DB.prepare(
    "SELECT id, channel_id, label FROM api_keys WHERE key_hash = ? AND revoked_at IS NULL"
  )
    .bind(keyHash)
    .first<{ id: string; channel_id: string; label: string }>();

  if (!row) return null;
  return { keyId: row.id, channelId: row.channel_id, label: row.label ?? "client" };
}

export { hashKey };
