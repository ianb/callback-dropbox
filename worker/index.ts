import { type Env, authenticate } from "./auth.js";
import {
  createChannel,
  createPairingCode,
  redeemPairingCode,
  getMessages,
  postMessage,
  deleteMessage,
} from "./routes.js";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;
    const method = request.method;

    try {
      // POST /channels — no auth required (creates a new channel + agent key)
      if (method === "POST" && pathname === "/channels") {
        return createChannel(request, env);
      }

      // POST /pair — no auth required (redeem pairing code)
      if (method === "POST" && pathname === "/pair") {
        return redeemPairingCode(request, env);
      }

      // All other routes require auth
      const auth = await authenticate(request, env);
      if (!auth) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }

      // POST /channels/:id/pair
      const pairMatch = pathname.match(/^\/channels\/([^/]+)\/pair$/);
      if (method === "POST" && pairMatch) {
        return createPairingCode(request, env, auth, pairMatch[1]);
      }

      // GET /messages
      if (method === "GET" && pathname === "/messages") {
        return getMessages(request, env, auth);
      }

      // POST /messages
      if (method === "POST" && pathname === "/messages") {
        return postMessage(request, env, auth);
      }

      // DELETE /messages/:id
      const deleteMatch = pathname.match(/^\/messages\/([^/]+)$/);
      if (method === "DELETE" && deleteMatch) {
        return deleteMessage(env, auth, deleteMatch[1]);
      }

      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Internal error";
      return new Response(JSON.stringify({ error: message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  },
};
