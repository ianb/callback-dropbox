import { type Env, type AuthResult } from "./auth.js";

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
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

interface CaptureManifest {
  sessionId: string;
  channelId: string;
  startedAt: string;
  endedAt: string | null;
  files: CaptureFile[];
}

interface CaptureFile {
  name: string;
  type: string;
  startedAt: string;
  size: number;
  source: string;
}

// POST /api/capture/sessions — create a new capture session
export async function createSession(
  _request: Request,
  env: Env,
  auth: AuthResult
): Promise<Response> {
  const sessionId = generateId();
  const finalizeToken = generateToken();
  const now = new Date().toISOString();

  const manifest: CaptureManifest = {
    sessionId,
    channelId: auth.channelId,
    startedAt: now,
    endedAt: null,
    files: [],
  };

  // Write initial manifest to R2
  await env.MEDIA.put(
    `${auth.channelId}/${sessionId}/manifest.json`,
    JSON.stringify(manifest),
    { httpMetadata: { contentType: "application/json" } }
  );

  // Create D1 record
  await env.DB.prepare(
    "INSERT INTO capture_sessions (id, channel_id, started_at, status, last_activity_at, finalize_token) VALUES (?, ?, ?, 'active', ?, ?)"
  )
    .bind(sessionId, auth.channelId, now, now, finalizeToken)
    .run();

  return json({ sessionId, finalizeToken, startedAt: now }, 201);
}

// POST /api/capture/sessions/:id/upload — upload a media file
export async function uploadFile(
  request: Request,
  env: Env,
  auth: AuthResult,
  sessionId: string
): Promise<Response> {
  const filename = request.headers.get("X-Capture-Filename");
  const startedAt = request.headers.get("X-Capture-Started-At");
  const source = request.headers.get("X-Capture-Source") || "unknown";

  if (!filename || !startedAt) {
    return error("X-Capture-Filename and X-Capture-Started-At headers required", 400);
  }

  // Verify session belongs to this channel and is active
  const session = await env.DB.prepare(
    "SELECT id FROM capture_sessions WHERE id = ? AND channel_id = ? AND status = 'active'"
  )
    .bind(sessionId, auth.channelId)
    .first<{ id: string }>();

  if (!session) {
    return error("Session not found or not active", 404);
  }

  const body = await request.arrayBuffer();
  const r2Key = `${auth.channelId}/${sessionId}/${filename}`;

  // Determine content type from filename
  let contentType = "application/octet-stream";
  if (filename.endsWith(".webm")) contentType = "audio/webm";
  else if (filename.endsWith(".jpg") || filename.endsWith(".jpeg")) contentType = "image/jpeg";
  else if (filename.endsWith(".png")) contentType = "image/png";

  // Upload to R2
  await env.MEDIA.put(r2Key, body, {
    httpMetadata: { contentType },
  });

  // Update manifest in R2
  const manifestKey = `${auth.channelId}/${sessionId}/manifest.json`;
  const manifestObj = await env.MEDIA.get(manifestKey);
  if (manifestObj) {
    const manifest: CaptureManifest = await manifestObj.json();
    manifest.files.push({
      name: filename,
      type: contentType,
      startedAt,
      size: body.byteLength,
      source,
    });
    await env.MEDIA.put(manifestKey, JSON.stringify(manifest), {
      httpMetadata: { contentType: "application/json" },
    });
  }

  // Update D1 activity
  const now = new Date().toISOString();
  await env.DB.prepare(
    "UPDATE capture_sessions SET file_count = file_count + 1, last_activity_at = ? WHERE id = ?"
  )
    .bind(now, sessionId)
    .run();

  return json({ uploaded: filename, size: body.byteLength });
}

// POST /api/capture/sessions/:id/finalize — end a session
// Supports both Bearer auth and ?token= query param (for sendBeacon)
export async function finalizeSession(
  request: Request,
  env: Env,
  auth: AuthResult | null,
  sessionId: string
): Promise<Response> {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");

  let channelId: string;

  if (auth) {
    // Authenticated via Bearer token — verify session ownership
    const session = await env.DB.prepare(
      "SELECT id FROM capture_sessions WHERE id = ? AND channel_id = ? AND status = 'active'"
    )
      .bind(sessionId, auth.channelId)
      .first<{ id: string }>();

    if (!session) {
      return error("Session not found or not active", 404);
    }
    channelId = auth.channelId;
  } else if (token) {
    // Token-based finalization (sendBeacon)
    const session = await env.DB.prepare(
      "SELECT id, channel_id FROM capture_sessions WHERE id = ? AND finalize_token = ? AND status = 'active'"
    )
      .bind(sessionId, token)
      .first<{ id: string; channel_id: string }>();

    if (!session) {
      return error("Invalid token or session not active", 403);
    }
    channelId = session.channel_id;
  } else {
    return error("Unauthorized", 401);
  }

  const now = new Date().toISOString();

  // Update manifest endedAt
  const manifestKey = `${channelId}/${sessionId}/manifest.json`;
  const manifestObj = await env.MEDIA.get(manifestKey);
  if (manifestObj) {
    const manifest: CaptureManifest = await manifestObj.json();
    manifest.endedAt = now;
    await env.MEDIA.put(manifestKey, JSON.stringify(manifest), {
      httpMetadata: { contentType: "application/json" },
    });
  }

  // Update D1
  await env.DB.prepare(
    "UPDATE capture_sessions SET status = 'completed', ended_at = ?, last_activity_at = ? WHERE id = ?"
  )
    .bind(now, now, sessionId)
    .run();

  return json({ finalized: true, endedAt: now });
}

