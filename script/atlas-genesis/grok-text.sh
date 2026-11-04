#!/bin/sh
set -eu
# Atlas sends the prompt on stdin. `grok -p` takes it as an argument and prints the reply.
# Subscription auth is ~/.grok/auth.json. This script never prints that file.
# An explicit curated profile replaces the coding agent; empty --tools means inherit, not disable.
# Verbatim avoids the user-message wrapper. The one-turn budget stays unchanged.
profile="${0%/*}/grok-agent.json"
if [ "${1:-}" = --version ]; then
  version=$(grok --no-auto-update version)
  digest=$(node -e 'const fs=require("node:fs"), crypto=require("node:crypto"); console.log(crypto.createHash("sha256").update(fs.readFileSync(process.argv[1])).digest("hex"))' "$profile")
  printf '%s; atlas-profile-sha256=%s\n' "$version" "$digest"
  exit 0
fi
format=${ATLAS_GROK_OUTPUT_FORMAT:-plain}
case "$format" in plain|streaming-messages-json) ;; *) exit 2 ;; esac
set --
if [ "$format" = streaming-messages-json ]; then set -- --include-partial-messages; fi
prompt=$(cat)
agents=$(cat "$profile")
system=$(node -e 'console.log(JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8"))["atlas-text"].prompt)' "$profile")
# Use a KNOWN nonempty allowlist, then remove its only member. Empty allowlists mean inherit.
# MCP meta-tools are denied explicitly too; the runtime canary must observe zero advertised tools.
exec grok --no-auto-update --output-format "$format" "$@" --max-turns 1 --no-subagents --disable-web-search --agents "$agents" --agent atlas-text --system-prompt-override "$system" --tools read_file --disallowed-tools read_file,search_tool,use_tool --deny '*' --verbatim --permission-mode dontAsk -p "$prompt"
