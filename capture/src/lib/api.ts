import type { CaptureCredentials } from "./storage";

export interface UploadFileOptions {
  sessionId: string;
  filename: string;
  blob: Blob;
  startedAt: string;
  source: string;
}

export class CaptureApi {
  private credentials: CaptureCredentials;

  constructor(credentials: CaptureCredentials) {
    this.credentials = credentials;
  }

  private get headers(): HeadersInit {
    return {
      Authorization: `Bearer ${this.credentials.apiKey}`,
    };
  }

  async createSession(): Promise<{
    sessionId: string;
    finalizeToken: string;
    startedAt: string;
  }> {
    const res = await fetch("/api/capture/sessions", {
      method: "POST",
      headers: this.headers,
    });
    if (!res.ok) throw new Error(`Create session failed: ${res.status}`);
    return res.json();
  }

  async uploadFile(options: UploadFileOptions): Promise<void> {
    const { sessionId, filename, blob, startedAt, source } = options;
    const res = await fetch(`/api/capture/sessions/${sessionId}/upload`, {
      method: "POST",
      headers: {
        ...this.headers,
        "X-Capture-Filename": filename,
        "X-Capture-Started-At": startedAt,
        "X-Capture-Source": source,
      },
      body: blob,
    });
    if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
  }

  async finalizeSession(sessionId: string): Promise<void> {
    const res = await fetch(`/api/capture/sessions/${sessionId}/finalize`, {
      method: "POST",
      headers: this.headers,
    });
    if (!res.ok) throw new Error(`Finalize failed: ${res.status}`);
  }

  buildFinalizeBeaconUrl(sessionId: string, token: string): string {
    return `/api/capture/sessions/${sessionId}/finalize?token=${encodeURIComponent(token)}`;
  }
}