// GET /api/capture/sessions — list sessions for this channel
export async function listSessions(
  request: Request,
  env: Env,
  auth: AuthResult
): Promise<Response> {
  const url = new URL(request.url);
  const status = url.searchParams.get("status");

  let query: string;
  let binds: unknown[];

  if (status) {
    query =
      "SELECT id, started_at, ended_at, status, file_count, last_activity_at FROM capture_sessions WHERE channel_id = ? AND status = ? ORDER BY started_at DESC";
    binds = [auth.channelId, status];
  } else {
    query =
      "SELECT id, started_at, ended_at, status, file_count, last_activity_at FROM capture_sessions WHERE channel_id = ? ORDER BY started_at DESC";
    binds = [auth.channelId];
  }

  const { results } = await env.DB.prepare(query)
    .bind(...binds)
    .all<{
      id: string;
      started_at: string;
      ended_at: string | null;
      status: string;
      file_count: number;
      last_activity_at: string | null;
    }>();

  const sessions = results.map((row) => ({
    id: row.id,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    status: row.status,
    fileCount: row.file_count,
    lastActivityAt: row.last_activity_at,
  }));

  return json({ sessions });
}

// GET /api/capture/sessions/:id/manifest — get session manifest
export async function getManifest(
  _request: Request,
  env: Env,
  auth: AuthResult,
  sessionId: string
): Promise<Response> {
  const key = `${auth.channelId}/${sessionId}/manifest.json`;
  const obj = await env.MEDIA.get(key);

  if (!obj) {
    return error("Manifest not found", 404);
  }

  return new Response(obj.body, {
    headers: { "Content-Type": "application/json" },
  });
}

// GET /api/capture/sessions/:id/files/:name — download a file
export async function getFile(
  _request: Request,
  env: Env,
  auth: AuthResult,
  sessionId: string,
  filename: string
): Promise<Response> {
  const key = `${auth.channelId}/${sessionId}/${filename}`;
  const obj = await env.MEDIA.get(key);

  if (!obj) {
    return error("File not found", 404);
  }

  return new Response(obj.body, {
    headers: {
      "Content-Type": obj.httpMetadata?.contentType || "application/octet-stream",
      "Content-Length": String(obj.size),
    },
  });
}

// DELETE /api/capture/sessions/:id — delete session and all R2 files
export async function deleteSession(
  _request: Request,
  env: Env,
  auth: AuthResult,
  sessionId: string
): Promise<Response> {
  // Verify session belongs to this channel
  const session = await env.DB.prepare(
    "SELECT id FROM capture_sessions WHERE id = ? AND channel_id = ?"
  )
    .bind(sessionId, auth.channelId)
    .first<{ id: string }>();

  if (!session) {
    return error("Session not found", 404);
  }

  // List and delete all R2 objects for this session
  const prefix = `${auth.channelId}/${sessionId}/`;
  const listed = await env.MEDIA.list({ prefix });
  if (listed.objects.length > 0) {
    await env.MEDIA.delete(listed.objects.map((o) => o.key));
  }

  // Delete D1 record
  await env.DB.prepare("DELETE FROM capture_sessions WHERE id = ?")
    .bind(sessionId)
    .run();

  return json({ deleted: true });
}

// Cron handler: auto-finalize stale active sessions
export async function autoFinalizeSessions(env: Env): Promise<void> {
  const cutoff = new Date(Date.now() - 2 * 60 * 1000).toISOString(); // 2 minutes ago

  const { results } = await env.DB.prepare(
    "SELECT id, channel_id FROM capture_sessions WHERE status = 'active' AND last_activity_at < ?"
  )
    .bind(cutoff)
    .all<{ id: string; channel_id: string }>();

  const now = new Date().toISOString();

  for (const session of results) {
    // Update manifest
    const manifestKey = `${session.channel_id}/${session.id}/manifest.json`;
    const manifestObj = await env.MEDIA.get(manifestKey);
    if (manifestObj) {
      const manifest: CaptureManifest = await manifestObj.json();
      manifest.endedAt = now;
      await env.MEDIA.put(manifestKey, JSON.stringify(manifest), {
        httpMetadata: { contentType: "application/json" },
      });
    }

    // Update D1
    await env.DB.prepare(
      "UPDATE capture_sessions SET status = 'completed', ended_at = ? WHERE id = ?"
    )
      .bind(now, session.id)
      .run();
  }
}
