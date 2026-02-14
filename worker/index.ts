import { type Env, authenticate } from "./auth.js";
import {
  createChannel,
  createPairingCode,
  redeemPairingCode,
  getMessages,
  postMessage,
  deleteMessage,
} from "./routes.js";
import {
  createSession,
  uploadFile,
  finalizeSession,
  listSessions,
  getManifest,
  getFile,
  deleteSession,
  autoFinalizeSessions,
} from "./capture-routes.js";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Capture-Filename, X-Capture-Started-At, X-Capture-Source",
};

function withCors(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(CORS_HEADERS)) {
    headers.set(k, v);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function isApiPath(pathname: string): boolean {
  return (
    pathname === "/channels" ||
    pathname === "/pair" ||
    pathname.startsWith("/channels/") ||
    pathname === "/messages" ||
    pathname.startsWith("/messages/") ||
    pathname.startsWith("/api/")
  );
}

export interface ScheduledParams {
  event: ScheduledEvent;
  env: Env;
  ctx: ExecutionContext;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;
    const method = request.method;

    // Non-API paths: serve static assets
    if (!isApiPath(pathname)) {
      return env.ASSETS.fetch(request);
    }

    // Handle CORS preflight
    if (method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    let response: Response;

    try {
      // POST /channels — no auth required (creates a new channel + agent key)
      if (method === "POST" && pathname === "/channels") {
        response = await createChannel(request, env);
      }
      // POST /pair — no auth required (redeem pairing code)
      else if (method === "POST" && pathname === "/pair") {
        response = await redeemPairingCode(request, env);
      }
      // POST /api/capture/sessions/:id/finalize — supports both auth and token
      else if (method === "POST" && /^\/api\/capture\/sessions\/[^/]+\/finalize$/.test(pathname)) {
        const sessionId = pathname.split("/")[4];
        const auth = await authenticate(request, env);
        response = await finalizeSession({ request, env, auth, sessionId });
      } else {
        // All other routes require auth
        const auth = await authenticate(request, env);
        if (!auth) {
          response = new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }
        // POST /channels/:id/pair
        else {
          const pairMatch = pathname.match(/^\/channels\/([^/]+)\/pair$/);
          if (method === "POST" && pairMatch) {
            response = await createPairingCode({ request, env, auth, channelId: pairMatch[1] });
          }
          // GET /messages
          else if (method === "GET" && pathname === "/messages") {
            response = await getMessages({ request, env, auth });
          }
          // POST /messages
          else if (method === "POST" && pathname === "/messages") {
            response = await postMessage({ request, env, auth });
          }
          // DELETE /messages/:id
          else if (method === "DELETE" && pathname.match(/^\/messages\/[^/]+$/)) {
            const messageId = pathname.split("/")[2];
            response = await deleteMessage({ env, auth, messageId });
          }
          // --- Capture routes ---
          // POST /api/capture/sessions — create session
          else if (method === "POST" && pathname === "/api/capture/sessions") {
            response = await createSession({ request, env, auth });
          }
          // GET /api/capture/sessions — list sessions
          else if (method === "GET" && pathname === "/api/capture/sessions") {
            response = await listSessions({ request, env, auth });
          }
          // POST /api/capture/sessions/:id/upload
          else if (method === "POST" && /^\/api\/capture\/sessions\/[^/]+\/upload$/.test(pathname)) {
            const sessionId = pathname.split("/")[4];
            response = await uploadFile({ request, env, auth, sessionId });
          }
          // GET /api/capture/sessions/:id/manifest
          else if (method === "GET" && /^\/api\/capture\/sessions\/[^/]+\/manifest$/.test(pathname)) {
            const sessionId = pathname.split("/")[4];
            response = await getManifest({ request, env, auth, sessionId });
          }
          // GET /api/capture/sessions/:id/files/:name
          else if (method === "GET" && /^\/api\/capture\/sessions\/[^/]+\/files\/[^/]+$/.test(pathname)) {
            const parts = pathname.split("/");
            const sessionId = parts[4];
            const filename = parts[6];
            response = await getFile({ request, env, auth, sessionId, filename });
          }
          // DELETE /api/capture/sessions/:id
          else if (method === "DELETE" && /^\/api\/capture\/sessions\/[^/]+$/.test(pathname)) {
            const sessionId = pathname.split("/")[4];
            response = await deleteSession({ request, env, auth, sessionId });
          } else {
            response = new Response(JSON.stringify({ error: "Not found" }), {
              status: 404,
              headers: { "Content-Type": "application/json" },
            });
          }
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Internal error";
      response = new Response(JSON.stringify({ error: message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    return withCors(response);
  },

  async scheduled(params: ScheduledParams): Promise<void> {
    await autoFinalizeSessions(params.env);
  },
};
