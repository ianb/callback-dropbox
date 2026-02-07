import { type Env, authenticate } from "./auth.js";
import {
  createChannel,
  createPairingCode,
  redeemPairingCode,
  getMessages,
  postMessage,
  deleteMessage,
} from "./routes.js";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;
    const method = request.method;

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
            response = await createPairingCode(request, env, auth, pairMatch[1]);
          }
          // GET /messages
          else if (method === "GET" && pathname === "/messages") {
            response = await getMessages(request, env, auth);
          }
          // POST /messages
          else if (method === "POST" && pathname === "/messages") {
            response = await postMessage(request, env, auth);
          }
          // DELETE /messages/:id
          else {
            const deleteMatch = pathname.match(/^\/messages\/([^/]+)$/);
            if (method === "DELETE" && deleteMatch) {
              response = await deleteMessage(env, auth, deleteMatch[1]);
            } else {
              response = new Response(JSON.stringify({ error: "Not found" }), {
                status: 404,
                headers: { "Content-Type": "application/json" },
              });
            }
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
};
