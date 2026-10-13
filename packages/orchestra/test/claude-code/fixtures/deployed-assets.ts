// CI-only narrow bundle entry. No owner app, query, login or account probe is invoked.
import fs from "node:fs/promises"
import path from "node:path"
import { ClaudeCodeSDK } from "../../../src/claude-code/sdk"
import { ClaudeHostPlugin } from "../../../src/claude-code/host/plugin"
import { PlaybookContent } from "../../../src/maestro/playbook-content"
import { SeatSkillRoot } from "../../../src/maestro/seat-skill-root"
import { Skill } from "../../../src/skill"

const executable = ClaudeCodeSDK.processLifetime({
  systemPrompt: { type: "preset", preset: "claude_code" },
  env: {},
}).options.pathToClaudeCodeExecutable
if (!executable) throw new Error("Deployed runtime did not select a real Claude Code resource")
if (Skill.PLAYBOOKS_DIR !== SeatSkillRoot.playbooks)
  throw new Error("Skill and standalone plugin playbook roots differ")
const plugin = await ClaudeHostPlugin.build({ seats: [], tools: {}, root: path.join(process.cwd(), "plugin-proof") })
const files = await PlaybookContent.read(path.join(plugin.path, "skills"))
await fs.access(executable)
await new Promise<void>((resolve, reject) =>
  process.stdout.write(JSON.stringify({ executable, files }), (error) => (error ? reject(error) : resolve())),
)
