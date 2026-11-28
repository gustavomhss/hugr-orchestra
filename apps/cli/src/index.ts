#!/usr/bin/env bun

if (process.argv[2] === "activity-custody") {
  const { launch } = await import("./commands/handlers/activity-custody")
  await launch(process.argv.slice(3))
} else {
  await import("./cli")
}
