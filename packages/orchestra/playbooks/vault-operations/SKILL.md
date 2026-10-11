---
name: vault-operations
description: Set up and use the 1Password CLI (`op`) to consume secrets safely - sign-in via desktop app integration or service account, listing vaults and item metadata, and running commands or rendering config with secrets injected (`op run`, `op inject`) without ever printing them. Use when the user asks to fetch, use or wire a secret from 1Password into a command, environment or config file, or to set up the 1Password CLI.
---

# Vault Operations (1Password CLI)

Follow the official CLI get-started steps (https://developer.1password.com/docs/cli/get-started/). Do not guess install commands.

## References

Read from this skill's own directory with `read`:

- `references/get-started.md` - install, desktop app integration, sign-in flow
- `references/cli-examples.md` - `op` examples

## Secret-handling rules (apply to every step)

- Never print secret values. Do not run `op read` or `op item get --reveal` so that the value lands in tool output, chat, logs, commit messages or code. Tool output is visible to the model and to transcripts.
- Never ask the user to paste a password, token or one-time code into chat, and never write secrets to files yourself.
- Prefer `op run` and `op inject` so secrets are resolved at execution time and exist only in the child process or an owner-only output file the user designated.
- Do not use `op run --no-masking` and do not run commands whose job is to echo a secret (`printenv`, `env`, `cat` of a rendered file).
- Reference secrets by `op://vault/item/field` URIs; those references are safe to show and store.
- Confirm with the user before creating, editing or deleting items, and before writing any rendered secret file to disk.

## Workflow

1. Check OS and shell.
2. Verify the CLI is present: `op --version`. If missing, point the user to the official install doc (macOS: `brew install 1password-cli`).
3. Detect the auth mode the user has set up:
   - **Service account:** `OP_SERVICE_ACCOUNT_TOKEN` is set in the environment (headless, CI). Test only whether it is set (`[ -n "$OP_SERVICE_ACCOUNT_TOKEN" ] && echo set`); never echo the value.
   - **Desktop app integration:** the 1Password desktop app is running and unlocked with CLI integration enabled (typical on desktops).
   - **Standalone signin:** neither of the above; `op signin` prompts for credentials each session.
4. Verify access with `op whoami` before any secret use. With multiple accounts, use `--account` or `OP_ACCOUNT`.

## Running `op` per auth mode

### Service account (preferred for headless use)

Run `op` directly with `bash`; there is no sign-in step. The user sets `OP_SERVICE_ACCOUNT_TOKEN` in the environment that launches Orchestra; you never see or set the value.

```bash
op vault list
op item list --vault app-prod
```

### Desktop app integration

Run `op` directly with `bash`. Do not wrap it in a multiplexer or a separate login shell: the integration uses a per-user IPC channel that may be unreachable from a different environment context. The first call may trigger Touch ID / Windows Hello / system auth for the user.

```bash
op whoami
op vault list
```

If a call returns `1Password CLI couldn't connect to the 1Password desktop app`, do not change how you run it. Ask the user to confirm the desktop app is running, unlocked and has CLI integration enabled (see `references/get-started.md`), then retry directly.

### Standalone signin (no app, interactive password)

This is the only mode that needs a persistent shell. `op signin` prints a POSIX `export OP_SESSION_...` line that must be applied with `eval` in the shell that will run later commands; per-command shells lose that state. Use `process_control` to hold one POSIX shell:

1. `process_control` action `start` with command `/bin/sh` (a POSIX shell, even if the user's login shell is fish or PowerShell; on Windows prefer desktop integration or a service account instead).
2. `process_control` action `submit` with `eval "$(op signin --account my.1password.com)"`, then action `log` to read the output.
3. If it asks for a password, MFA or account choice, stop and ask the user to complete sign-in themselves; do not type their credentials. Do not queue follow-up input while a prompt is open; poll with `log`/`wait` until the prompt returns.
4. Verify in the same process: `submit` `op whoami`, then `op vault list`, and read `log`.
5. Keep that process running and reuse it (`submit` + `log`) for later `op run` / `op inject` calls. Action `stop` ends the session when finished.

If sign-in without the app is wanted long term, the user should run `op account add` first.

## Using secrets

Resolve at execution time; the value never reaches you.

```bash
# Run a command with env vars resolved from op:// references (values masked in output)
export DB_PASSWORD="op://app-prod/db/password"
op run -- ./scripts/migrate.sh
op run --env-file="./.env.tpl" -- ./scripts/deploy.sh

# Render a config from a template (secrets resolved into the output file only; confirm the destination first)
op inject -i config.yml.tpl -o config.yml
```

Check that an item or field exists without revealing it:

```bash
op item get "db" --vault app-prod --format json | jq 'del(.fields[].value)'
op vault list
op account list
```

Prefer templates (`.tpl`, `.env.tpl`) containing only `op://` references so they are safe to commit. Never commit an injected output file; make sure it is gitignored before writing it.

`op read` is appropriate only when piped straight into a consumer, never displayed:

```bash
op read "op://app-prod/db/password" | some-cli login --password-stdin
```

## Troubleshooting

If a command returns "account is not signed in":

- service account: the user must re-export `OP_SERVICE_ACCOUNT_TOKEN` in the launching environment
- desktop app: confirm the app is running and integration is enabled
- standalone: re-run `op signin` with `eval` inside the same persistent shell and let the user authorize

## Web logins

For website passwords and one-time codes, use the user's browser or password-manager autofill flow rather than reading the secret through `op`. Reading a web password into the conversation defeats the no-exposure design; use `op` for secrets consumed by commands and config.

Adapted from openclaw/openclaw@2a305612539ccbb63a19b2030a05158dddd42a64 skills/1password (MIT).
