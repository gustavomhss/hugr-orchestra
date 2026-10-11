// The isolated user every scenario runs as (re-exported by lib.ts).

import { spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"

/**
 * An isolated user: HOME and every XDG directory in a temp dir (never the real ~/.local/share/orchestra), plus a
 * throwaway git project. The config goes inline through ORCHESTRA_CONFIG_CONTENT, as the repo's CLI harness does.
 */
export function isolated(name: string, config: Record<string, unknown>) {
  const home = realpathSync(mkdtempSync(path.join(os.tmpdir(), `omni-campaign-${name}-`)))
  const project = path.join(home, "project")
  mkdirSync(project, { recursive: true })
  writeFileSync(path.join(project, "a.ts"), "export const a = 1\n")
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env))
    if (value !== undefined && !/^(HUGR_|ORCHESTRA_|ORCHESTRA_|ANTHROPIC_|OPENAI_|AWS_|AZURE_|GOOGLE_|GEMINI_|GITHUB_|GH_|BUN_OPTIONS|NODE_OPTIONS|SSH_AUTH_SOCK)/i.test(key) && !/(TOKEN|SECRET|PASSWORD|API_KEY|CREDENTIAL)/i.test(key)) env[key] = value
  Object.assign(env, {
    ORCHESTRA_TEST_HOME: home,
    HOME: home,
    USERPROFILE: home,
    APPDATA: path.join(home, "AppData/Roaming"),
    LOCALAPPDATA: path.join(home, "AppData/Local"),
    PWD: project,
    GIT_CONFIG_GLOBAL: path.join(home, ".gitconfig"),
    GIT_CONFIG_NOSYSTEM: "1",
    XDG_CONFIG_HOME: path.join(home, ".config"),
    XDG_DATA_HOME: path.join(home, ".local/share"),
    XDG_STATE_HOME: path.join(home, ".local/state"),
    XDG_CACHE_HOME: path.join(home, ".cache"),
    ORCHESTRA_CONFIG_CONTENT: JSON.stringify(config.provider ? {
      ...config,
      agent: { maestro: { model: "test/test-model", permission: { "*": "allow" } }, ...(config.agent as Record<string, unknown>) },
    } : config),
    ORCHESTRA_DISABLE_PROJECT_CONFIG: "1",
    ORCHESTRA_PURE: "1",
    ORCHESTRA_DISABLE_AUTOUPDATE: "1",
    ORCHESTRA_DISABLE_AUTOCOMPACT: "1",
    ORCHESTRA_DISABLE_MODELS_FETCH: "1",
    ORCHESTRA_AUTH_CONTENT: "{}",
    ORCHESTRA_DISABLE_CLAUDE_CODE: "1",
    ORCHESTRA_DISABLE_EXTERNAL_SKILLS: "1",
    ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER: process.env.ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER ?? "1",
  })
  const git = spawnSync("git", ["init", "-q"], { cwd: project, env })
  if (git.status !== 0) throw new Error(`git init failed: ${git.error ?? git.stderr}`)
  return { home, project, env }
}
