import type { OAuthClientProvider, OAuthDiscoveryState } from "@modelcontextprotocol/sdk/client/auth.js"
import type {
  OAuthClientMetadata,
  OAuthTokens,
  OAuthClientInformation,
  OAuthClientInformationFull,
} from "@modelcontextprotocol/sdk/shared/auth.js"
import type { ConfigMCP } from "@orchestra/schema/config-mcp"
import type { Mcp } from "@orchestra/schema/mcp"
import { Effect } from "effect"
import { McpAuth } from "./auth"

const OAUTH_CALLBACK_PORT = 19876
const OAUTH_CALLBACK_PATH = "/mcp/oauth/callback"

export interface McpOAuthConfig {
  clientId?: string
  clientSecret?: string
  scope?: string
  callbackPort?: number
  redirectUri?: string
}

export interface McpOAuthCallbacks {
  onRedirect: (url: URL) => void | Promise<void>
}

export class McpOAuthProvider implements OAuthClientProvider {
  constructor(
    protected mcpName: string,
    protected serverUrl: string,
    protected config: McpOAuthConfig,
    private callbacks: McpOAuthCallbacks,
    protected auth: McpAuth.Interface,
    protected binding: McpAuth.Binding,
  ) {}

  protected observedIssuer?: string

  get redirectUrl(): string {
    if (this.config.redirectUri) {
      return this.config.redirectUri
    }
    const port = this.config.callbackPort ?? OAUTH_CALLBACK_PORT
    return `http://127.0.0.1:${port}${OAUTH_CALLBACK_PATH}`
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      redirect_uris: [this.redirectUrl],
      client_name: "Orchestra",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: this.config.clientSecret ? "client_secret_post" : "none",
      ...(this.config.scope ? { scope: this.config.scope } : {}),
    }
  }

  // The transport calls tokens() before discovery. Legacy bytes must already fail at that boundary.
  protected async checked() {
    if (this.binding.name !== this.mcpName || this.binding.serverUrl !== this.serverUrl)
      throw new McpAuth.ReauthRequired()
    const entry = await Effect.runPromise(this.auth.readBinding(this.binding))
    if (entry.issuer !== undefined && !McpAuth.issuerUrl(entry.issuer)) throw new McpAuth.ReauthRequired()
    if (this.observedIssuer && !McpAuth.sameIssuer(entry.issuer, this.observedIssuer))
      throw new McpAuth.ReauthRequired()
    if (
      entry.clientInfo &&
      (!McpAuth.sameIssuer(entry.issuer, entry.clientInfo.issuer) ||
        entry.clientInfo.source !== (this.config.clientId ? "configured" : "dynamic") ||
        (this.config.clientId && entry.clientInfo.clientId !== this.config.clientId) ||
        (entry.clientInfo.source === "configured" && entry.clientInfo.clientSecret !== undefined))
    )
      throw new McpAuth.ReauthRequired()
    if (entry.tokens && (!entry.clientInfo || !McpAuth.sameIssuer(entry.issuer, entry.tokens.issuer)))
      throw new McpAuth.ReauthRequired()
    if (
      this.config.clientId &&
      entry.staticClientBinding &&
      (entry.staticClientBinding.clientId !== this.config.clientId ||
        (entry.issuer && !McpAuth.sameIssuer(entry.staticClientBinding.issuer, entry.issuer)))
    )
      throw new McpAuth.ReauthRequired()
    return entry
  }

  protected issuer(stamp?: string) {
    if (!this.observedIssuer || (stamp !== undefined && !McpAuth.sameIssuer(stamp, this.observedIssuer)))
      throw new McpAuth.ReauthRequired()
    return this.observedIssuer
  }

  async saveDiscoveryState(state: OAuthDiscoveryState): Promise<void> {
    const issuer = McpAuth.issuerUrl(String(state.authorizationServerUrl))
    if (!issuer) throw new McpAuth.ReauthRequired()
    const entry = await this.checked()
    if (entry.issuer && !McpAuth.sameIssuer(entry.issuer, issuer)) throw new McpAuth.ReauthRequired()
    if (
      this.config.clientId &&
      entry.staticClientBinding &&
      (entry.staticClientBinding.clientId !== this.config.clientId ||
        !McpAuth.sameIssuer(entry.staticClientBinding.issuer, issuer))
    )
      throw new McpAuth.ReauthRequired()
    await Effect.runPromise(this.auth.updateBinding(this.binding, { issuer }))
    this.observedIssuer = issuer
  }

  async clientInformation(): Promise<OAuthClientInformation | undefined> {
    const entry = await this.checked()
    if (this.config.clientId) {
      if (!entry.staticClientBinding || !McpAuth.sameIssuer(entry.staticClientBinding.issuer, entry.issuer))
        throw new McpAuth.ReauthRequired()
      return {
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        issuer: entry.staticClientBinding.issuer,
      }
    }
    if (!entry.clientInfo) return undefined
    if (entry.clientInfo.clientSecretExpiresAt && entry.clientInfo.clientSecretExpiresAt < Date.now() / 1000)
      return undefined
    return {
      issuer: entry.clientInfo.issuer,
      client_id: entry.clientInfo.clientId,
      client_secret: entry.clientInfo.clientSecret,
    }
  }

  protected clientEntry(info: OAuthClientInformationFull): McpAuth.StampedClientInfo {
    const issuer = this.issuer(info.issuer)
    if (!info.issuer || (this.config.clientId && info.client_id !== this.config.clientId))
      throw new McpAuth.ReauthRequired()
    return {
      issuer,
      source: this.config.clientId ? "configured" : "dynamic",
      clientId: info.client_id,
      ...(this.config.clientId
        ? {}
        : {
            clientSecret: info.client_secret,
            clientIdIssuedAt: info.client_id_issued_at,
            clientSecretExpiresAt: info.client_secret_expires_at,
          }),
    }
  }

  async saveClientInformation(info: OAuthClientInformationFull): Promise<void> {
    await this.checked()
    await Effect.runPromise(this.auth.updateBinding(this.binding, { clientInfo: this.clientEntry(info) }))
  }

  async tokens(): Promise<OAuthTokens | undefined> {
    const entry = await this.checked()
    if (!entry.tokens) return undefined
    return {
      issuer: entry.tokens.issuer,
      access_token: entry.tokens.accessToken,
      token_type: "Bearer",
      refresh_token: entry.tokens.refreshToken,
      expires_in: entry.tokens.expiresAt
        ? Math.max(0, Math.floor(entry.tokens.expiresAt - Date.now() / 1000))
        : undefined,
      scope: entry.tokens.scope,
    }
  }

  protected tokenEntry(tokens: OAuthTokens): McpAuth.StampedTokens {
    if (!tokens.issuer) throw new McpAuth.ReauthRequired()
    return {
      issuer: this.issuer(tokens.issuer),
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: tokens.expires_in ? Date.now() / 1000 + tokens.expires_in : undefined,
      scope: tokens.scope,
    }
  }

  async saveTokens(tokens: OAuthTokens): Promise<void> {
    const entry = await this.checked()
    if (!entry.clientInfo || !McpAuth.sameIssuer(entry.clientInfo.issuer, this.issuer(tokens.issuer)))
      throw new McpAuth.ReauthRequired()
    await Effect.runPromise(this.auth.updateBinding(this.binding, { tokens: this.tokenEntry(tokens) }))
  }

  async redirectToAuthorization(authorizationUrl: URL): Promise<void> {
    await this.checked()
    await this.callbacks.onRedirect(authorizationUrl)
  }

  async saveCodeVerifier(codeVerifier: string): Promise<void> {
    await this.checked()
    await Effect.runPromise(this.auth.updateBinding(this.binding, { codeVerifier }))
  }

  async codeVerifier(): Promise<string> {
    const entry = await this.checked()
    if (!entry.codeVerifier) throw new McpAuth.ReauthRequired()
    return entry.codeVerifier
  }

  async saveState(state: string): Promise<void> {
    await this.checked()
    await Effect.runPromise(this.auth.updateBinding(this.binding, { oauthState: state }))
  }

  async state(): Promise<string> {
    const entry = await this.checked()
    if (entry.oauthState) return entry.oauthState
    const state = Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("")
    await Effect.runPromise(this.auth.updateBinding(this.binding, { oauthState: state }))
    return state
  }

  async invalidateCredentials(type: "all" | "client" | "tokens"): Promise<void> {
    await Effect.runPromise(this.auth.invalidateBinding(this.binding, type))
  }
}

