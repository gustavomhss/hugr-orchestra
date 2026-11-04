#!/bin/sh
# Atlas sends the prompt on stdin. `grok -p` takes it as an argument and prints the reply.
# Subscription auth is ~/.grok/auth.json. This script never prints that file.
# Remove built-in tools explicitly; dontAsk alone is not a tool allowlist.
# Verbatim avoids the coding-agent prompt wrapper. The one-turn budget stays unchanged.
prompt=$(cat)
exec grok --no-auto-update --output-format plain --max-turns 1 --no-subagents --disable-web-search --tools "" --deny '*' --verbatim --permission-mode dontAsk -p "$prompt"
