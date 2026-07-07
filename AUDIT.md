# ContactSnap AI — Code Audit & Recommendations

## Implementation status (updated after remediation pass)

Done in this branch:

- **All P0 parser bugs (#1–#8)** — email-header pre-pass, pipe/bullet segment splitting, `libphonenumber-js` validation + formatting (kills account-number/invoice false positives and fixes mangled parens), alphabetic-TLD URL matching, end-of-line company-suffix matching (no more "capital"-substring companies), extended street types + postal-anchored city/state matching scoped after the street line, Unicode names with credential-suffix stripping, sign-off stoplist, weighted overall confidence (garbage now scores ~0), and removal of the parseContact/detectMultipleContacts mutual recursion. 10 new regression tests in `packages/parser/tests/real-world.test.ts`.
- **`mergeContacts` clobber fix** — field-by-field merge; sparse re-parses no longer erase existing data.
- **Web app** — phone fields editable, typed `updateContact`, localStorage persistence for history/settings/connections, auto-parse on paste, multi-contact picker buttons.
- **Integrations** — `URL`-based redirect-URI validation (closes `localhost.evil.com` bypass), PKCE pair generation, authorization-code exchange + refresh for both providers, Graph search moved from unsupported `$search` to `$filter`, Google contact web-URL fix, duplicate email match now recommends "update". 15 new integration tests with mocked `fetch`.
- **Tooling** — GitHub Actions CI (typecheck + tests across workspaces), root `test` script now runs all workspace tests, `VITE_OPENAI_API_KEY` removed from `.env.example`.

Done in the second remediation pass:

- **Real save path wired end-to-end** — the web app now runs OAuth (Microsoft: auth-code + PKCE with silent refresh; Google: implicit token flow, no secret in the bundle), searches the real address book for duplicates by email before saving, creates/updates via the provider APIs, records real contact IDs in history, and Undo deletes a created contact provider-side. Demo mode (local-log only) remains the automatic fallback when no client ID is configured.
- **Provider packages** — `deleteGoogleContact`/`deleteMicrosoftContact`, `getGoogleContactEtag` (required for People API updates), and a Google implicit-flow option; all tested with mocked fetch.
- **Duplicate matching** — nickname-aware (Bob ↔ Robert), single-typo-tolerant for long names, first-initial matching; exact email match recommends "update".
- **Parser** — forwarded-email handling (prefers the original sender after the "Forwarded message" marker), quoted-reply/`On … wrote:` line stripping, ALL-CAPS name normalization.
- **Eval harness** — ground-truth corpus (`packages/parser/eval/corpus.ts`), per-field accuracy report (`npm run eval`), and CI-enforced accuracy floors.
- **UX** — Ctrl/Cmd+Enter saves from the capture view.

Still open (requires deployment or credentials): Outlook add-in capture surface, background inbox signature scanning, Apollo enrichment, AI extraction fallback layer, desktop (Tauri) implementation, ESLint/Prettier.

---

Audit date: 2026-07-06. Scope: full repository (parser, web app, integrations, desktop shell, tooling). Method: code review of every source file, `npm run test` (11/11 pass), `npm run typecheck` (clean), plus a stress test of the parser against 10 realistic Copy2Contact-style inputs (email headers, pipe-separated signatures, LinkedIn copies, addresses, invoice text as a false-positive check).

## Verdict

The scaffold is genuinely good: clean monorepo layout, shared types, a deterministic parser with per-field confidence and evidence, sensible privacy defaults, and OAuth helpers that already think about state entropy and PKCE. But the app currently **demos** Copy2Contact rather than functioning like it. The two biggest gaps:

1. **Nothing is ever actually saved.** The web app's save flow is a `setTimeout` that fabricates provider IDs (`google_${Date.now()}`). The Google/Microsoft integration packages exist but are never imported by the app, and there is no OAuth token exchange anywhere — only auth-URL builders.
2. **The parser fails on the most common real-world formats.** Copy2Contact's core value is turning email headers and messy signatures into contacts. Stress testing showed the parser breaks on `From:` headers, pipe-separated signature lines, non-ASCII names, US addresses with suite numbers, and produces high-confidence garbage from non-contact text.

Everything below is ordered by priority.

---

## P0 — Parser correctness bugs (confirmed by stress test)

### 1. Keyword-substring company detection produces bad companies constantly

`isCompanyLine()` treats any line containing a `companySuffixes` word (including **"capital"**) as a company. Input:

```
From: Sarah O'Brien <sarah.obrien@quick-capitalfunding.com>
Subject: RE: Working capital application
```

parses with `company = "Subject: RE: Working capital application"`. For a capital-funding business this misfires on a large share of real emails. Similarly `titleWords` contains "account", so invoice text `Account 4485-9921-0034` becomes a job title.

**Fix:** require the suffix to be the trailing token of a short line (`/\b(inc|llc|ltd|corp|gmbh|…)\.?$/i`), reject lines starting with header tokens (`From:`, `To:`, `Subject:`, `Sent:`, `Re:`), and require the line to be short (< ~50 chars). Same for titles: match title keywords only at word level on short lines, and exclude lines that are mostly digits.

There is also an operator-precedence smell in `isCompanyLine` (`a || b === false && c && d`) — the copyright guard only applies to one branch. Split it into named booleans.

### 2. Email headers (`From: Name <email>`) are not handled at all

This is Copy2Contact's #1 use case. `Sarah O'Brien <sarah.obrien@...>` loses the display name entirely and falls back to the email local-part, producing "Sarah Obrien" (apostrophe lost). **Fix:** add an explicit pre-pass for RFC-5322-style patterns: `/^(from|to|cc|reply-to):\s*"?([^"<]+)"?\s*<([^>]+)>/im` and for bare `Name <email>` lines. The display name from a header should be the highest-confidence name source, above signature-line heuristics.