export class McpOAuthPendingProvider extends McpOAuthProvider {
  private pendingClientInfo?: McpAuth.StampedClientInfo
  private pendingTokens?: McpAuth.StampedTokens

  override async clientInformation(): Promise<OAuthClientInformation | undefined> {
    const entry = await this.checked()
    if (this.config.clientId) {
      const issuer = this.issuer()
      if (
        entry.staticClientBinding &&
        (entry.staticClientBinding.clientId !== this.config.clientId ||
          !McpAuth.sameIssuer(entry.staticClientBinding.issuer, issuer))
      )
        throw new McpAuth.ReauthRequired()
      const identity = { clientId: this.config.clientId, issuer, source: "configured" as const }
      // Bind public identity before the SDK can use the configured secret, even if exchange never commits.
      await Effect.runPromise(this.auth.updateBinding(this.binding, { clientInfo: identity }))
      this.pendingClientInfo = identity
      return { client_id: this.config.clientId, client_secret: this.config.clientSecret, issuer }
    }
    return this.pendingClientInfo
      ? {
          issuer: this.pendingClientInfo.issuer,
          client_id: this.pendingClientInfo.clientId,
          client_secret: this.pendingClientInfo.clientSecret,
        }
      : undefined
  }

  override async saveClientInformation(info: OAuthClientInformationFull): Promise<void> {
    await this.checked()
    this.pendingClientInfo = this.clientEntry(info)
  }

