export * as ServerFabricContexts from "./fabric-contexts"

import type { AbsolutePath } from "@orchestra/schema/schema"
import { Context } from "effect"

/** Trusted composition only. Acquiring this config never provisions a context root. */
export class Config extends Context.Service<Config, Readonly<{ root?: AbsolutePath }>>()(
  "@orchestra/ServerFabricContextsConfig",
) {}
