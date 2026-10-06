import { Schema } from "effect"
import DESCRIPTION from "./shell.txt"
import { PositiveInt } from "@opencode-ai/core/schema"
import { Global } from "@opencode-ai/core/global"

export type Limits = {
  maxLines: number
  maxBytes: number
}

export function parameterSchema() {
  return Schema.Struct({
    command: Schema.String.annotate({ description: "The command to execute" }),
    timeout: Schema.optional(PositiveInt).annotate({ description: "Optional timeout in milliseconds" }),
    workdir: Schema.optional(Schema.String).annotate({
      description: `The working directory to run the command in. Defaults to the current directory. Use this instead of 'cd' commands.`,
    }),
  })
}

export const Parameters = parameterSchema()
export type Parameters = Schema.Schema.Type<typeof Parameters>

function renderPrompt(template: string, values: Record<string, string>) {
  return template.replace(/\$\{(\w+)\}/g, (_, key: string) => {
    const value = values[key]
    if (value === undefined) throw new Error(`Missing shell prompt value: ${key}`)
    return value
  })
}

// Display names keep the configured name, which the description must contain.
function shellDisplayName(name: string) {
  if (name === "pwsh") return "PowerShell 7+ (pwsh)"
  if (name === "powershell") return "Windows PowerShell 5.1 (powershell)"
  if (name === "cmd") return "cmd.exe"
  return name
}

const POWERSHELL_NOTES = `

# PowerShell notes
- Double quotes interpolate (\`"Hello $name"\`); single quotes are literal.
- Use full cmdlet names such as \`Get-ChildItem\` and \`Remove-Item\` rather than aliases.
- \`$(...)\` is a subexpression and \`@(...)\` an array expression.
- Run an executable whose path has spaces with the call operator: \`& "path with spaces/tool.exe" args\`.
- The escape character is the backtick.`

const CMD_NOTES = `

# cmd.exe notes
- Only double quotes quote, so put paths with spaces in double quotes.
- Variables are \`%VAR%\`; test for files with \`if exist\`.
- Run a batch file from another command with \`call\`.`

function profile(name: string) {
  if (name === "cmd") {
    return {
      chain: "Chain dependent commands with `&&`; `&` runs the next command even when one fails.",
      notes: CMD_NOTES,
      // cmd.exe does not treat single quotes as quoting.
      commitExample: `git commit -m "subject" -m "body"`,
    }
  }
  if (name === "powershell") {
    return {
      chain: "Windows PowerShell 5.1 has no `&&`: chain dependent commands as `cmd1; if ($?) { cmd2 }`.",
      notes: POWERSHELL_NOTES,
      commitExample: "git commit -m 'subject' -m 'body'",
    }
  }
  return {
    chain: "Chain dependent commands with `&&`; `;` runs the next command even when one fails.",
    notes: name === "pwsh" ? POWERSHELL_NOTES : "",
    commitExample: "git commit -m 'subject' -m 'body'",
  }
}

export function render(name: string, platform: NodeJS.Platform, limits: Limits, defaultTimeoutMs: number) {
  const selected = profile(name)
  return {
    description: renderPrompt(DESCRIPTION, {
      shell: shellDisplayName(name),
      os: platform,
      tmp: Global.Path.tmp,
      chain: selected.chain,
      timeout: String(defaultTimeoutMs),
      notes: selected.notes,
      maxLines: String(limits.maxLines),
      maxBytes: String(limits.maxBytes),
      commitExample: selected.commitExample,
    }),
    parameters: parameterSchema(),
  }
}

export * as ShellPrompt from "./prompt"
