import { Provider } from "@orchestra/schema/provider"
import { Location } from "@orchestra/schema/location"
import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/unstable/httpapi"
import { ProviderNotFoundError, ServiceUnavailableError } from "../errors"
import { LocationQuery, locationQueryOpenApi } from "./location"

const ClaudeCodeAccount = Schema.Struct({
  signedIn: Schema.Boolean,
  email: Schema.String.pipe(Schema.optional),
  subscription: Schema.String.pipe(Schema.optional),
}).annotate({ identifier: "ClaudeCodeAccount" })

export const ProviderGroup = HttpApiGroup.make("server.provider")
  .add(
    HttpApiEndpoint.get("provider.list", "/api/provider", {
      query: LocationQuery,
      success: Location.response(Schema.Array(Provider.Info)),
      error: ServiceUnavailableError,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.provider.list",
          summary: "List providers",
          description: "Retrieve active AI providers so clients can show provider availability and configuration.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.get("provider.get", "/api/provider/:providerID", {
      params: { providerID: Provider.ID },
      query: LocationQuery,
      success: Location.response(Provider.Info),
      error: [ProviderNotFoundError, ServiceUnavailableError],
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.provider.get",
          summary: "Get provider",
          description: "Retrieve a single AI provider so clients can inspect its availability and endpoint settings.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.get("provider.claudeCode.account", "/api/provider/claude-code/account", {
      success: ClaudeCodeAccount,
    }).annotateMerge(
      OpenApi.annotations({
        identifier: "v2.provider.claudeCode.account",
        summary: "Get Claude Code account",
        description:
          "Whether the Claude Code binary Claude mode runs is signed in, with the account email and subscription. No credential is returned.",
      }),
    ),
  )
  .add(
    HttpApiEndpoint.post("provider.claudeCode.login", "/api/provider/claude-code/login", {
      success: Schema.Struct({ url: Schema.String }).annotate({ identifier: "ClaudeCodeLogin" }),
      error: ServiceUnavailableError,
    }).annotateMerge(
      OpenApi.annotations({
        identifier: "v2.provider.claudeCode.login",
        summary: "Start Claude Code sign-in",
        description:
          "Run `claude auth login --claudeai` with the binary Claude mode runs. Claude Code opens the browser itself; the returned URL is its manual fallback, whose page shows a code to send to the login code route. Sign-in continues in the background; the account route reports the result.",
      }),
    ),
  )
  .add(
    HttpApiEndpoint.post("provider.claudeCode.loginCode", "/api/provider/claude-code/login/code", {
      payload: Schema.Struct({ code: Schema.String }),
      success: Schema.Boolean,
    }).annotateMerge(
      OpenApi.annotations({
        identifier: "v2.provider.claudeCode.loginCode",
        summary: "Send Claude Code sign-in code",
        description: "Hand the code shown by the fallback sign-in page to the running Claude Code sign-in.",
      }),
    ),
  )
  .annotateMerge(
    OpenApi.annotations({
      title: "providers",
      description: "Experimental provider routes.",
    }),
  )