  override async tokens(): Promise<OAuthTokens | undefined> {
    await this.checked()
    return this.pendingTokens
      ? {
          issuer: this.pendingTokens.issuer,
          access_token: this.pendingTokens.accessToken,
          token_type: "Bearer",
          refresh_token: this.pendingTokens.refreshToken,
          scope: this.pendingTokens.scope,
        }
      : undefined
  }

  override async saveTokens(tokens: OAuthTokens): Promise<void> {
    await this.checked()
    if (!this.pendingClientInfo || !McpAuth.sameIssuer(this.pendingClientInfo.issuer, this.issuer(tokens.issuer)))
      throw new McpAuth.ReauthRequired()
    this.pendingTokens = this.tokenEntry(tokens)
  }

  override async invalidateCredentials(type: "all" | "client" | "tokens"): Promise<void> {
    await super.invalidateCredentials(type)
    if (type === "all" || type === "client") this.pendingClientInfo = undefined
    this.pendingTokens = undefined
  }

  async commit(): Promise<void> {
    await this.checked()
    if (!this.pendingTokens || !this.pendingClientInfo) throw new McpAuth.ReauthRequired()
    await Effect.runPromise(
      this.auth.commitBinding(this.binding, {
        issuer: this.issuer(),
        tokens: this.pendingTokens,
        clientInfo: this.pendingClientInfo,
      }),
    )
  }
}

export { OAUTH_CALLBACK_PORT, OAUTH_CALLBACK_PATH }

/**
 * Parse a redirect URI to extract port and path for the callback server.
 * Returns defaults if the URI can't be parsed.
 */
export function parseRedirectUri(redirectUri?: string): { port: number; path: string } {
  if (!redirectUri) {
    return { port: OAUTH_CALLBACK_PORT, path: OAUTH_CALLBACK_PATH }
  }

  try {
    const url = new URL(redirectUri)
    const port = url.port ? parseInt(url.port, 10) : url.protocol === "https:" ? 443 : 80
    const path = url.pathname || OAUTH_CALLBACK_PATH
    return { port, path }
  } catch {
    return { port: OAUTH_CALLBACK_PORT, path: OAUTH_CALLBACK_PATH }
  }
}

export function oauthConfig(server: ConfigMCP.Remote): McpOAuthConfig {
  const oauth = server.oauth === false ? undefined : server.oauth
  return {
    clientId: oauth?.client_id,
    clientSecret: oauth?.client_secret,
    scope: oauth?.scope,
    callbackPort: oauth?.callback_port,
    redirectUri: oauth?.redirect_uri,
  }
}

export function unauthorized(error: Error) {
  return error.name === "UnauthorizedError" || /\b401\b|unauthorized/i.test(error.message)
}

// An OAuth failure needs a sign-in, unless the server cannot register a client and needs a configured client ID.
export function authStatus(error: Error, oauth: boolean): Mcp.Status | undefined {
  if (error instanceof McpAuth.ReauthRequired) return { status: "needs_auth" }
  if (!unauthorized(error) && !(oauth && error.message.includes("OAuth"))) return undefined
  if (/registration|client_id/.test(error.message))
    return {
      status: "needs_client_registration",
      error: "The server does not support dynamic client registration. Set oauth.client_id in its MCP config.",
    }
  return { status: "needs_auth" }
}
