# callback-dropbox

Cloud message relay between [callback-box](https://github.com/ianb/callback-box) (agent) and callback-clerk (browser extension). A Cloudflare Worker backed by D1 (SQLite) with end-to-end AES-256-GCM encryption.

## Setup

```bash
npm install
npm run build
```

## Deployment

1. Create a D1 database in the Cloudflare dashboard (or via `npx wrangler d1 create callback-dropbox`)
2. Update `database_id` in `wrangler.toml`
3. Create a Cloudflare API token with **Workers Scripts: Edit** and **D1: Edit** permissions
4. Apply the schema and deploy:

```bash
export CLOUDFLARE_API_TOKEN=<your-token>
npx wrangler d1 execute callback-dropbox --remote --file=worker/schema.sql
npx wrangler deploy
```

The worker will be available at `https://callback-dropbox.<your-account>.workers.dev`.

## API

All routes return JSON. Authenticated routes require `Authorization: Bearer <api_key>`.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/channels` | No | Create a channel (returns `channelId` + `apiKey`) |
| POST | `/channels/:id/pair` | Yes | Generate a 6-digit pairing code |
| POST | `/pair` | No | Redeem a pairing code (returns `apiKey` + `channelKey`) |
| GET | `/messages?since=<iso>` | Yes | Fetch messages for your channel |
| POST | `/messages` | Yes | Post an encrypted message |
| DELETE | `/messages/:id` | Yes | Delete/acknowledge a message |

## Client Library

```typescript
import { DropboxClient } from "callback-dropbox/client";

const client = new DropboxClient({
  url: "https://callback-dropbox.<account>.workers.dev",
  apiKey: "sk-...",
  channelKey: "<base64-aes-key>",
});

await client.send({ type: "tab-list", data: [...] });
const messages = await client.poll({ since: lastSeen });
```

### Pairing Flow

```typescript
import { createChannel, generatePairingCode, redeemPairingCode } from "callback-dropbox/client";

// Agent side:
const { channelId, apiKey, channelKey } = await createChannel(workerUrl);
const { code } = await generatePairingCode(workerUrl, apiKey, channelId, channelKey);
// Share the 6-digit code with the client

// Client side:
const { channelId, apiKey, channelKey } = await redeemPairingCode(workerUrl, code);
```

## Testing

```bash
npm test
```