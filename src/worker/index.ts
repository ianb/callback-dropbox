import { type Env, type AuthResult, authenticate } from "./auth.js";
import {
  createChannel,
  createPairingCode,
  redeemPairingCode,
  listKeys,
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

async function handleAuthedRoute(
  { method, pathname }: { method: string; pathname: string },
  { request, env, auth }: { request: Request; env: Env; auth: AuthResult },
): Promise<Response> {
  const pairMatch = pathname.match(/^\/channels\/([^/]+)\/pair$/);
  if (method === "POST" && pairMatch) {
    return createPairingCode({ request, env, auth, channelId: pairMatch[1] });
  }
  const keysMatch = pathname.match(/^\/channels\/([^/]+)\/keys$/);
  if (method === "GET" && keysMatch) {
    return listKeys({ env, auth, channelId: keysMatch[1] });
  }
  if (method === "GET" && pathname === "/messages") {
    return getMessages({ request, env, auth });
  }
  if (method === "POST" && pathname === "/messages") {
    return postMessage({ request, env, auth });
  }
  if (method === "DELETE" && pathname.match(/^\/messages\/[^/]+$/)) {
    const messageId = pathname.split("/")[2];
    return deleteMessage({ env, auth, messageId });
  }
  if (method === "POST" && pathname === "/api/capture/sessions") {
    return createSession({ request, env, auth });
  }
  if (method === "GET" && pathname === "/api/capture/sessions") {
    return listSessions({ request, env, auth });
  }
  if (method === "POST" && /^\/api\/capture\/sessions\/[^/]+\/upload$/.test(pathname)) {
    const sessionId = pathname.split("/")[4];
    return uploadFile({ request, env, auth, sessionId });
  }
  if (method === "GET" && /^\/api\/capture\/sessions\/[^/]+\/manifest$/.test(pathname)) {
    const sessionId = pathname.split("/")[4];
    return getManifest({ request, env, auth, sessionId });
  }
  if (method === "GET" && /^\/api\/capture\/sessions\/[^/]+\/files\/[^/]+$/.test(pathname)) {
    const parts = pathname.split("/");
    const sessionId = parts[4];
    const filename = parts[6];
    return getFile({ request, env, auth, sessionId, filename });
  }
  if (method === "DELETE" && /^\/api\/capture\/sessions\/[^/]+$/.test(pathname)) {
    const sessionId = pathname.split("/")[4];
    return deleteSession({ request, env, auth, sessionId });
  }
  return new Response(JSON.stringify({ error: "Not found" }), {
    status: 404,
    headers: { "Content-Type": "application/json" },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;
    const method = request.method;

    if (!isApiPath(pathname)) {
      return env.ASSETS.fetch(request);
    }

    if (method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    let response: Response;

    try {
      if (method === "POST" && pathname === "/channels") {
        response = await createChannel(request, env);
      } else if (method === "POST" && pathname === "/pair") {
        response = await redeemPairingCode(request, env);
      } else if (method === "POST" && /^\/api\/capture\/sessions\/[^/]+\/finalize$/.test(pathname)) {
        const sessionId = pathname.split("/")[4];
        const auth = await authenticate(request, env);
        response = await finalizeSession({ request, env, auth, sessionId });
      } else {
        const auth = await authenticate(request, env);
        if (!auth) {
          response = new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        } else {
          response = await handleAuthedRoute({ method, pathname }, { request, env, auth });
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
