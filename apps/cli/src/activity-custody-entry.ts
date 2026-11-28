#!/usr/bin/env bun

import { launch } from "./commands/handlers/activity-custody"

await launch(process.argv.slice(2))
