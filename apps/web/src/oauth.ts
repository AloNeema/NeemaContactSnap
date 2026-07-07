import { buildGoogleAuthUrl } from "@contactsnap/integrations-google";
import {
  buildMicrosoftAuthUrl,
  createPkcePair,
  exchangeMicrosoftCode,
  refreshMicrosoftToken
} from "@contactsnap/integrations-microsoft";

export type OAuthProvider = "google" | "microsoft";

export type ProviderTokens = {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
};

export class OAuthError extends Error {
  code: "not_connected" | "token_expired" | "provider_rejected";

  constructor(code: OAuthError["code"], message: string) {
    super(message);
    this.code = code;
  }
}

type PendingAuth = {
  provider: OAuthProvider;
  state: string;
  codeVerifier?: string;
};

const env: Record<string, string | undefined> = (import.meta as unknown as { env?: Record<string, string> }).env ?? {};

const providerConfig = {
  google: {
    clientId: env.VITE_GOOGLE_CLIENT_ID,
    redirectUri: env.VITE_GOOGLE_REDIRECT_URI ?? `${window.location.origin}/oauth/google/callback`
  },
  microsoft: {
    clientId: env.VITE_MICROSOFT_CLIENT_ID,
    tenantId: env.VITE_MICROSOFT_TENANT_ID || undefined,
    redirectUri: env.VITE_MICROSOFT_REDIRECT_URI ?? `${window.location.origin}/oauth/microsoft/callback`
  }
} as const;

const pendingKey = "contactsnap.oauth.pending";
const tokensKey = (provider: OAuthProvider) => `contactsnap.tokens.${provider}`;

export function isProviderConfigured(provider: OAuthProvider): boolean {
  return Boolean(providerConfig[provider].clientId);
}

export function getStoredTokens(provider: OAuthProvider): ProviderTokens | undefined {
  try {
    const raw = window.localStorage.getItem(tokensKey(provider));
    return raw ? (JSON.parse(raw) as ProviderTokens) : undefined;
  } catch {
    return undefined;
  }
}

export function isProviderConnected(provider: OAuthProvider): boolean {
  return Boolean(getStoredTokens(provider));
}

export function disconnectProvider(provider: OAuthProvider): void {
  window.localStorage.removeItem(tokensKey(provider));
}

function randomState(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

// Redirect the browser to the provider's consent screen. Google uses the
// implicit token flow (a pure browser app cannot hold the client secret its
// web clients require for code exchange); Microsoft uses auth-code + PKCE,
// which Entra supports for SPA-registered redirect URIs.
export async function startOAuth(provider: OAuthProvider): Promise<void> {
  const state = randomState();
  if (provider === "google") {
    const config = providerConfig.google;
    if (!config.clientId) throw new OAuthError("not_connected", "Google client ID is not configured.");
    savePending({ provider, state });
    window.location.assign(buildGoogleAuthUrl({ clientId: config.clientId, redirectUri: config.redirectUri, responseType: "token" }, state));
    return;
  }
  const config = providerConfig.microsoft;
  if (!config.clientId) throw new OAuthError("not_connected", "Microsoft client ID is not configured.");
  const pkce = await createPkcePair();
  savePending({ provider, state, codeVerifier: pkce.codeVerifier });
  window.location.assign(buildMicrosoftAuthUrl({ clientId: config.clientId, tenantId: config.tenantId, redirectUri: config.redirectUri, codeChallenge: pkce.codeChallenge }, state));
}

// Call once on app load. If the current URL is an OAuth redirect, finish the
// flow, store tokens, clean the URL, and return which provider connected.
export async function completeOAuthCallback(): Promise<OAuthProvider | undefined> {
  const pending = loadPending();
  if (!pending) return undefined;

  if (pending.provider === "google") {
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const accessToken = params.get("access_token");
    if (!accessToken) return undefined;
    clearPending();
    if (params.get("state") !== pending.state) {
      throw new OAuthError("provider_rejected", "Google OAuth state mismatch — possible CSRF; try connecting again.");
    }
    const expiresIn = Number(params.get("expires_in") ?? 3600);
    storeTokens("google", { accessToken, expiresAt: Date.now() + expiresIn * 1000 });
    cleanUrl();
    return "google";
  }

  const query = new URLSearchParams(window.location.search);
  const code = query.get("code");
  if (!code) return undefined;
  clearPending();
  if (query.get("state") !== pending.state) {
    throw new OAuthError("provider_rejected", "Microsoft OAuth state mismatch — possible CSRF; try connecting again.");
  }
  const config = providerConfig.microsoft;
  const tokens = await exchangeMicrosoftCode({
    clientId: config.clientId!,
    redirectUri: config.redirectUri,
    code,
    codeVerifier: pending.codeVerifier ?? "",
    tenantId: config.tenantId
  });
  storeTokens("microsoft", {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAt: Date.now() + tokens.expiresIn * 1000
  });
  cleanUrl();
  return "microsoft";
}

// Return a usable access token, refreshing when possible. Google implicit
// tokens cannot be refreshed silently — the user reconnects when one expires.
export async function getValidAccessToken(provider: OAuthProvider): Promise<string> {
  const tokens = getStoredTokens(provider);
  if (!tokens) throw new OAuthError("not_connected", `${provider} is not connected.`);
  if (tokens.expiresAt > Date.now() + 60_000) return tokens.accessToken;

  if (provider === "microsoft" && tokens.refreshToken) {
    const config = providerConfig.microsoft;
    const refreshed = await refreshMicrosoftToken({ clientId: config.clientId!, refreshToken: tokens.refreshToken, tenantId: config.tenantId });
    storeTokens("microsoft", {
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken,
      expiresAt: Date.now() + refreshed.expiresIn * 1000
    });
    return refreshed.accessToken;
  }

  disconnectProvider(provider);
  throw new OAuthError("token_expired", `${provider} session expired. Reconnect from Settings and try again.`);
}

function storeTokens(provider: OAuthProvider, tokens: ProviderTokens): void {
  // NOTE: localStorage is acceptable for the web MVP only. The desktop app
  // must store tokens in the OS keychain per the privacy model.
  window.localStorage.setItem(tokensKey(provider), JSON.stringify(tokens));
}

function savePending(pending: PendingAuth): void {
  window.sessionStorage.setItem(pendingKey, JSON.stringify(pending));
}

function loadPending(): PendingAuth | undefined {
  try {
    const raw = window.sessionStorage.getItem(pendingKey);
    return raw ? (JSON.parse(raw) as PendingAuth) : undefined;
  } catch {
    return undefined;
  }
}

function clearPending(): void {
  window.sessionStorage.removeItem(pendingKey);
}

function cleanUrl(): void {
  window.history.replaceState({}, "", "/");
}
