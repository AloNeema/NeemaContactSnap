import type { ParsedContact, SaveContactResult } from "@contactsnap/shared-types";

const peopleBaseUrl = "https://people.googleapis.com/v1";
const scopes = ["https://www.googleapis.com/auth/contacts"];

export type GoogleContactsConfig = {
  clientId: string;
  redirectUri: string;
  codeChallenge?: string;
};

export type GoogleContactSearchResult = {
  resourceName: string;
  displayName?: string;
  emailAddresses?: string[];
};

// Parse the URI instead of prefix-matching so hosts like
// "localhost.evil.com" cannot pass as localhost.
export function isSafeRedirectUri(redirectUri: string): boolean {
  try {
    const url = new URL(redirectUri);
    if (url.protocol === "https:") return true;
    return url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1");
  } catch {
    return false;
  }
}

export type PkcePair = {
  codeVerifier: string;
  codeChallenge: string;
};

export async function createPkcePair(): Promise<PkcePair> {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const codeVerifier = base64UrlEncode(bytes);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(codeVerifier));
  return { codeVerifier, codeChallenge: base64UrlEncode(new Uint8Array(digest)) };
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function buildGoogleAuthUrl(config: GoogleContactsConfig, state: string): string {
  if (!state || state.length < 16) throw new Error("Google OAuth state must be an unpredictable value of at least 16 characters.");
  if (!isSafeRedirectUri(config.redirectUri)) {
    throw new Error("Google redirect URI must use localhost during development or HTTPS in production.");
  }
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: scopes.join(" "),
    access_type: "offline",
    prompt: "consent",
    state
  });
  if (config.codeChallenge) {
    params.set("code_challenge", config.codeChallenge);
    params.set("code_challenge_method", "S256");
  }
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export type GoogleTokenResponse = {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
  scope?: string;
};

// Exchange the authorization code returned to the redirect URI for tokens.
// clientSecret is required for Google "Web application" clients; installed /
// desktop clients rely on the PKCE codeVerifier alone.
export async function exchangeGoogleCode(options: {
  clientId: string;
  redirectUri: string;
  code: string;
  codeVerifier?: string;
  clientSecret?: string;
}): Promise<GoogleTokenResponse> {
  const body = new URLSearchParams({
    client_id: options.clientId,
    redirect_uri: options.redirectUri,
    code: options.code,
    grant_type: "authorization_code"
  });
  if (options.codeVerifier) body.set("code_verifier", options.codeVerifier);
  if (options.clientSecret) body.set("client_secret", options.clientSecret);
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString()
  });
  await assertOk(response, "exchange Google authorization code");
  const payload = await response.json();
  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    expiresIn: payload.expires_in,
    scope: payload.scope
  };
}

export async function refreshGoogleToken(options: {
  clientId: string;
  refreshToken: string;
  clientSecret?: string;
}): Promise<GoogleTokenResponse> {
  const body = new URLSearchParams({
    client_id: options.clientId,
    refresh_token: options.refreshToken,
    grant_type: "refresh_token"
  });
  if (options.clientSecret) body.set("client_secret", options.clientSecret);
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString()
  });
  await assertOk(response, "refresh Google access token");
  const payload = await response.json();
  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token ?? options.refreshToken,
    expiresIn: payload.expires_in,
    scope: payload.scope
  };
}

export function assertGoogleTokenSafeForStorage(token: string): void {
  if (!token || token.length < 20) throw new Error("Google token is empty or malformed.");
  if (token.includes(" ")) throw new Error("Google token must be stored as an opaque secret without logging or splitting.");
}

export async function searchGoogleContacts(accessToken: string, query: string): Promise<GoogleContactSearchResult[]> {
  const params = new URLSearchParams({
    query,
    readMask: "names,emailAddresses,phoneNumbers,organizations"
  });
  const response = await fetch(`${peopleBaseUrl}/people:searchContacts?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  await assertOk(response, "search Google Contacts");
  const payload = await response.json();
  return (payload.results ?? []).map((result: any) => ({
    resourceName: result.person.resourceName,
    displayName: result.person.names?.[0]?.displayName,
    emailAddresses: result.person.emailAddresses?.map((email: any) => email.value)
  }));
}

export async function createGoogleContact(accessToken: string, contact: ParsedContact): Promise<SaveContactResult> {
  const response = await fetch(`${peopleBaseUrl}/people:createContact`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(toGooglePerson(contact))
  });
  await assertOk(response, "create Google contact");
  const payload = await response.json();
  return {
    provider: "google",
    id: payload.resourceName,
    // resourceName is "people/c123…" but the web URL wants only the "c123…" id.
    url: payload.resourceName ? `https://contacts.google.com/person/${encodeURIComponent(String(payload.resourceName).replace(/^people\//, ""))}` : undefined,
    created: true
  };
}

export async function updateGoogleContact(accessToken: string, resourceName: string, etag: string, contact: ParsedContact): Promise<SaveContactResult> {
  const response = await fetch(`${peopleBaseUrl}/${resourceName}:updateContact?updatePersonFields=names,emailAddresses,phoneNumbers,organizations,urls,addresses,biographies`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ ...toGooglePerson(contact), etag })
  });
  await assertOk(response, "update Google contact");
  const payload = await response.json();
  return { provider: "google", id: payload.resourceName, created: false };
}

function toGooglePerson(contact: ParsedContact): Record<string, unknown> {
  return {
    names: [
      {
        givenName: contact.firstName,
        familyName: contact.lastName,
        displayName: contact.fullName
      }
    ].filter((name) => name.displayName || name.givenName || name.familyName),
    emailAddresses: contact.emails.map((value) => ({ value })),
    phoneNumbers: contact.phones.map((phone) => ({ value: phone.value, type: phone.type === "unknown" ? "other" : phone.type })),
    organizations: contact.company || contact.title ? [{ name: contact.company, title: contact.title }] : [],
    urls: [
      contact.website ? { value: contact.website, type: "work" } : undefined,
      contact.linkedinUrl ? { value: contact.linkedinUrl, type: "profile" } : undefined
    ].filter(Boolean),
    addresses: contact.address
      ? [
          {
            streetAddress: contact.address.street,
            city: contact.address.city,
            region: contact.address.state,
            postalCode: contact.address.postalCode,
            country: contact.address.country,
            type: "work"
          }
        ]
      : [],
    biographies: [{ value: `Imported by ContactSnap AI\n\n${contact.notes ?? ""}`.trim(), contentType: "TEXT_PLAIN" }]
  };
}

async function assertOk(response: Response, action: string): Promise<void> {
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Unable to ${action}: ${response.status} ${detail}`);
  }
}
