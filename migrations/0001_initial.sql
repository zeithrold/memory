CREATE TABLE memories (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  project TEXT NOT NULL DEFAULT 'global',
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  kind TEXT NOT NULL,
  tags TEXT NOT NULL,
  source TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  search_text TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  deleted INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(owner_id, project, fingerprint),
  UNIQUE(owner_id, idempotency_key)
);
CREATE INDEX memories_owner_project ON memories(owner_id, project, deleted, updated_at);
CREATE TABLE revisions (
  memory_id TEXT NOT NULL REFERENCES memories(id),
  version INTEGER NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  kind TEXT NOT NULL,
  tags TEXT NOT NULL,
  source TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(memory_id, version)
);
CREATE VIRTUAL TABLE memories_fts USING fts5(search_text, content='memories', content_rowid='rowid');
CREATE TABLE index_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  memory_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  available_at INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  UNIQUE(memory_id, version)
);
CREATE TRIGGER memories_insert AFTER INSERT ON memories BEGIN
  INSERT INTO memories_fts(rowid, search_text) VALUES(new.rowid, new.search_text);
  INSERT INTO revisions VALUES(new.id, new.version, new.title, new.content, new.kind, new.tags, new.source, new.updated_at);
  INSERT INTO index_jobs(memory_id, version) VALUES(new.id, new.version);
END;
CREATE TRIGGER memories_update AFTER UPDATE ON memories BEGIN
  INSERT INTO memories_fts(memories_fts, rowid, search_text) VALUES('delete', old.rowid, old.search_text);
  INSERT INTO memories_fts(rowid, search_text) VALUES(new.rowid, new.search_text);
  INSERT INTO revisions SELECT new.id, new.version, new.title, new.content, new.kind, new.tags, new.source, new.updated_at WHERE new.deleted = 0;
  DELETE FROM revisions WHERE memory_id = new.id AND new.deleted = 1;
  INSERT INTO index_jobs(memory_id, version) VALUES(new.id, new.version);
END;
CREATE TABLE api_tokens (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  name TEXT NOT NULL,
  digest TEXT NOT NULL UNIQUE,
  prefix TEXT NOT NULL,
  scopes TEXT NOT NULL,
  project TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  last_used_at TEXT
);
CREATE INDEX api_tokens_owner ON api_tokens(owner_id);
CREATE TABLE usage_events (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  token_id TEXT,
  operation TEXT NOT NULL,
  status INTEGER NOT NULL,
  duration_ms INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX usage_owner_time ON usage_events(owner_id, created_at);
CREATE TABLE rate_limits (
  bucket TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
