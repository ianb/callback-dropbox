import { useState, useCallback } from "react";
import { getCredentials, clearCredentials, type CaptureCredentials } from "./lib/storage";
import PairingView from "./components/PairingView";
import CaptureView from "./components/CaptureView";

export default function App() {
  const [credentials, setCredentials] = useState<CaptureCredentials | null>(
    getCredentials
  );

  const handlePaired = useCallback((creds: CaptureCredentials) => {
    setCredentials(creds);
  }, []);

  const handleDisconnect = useCallback(() => {
    clearCredentials();
    setCredentials(null);
  }, []);

  if (!credentials) {
    return <PairingView onPaired={handlePaired} />;
  }

  return <CaptureView credentials={credentials} onDisconnect={handleDisconnect} />;
}
