export type FacingMode = "user" | "environment";

export class CameraCapture {
  private stream: MediaStream | null = null;
  private videoEl: HTMLVideoElement | null = null;
  facingMode: FacingMode = "environment";

  async start(videoEl: HTMLVideoElement, facing?: FacingMode): Promise<void> {
    if (facing) this.facingMode = facing;
    this.videoEl = videoEl;

    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: this.facingMode },
      audio: false,
    });

    videoEl.srcObject = this.stream;
    await videoEl.play();
  }

  async flip(): Promise<void> {
    this.facingMode = this.facingMode === "user" ? "environment" : "user";
    this.stopStream();
    if (this.videoEl) {
      await this.start(this.videoEl);
    }
  }

  takePhoto(): { blob: Promise<Blob | null>; source: string } {
    if (!this.videoEl) {
      return { blob: Promise.resolve(null), source: `camera-${this.facingMode}` };
    }

    const canvas = document.createElement("canvas");
    canvas.width = this.videoEl.videoWidth;
    canvas.height = this.videoEl.videoHeight;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(this.videoEl, 0, 0);

    const blobPromise = new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), "image/jpeg", 0.85);
    });

    return { blob: blobPromise, source: `camera-${this.facingMode}` };
  }

  stop(): void {
    this.stopStream();
    if (this.videoEl) {
      this.videoEl.srcObject = null;
      this.videoEl = null;
    }
  }

  private stopStream(): void {
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
  }

  get active(): boolean {
    return this.stream !== null && this.stream.active;
  }
}