### 3. Pipe/bullet-separated signatures fail completely

```
John Smith | Senior Loan Officer | Quick Capital Funding
D: (555) 234-5678 | C: (555) 876-5432
```

yields no name, no title, and `company = the entire first line`. **Fix:** before line classification, split lines on ` | `, ` • `, ` · `, ` – ` into segments and classify each segment as if it were a line. This one change fixes a very large class of real signatures.

### 4. Phone extraction mangles and mislabels numbers

- `(555) 234-5678` is extracted as `555) 234-5678` — the regex `\+?\d[…]` can't start on `(`. Allow an optional leading `\(`.
- `D:` (direct) and `C:` (cell) labels aren't in the label list, so those numbers come out `unknown` and the label prefix logic misses them.
- `4485-9921-0034` (an account number) is happily extracted as an office phone.
- No normalization to E.164; `phone.value` keeps arbitrary formatting, which weakens duplicate matching and produces messy provider records.

**Fix:** adopt [`libphonenumber-js`](https://www.npmjs.com/package/libphonenumber-js) (small, tree-shakeable) for validation + E.164 normalization, keep your label-classification layer on top. Validation alone kills most false positives (account numbers, invoice IDs).

### 5. URL regex matches dotted numbers

`Ph 561.555.9900` produces `website = "https://561.555.9900"`, and `$12,500.00` produces `website = "https://500.00"`. **Fix:** require the last dot-segment to be an alphabetic TLD (`\.[a-z]{2,}\b` with no digits), or check against a small TLD allowlist, and reject candidates that are substrings of an already-matched phone.

### 6. Address parsing misreads common US formats

```
1200 N. Federal Hwy, Suite 200
Boca Raton, FL 33432
```

yields `city="N. Federal Hwy", state="Suite", postalCode="200"` — the street line itself matched `cityStateRegex`, and the real city/state/ZIP line was ignored. **Fix:** (a) extend `streetRegex` with Hwy/Highway/Court/Ct/Place/Pl/Circle/Cir/Parkway/Pkwy/Terrace/Broadway/PO Box; (b) make `cityStateRegex` require a real ZIP shape (`\d{5}(-\d{4})?` for US) or a known state code, and run it only on lines *after* the matched street line.

### 7. Non-ASCII names never match

`Hans Müller` fails the ASCII-only name regex and falls back to the email local-part ("Hans Mueller"); `Geschäftsführer` and `Müller GmbH` are missed (GmbH isn't in the suffix list). **Fix:** use Unicode property escapes — `/^\p{Lu}[\p{L}.'-]+(?:\s+\p{Lu}[\p{L}.'-]+){1,3}$/u` — and add international suffixes (GmbH, AG, SA, SAS, BV, Pty, Oy, AB, SRL, KK). Also strip credential suffixes (`, MBA, CPA, Esq., Jr.`) into a separate field rather than rejecting the line.

### 8. Confidence is misleading on garbage input

Pure invoice text (no email, no name) scores **0.82 confidence** because the aggregate averages only the fields that matched (bogus phone/title/website). Copy2Contact-style tools live or die on trust in that number. **Fix:** compute overall confidence as a weighted score over *required* fields (name 0.3, email 0.3, phone 0.2, company/title 0.2), with zero contribution for missing ones. Garbage should score < 0.3, and the UI should show an "doesn't look like contact info" state below a threshold.

### 9. Smaller parser issues

- `parseContact` calls `detectMultipleContacts(sourceText)` which calls `parseContact` per chunk (which each call `detectMultipleContacts` again). It terminates, but it's mutually recursive and wasteful — the web app also re-runs it on every keystroke. Pass a `skipMultiDetect` flag or hoist the split.
- `extractName` caps at 48 chars and requires 2–4 capitalized words — reasonable, but it runs *after* the disclaimer filter only; sign-off words ("Thanks!", "Best,") are handled by the capitalization rule mostly by luck. Consider an explicit sign-off stoplist.
- `locateEvidence` uses first `indexOf`, so highlighting can point at the wrong line when a value appears twice.
- `internals.normalizePhone` exports a pointless alias (`normalizePhoneDisplayForSearch`) — dead indirection.
- `findDuplicateContacts`: an exact-email-only match scores 0.7 → recommendation "merge". Exact email match is the strongest possible signal and should recommend "update" on its own (Copy2Contact treats same-email as same-person).

---

## P0 — The save path is simulated end-to-end

`apps/web/src/main.tsx` never imports either integration package. "Connect Google/Outlook" toggles flip local booleans; `saveContact()` waits 450 ms and writes a fake history entry. The History empty-state even says "after Google or Outlook saves succeed", which never happens.

**Recommendation — smallest path to a real product:**

1. Pick **one provider first** and wire it fully before the second. (Given your domain is on Microsoft 365, start with Microsoft Graph.)
2. Implement the missing OAuth pieces: PKCE verifier/challenge generation, the **code→token exchange**, and refresh-token handling. For a pure SPA, use auth-code + PKCE (MSAL.js / `@azure/msal-browser` gives you this for free on the Microsoft side; for Google use the GIS token client). The current packages only build authorize URLs — that's maybe 20% of OAuth.
3. On save: call `searchMicrosoftContacts`/`searchGoogleContacts` first and feed real results into `findDuplicateContacts`, instead of only checking local history. Duplicate detection against local session history misses everything already in the user's address book — which is where duplicates actually live.
4. Store the real provider `id` in `ImportLogEntry.providerIds` so **undo can actually delete/restore the provider-side contact**. Right now undo only hides a local row while the (would-be) provider contact survives.

## P0 — Fix `mergeContacts` before wiring real saves

```ts
return { ...existing, ...incoming, ... }
```

`ParsedContact` always materializes every key, so `incoming.title === undefined` **overwrites** an existing title with `undefined`. Updating a contact from a sparse new signature would erase data already on the record. Merge field-by-field: `title: incoming.title ?? existing.title`, etc. This is exactly the case update-mode exists for, so it will bite immediately.

---

## P1 — Integration-layer issues

- **Redirect URI validation bypass:** `/^https?:\/\/localhost|…/` matches `http://localhost.evil.com` (no boundary after "localhost"). Use `new URL(uri)` and check `hostname === "localhost" || hostname === "127.0.0.1" || protocol === "https:"`. (Both integration packages share this bug.)
- **Microsoft `$search` on `/me/contacts` is not supported** by Graph for personal contacts (it's for messages/directory objects); the call will 400 in production. Use `$filter`, e.g. `emailAddresses/any(a:a/address eq '...')` or `startswith(displayName, '...')`.
- **Google contact URL is wrong:** `resourceName` is `people/c123…`, but the web URL is `https://contacts.google.com/person/c123…` — strip the `people/` prefix.
- `assertGoogleTokenSafeForStorage` / `assertMicrosoftTokenSafeForStorage` are security theater — they check length/spaces and store nothing. Either implement keychain-backed storage behind the `DesktopRuntime` interface or delete them until then.
- No 401/token-expiry handling, no retry/backoff, and `assertOk` throws the raw response body into `Error.message` (can end up in logs; fine for now, but scrub before adding telemetry).
- **`VITE_OPENAI_API_KEY` is a secret-leak footgun**: every `VITE_`-prefixed variable is embedded in the shipped client bundle. When you add AI extraction, the key must live server-side (or in the Tauri backend) behind a proxy endpoint — never in Vite env.

## P1 — Web app / UX

- **Phone fields are `readOnly`** in the review form — the user can see a mangled `555) 234-5678` and cannot fix it before saving. Every field must be editable in a review-before-save product.
- **No persistence:** history and settings vanish on refresh. `localStorage` is a one-hour fix for the web MVP (the README's privacy model already permits storing reviewed imports).
- Editing a field doesn't update `fieldConfidence`/`fieldEvidence`, so the meter and "why we extracted this" panel describe stale values. Mark user-edited fields as `confidence: 1, rationale: "Edited by you"`.
- `updateContact(field: keyof ParsedContact, value: any)` — type it with a generic (`<K extends keyof ParsedContact>(field: K, value: ParsedContact[K])`).
- Multiple-contact detection warns but offers no action. Add "Split into N contacts" that queues each chunk through review — that's the Copy2Contact behavior.
- Parse only runs on button click; consider auto-parse on paste (debounced), which is the "snap" in ContactSnap.
- Only `emails[0]` and two phone slots are shown; extra emails/phones are silently dropped from review (though they do reach the payload builders).

## P1 — Testing & tooling

- Tests cover only the happy-path seed signatures. Add the failing formats from this audit as fixtures: email `From:` headers, pipe-separated lines, `(paren) phones`, `D:`/`C:` labels, Hwy/Suite addresses, non-ASCII names, and a non-contact text that must score low confidence. (The stress-test inputs in this audit reproduce every P0 bug.)
- No tests at all for the two integration packages — add unit tests with mocked `fetch` asserting request shape (URL, method, body mapping), which would have caught the `$search` and URL-format issues.
- Root `lint` script exists but no workspace defines one — add ESLint + Prettier, or delete the script.
- No CI. A single GitHub Actions workflow running `npm ci && npm run typecheck && npm test` on PRs is cheap and prevents regressions.
- No LICENSE file.

## P2 — Roadmap alignment

- The desktop app is an interface file plus README — fine as a plan, but the root README oversells it ("Desktop shell placeholder" is accurate; "global hotkey, tray, clipboard capture, secure token storage, and local SQLite history" reads as shipped). Tighten the README to match reality.
- AI extraction settings exist in the UI but no AI code exists. Either hide the toggles behind a feature flag until the provider layer lands, or label them "coming soon" — a privacy toggle that controls nothing erodes trust.
- When AI extraction lands, keep the deterministic parser as the merge baseline (as your roadmap says) and validate model output against a JSON schema (zod) before merging — never let the model output overwrite a higher-confidence deterministic field.

---

## Suggested order of attack

1. Parser fixes P0 #1–#8 + regression tests (pure TypeScript, no external dependencies except libphonenumber-js; highest value-per-hour).
2. `mergeContacts` fix + phone-field editability (small, unblocks trust in review flow).
3. Microsoft Graph end-to-end: MSAL PKCE login → search (`$filter`) → create/update → store real IDs → real undo (delete).
4. Google People API end-to-end (same shape).
5. localStorage persistence, CI workflow, ESLint.
6. Desktop (Tauri) and AI extraction per the existing roadmap.
