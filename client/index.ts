export { DropboxClient } from "./client.js";
export type {
  DropboxClientOptions,
  DecryptedMessage,
  EncryptedMessage,
} from "./client.js";

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
  OpenTabMessageSchema,
  DropboxMessageSchema,
} from "./schemas.js";
export type {
  TabInfo,
  TabsMessage,
  MemoMessage,
  OpenTabMessage,
  DropboxMessage,
} from "./schemas.js";
