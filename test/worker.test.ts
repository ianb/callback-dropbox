import t from "tap";

// We test the worker by importing the route handlers and mocking the D1 binding.
// This avoids needing a full wrangler environment for unit tests.

// A minimal mock for D1
function createMockDB() {
  const tables: Record<string, Record<string, unknown>[]> = {
    channels: [],
    api_keys: [],
    messages: [],
    pairing_codes: [],
  };

  function mockPrepare(query: string) {
    return {
      _query: query,
      _binds: [] as unknown[],
      bind(...args: unknown[]) {
        this._binds = args;
        return this;
      },
      async first<T>(): Promise<T | null> {
        // Simple mock: find matching row
        if (this._query.includes("FROM api_keys")) {
          const hash = this._binds[0];
          const row = tables.api_keys.find(
            (r) => r.key_hash === hash && !r.revoked_at
          );
          return (row as T) ?? null;
        }
        if (this._query.includes("FROM pairing_codes")) {
          const code = this._binds[0];
          const row = tables.pairing_codes.find((r) => r.code === code);
          return (row as T) ?? null;
        }
        return null;
      },
      async all<T>(): Promise<{ results: T[] }> {
        if (this._query.includes("FROM messages")) {
          const channelId = this._binds[0];
          let msgs = tables.messages.filter(
            (r) => r.channel_id === channelId
          );
          if (this._binds[1]) {
            msgs = msgs.filter(
              (r) => (r.created_at as string) > (this._binds[1] as string)
            );
          }
          return { results: msgs as T[] };
        }
        return { results: [] };
      },
      async run() {
        if (this._query.startsWith("INSERT INTO")) {
          const tableMatch = this._query.match(/INSERT INTO (\w+)/);
          if (tableMatch) {
            const table = tableMatch[1];
            const colsMatch = this._query.match(/\(([^)]+)\) VALUES/);
            if (colsMatch) {
              const cols = colsMatch[1].split(",").map((c) => c.trim());
              const row: Record<string, unknown> = {};
              cols.forEach((col, i) => {
                row[col] = this._binds[i];
              });
              tables[table].push(row);
            }
          }
        }
        if (this._query.startsWith("UPDATE")) {
          const code = this._binds[0];
          const row = tables.pairing_codes.find((r) => r.code === code);
          if (row) row.used = 1;
        }
        if (this._query.startsWith("DELETE")) {
          const id = this._binds[0];
          const channelId = this._binds[1];
          const idx = tables.messages.findIndex(
            (r) => r.id === id && r.channel_id === channelId
          );
          return { meta: { changes: idx >= 0 ? 1 : 0 } };
        }
        return { meta: { changes: 1 } };
      },
    };
  }

  return {
    tables,
    prepare: mockPrepare,
    batch(stmts: ReturnType<typeof mockPrepare>[]) {
      return Promise.all(stmts.map((s) => s.run()));
    },
  };
}

// Import the worker handler
import worker from "../worker/index.js";

function makeEnv(db: ReturnType<typeof createMockDB>) {
  return { DB: db as unknown as D1Database };
}

t.test("POST /channels creates a channel", async (t) => {
  const db = createMockDB();
  const env = makeEnv(db);

  const req = new Request("https://test.workers.dev/channels", {
    method: "POST",
  });
  const res = await worker.fetch(req, env);

  t.equal(res.status, 201);
  const body = (await res.json()) as { channelId: string; apiKey: string };
  t.type(body.channelId, "string");
  t.type(body.apiKey, "string");
  t.ok(body.apiKey.startsWith("sk-"));
  t.equal(db.tables.channels.length, 1);
  t.equal(db.tables.api_keys.length, 1);
});

t.test("GET /messages requires auth", async (t) => {
  const db = createMockDB();
  const env = makeEnv(db);

  const req = new Request("https://test.workers.dev/messages");
  const res = await worker.fetch(req, env);

  t.equal(res.status, 401);
});

t.test("unknown route without auth returns 401", async (t) => {
  const db = createMockDB();
  const env = makeEnv(db);

  const req = new Request("https://test.workers.dev/nonexistent");
  const res = await worker.fetch(req, env);

  t.equal(res.status, 401);
});
