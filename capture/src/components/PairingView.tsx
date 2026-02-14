import { useState, useRef } from "react";
import { saveCredentials, type CaptureCredentials } from "../lib/storage";

interface Props {
  onPaired: (credentials: CaptureCredentials) => void;
}

export default function PairingView({ onPaired }: Props) {
  const [digits, setDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const handleInput = (index: number, value: string) => {
    if (!/^\d?$/.test(value)) return;

    const next = [...digits];
    next[index] = value;
    setDigits(next);
    setError(null);

    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto-submit when all 6 digits entered
    if (value && index === 5 && next.every((d) => d)) {
      submit(next.join(""));
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (pasted.length === 6) {
      const next = pasted.split("");
      setDigits(next);
      submit(pasted);
    }
  };

  async function submit(code: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/pair", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, label: "capture" }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      const { channelId, apiKey } = await res.json();
      const credentials: CaptureCredentials = { apiKey, channelId };
      saveCredentials(credentials);
      onPaired(credentials);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Pairing failed");
      setDigits(["", "", "", "", "", ""]);
      inputRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-center justify-center h-full bg-gray-950 px-6">
      <h1 className="text-2xl font-bold mb-2">Capture</h1>
      <p className="text-gray-400 mb-8 text-center">
        Enter the 6-digit pairing code from your callback box
      </p>

      <div className="flex gap-2 mb-6" onPaste={handlePaste}>
        {digits.map((digit, i) => (
          <input
            key={i}
            ref={(el) => { inputRefs.current[i] = el; }}
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={digit}
            onChange={(e) => handleInput(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            disabled={loading}
            className="w-12 h-14 text-center text-2xl font-mono bg-gray-800 border border-gray-600 rounded-lg focus:border-blue-500 focus:outline-none disabled:opacity-50"
          />
        ))}
      </div>

      {error && <p className="text-red-400 text-sm mb-4">{error}</p>}
      {loading && <p className="text-gray-400 text-sm">Pairing...</p>}
    </div>
  );
}
