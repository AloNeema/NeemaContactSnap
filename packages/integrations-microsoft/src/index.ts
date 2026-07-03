import type { ParsedContact, SaveContactResult } from "@contactsnap/shared-types";

const graphBaseUrl = "https://graph.microsoft.com/v1.0";
const scopes = ["offline_access", "Contacts.ReadWrite"];

export type MicrosoftContactsConfig = {
  clientId: string;
  tenantId?: string;
  redirectUri: string;
  codeChallenge?: string;
};

export type MicrosoftContactSearchResult = {
  id: string;
  displayName?: string;
  emailAddresses?: string[];
};

export function buildMicrosoftAuthUrl(config: MicrosoftContactsConfig, state: string): string {
  if (!state || state.length < 16) throw new Error("Microsoft OAuth state must be an unpredictable value of at least 16 characters.");
  if (!/^https?:\/\/localhost|^http:\/\/127\.0\.0\.1|^https:\/\//.test(config.redirectUri)) {
    throw new Error("Microsoft redirect URI must use localhost during development or HTTPS in production.");
  }
  const tenant = config.tenantId ?? "common";
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    response_mode: "query",
    scope: scopes.join(" "),
    state
  });
  if (config.codeChallenge) {
    params.set("code_challenge", config.codeChallenge);
    params.set("code_challenge_method", "S256");
  }
  return `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize?${params.toString()}`;
}

export function assertMicrosoftTokenSafeForStorage(token: string): void {
  if (!token || token.length < 20) throw new Error("Microsoft token is empty or malformed.");
  if (token.includes(" ")) throw new Error("Microsoft token must be stored as an opaque secret without logging or splitting.");
}

export async function searchMicrosoftContacts(accessToken: string, query: string): Promise<MicrosoftContactSearchResult[]> {
  const params = new URLSearchParams({
    "$search": `"${query.replace(/"/g, "")}"`,
    "$top": "10"
  });
  const response = await fetch(`${graphBaseUrl}/me/contacts?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ConsistencyLevel: "eventual"
    }
  });
  await assertOk(response, "search Microsoft contacts");
  const payload = await response.json();
  return (payload.value ?? []).map((contact: any) => ({
    id: contact.id,
    displayName: contact.displayName,
    emailAddresses: contact.emailAddresses?.map((email: any) => email.address)
  }));
}

export async function createMicrosoftContact(accessToken: string, contact: ParsedContact): Promise<SaveContactResult> {
  const response = await fetch(`${graphBaseUrl}/me/contacts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(toGraphContact(contact))
  });
  await assertOk(response, "create Microsoft contact");
  const payload = await response.json();
  return {
    provider: "microsoft",
    id: payload.id,
    url: payload.webLink,
    created: true
  };
}

export async function updateMicrosoftContact(accessToken: string, id: string, contact: ParsedContact): Promise<SaveContactResult> {
  const response = await fetch(`${graphBaseUrl}/me/contacts/${id}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(toGraphContact(contact))
  });
  await assertOk(response, "update Microsoft contact");
  return { provider: "microsoft", id, created: false };
}

function toGraphContact(contact: ParsedContact): Record<string, unknown> {
  return {
    givenName: contact.firstName,
    surname: contact.lastName,
    displayName: contact.fullName,
    jobTitle: contact.title,
    companyName: contact.company,
    emailAddresses: contact.emails.map((address, index) => ({ name: index === 0 ? contact.fullName : undefined, address })),
    mobilePhone: contact.phones.find((phone) => phone.type === "mobile")?.value,
    businessPhones: contact.phones.filter((phone) => phone.type === "office" || phone.type === "unknown").map((phone) => phone.value),
    businessHomePage: contact.website,
    businessAddress: contact.address
      ? {
          street: contact.address.street,
          city: contact.address.city,
          state: contact.address.state,
          postalCode: contact.address.postalCode,
          countryOrRegion: contact.address.country
        }
      : undefined,
    personalNotes: `Imported by ContactSnap AI\n${contact.linkedinUrl ? `LinkedIn: ${contact.linkedinUrl}\n` : ""}${contact.notes ?? ""}`.trim()
  };
}

async function assertOk(response: Response, action: string): Promise<void> {
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Unable to ${action}: ${response.status} ${detail}`);
  }
}
