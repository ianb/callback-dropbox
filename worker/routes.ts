import { type Env, type AuthResult, authenticate, hashKey } from "./auth.js";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function error(message: string, status: number): Response {
  return json({ error: message }, status);
}

function generateId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function generateApiKey(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return (
    "sk-" + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
  );
}

function generatePairingCode(): string {
  const bytes = new Uint8Array(3);
  crypto.getRandomValues(bytes);
  const num = (bytes[0] << 16) | (bytes[1] << 8) | bytes[2];
  return String(num % 1000000).padStart(6, "0");
}

// POST /channels — create a new channel
export async function createChannel(
  _request: Request,
  env: Env
): Promise<Response> {
  const channelId = generateId();
  const apiKey = generateApiKey();
  const keyId = generateId();
  const keyHash = await hashKey(apiKey);
  const now = new Date().toISOString();

  await env.DB.batch([
    env.DB.prepare("INSERT INTO channels (id, created_at) VALUES (?, ?)").bind(
      channelId,
      now
    ),
    env.DB.prepare(
      "INSERT INTO api_keys (id, channel_id, key_hash, label, created_at) VALUES (?, ?, ?, ?, ?)"
    ).bind(keyId, channelId, keyHash, "agent", now),
  ]);

  return json({ channelId, apiKey }, 201);
}

export interface CreatePairingCodeParams {
  request: Request;
  env: Env;
  auth: AuthResult;
  channelId: string;
}

// POST /channels/:id/pair — generate a pairing code (requires auth)
export async function createPairingCode(
  params: CreatePairingCodeParams
): Promise<Response> {
  const { request, env, auth, channelId } = params;
  if (auth.channelId !== channelId) {
    return error("Forbidden", 403);
  }

  const body = await request.json<{ encryptedChannelKey: string }>();
  if (!body.encryptedChannelKey) {
    return error("encryptedChannelKey is required", 400);
  }

  const code = generatePairingCode();
  const clientApiKey = generateApiKey();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 min

  await env.DB.prepare(
    "INSERT INTO pairing_codes (code, channel_id, api_key, encrypted_channel_key, expires_at) VALUES (?, ?, ?, ?, ?)"
  ).bind(code, channelId, clientApiKey, body.encryptedChannelKey, expiresAt).run();

  return json({ code, expiresAt }, 201);
}

// POST /pair — redeem a pairing code (no auth required)
export async function redeemPairingCode(
  request: Request,
  env: Env
): Promise<Response> {
  const body = await request.json<{ code: string; label?: string }>();
  if (!body.code) {
    return error("code is required", 400);
  }

  const row = await env.DB.prepare(
    "SELECT code, channel_id, api_key, encrypted_channel_key, expires_at, used FROM pairing_codes WHERE code = ?"
  )
    .bind(body.code)
    .first<{
      code: string;
      channel_id: string;
      api_key: string;
      encrypted_channel_key: string;
      expires_at: string;
      used: number;
    }>();

  if (!row) return error("Invalid pairing code", 404);
  if (row.used) return error("Pairing code already used", 410);
  if (new Date(row.expires_at) < new Date())
    return error("Pairing code expired", 410);

  // Mark as used and create the API key
  const keyId = generateId();
  const keyHash = await hashKey(row.api_key);
  const now = new Date().toISOString();

  await env.DB.batch([
    env.DB.prepare("UPDATE pairing_codes SET used = 1 WHERE code = ?").bind(
      body.code
    ),
    env.DB.prepare(
      "INSERT INTO api_keys (id, channel_id, key_hash, label, created_at) VALUES (?, ?, ?, ?, ?)"
    ).bind(keyId, row.channel_id, keyHash, body.label || "client", now),
  ]);

  return json({
    channelId: row.channel_id,
    apiKey: row.api_key,
    encryptedChannelKey: row.encrypted_channel_key,
  });
}

export interface GetMessagesParams {
  request: Request;
  env: Env;
  auth: AuthResult;
}

// GET /messages?since=<iso> — fetch messages (requires auth)
export async function getMessages(
  params: GetMessagesParams
): Promise<Response> {
  const { request, env, auth } = params;
  const url = new URL(request.url);
  const since = url.searchParams.get("since");

  let query: string;
  let binds: unknown[];

  if (since) {
    query =
      "SELECT id, sender, content_type, body, nonce, created_at FROM messages WHERE channel_id = ? AND created_at > ? ORDER BY created_at ASC";
    binds = [auth.channelId, since];
  } else {
    query =
      "SELECT id, sender, content_type, body, nonce, created_at FROM messages WHERE channel_id = ? ORDER BY created_at ASC";
    binds = [auth.channelId];
  }

  const { results } = await env.DB.prepare(query)
    .bind(...binds)
    .all<{
      id: string;
      sender: string;
      content_type: string | null;
      body: string;
      nonce: string;
      created_at: string;
    }>();

  const messages = results.map((row) => ({
    id: row.id,
    sender: row.sender,
    contentType: row.content_type,
    body: row.body,
    nonce: row.nonce,
    createdAt: row.created_at,
  }));

  return json({ messages });
}

export interface PostMessageParams {
  request: Request;
  env: Env;
  auth: AuthResult;
}

// POST /messages — post a message (requires auth)
export async function postMessage(
  params: PostMessageParams
): Promise<Response> {
  const { request, env, auth } = params;
  const body = await request.json<{
    sender: string;
    contentType?: string;
    body: string; // base64-encoded encrypted blob
    nonce: string; // base64-encoded nonce
  }>();

  if (!body.body || !body.nonce || !body.sender) {
    return error("sender, body, and nonce are required", 400);
  }

  const id = generateId();
  const now = new Date().toISOString();

  await env.DB.prepare(
    "INSERT INTO messages (id, channel_id, sender, content_type, body, nonce, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).bind(
    id,
    auth.channelId,
    body.sender,
    body.contentType ?? null,
    body.body,
    body.nonce,
    now
  ).run();

  return json({ id, createdAt: now }, 201);
}

export interface DeleteMessageParams {
  env: Env;
  auth: AuthResult;
  messageId: string;
}

// DELETE /messages/:id — delete/ack a message (requires auth)
export async function deleteMessage(
  params: DeleteMessageParams
): Promise<Response> {
  const { env, auth, messageId } = params;
  const result = await env.DB.prepare(
    "DELETE FROM messages WHERE id = ? AND channel_id = ?"
  )
    .bind(messageId, auth.channelId)
    .run();

  if (!result.meta.changes) {
    return error("Message not found", 404);
  }

  return json({ deleted: true });
}

