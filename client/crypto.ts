const ALGORITHM = "AES-GCM";
const KEY_LENGTH = 256;
const NONCE_LENGTH = 12; // 96-bit nonce for AES-GCM

export async function generateChannelKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    { name: ALGORITHM, length: KEY_LENGTH },
    true, // extractable
    ["encrypt", "decrypt"]
  ) as Promise<CryptoKey>;
}

export async function exportKey(key: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey("raw", key) as ArrayBuffer;
  return arrayBufferToBase64(raw);
}

export async function importKey(base64Key: string): Promise<CryptoKey> {
  const raw = base64ToArrayBuffer(base64Key);
  return crypto.subtle.importKey("raw", raw, { name: ALGORITHM }, true, [
    "encrypt",
    "decrypt",
  ]);
}

export async function encrypt(
  key: CryptoKey,
  plaintext: string
): Promise<{ body: string; nonce: string }> {
  const nonce = crypto.getRandomValues(new Uint8Array(NONCE_LENGTH));
  const encoded = new TextEncoder().encode(plaintext);

  const ciphertext = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv: nonce },
    key,
    encoded
  );

  return {
    body: arrayBufferToBase64(ciphertext),
    nonce: arrayBufferToBase64(nonce.buffer),
  };
}

export interface DecryptParams {
  key: CryptoKey;
  body: string;
  nonce: string;
}

export async function decrypt(params: DecryptParams): Promise<string> {
  const { key, body, nonce } = params;
  const ciphertext = base64ToArrayBuffer(body);
  const iv = base64ToArrayBuffer(nonce);

  const plaintext = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv },
    key,
    ciphertext
  );

  return new TextDecoder().decode(plaintext);
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}
