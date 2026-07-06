import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ParsedContact } from "@contactsnap/shared-types";
import {
  buildMicrosoftAuthUrl,
  createMicrosoftContact,
  exchangeMicrosoftCode,
  isSafeRedirectUri,
  searchMicrosoftContacts
} from "../src/index";

const contact: ParsedContact = {
  fullName: "Jordan Lee",
  firstName: "Jordan",
  lastName: "Lee",
  company: "Northstar Systems Inc.",
  emails: ["jordan.lee@northstarsystems.com"],
  phones: [
    { type: "mobile", value: "(415) 555-0198", confidence: 0.9 },
    { type: "office", value: "(415) 555-0199", confidence: 0.9 }
  ],
  sourceText: "",
  dateCaptured: new Date().toISOString(),
  confidence: 0.9,
  fieldConfidence: {},
  fieldEvidence: {},
  warnings: []
};

function mockFetchOnce(payload: unknown, ok = true, status = 200) {
  const response = {
    ok,
    status,
    json: async () => payload,
    text: async () => JSON.stringify(payload)
  } as Response;
  const spy = vi.fn(async () => response);
  vi.stubGlobal("fetch", spy);
  return spy;
}

beforeEach(() => vi.unstubAllGlobals());
afterEach(() => vi.unstubAllGlobals());

describe("isSafeRedirectUri", () => {
  it("rejects lookalike localhost hosts", () => {
    expect(isSafeRedirectUri("http://localhost.evil.com/callback")).toBe(false);
    expect(isSafeRedirectUri("http://localhost:5173/callback")).toBe(true);
  });
});

describe("buildMicrosoftAuthUrl", () => {
  it("uses the tenant and includes PKCE parameters", () => {
    const url = new URL(buildMicrosoftAuthUrl({ clientId: "id", tenantId: "contoso", redirectUri: "https://x.com/cb", codeChallenge: "challenge" }, "0123456789abcdef"));
    expect(url.pathname).toContain("/contoso/");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  });
});

describe("searchMicrosoftContacts", () => {
  it("uses $filter on email address for email queries ($search is unsupported on /me/contacts)", async () => {
    const spy = mockFetchOnce({ value: [] });
    await searchMicrosoftContacts("token", "jordan.lee@northstarsystems.com");
    const [url] = spy.mock.calls[0] as unknown as [string];
    const params = new URL(url).searchParams;
    expect(params.get("$filter")).toBe("emailAddresses/any(a:a/address eq 'jordan.lee@northstarsystems.com')");
    expect(params.get("$search")).toBeNull();
  });

  it("uses startswith(displayName) for name queries and escapes quotes", async () => {
    const spy = mockFetchOnce({ value: [] });
    await searchMicrosoftContacts("token", "O'Brien");
    const [url] = spy.mock.calls[0] as unknown as [string];
    expect(new URL(url).searchParams.get("$filter")).toBe("startswith(displayName, 'O''Brien')");
  });
});

describe("exchangeMicrosoftCode", () => {
  it("posts the code and verifier to the tenant token endpoint", async () => {
    const spy = mockFetchOnce({ access_token: "at", refresh_token: "rt", expires_in: 3600 });
    const tokens = await exchangeMicrosoftCode({ clientId: "id", redirectUri: "https://x.com/cb", code: "code123", codeVerifier: "verifier", tenantId: "contoso" });
    expect(tokens.accessToken).toBe("at");
    const [url, init] = spy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://login.microsoftonline.com/contoso/oauth2/v2.0/token");
    const body = new URLSearchParams(String(init.body));
    expect(body.get("code_verifier")).toBe("verifier");
    expect(body.get("grant_type")).toBe("authorization_code");
  });
});

describe("createMicrosoftContact", () => {
  it("maps phones by type into mobilePhone and businessPhones", async () => {
    const spy = mockFetchOnce({ id: "abc", webLink: "https://outlook.example/abc" });
    const result = await createMicrosoftContact("token", contact);
    expect(result.id).toBe("abc");
    expect(result.url).toBe("https://outlook.example/abc");
    const [, init] = spy.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(body.mobilePhone).toBe("(415) 555-0198");
    expect(body.businessPhones).toEqual(["(415) 555-0199"]);
    expect(body.givenName).toBe("Jordan");
  });
});
