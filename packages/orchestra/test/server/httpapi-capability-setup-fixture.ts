export * as CapabilitySetupHostFixture from "./httpapi-capability-setup-fixture"

import { ConfigProvider, Layer } from "effect"
import { CapabilitySetupHttpFixture } from "../../../server/test/capability-setup-http-fixture"
import { HttpApiApp } from "../../src/server/routes/instance/httpapi/server"

export const basic = (password = "host-secret:colon") => `Basic ${Buffer.from(`host-proof:${password}`).toString("base64")}`

export function make(options: { password?: string } = {}) {
  return CapabilitySetupHttpFixture.make({ routes: (operator, verifier) =>
    HttpApiApp.createRoutes(undefined, operator, verifier).pipe(Layer.provide(ConfigProvider.layer(
      ConfigProvider.fromUnknown({ ORCHESTRA_SERVER_USERNAME: "host-proof", ORCHESTRA_SERVER_PASSWORD: options.password }),
    ))) })
}
