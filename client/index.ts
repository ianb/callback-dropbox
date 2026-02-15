export { DropboxClient } from "./client.js";
export type {
  DropboxClientOptions,
  DecryptedMessage,
  EncryptedMessage,
} from "./client.js";

export { CaptureClient } from "./capture-client.js";
export type { CaptureClientOptions } from "./capture-client.js";

export {
  generateChannelKey,
  exportKey,
  importKey,
  encrypt,
  decrypt,
} from "./crypto.js";

export {
  createChannel,
  generatePairingCode,
  redeemPairingCode,
} from "./pairing.js";
export type {
  ChannelCreationResult,
  PairingCodeResult,
  PairingRedemptionResult,
} from "./pairing.js";

export {
  TabInfoSchema,
  TabsMessageSchema,
  MemoMessageSchema,
  SaveToBriefMessageSchema,
  SavePageMessageSchema,
  OpenTabMessageSchema,
  DropboxMessageSchema,
  CaptureFileSchema,
  CaptureManifestSchema,
  CaptureSessionSummarySchema,
} from "./schemas.js";
export type {
  TabInfo,
  TabsMessage,
  MemoMessage,
  SaveToBriefMessage,
  SavePageMessage,
  OpenTabMessage,
  DropboxMessage,
  CaptureFile,
  CaptureManifest,
  CaptureSessionSummary,
} from "./schemas.js";
