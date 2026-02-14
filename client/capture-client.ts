import type { CaptureManifest, CaptureSessionSummary } from "./schemas.js";

export interface CaptureClientOptions {
  url: string;
  apiKey: string;
}

export class CaptureClient {
  private url: string;
  private apiKey: string;

  constructor(options: CaptureClientOptions) {
    this.url = options.url.replace(/\/$/, "");
    this.apiKey = options.apiKey;
  }

  private async request(
    path: string,
    options: RequestInit = {}
  ): Promise<Response> {
    const res = await fetch(`${this.url}${path}`, {
      ...options,
      headers: {
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

  async listSessions(
    options: { status?: string } = {}
  ): Promise<CaptureSessionSummary[]> {
    const params = options.status
      ? `?status=${encodeURIComponent(options.status)}`
      : "";
    const res = await this.request(`/api/capture/sessions${params}`);
    const { sessions } = (await res.json()) as {
      sessions: CaptureSessionSummary[];
    };
    return sessions;
  }

  async getManifest(sessionId: string): Promise<CaptureManifest> {
    const res = await this.request(
      `/api/capture/sessions/${encodeURIComponent(sessionId)}/manifest`
    );
    return res.json() as Promise<CaptureManifest>;
  }

  async downloadFile(
    sessionId: string,
    filename: string
  ): Promise<ArrayBuffer> {
    const res = await this.request(
      `/api/capture/sessions/${encodeURIComponent(sessionId)}/files/${encodeURIComponent(filename)}`
    );
    return res.arrayBuffer();
  }

  async downloadFileStream(
    sessionId: string,
    filename: string
  ): Promise<ReadableStream<Uint8Array>> {
    const res = await this.request(
      `/api/capture/sessions/${encodeURIComponent(sessionId)}/files/${encodeURIComponent(filename)}`
    );
    if (!res.body) throw new Error("No response body");
    return res.body;
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.request(
      `/api/capture/sessions/${encodeURIComponent(sessionId)}`,
      { method: "DELETE" }
    );
  }
}
