import { check, object } from "./assertions"
import { http, route } from "./dsl"
import { type Scenario } from "./types"

export const providerScenarios: Scenario[] = [
  http.protected.get("/provider", "provider.list").json(),
  http.protected.get("/provider/auth", "provider.auth").json(),
  http.protected
    .post("/provider/{providerID}/oauth/authorize", "provider.oauth.authorize")
    .at((ctx) => ({
      path: route("/provider/{providerID}/oauth/authorize", { providerID: "httpapi" }),
      headers: ctx.headers(),
      body: { method: "bad" },
    }))
    .status(400),
  http.protected
    .post("/provider/{providerID}/oauth/callback", "provider.oauth.callback")
    .at((ctx) => ({
      path: route("/provider/{providerID}/oauth/callback", { providerID: "httpapi" }),
      headers: ctx.headers(),
      body: { method: "bad" },
    }))
    .status(400),
  // Claude mode sign-in. The exercise points Claude mode at a missing executable (environment.ts), so no route starts
  // Claude Code: the account reads as signed out, sign-in fails at once, and a code has no sign-in to reach.
  http.protected.get("/provider/claude-code/account", "provider.claudeCode.account").json(200, (body) => {
    object(body)
    check(body.signedIn === false, "an unavailable Claude Code should read as signed out")
  }),
  http.protected
    .post("/provider/claude-code/login", "provider.claudeCode.login")
    .at((ctx) => ({ path: "/provider/claude-code/login", headers: ctx.headers() }))
    .status(400),
  http.protected
    .post("/provider/claude-code/login/code", "provider.claudeCode.loginCode")
    .at((ctx) => ({ path: "/provider/claude-code/login/code", headers: ctx.headers(), body: { code: "code#state" } }))
    .json(200, (body) => check(body === false, "a code without a running sign-in should not be accepted")),
]
