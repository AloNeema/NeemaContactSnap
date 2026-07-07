import {
  createGoogleContact,
  deleteGoogleContact,
  getGoogleContactEtag,
  searchGoogleContacts,
  updateGoogleContact
} from "@contactsnap/integrations-google";
import {
  createMicrosoftContact,
  deleteMicrosoftContact,
  searchMicrosoftContacts,
  updateMicrosoftContact
} from "@contactsnap/integrations-microsoft";
import type { ParsedContact, ProviderSaveError, SaveContactResult } from "@contactsnap/shared-types";
import { getValidAccessToken, OAuthError, type OAuthProvider } from "./oauth";

export type ProviderSaveOutcome =
  | { ok: true; result: SaveContactResult }
  | { ok: false; error: ProviderSaveError };

// Save to a live provider: search the real address book first so duplicate
// decisions are made against what is actually there, not just local history.
export async function saveContactToProvider(
  provider: OAuthProvider,
  contact: ParsedContact,
  mode: "create" | "update"
): Promise<ProviderSaveOutcome> {
  try {
    const token = await getValidAccessToken(provider);
    const query = contact.emails[0] ?? contact.fullName ?? "";
    const existing = query ? await searchProvider(provider, token, query) : [];
    const emailMatch = existing.find((candidate) =>
      candidate.emailAddresses?.some((address) => contact.emails.includes(address.toLowerCase()))
    );

    if (mode === "create" && emailMatch) {
      return {
        ok: false,
        error: {
          provider,
          code: "duplicate_requires_review",
          message: `${emailMatch.displayName ?? "A contact"} with this email already exists in ${providerLabel(provider)}.`,
          nextStep: "Switch the save mode to \"update existing\" to merge into that contact, or change the email."
        }
      };
    }

    if (mode === "update" && emailMatch) {
      if (provider === "google") {
        const etag = await getGoogleContactEtag(token, emailMatch.id);
        return { ok: true, result: await updateGoogleContact(token, emailMatch.id, etag, contact) };
      }
      return { ok: true, result: await updateMicrosoftContact(token, emailMatch.id, contact) };
    }

    const result = provider === "google"
      ? await createGoogleContact(token, contact)
      : await createMicrosoftContact(token, contact);
    return { ok: true, result };
  } catch (error) {
    return { ok: false, error: toSaveError(provider, error) };
  }
}

export async function deleteProviderContact(provider: OAuthProvider, id: string): Promise<ProviderSaveOutcome> {
  try {
    const token = await getValidAccessToken(provider);
    if (provider === "google") await deleteGoogleContact(token, id);
    else await deleteMicrosoftContact(token, id);
    return { ok: true, result: { provider, id, created: false } };
  } catch (error) {
    return { ok: false, error: toSaveError(provider, error) };
  }
}

type ProviderMatch = { id: string; displayName?: string; emailAddresses?: string[] };

async function searchProvider(provider: OAuthProvider, token: string, query: string): Promise<ProviderMatch[]> {
  if (provider === "google") {
    const results = await searchGoogleContacts(token, query);
    return results.map((result) => ({ id: result.resourceName, displayName: result.displayName, emailAddresses: result.emailAddresses?.map((email) => email.toLowerCase()) }));
  }
  const results = await searchMicrosoftContacts(token, query);
  return results.map((result) => ({ id: result.id, displayName: result.displayName, emailAddresses: result.emailAddresses?.map((email) => email.toLowerCase()) }));
}

function providerLabel(provider: OAuthProvider): string {
  return provider === "google" ? "Google Contacts" : "Outlook Contacts";
}

function toSaveError(provider: OAuthProvider, error: unknown): ProviderSaveError {
  if (error instanceof OAuthError) {
    return {
      provider,
      code: error.code === "token_expired" ? "token_expired" : "not_connected",
      message: error.message,
      nextStep: "Open Settings and reconnect the account, then try again."
    };
  }
  const message = error instanceof Error ? error.message : String(error);
  if (/\b401\b/.test(message)) {
    return { provider, code: "token_expired", message: `${providerLabel(provider)} rejected the session (401).`, nextStep: "Reconnect the account from Settings and try again." };
  }
  if (/\b403\b/.test(message)) {
    return { provider, code: "missing_scope", message: `${providerLabel(provider)} denied access (403).`, nextStep: "Reconnect and accept the contacts permission when prompted." };
  }
  if (error instanceof TypeError) {
    return { provider, code: "network_error", message: `Could not reach ${providerLabel(provider)}.`, nextStep: "Check your connection and try again." };
  }
  return { provider, code: "provider_rejected", message, nextStep: "Review the contact fields and try again." };
}
