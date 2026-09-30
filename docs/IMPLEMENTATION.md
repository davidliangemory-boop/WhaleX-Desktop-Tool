# WhaleX 0.2 implementation

`web/` is the only active frontend. Pages publishes it and Tauri packages `../../web`. The old desktop `dist/` stays as a migration reference.

- `logic.js`: validation, escaping, tags, local-rule routing, conflict reconciliation.
- `store.js`: IndexedDB `[scope,id]` records, transactions, migration, CRUD, backup/import.
- `sync.js`: optional Supabase REST Auth, locks, optimistic-concurrency RPC, paged pulls and retries.
- `composer.js`: shared editable sticky for homepage, modal, PiP, native capture and native note windows.
- `app.js`: navigation, actions, PiP, settings, exports.
- `capture.js`: independent capture/editor host.
- `supabase/schema.sql`: ownership RLS and atomic version checks.

A scope is `local` or `project_url|user_id`. Each mutation has an ID, base server version and dirty flag. Deleted records remain tombstones. On successful acknowledgement, a newer local mutation is preserved and only its base updated. A stale-version conflict installs the remote record and retains a new visible local conflict copy. Identical retries are idempotent. No client clock decides which content survives.

Pulls are paged in batches of 500, including tombstones. This is a personal-workspace design, not a collaborative CRDT editor. Concurrent inserts during a paged pull may defer a record until the next periodic full pull. Browser Web Locks coordinate token refresh and sync; optimistic concurrency remains the fallback. BroadcastChannel refreshes same-origin windows, with a storage event fallback. Desktop and browser storage are different origins, so cross-device/cross-origin transfer needs configured cloud sync.

Main/capture windows hide on close and remain in the tray. Per-note windows load the editable composer. Native sticky IDs are validated before being embedded in internal URLs. The application identifier and old SQLite are retained. A shortcut registration conflict logs a warning instead of crashing startup.

Client configuration accepts only publishable/anon keys; no privileged key ships. Local scripts only, Supabase HTTPS and native IPC permitted by CSP. RLS is ownership-based and RPC uses SECURITY INVOKER. User text is escaped before HTML display. Uploading the local workspace requires confirmation. Sessions live in localStorage; this is not an E2EE vault.

Verification boundaries: Node tests cover pure functions. Chromium tests exercise real UI and IndexedDB with mocked cloud responses. PostgreSQL tests exercise the actual schema with a minimal disposable Auth schema. Hosted Supabase login/email, project setup and Windows native z-order require separate live verification. Build success alone is not desktop acceptance. Do not claim sync is enabled merely because Pages deployed.
