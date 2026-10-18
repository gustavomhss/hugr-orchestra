import { ProviderAuth } from "@/provider/auth"
import { Provider } from "@/provider/provider"

import { Schema } from "effect"
import { HttpApi, HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/unstable/httpapi"
import { Authorization } from "../middleware/authorization"
import { InstanceContextMiddleware } from "../middleware/instance-context"
import { WorkspaceRoutingMiddleware, WorkspaceRoutingQuery } from "../middleware/workspace-routing"
import { described } from "./metadata"
import { ProviderV2 } from "@orchestra/core/provider"

const root = "/provider"

const ProviderAuthErrorName = Schema.Union([
  Schema.Literal("BadRequest"),
  Schema.Literal("ProviderAuthOauthMissing"),
  Schema.Literal("ProviderAuthOauthCodeMissing"),
  Schema.Literal("ProviderAuthOauthCallbackFailed"),
  Schema.Literal("ProviderAuthValidationFailed"),
])
export class ProviderAuthApiError extends Schema.ErrorClass<ProviderAuthApiError>("ProviderAuthError")(
  {
    name: ProviderAuthErrorName,
    data: Schema.Struct({
      providerID: Schema.optional(ProviderV2.ID),
      field: Schema.optional(Schema.String),
      message: Schema.optional(Schema.String),
      kind: Schema.optional(Schema.String),
    }),
  },
  { httpApiStatus: 400 },
) {}

export const ClaudeCodeAccount = Schema.Struct({
  signedIn: Schema.Boolean,
  email: Schema.optional(Schema.String),
  subscription: Schema.optional(Schema.String),
}).annotate({ identifier: "ClaudeCodeAccount" })

export const ClaudeCodeLogin = Schema.Struct({
  url: Schema.String,
}).annotate({ identifier: "ClaudeCodeLogin" })

export const ClaudeCodeLoginCode = Schema.Struct({
  code: Schema.String,
})

export class ClaudeCodeLoginApiError extends Schema.ErrorClass<ClaudeCodeLoginApiError>("ClaudeCodeLoginError")(
  { name: Schema.Literal("ClaudeCodeLoginFailed"), data: Schema.Struct({ message: Schema.String }) },
  { httpApiStatus: 400 },
) {}

export const ProviderApi = HttpApi.make("provider")
  .add(
    HttpApiGroup.make("provider")
      .add(
        HttpApiEndpoint.get("list", root, {
          query: WorkspaceRoutingQuery,
          success: described(Provider.ListResult, "List of providers"),
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "provider.list",
            summary: "List providers",
            description: "Get a list of all available AI providers, including both available and connected ones.",
          }),
        ),
        HttpApiEndpoint.get("auth", `${root}/auth`, {
          query: WorkspaceRoutingQuery,
          success: described(ProviderAuth.Methods, "Provider auth methods"),
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "provider.auth",
            summary: "Get provider auth methods",
            description: "Retrieve available authentication methods for all AI providers.",
          }),
        ),
        HttpApiEndpoint.post("authorize", `${root}/:providerID/oauth/authorize`, {
          params: { providerID: ProviderV2.ID },
          query: WorkspaceRoutingQuery,
          payload: ProviderAuth.AuthorizeInput,
          success: described(Schema.UndefinedOr(ProviderAuth.Authorization), "Authorization URL and method"),
          error: ProviderAuthApiError,
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "provider.oauth.authorize",
            summary: "Start OAuth authorization",
            description: "Start the OAuth authorization flow for a provider.",
          }),
        ),
        HttpApiEndpoint.post("callback", `${root}/:providerID/oauth/callback`, {
          params: { providerID: ProviderV2.ID },
          query: WorkspaceRoutingQuery,
          payload: ProviderAuth.CallbackInput,
          success: described(Schema.Boolean, "OAuth callback processed successfully"),
          error: ProviderAuthApiError,
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "provider.oauth.callback",
            summary: "Handle OAuth callback",
            description: "Handle the OAuth callback from a provider after user authorization.",
          }),
        ),
        HttpApiEndpoint.get("claudeCodeAccount", `${root}/claude-code/account`, {
          query: WorkspaceRoutingQuery,
          success: described(ClaudeCodeAccount, "Claude Code sign-in status"),
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "provider.claudeCode.account",
            summary: "Get Claude Code account",
            description:
              "Whether the Claude Code binary Claude mode runs is signed in, with the account email and subscription. No credential is returned.",
          }),
        ),
        HttpApiEndpoint.post("claudeCodeLogin", `${root}/claude-code/login`, {
          query: WorkspaceRoutingQuery,
          success: described(ClaudeCodeLogin, "Fallback sign-in URL"),
          error: ClaudeCodeLoginApiError,
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "provider.claudeCode.login",
            summary: "Start Claude Code sign-in",
            description:
              "Run `claude auth login --claudeai` with the binary Claude mode runs. Claude Code opens the browser itself; the returned URL is its manual fallback, whose page shows a code to send to provider.claudeCode.loginCode. Sign-in continues in the background; provider.claudeCode.account reports the result.",
          }),
        ),
        HttpApiEndpoint.post("claudeCodeLoginCode", `${root}/claude-code/login/code`, {
          query: WorkspaceRoutingQuery,
          payload: ClaudeCodeLoginCode,
          success: described(Schema.Boolean, "Whether a running sign-in received the code"),
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "provider.claudeCode.loginCode",
            summary: "Send Claude Code sign-in code",
            description: "Hand the code shown by the fallback sign-in page to the running Claude Code sign-in.",
          }),
        ),
      )
      .annotateMerge(
        OpenApi.annotations({
          title: "provider",
          description: "Experimental HttpApi provider routes.",
        }),
      )
      .middleware(InstanceContextMiddleware)
      .middleware(WorkspaceRoutingMiddleware)
      .middleware(Authorization),
  )
  .annotateMerge(
    OpenApi.annotations({
      title: "orchestra experimental HttpApi",
      version: "0.0.1",
      description: "Experimental HttpApi surface for selected instance routes.",
    }),
  )
