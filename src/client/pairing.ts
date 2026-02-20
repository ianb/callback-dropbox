import { generateChannelKey, exportKey } from "./crypto.js";

export interface ChannelCreationResult {
  channelId: string;
  apiKey: string;
  channelKey: string; // base64-encoded AES key
}

export interface PairingCodeResult {
  code: string;
  expiresAt: string;
}

export interface PairingRedemptionResult {
  channelId: string;
  apiKey: string;
  channelKey: string; // base64-encoded AES key
}

export interface GeneratePairingCodeParams {
  workerUrl: string;
  apiKey: string;
  channelId: string;
  channelKey: string; // base64
}

// Step 1: Agent creates a channel and gets credentials + channel key
export async function createChannel(
  workerUrl: string
): Promise<ChannelCreationResult> {
  const channelKey = await generateChannelKey();
  const channelKeyBase64 = await exportKey(channelKey);

  const res = await fetch(`${workerUrl}/channels`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to create channel: HTTP ${res.status}: ${body}`);
  }

  const { channelId, apiKey } = (await res.json()) as {
    channelId: string;
    apiKey: string;
  };

  return { channelId, apiKey, channelKey: channelKeyBase64 };
}

// Step 2: Agent generates a pairing code for a client to use
export async function generatePairingCode(
  params: GeneratePairingCodeParams
): Promise<PairingCodeResult> {
  const { workerUrl, apiKey, channelId, channelKey } = params;
  // The channel key is passed as encryptedChannelKey — in this simple scheme
  // it's transmitted in plaintext over HTTPS. For stronger protection, the agent
  // could encrypt it with a key derived from the pairing code, but HTTPS is
  // sufficient for this use case since the worker is trusted with transport.
  const res = await fetch(`${workerUrl}/channels/${channelId}/pair`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ encryptedChannelKey: channelKey }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `Failed to generate pairing code: HTTP ${res.status}: ${body}`
    );
  }

  return res.json();
}

// Step 3: Client redeems a pairing code
export async function redeemPairingCode(
  workerUrl: string,
  code: string
): Promise<PairingRedemptionResult> {
  const res = await fetch(`${workerUrl}/pair`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `Failed to redeem pairing code: HTTP ${res.status}: ${body}`
    );
  }

  const { channelId, apiKey, encryptedChannelKey } = (await res.json()) as {
    channelId: string;
    apiKey: string;
    encryptedChannelKey: string;
  };

  return { channelId, apiKey, channelKey: encryptedChannelKey };
}
