CREATE TABLE channels (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL
);

CREATE TABLE api_keys (
  id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  label TEXT,
  created_at TEXT NOT NULL,
  revoked_at TEXT,
  FOREIGN KEY (channel_id) REFERENCES channels(id)
);

CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL,
  sender TEXT NOT NULL,
  content_type TEXT,
  body BLOB NOT NULL,
  nonce BLOB NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (channel_id) REFERENCES channels(id)
);

CREATE TABLE pairing_codes (
  code TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL,
  api_key TEXT NOT NULL,
  encrypted_channel_key BLOB NOT NULL,
  expires_at TEXT NOT NULL,
  used INTEGER DEFAULT 0
);
