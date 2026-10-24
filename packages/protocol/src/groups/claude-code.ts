import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/unstable/httpapi"

export const ClaudeCodeAccount = Schema.Struct({
  signedIn: Schema.Boolean,
  email: Schema.optional(Schema.String),
  subscription: Schema.optional(Schema.String),
}).annotate({ identifier: "ClaudeCodeAccount" })

export const ClaudeCodeLogin = Schema.Struct({ url: Schema.String }).annotate({ identifier: "ClaudeCodeLogin" })

export const ClaudeCodeLoginCode = Schema.Struct({ code: Schema.String }).annotate({ identifier: "ClaudeCodeLoginCode" })

export class ClaudeCodeLoginError extends Schema.TaggedErrorClass<ClaudeCodeLoginError>()(
  "ClaudeCodeLoginError",
  { message: Schema.String },
  { httpApiStatus: 400 },
) {}

// The sign-in belongs to the server's Claude Code binary, not to a Location, so these routes take no location.
export const ClaudeCodeGroup = HttpApiGroup.make("server.claudeCode")
  .add(
    HttpApiEndpoint.get("claudeCode.account", "/api/claude-code/account", {
      success: ClaudeCodeAccount,
    }).annotateMerge(
      OpenApi.annotations({
        identifier: "v2.claudeCode.account",
        summary: "Get Claude Code account",
        description:
          "Whether the Claude Code binary Claude mode runs is signed in, with the account email and subscription. No credential is returned.",
      }),
    ),
  )
  .add(
    HttpApiEndpoint.post("claudeCode.login", "/api/claude-code/login", {
      success: ClaudeCodeLogin,
      error: ClaudeCodeLoginError,
    }).annotateMerge(
      OpenApi.annotations({
        identifier: "v2.claudeCode.login",
        summary: "Start Claude Code sign-in",
        description:
          "Run `claude auth login --claudeai` with the binary Claude mode runs. Claude Code opens the browser itself; the returned URL is its manual fallback, whose page shows a code to send to the login code route. Sign-in continues in the background; the account route reports the result.",
      }),
    ),
  )
  .add(
    HttpApiEndpoint.post("claudeCode.loginCode", "/api/claude-code/login/code", {
      payload: ClaudeCodeLoginCode,
      success: Schema.Boolean,
    }).annotateMerge(
      OpenApi.annotations({
        identifier: "v2.claudeCode.loginCode",
        summary: "Send Claude Code sign-in code",
        description: "Hand the code shown by the fallback sign-in page to the running Claude Code sign-in.",
      }),
    ),
  )
  .annotateMerge(
    OpenApi.annotations({
      title: "claude-code",
      description: "Claude Code sign-in routes.",
    }),
  )
