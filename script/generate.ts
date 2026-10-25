#!/usr/bin/env bun

import { $ } from "bun"

await $`bun ./packages/sdk/js/script/build.ts`

await $`bun run generate`.cwd("packages/client")

await $`./script/format.ts`
