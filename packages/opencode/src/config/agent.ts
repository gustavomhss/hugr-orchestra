export * as ConfigAgent from "./agent"

import path from "path"
import { Exit, Schema } from "effect"
import { Glob } from "@opencode-ai/core/util/glob"
import { ConfigAgentV1 } from "@opencode-ai/core/v1/config/agent"
import { configEntryNameFromPath } from "./entry-name"
import * as ConfigMarkdown from "./markdown"
import { ConfigParse } from "./parse"

export async function load(dir: string) {
  const result: Record<string, ConfigAgentV1.Info> = {}
  for (const item of await Glob.scan("{agent,agents}/**/*.md", {
    cwd: dir,
    absolute: true,
    dot: true,
    symlink: true,
  })) {
    const md = await ConfigMarkdown.parse(item).catch(() => undefined)
    if (!md) continue

    const name = configEntryNameFromPath(path.relative(dir, item), ["agent/", "agents/"])

    // A file without a body overrides other fields only; it keeps the agent's built-in prompt.
    const prompt = md.content.trim()
    const config = {
      name,
      ...md.data,
      ...(prompt ? { prompt } : {}),
    }
    result[config.name] = protectMaestro(config.name, ConfigParse.schema(ConfigAgentV1.Info, config, item))
  }
  return result
}

export async function loadMode(dir: string) {
  const result: Record<string, ConfigAgentV1.Info> = {}
  for (const item of await Glob.scan("{mode,modes}/*.md", {
    cwd: dir,
    absolute: true,
    dot: true,
    symlink: true,
  })) {
    const md = await ConfigMarkdown.parse(item).catch(() => undefined)
    if (!md) continue

    const prompt = md.content.trim()
    const config = {
      name: configEntryNameFromPath(path.relative(dir, item), ["mode/", "modes/"]),
      ...md.data,
      ...(prompt ? { prompt } : {}),
    }
    const parsed = Schema.decodeUnknownExit(ConfigAgentV1.Info)(config, { errors: "all", propertyOrder: "original" })
    if (Exit.isSuccess(parsed)) {
      result[config.name] = {
        ...protectMaestro(config.name, parsed.value),
        mode: "primary" as const,
      }
    }
  }
  return result
}

// Every session runs on Maestro, so an agent file can neither disable it nor take it out of primary mode. The keys
// are dropped rather than overridden, so the file never changes what other configuration sets for them.
function protectMaestro(name: string, agent: ConfigAgentV1.Info): ConfigAgentV1.Info {
  if (name !== "maestro") return agent
  return Object.fromEntries(Object.entries(agent).filter(([key]) => key !== "disable" && key !== "mode"))
}
