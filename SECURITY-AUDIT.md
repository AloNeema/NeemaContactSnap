# ContactSnap AI Production MVP Audit

## Hardened in this pass

- OAuth helpers now require high-entropy state values, reject unsafe redirect URI shapes, and support PKCE code challenges.
- Provider tokens are treated as opaque secrets and must be stored only through OS keychain / credential-manager paths in the desktop runtime.
- Desktop clipboard capture now fails closed unless the platform is supported, clipboard monitoring is enabled, permission is granted, and the clipboard has text.
- Parser output now includes source-line evidence, field rationale, and stronger per-field confidence scoring.
- Duplicate detection now considers email, phone, normalized name/company, and email domain, then recommends create, merge, or update.
- The review UI now shows source text beside extracted fields, highlights evidence, explains why fields were extracted, and supports create-versus-update decisions.
- Save flow now has loading states, provider readiness validation, explicit next-step errors, one-click Google + Microsoft save, import history, and undo.

## Remaining production work

- Exchange OAuth authorization codes server-side or through a native desktop callback with PKCE verification.
- Persist refresh tokens only in macOS Keychain or Windows Credential Manager.
- Replace simulated provider connection toggles with real OAuth callbacks and token refresh.
- Add provider API tests with mocked Google People API and Microsoft Graph responses.
- Add native Tauri commands for hotkeys, tray, clipboard permissions, SQLite import logs, and undo provider deletes.
- Add an opt-in AI extraction service with schema validation, audit logs, and deterministic fallback merging.
