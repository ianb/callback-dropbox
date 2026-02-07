import t from "tap";
import { DropboxClient } from "../client/client.js";
import { generateChannelKey, exportKey, encrypt } from "../client/crypto.js";

// Mock fetch for client tests
function mockFetch(responses: Map<string, { status: number; body: unknown }>) {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const path = new URL(url).pathname;
    const key = `${init?.method ?? "GET"} ${path}`;
    const response = responses.get(key);
    if (!response) {
      return new Response(JSON.stringify({ error: "Not mocked" }), {
        status: 500,
      });
    }
    return new Response(JSON.stringify(response.body), {
      status: response.status,
      headers: { "Content-Type": "application/json" },
    });
  };
}

t.test("DropboxClient.send encrypts and posts", async (t) => {
  const key = await generateChannelKey();
  const channelKey = await exportKey(key);

  let capturedBody: string | undefined;

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
    capturedBody = init?.body as string;
    return new Response(
      JSON.stringify({ id: "msg-1", createdAt: "2025-01-01T00:00:00Z" }),
      { status: 201, headers: { "Content-Type": "application/json" } }
    );
  };

  t.teardown(() => {
    globalThis.fetch = originalFetch;
  });

  const client = new DropboxClient({
    url: "https://test.workers.dev",
    apiKey: "sk-test",
    channelKey,
  });

  const result = await client.send({ type: "test", value: 42 });
  t.equal(result.id, "msg-1");

  // Verify the body was encrypted (not plaintext JSON)
  const parsed = JSON.parse(capturedBody!);
  t.type(parsed.body, "string");
  t.type(parsed.nonce, "string");
  t.equal(parsed.sender, "client");
  // The body should not be the plain JSON
  t.not(parsed.body, JSON.stringify({ type: "test", value: 42 }));
});

t.test("DropboxClient.poll decrypts messages", async (t) => {
  const key = await generateChannelKey();
  const channelKey = await exportKey(key);

  // Pre-encrypt a message
  const { body, nonce } = await encrypt(
    key,
    JSON.stringify({ type: "hello" })
  );

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    return new Response(
      JSON.stringify({
        messages: [
          {
            id: "msg-1",
            sender: "agent",
            contentType: "application/json",
            body,
            nonce,
            createdAt: "2025-01-01T00:00:00Z",
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  };

  t.teardown(() => {
    globalThis.fetch = originalFetch;
  });

  const client = new DropboxClient({
    url: "https://test.workers.dev",
    apiKey: "sk-test",
    channelKey,
  });

  const messages = await client.poll();
  t.equal(messages.length, 1);
  t.same(messages[0].data, { type: "hello" });
  t.equal(messages[0].sender, "agent");
});
