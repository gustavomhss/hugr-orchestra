export * as ShellIntegration from "./shell-integration"

import { randomUUID } from "node:crypto"
import { rename, stat, mkdir } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

// Makes a zsh or bash print OSC 133 marks (see shell-marks.ts) without editing the user's startup files: the shell is
// started through ours, which run the user's and then add the hooks. The nonce reaches the shell as a file that the
// script reads and deletes, and it stays in a shell variable that is never exported, so the programs the shell runs do not
// inherit it. It does not stop code that runs inside the shell itself from reading it; that is the sandbox's job.

export type Prepared = { readonly args: string[]; readonly env: Record<string, string>; readonly nonce: string }

export async function prepare(input: {
  command: string
  args: readonly string[]
  env: Readonly<Record<string, string | undefined>>
}): Promise<Prepared | undefined> {
  if (process.platform === "win32") return undefined
  const shell = path.basename(input.command)
  if (shell !== "zsh" && shell !== "bash") return undefined
  const login = input.args.some((arg) => arg === "-l" || arg === "--login")
  // Anything else on the command line (such as -c) is not an interactive shell.
  if (input.args.some((arg) => arg !== "-l" && arg !== "--login")) return undefined

  const root = await installed()
  if (!root) return undefined
  const nonce = randomUUID()
  const nonceFile = path.join(root, `nonce-${randomUUID()}`)
  await Bun.write(nonceFile, nonce + "\n", { mode: 0o600 })

  if (shell === "zsh")
    return {
      args: [...input.args],
      env: {
        ZDOTDIR: path.join(root, "zsh"),
        ORCHESTRA_USER_ZDOTDIR: input.env.ZDOTDIR ?? input.env.HOME ?? "",
        ORCHESTRA_SI_NONCE_FILE: nonceFile,
      },
      nonce,
    }
  // bash ignores --init-file for a login shell, so the script does the login startup itself.
  return {
    args: ["--init-file", path.join(root, "bash", "init.sh")],
    env: { ...(login ? { ORCHESTRA_SI_LOGIN: "1" } : {}), ORCHESTRA_SI_NONCE_FILE: nonceFile },
    nonce,
  }
}

// The directory the scripts live in. It sits in the shared temp directory, so it is only used when it belongs to this
// user and nobody else can write to it; otherwise another user could plant startup files this shell would run.
async function installed() {
  const root = path.join(os.tmpdir(), `orchestra-shell-integration-${process.getuid?.() ?? 0}`)
  await mkdir(path.join(root, "zsh"), { recursive: true, mode: 0o700 })
  await mkdir(path.join(root, "bash"), { recursive: true, mode: 0o700 })
  const info = await stat(root)
  if (info.uid !== process.getuid?.() || (info.mode & 0o077) !== 0) return undefined
  await Promise.all(Object.entries(SCRIPTS).map(([name, content]) => install(path.join(root, name), content)))
  return root
}

async function install(file: string, content: string) {
  if ((await Bun.file(file).text().catch(() => undefined)) === content) return
  const next = `${file}.${process.pid}.${randomUUID()}`
  await Bun.write(next, content)
  await rename(next, file)
}

const ZSH_STARTUP = (name: string) => `
# Runs the user's ${name} with their ZDOTDIR, then points back here so the next startup file is ours too.
ORCHESTRA_SI_ZDOTDIR=$ZDOTDIR
ZDOTDIR=\${ORCHESTRA_USER_ZDOTDIR:-$HOME}
[[ -f $ZDOTDIR/${name} ]] && source $ZDOTDIR/${name}
ORCHESTRA_USER_ZDOTDIR=$ZDOTDIR
ZDOTDIR=$ORCHESTRA_SI_ZDOTDIR
unset ORCHESTRA_SI_ZDOTDIR
`

