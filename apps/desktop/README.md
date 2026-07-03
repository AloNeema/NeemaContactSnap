# ContactSnap AI Desktop

The desktop app is Tauri-first because it gives ContactSnap AI a smaller footprint and direct access to OS primitives for global shortcuts, tray actions, secure storage, and clipboard permissions.

## Native Capability Plan

- Register `Cmd+Shift+C` on macOS and `Ctrl+Shift+C` on Windows.
- Read selected text when available, otherwise read the clipboard after permission checks.
- Open a quick capture window with the parser result and editable fields.
- Store OAuth tokens in the OS keychain or Windows Credential Manager.
- Store reviewed import history and undo metadata in local SQLite.
- Never persist raw clipboard text until the review step creates an import log entry.

## Tauri Commands

- `capture_clipboard`
- `parse_text`
- `save_google_contact`
- `save_microsoft_contact`
- `search_duplicates`
- `undo_last_import`
- `get_import_history`
- `update_privacy_settings`
