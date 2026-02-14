import { useState, useEffect, useRef, useCallback } from "react";
import type { CaptureCredentials } from "../lib/storage";
import { CaptureApi } from "../lib/api";
import { ChunkedRecorder } from "../lib/recorder";
import { CameraCapture } from "../lib/camera";

interface Props {
  credentials: CaptureCredentials;
  onDisconnect: () => void;
}

type UploadState = "uploading" | "uploaded" | "failed";

interface AudioChunkStatus {
  index: number;
  state: UploadState;
}

export default function CaptureView({ credentials, onDisconnect }: Props) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [finalizeToken, setFinalizeToken] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [photoStates, setPhotoStates] = useState<UploadState[]>([]);
  const [audioChunks, setAudioChunks] = useState<AudioChunkStatus[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showMenu, setShowMenu] = useState(false);
  const [flashing, setFlashing] = useState(false);

  const apiRef = useRef(new CaptureApi(credentials));
  const recorderRef = useRef<ChunkedRecorder | null>(null);
  const cameraRef = useRef(new CameraCapture());
  const videoRef = useRef<HTMLVideoElement>(null);
  const timerRef = useRef<number | null>(null);
  const recordStartRef = useRef<number>(0);
  const galleryRef = useRef<HTMLInputElement>(null);
  const shutterAudioRef = useRef<HTMLAudioElement | null>(null);

  // Preload shutter sound
  useEffect(() => {
    shutterAudioRef.current = new Audio("/shutter.mp3");
  }, []);

  // Create session on mount
  useEffect(() => {
    let cancelled = false;
    apiRef.current.createSession().then(({ sessionId, finalizeToken }) => {
      if (!cancelled) {
        setSessionId(sessionId);
        setFinalizeToken(finalizeToken);
      }
    }).catch((err) => {
      if (!cancelled) setError(`Session creation failed: ${err.message}`);
    });
    return () => { cancelled = true; };
  }, []);

  // Finalize on unmount/beforeunload
  useEffect(() => {
    const handleUnload = () => {
      if (sessionId && finalizeToken) {
        const url = apiRef.current.buildFinalizeBeaconUrl(sessionId, finalizeToken);
        navigator.sendBeacon(url);
      }
    };
    window.addEventListener("beforeunload", handleUnload);
    return () => {
      window.removeEventListener("beforeunload", handleUnload);
      handleUnload();
    };
  }, [sessionId, finalizeToken]);

  // Recording timer
  useEffect(() => {
    if (recording) {
      recordStartRef.current = Date.now();
      timerRef.current = window.setInterval(() => {
        setRecordingTime(Math.floor((Date.now() - recordStartRef.current) / 1000));
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      setRecordingTime(0);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [recording]);

  const triggerFlash = useCallback(() => {
    setFlashing(true);
    shutterAudioRef.current?.play().catch(() => {});
    setTimeout(() => setFlashing(false), 250);
  }, []);

  interface UploadPhotoParams {
    sessionId: string;
    index: number;
    blob: Blob;
    startedAt: string;
    source: string;
  }

  const uploadPhoto = useCallback(
    async ({ sessionId, index, blob, startedAt, source }: UploadPhotoParams) => {
      const ext = blob.type.includes("png") ? "png" : "jpg";
      const filename = `photo-${String(index + 1).padStart(3, "0")}.${ext}`;
      setPhotoStates((prev) => {
        const next = [...prev];
        next[index] = "uploading";
        return next;
      });
      try {
        await apiRef.current.uploadFile({ sessionId, filename, blob, startedAt, source });
        setPhotoStates((prev) => {
          const next = [...prev];
          next[index] = "uploaded";
          return next;
        });
      } catch {
        setPhotoStates((prev) => {
          const next = [...prev];
          next[index] = "failed";
          return next;
        });
      }
    },
    []
  );

  interface HandleChunkParams {
    blob: Blob;
    index: number;
    startedAt: string;
  }

  const handleChunk = useCallback(
    ({ blob, index, startedAt }: HandleChunkParams) => {
      if (!sessionId) return;
      const filename = `audio-${String(index + 1).padStart(3, "0")}.webm`;
      setAudioChunks((prev) => [...prev, { index, state: "uploading" }]);
      apiRef.current
        .uploadFile({ sessionId, filename, blob, startedAt, source: "microphone" })
        .then(() => {
          setAudioChunks((prev) =>
            prev.map((c) => (c.index === index ? { ...c, state: "uploaded" } : c))
          );
        })
        .catch(() => {
          setAudioChunks((prev) =>
            prev.map((c) => (c.index === index ? { ...c, state: "failed" } : c))
          );
        });
    },
    [sessionId]
  );

  const toggleRecording = useCallback(async () => {
    if (recording) {
      recorderRef.current?.stop();
      recorderRef.current = null;
      setRecording(false);
    } else {
      try {
        const recorder = new ChunkedRecorder({ onChunk: handleChunk });
        recorderRef.current = recorder;
        await recorder.start();
        setRecording(true);
      } catch (err) {
        setError(`Microphone access failed: ${err instanceof Error ? err.message : "unknown"}`);
      }
    }
  }, [recording, handleChunk]);

  const startCamera = useCallback(async () => {
    try {
      if (videoRef.current) {
        await cameraRef.current.start(videoRef.current);
        setCameraOn(true);
      }
    } catch (err) {
      setError(`Camera access failed: ${err instanceof Error ? err.message : "unknown"}`);
    }
  }, []);

  const toggleCamera = useCallback(async () => {
    if (cameraOn) {
      cameraRef.current.stop();
      setCameraOn(false);
    } else {
      await startCamera();
    }
  }, [cameraOn, startCamera]);

  const flipCamera = useCallback(async () => {
    if (cameraOn) {
      await cameraRef.current.flip();
    }
  }, [cameraOn]);

  const takePhoto = useCallback(async () => {
    if (!sessionId) return;
    // If camera is off, turn it on (no photo taken)
    if (!cameraOn) {
      await startCamera();
      return;
    }
    triggerFlash();
    const { blob: blobPromise, source } = cameraRef.current.takePhoto();
    const blob = await blobPromise;
    if (!blob) return;
    const index = photoStates.length;
    const startedAt = new Date().toISOString();
    setPhotoStates((prev) => [...prev, "uploading"]);
    uploadPhoto({ sessionId, index, blob, startedAt, source });
  }, [sessionId, cameraOn, photoStates.length, startCamera, triggerFlash, uploadPhoto]);

  const pickFromGallery = useCallback(() => {
    galleryRef.current?.click();
  }, []);

  const handleGallerySelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!sessionId || !e.target.files) return;
      for (const file of Array.from(e.target.files)) {
        const index = photoStates.length;
        const startedAt = new Date().toISOString();
        setPhotoStates((prev) => [...prev, "uploading"]);
        uploadPhoto({ sessionId, index, blob: file, startedAt, source: "gallery" });
      }
      e.target.value = "";
    },
    [sessionId, photoStates.length, uploadPhoto]
  );

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  };

  // Derived upload status
  const photosUploaded = photoStates.filter((s) => s === "uploaded").length;
  const photosUploading = photoStates.filter((s) => s === "uploading").length;
  const photoTotal = photoStates.length;

  const audioUploaded = audioChunks.filter((c) => c.state === "uploaded").length;
  const audioUploading = audioChunks.filter((c) => c.state === "uploading").length;
  const audioTotal = audioChunks.length;

  return (
    <div className="flex flex-col h-full bg-black relative">
      {/* Status bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-900/80 z-10">
        <div className="flex items-center gap-3">
          {recording && (
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse" />
              <span className="text-sm font-mono">{formatTime(recordingTime)}</span>
            </div>
          )}
          {!recording && audioTotal > 0 && (
            <div className="flex items-center gap-1.5 text-sm">
              {audioUploading > 0 ? (
                <>
                  <span className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse" />
                  <span className="text-yellow-400">audio uploading</span>
                </>
              ) : (
                <>
                  <span className="text-green-400">&#10003;</span>
                  <span className="text-green-400">audio ({audioUploaded})</span>
                </>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-3 text-sm">
          {photoTotal > 0 && (
            <div className="flex items-center gap-1.5">
              {photosUploading > 0 ? (
                <>
                  <span className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse" />
                  <span className="text-yellow-400">{photosUploaded}/{photoTotal}</span>
                </>
              ) : (
                <>
                  <span className="text-green-400">&#10003;</span>
                  <span className="text-green-400">{photoTotal} photos</span>
                </>
              )}
            </div>
          )}
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="text-gray-400 hover:text-white p-1"
          >
            &#8942;
          </button>
        </div>
      </div>

      {/* Menu dropdown */}
      {showMenu && (
        <div className="absolute top-12 right-4 bg-gray-800 rounded-lg shadow-lg z-20 py-1">
          <button
            onClick={() => { setShowMenu(false); onDisconnect(); }}
            className="block w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-gray-700"
          >
            Disconnect
          </button>
        </div>
      )}

      {/* Viewfinder — tap to take photo */}
      <div
        className={`flex-1 min-h-0 relative flex items-center justify-center overflow-hidden ${flashing ? "flash-active" : ""}`}
        onClick={cameraOn ? takePhoto : undefined}
      >
        <video
          ref={videoRef}
          className={`w-full h-full object-cover ${cameraOn ? "" : "hidden"}`}
          playsInline
          muted
        />
        {!cameraOn && (
          <div className="text-gray-600 text-center">
            <p className="text-lg">Camera off</p>
            <p className="text-sm mt-1">Tap the camera button to start</p>
          </div>
        )}
      </div>

      {/* Error display */}
      {error && (
        <div className="absolute top-14 left-4 right-4 bg-red-900/80 text-red-200 text-sm px-3 py-2 rounded-lg">
          {error}
          <button
            onClick={() => setError(null)}
            className="float-right text-red-300 hover:text-white"
          >
            &times;
          </button>
        </div>
      )}

      {/* Controls */}
      <div className="flex items-center justify-around px-6 py-6 bg-gray-900/80">
        {/* Gallery picker */}
        <button
          onClick={pickFromGallery}
          disabled={!sessionId}
          className="w-10 h-10 rounded-lg border-2 border-gray-500 flex items-center justify-center disabled:opacity-30"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <path d="M21 15l-5-5L5 21" />
          </svg>
        </button>
        <input
          ref={galleryRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={handleGallerySelect}
        />

        {/* Record button */}
        <button
          onClick={toggleRecording}
          disabled={!sessionId}
          className="w-16 h-16 rounded-full border-4 border-white flex items-center justify-center disabled:opacity-30"
        >
          {recording ? (
            <span className="w-7 h-7 bg-red-500 rounded-sm" />
          ) : (
            <span className="w-11 h-11 bg-red-500 rounded-full" />
          )}
        </button>

        {/* Shutter button (take photo, or turn on camera if off) */}
        <button
          onClick={takePhoto}
          disabled={!sessionId}
          className="w-14 h-14 rounded-full border-4 border-white bg-white/10 disabled:opacity-30 active:bg-white/30"
        />

        {/* Camera toggle */}
        <button
          onClick={toggleCamera}
          disabled={!sessionId}
          className={`w-10 h-10 rounded-full flex items-center justify-center disabled:opacity-30 ${cameraOn ? "bg-blue-600" : "bg-gray-700"}`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        </button>

        {/* Flip camera */}
        <button
          onClick={flipCamera}
          disabled={!cameraOn}
          className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center disabled:opacity-30"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>
    </div>
  );
}
