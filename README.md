# ContactSnap AI

ContactSnap AI is a modern contact-capture foundation inspired by Copy2Contact, Evercontact, and Signus Contact Grabber. It turns messy signatures, copied profile text, business-card OCR, or email bodies into structured contacts that can be reviewed and saved to Google Contacts, Microsoft 365 / Outlook Contacts, and later CRMs.

## What is included

- React + TypeScript web MVP for paste, parse, review, duplicate warnings, integrations, history, and settings.
- Reusable parser package with deterministic extraction, field confidence, warnings, duplicate detection, and multiple-contact detection.
- Google People API and Microsoft Graph integration packages with OAuth URL helpers, contact search, create, and update methods.
- Desktop shell placeholder under `apps/desktop` for the Tauri-first app surface: global hotkey, tray, clipboard capture, quick review, secure token storage, and local SQLite history.
- Seed examples and parser unit tests for signatures, phones, names, company/title detection, addresses, duplicates, multiple contacts, and invalid input.

## Project Structure

```text
apps/
  desktop/                 Tauri desktop shell foundation
  web/                     React dashboard and MVP capture flow
packages/
  parser/                  Reusable extraction and duplicate engine
  integrations-google/     Google People API adapter
  integrations-microsoft/  Microsoft Graph Contacts adapter
  shared-types/            Cross-app TypeScript contracts
  ui/                      Shared React UI primitives
```

## Setup

```bash
npm install
npm run test
npm run dev
```

Create `.env.local` from `.env.example` and add OAuth client IDs before connecting real Google or Microsoft accounts. The app remains usable in local-only parser mode without AI or OAuth credentials.

## Connecting real accounts

Without client IDs the app runs in **demo mode**: saves are logged to local history only. To save to real address books:

- **Microsoft / Outlook** (recommended first): in [Microsoft Entra admin center](https://entra.microsoft.com) register an app, add a **Single-page application** redirect URI of `http://localhost:5173/oauth/microsoft/callback`, grant delegated `Contacts.ReadWrite` + `offline_access`, and put the Application (client) ID in `VITE_MICROSOFT_CLIENT_ID`. Auth uses authorization code + PKCE with silent refresh.
- **Google**: in [Google Cloud Console](https://console.cloud.google.com/apis/credentials) create an OAuth **Web application** client with an authorized redirect URI of `http://localhost:5173/oauth/google/callback`, enable the People API, and put the client ID in `VITE_GOOGLE_CLIENT_ID`. The browser app uses the implicit token flow (no client secret in the bundle); reconnect when the session expires.

Once connected, Save Contact searches the real address book for duplicates by email, creates or updates through the provider API, records the real contact IDs in history, and Undo deletes a created contact provider-side.

## Parser quality

`npm run eval` scores the parser against the ground-truth corpus in `packages/parser/eval/corpus.ts` and prints per-field accuracy. CI enforces per-field accuracy floors (`packages/parser/tests/eval.test.ts`). When the parser gets a real signature wrong, add the (anonymized) sample to the corpus with the expected fields — that miss becomes a permanent regression test.

## Privacy Model

- Local deterministic parsing is the default.
- AI extraction is opt-in and should be gated by "Ask before sending text to AI."
- Raw clipboard text is not persisted unless the user reviews or saves an import.
- Desktop tokens should be stored through the OS keychain / credential manager.
- Import logs store structured metadata, source type, destination, and timestamps.

## Roadmap v1.1

- Tauri global hotkey and tray implementation with clipboard permission UX.
- SQLite-backed desktop history, undo, and duplicate cache.
- OpenAI-compatible extraction layer with JSON schema validation and deterministic fallback merge.
- OAuth token refresh and secure keychain persistence.
- Contact enrichment from domain metadata and verified company websites.
- CRM exports for HubSpot, Salesforce, and Pipedrive.
- Browser extension and mail-client companion actions.
