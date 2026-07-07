import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ParsedContact } from "@contactsnap/shared-types";
import {
  buildGoogleAuthUrl,
  createGoogleContact,
  createPkcePair,
  deleteGoogleContact,
  exchangeGoogleCode,
  getGoogleContactEtag,
  isSafeRedirectUri,
  searchGoogleContacts
} from "../src/index";

const contact: ParsedContact = {
  fullName: "Jordan Lee",
  firstName: "Jordan",
  lastName: "Lee",
  company: "Northstar Systems Inc.",
  emails: ["jordan.lee@northstarsystems.com"],
  phones: [{ type: "mobile", value: "(415) 555-0198", confidence: 0.9 }],
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
  it("accepts https and real localhost", () => {
    expect(isSafeRedirectUri("https://app.example.com/callback")).toBe(true);
    expect(isSafeRedirectUri("http://localhost:5173/oauth/google/callback")).toBe(true);
    expect(isSafeRedirectUri("http://127.0.0.1:5173/callback")).toBe(true);
  });

  it("rejects lookalike localhost hosts and plain http", () => {
    expect(isSafeRedirectUri("http://localhost.evil.com/callback")).toBe(false);
    expect(isSafeRedirectUri("http://app.example.com/callback")).toBe(false);
    expect(isSafeRedirectUri("not a url")).toBe(false);
  });
});

describe("buildGoogleAuthUrl", () => {
  it("requires unpredictable state", () => {
    expect(() => buildGoogleAuthUrl({ clientId: "id", redirectUri: "https://x.com/cb" }, "short")).toThrow(/state/);
  });

  it("includes PKCE challenge parameters", () => {
    const url = new URL(buildGoogleAuthUrl({ clientId: "id", redirectUri: "https://x.com/cb", codeChallenge: "challenge" }, "0123456789abcdef"));
    expect(url.searchParams.get("code_challenge")).toBe("challenge");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("access_type")).toBe("offline");
  });

  it("supports the implicit token flow for browser-only apps", () => {
    const url = new URL(buildGoogleAuthUrl({ clientId: "id", redirectUri: "https://x.com/cb", responseType: "token" }, "0123456789abcdef"));
    expect(url.searchParams.get("response_type")).toBe("token");
    expect(url.searchParams.get("access_type")).toBeNull();
  });
});

describe("createPkcePair", () => {
  it("produces a base64url verifier and challenge", async () => {
    const pair = await createPkcePair();
    expect(pair.codeVerifier).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect(pair.codeChallenge).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect(pair.codeChallenge).not.toBe(pair.codeVerifier);
  });
});

describe("exchangeGoogleCode", () => {
  it("posts the code and verifier to the token endpoint", async () => {
    const spy = mockFetchOnce({ access_token: "at", refresh_token: "rt", expires_in: 3600 });
    const tokens = await exchangeGoogleCode({ clientId: "id", redirectUri: "https://x.com/cb", code: "code123", codeVerifier: "verifier" });
    expect(tokens.accessToken).toBe("at");
    expect(tokens.refreshToken).toBe("rt");
    const [url, init] = spy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://oauth2.googleapis.com/token");
    const body = new URLSearchParams(String(init.body));
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("code_verifier")).toBe("verifier");
  });
});

describe("createGoogleContact", () => {
  it("maps the contact and builds the web URL without the people/ prefix", async () => {
    mockFetchOnce({ resourceName: "people/c12345" });
    const result = await createGoogleContact("token", contact);
    expect(result.id).toBe("people/c12345");
    expect(result.url).toBe("https://contacts.google.com/person/c12345");
  });

  it("throws with status detail on failure", async () => {
    mockFetchOnce({ error: "denied" }, false, 403);
    await expect(createGoogleContact("token", contact)).rejects.toThrow(/403/);
  });
});

describe("getGoogleContactEtag", () => {
  it("returns the etag from the person resource", async () => {
    const spy = mockFetchOnce({ etag: "abc123", resourceName: "people/c1" });
    await expect(getGoogleContactEtag("token", "people/c1")).resolves.toBe("abc123");
    const [url] = spy.mock.calls[0] as unknown as [string];
    expect(url).toContain("people/c1?personFields=");
  });

  it("throws when no etag is present", async () => {
    mockFetchOnce({ resourceName: "people/c1" });
    await expect(getGoogleContactEtag("token", "people/c1")).rejects.toThrow(/etag/);
  });
});

describe("deleteGoogleContact", () => {
  it("calls the deleteContact endpoint", async () => {
    const spy = mockFetchOnce({});
    await deleteGoogleContact("token", "people/c1");
    const [url, init] = spy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("people/c1:deleteContact");
    expect(init.method).toBe("DELETE");
  });
});

describe("searchGoogleContacts", () => {
  it("sends the query with a readMask", async () => {
    const spy = mockFetchOnce({ results: [{ person: { resourceName: "people/c1", names: [{ displayName: "Jordan Lee" }] } }] });
    const results = await searchGoogleContacts("token", "jordan.lee@northstarsystems.com");
    expect(results[0]).toEqual({ resourceName: "people/c1", displayName: "Jordan Lee", emailAddresses: undefined });
    const [url] = spy.mock.calls[0] as unknown as [string];
    expect(url).toContain("people:searchContacts");
    expect(url).toContain("readMask=");
  });
});
