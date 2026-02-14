const STORAGE_KEY = "capture-credentials";

export interface CaptureCredentials {
  apiKey: string;
  channelId: string;
}

export function getCredentials(): CaptureCredentials | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    const parsed = JSON.parse(stored);
    if (parsed.apiKey && parsed.channelId) return parsed;
    return null;
  } catch {
    return null;
  }
}

export function saveCredentials(credentials: CaptureCredentials): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(credentials));
}

export function clearCredentials(): void {
  localStorage.removeItem(STORAGE_KEY);
}
