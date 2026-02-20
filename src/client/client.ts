import { importKey, encrypt, decrypt } from "./crypto.js";

export interface DropboxClientOptions {
  url: string;
  apiKey: string;
  channelKey: string; // base64-encoded AES key
}

export interface EncryptedMessage {
  id: string;
  sender: string;
  contentType: string | null;
  body: string; // base64 encrypted
  nonce: string; // base64 nonce
  createdAt: string;
}

export interface DecryptedMessage {
  id: string;
  sender: string;
  contentType: string | null;
  data: unknown;
  createdAt: string;
}

export class DropboxClient {
  private url: string;
  private apiKey: string;
  private channelKeyBase64: string;
  private _key: CryptoKey | null = null;

  constructor(options: DropboxClientOptions) {
    this.url = options.url.replace(/\/$/, "");
    this.apiKey = options.apiKey;
    this.channelKeyBase64 = options.channelKey;
  }

  private async key(): Promise<CryptoKey> {
    if (!this._key) {
      this._key = await importKey(this.channelKeyBase64);
    }
    return this._key;
  }

  private async request(
    path: string,
    options: RequestInit = {}
  ): Promise<Response> {
    const res = await fetch(`${this.url}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
        ...(options.headers as Record<string, string>),
      },
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`HTTP ${res.status}: ${body}`);
    }
    return res;
  }

  async send(
    data: unknown,
    options: { sender?: string; contentType?: string } = {}
  ): Promise<{ id: string; createdAt: string }> {
    const k = await this.key();
    const plaintext = JSON.stringify(data);
    const { body, nonce } = await encrypt(k, plaintext);

    const res = await this.request("/messages", {
      method: "POST",
      body: JSON.stringify({
        sender: options.sender ?? "client",
        contentType: options.contentType ?? "application/json",
        body,
        nonce,
      }),
    });

    return res.json();
  }

  async poll(
    options: { since?: string } = {}
  ): Promise<DecryptedMessage[]> {
    const params = options.since ? `?since=${encodeURIComponent(options.since)}` : "";
    const res = await this.request(`/messages${params}`);
    const { messages } = (await res.json()) as {
      messages: EncryptedMessage[];
    };

    const k = await this.key();
    const decrypted: DecryptedMessage[] = [];

    for (const msg of messages) {
      const plaintext = await decrypt({
        key: k,
        body: msg.body,
        nonce: msg.nonce,
      });
      decrypted.push({
        id: msg.id,
        sender: msg.sender,
        contentType: msg.contentType,
        data: JSON.parse(plaintext),
        createdAt: msg.createdAt,
      });
    }

    return decrypted;
  }

  async deleteMessage(id: string): Promise<void> {
    await this.request(`/messages/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  }
}
