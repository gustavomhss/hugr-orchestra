export * as PluginSdkPackage from "./sdk-package"

import npa from "npm-package-arg"
import semver from "semver"
import { Schema } from "effect"
import sdk from "../../../plugin/package.json"

export class VersionError extends Schema.TaggedErrorClass<VersionError>()("PluginSdkVersionError", {
  requested: Schema.String,
  bundled: Schema.String,
}) {}

export const manifest = {
  name: sdk.name,
  version: sdk.version,
  license: sdk.license,
  type: "module" as const,
  main: "./index.js",
  exports: Object.fromEntries(Object.entries(sdk.exports).map(([key, value]) => [key, value.replace("./src/", "./").replace(/\.ts$/, ".js")])),
}

export const sources = Object.fromEntries([
  ["package.json", JSON.stringify(manifest)],
  ...Object.entries(manifest.exports).map(([key, file]) => [
    file.slice(2),
    `export * from ${JSON.stringify("orchestra-plugin-sdk:" + sdk.name + (key === "." ? "" : key.slice(1)))}\n`,
  ]),
])

// npm aliases carry their real package identity in subSpec, not the dependency key.
export function request(name: string, rawSpec: string) {
  const parsed = npa.resolve(name, rawSpec)
  const target = parsed.type === "alias" ? parsed.subSpec : parsed
  if (target.name !== sdk.name) return
  if ((target.type === "tag" && target.fetchSpec === "latest") ||
      ((target.type === "range" || target.type === "version") && target.fetchSpec && semver.satisfies(sdk.version, target.fetchSpec))) return target
  throw new VersionError({ requested: parsed.toString(), bundled: sdk.version })
}

export function versionFailure(cause: unknown) {
  if (cause instanceof VersionError) return cause
  if (cause && typeof cause === "object" && "code" in cause && cause.code === "ETARGET" &&
      "name" in cause && cause.name === sdk.name && "wanted" in cause && typeof cause.wanted === "string")
    return new VersionError({ requested: `${sdk.name}@${cause.wanted}`, bundled: sdk.version })
}