const SCRIPTS: Record<string, string> = {
  "zsh/.zshenv": ZSH_STARTUP(".zshenv"),
  "zsh/.zprofile": ZSH_STARTUP(".zprofile"),
  "zsh/.zshrc": `
# From here the user's ZDOTDIR is permanent, so .zlogin and any subshell read the user's own files.
ZDOTDIR=\${ORCHESTRA_USER_ZDOTDIR:-$HOME}
[[ -f $ZDOTDIR/.zshrc ]] && source $ZDOTDIR/.zshrc
unset ORCHESTRA_USER_ZDOTDIR

if [[ -n $ORCHESTRA_SI_NONCE_FILE && -r $ORCHESTRA_SI_NONCE_FILE ]]; then
  typeset __orc_nonce
  read -r __orc_nonce < $ORCHESTRA_SI_NONCE_FILE
  rm -f $ORCHESTRA_SI_NONCE_FILE
fi
unset ORCHESTRA_SI_NONCE_FILE
[[ -n $__orc_nonce ]] || return 0

typeset -i __orc_seq=0 __orc_running=0
__orc_preexec() {
  __orc_seq+=1
  __orc_running=1
  printf '\\033]133;C;orchestra=%s:%s\\007' $__orc_nonce $__orc_seq
}
__orc_precmd() {
  local ec=$?
  if (( __orc_running )); then
    printf '\\033]133;D;%s;orchestra=%s:%s\\007' $ec $__orc_nonce $__orc_seq
    __orc_running=0
  fi
  printf '\\033]7;file://localhost%s\\007' "\${PWD//\\%/%25}"
  printf '\\033]133;A;orchestra=%s:%s\\007' $__orc_nonce $__orc_seq
  return $ec
}
autoload -Uz add-zsh-hook
add-zsh-hook preexec __orc_preexec
precmd_functions=(__orc_precmd $precmd_functions)
`,
  "bash/init.sh": `
# Stands in for the user's startup files, which --init-file would otherwise skip.
if [ -n "$ORCHESTRA_SI_LOGIN" ]; then
  [ -r /etc/profile ] && . /etc/profile
  for __orc_file in ~/.bash_profile ~/.bash_login ~/.profile; do
    [ -r "$__orc_file" ] && { . "$__orc_file"; break; }
  done
  unset __orc_file
else
  [ -r ~/.bashrc ] && . ~/.bashrc
fi
unset ORCHESTRA_SI_LOGIN

if [ -n "$ORCHESTRA_SI_NONCE_FILE" ] && [ -r "$ORCHESTRA_SI_NONCE_FILE" ]; then
  read -r __orc_nonce < "$ORCHESTRA_SI_NONCE_FILE"
  rm -f "$ORCHESTRA_SI_NONCE_FILE"
fi
unset ORCHESTRA_SI_NONCE_FILE
[ -n "$__orc_nonce" ] || return 0

__orc_seq=0
__orc_running=
# Busy until the first prompt is ready, so the commands that finish this script are not taken for the user's.
__orc_busy=1
# Works on bash 3.2, which has no PS0: the DEBUG trap fires before each command. The prompt's own commands are skipped by
# name and by the busy flag, so only what the user typed starts a mark.
__orc_preexec() {
  case "$BASH_COMMAND" in __orc_precmd*|__orc_ready*) return ;; esac
  [ -n "$__orc_busy" ] && return
  [ -n "$__orc_running" ] && return
  __orc_running=1
  __orc_seq=$((__orc_seq + 1))
  printf '\\033]133;C;orchestra=%s:%s\\007' "$__orc_nonce" "$__orc_seq"
}
__orc_precmd() {
  local ec=$?
  __orc_busy=1
  if [ -n "$__orc_running" ]; then
    printf '\\033]133;D;%s;orchestra=%s:%s\\007' "$ec" "$__orc_nonce" "$__orc_seq"
    __orc_running=
  fi
  printf '\\033]7;file://localhost%s\\007' "\${PWD//\\%/%25}"
  printf '\\033]133;A;orchestra=%s:%s\\007' "$__orc_nonce" "$__orc_seq"
  return $ec
}
__orc_ready() { __orc_busy=; }
trap '__orc_preexec' DEBUG
PROMPT_COMMAND="__orc_precmd\${PROMPT_COMMAND:+;$PROMPT_COMMAND};__orc_ready"
`,
}
