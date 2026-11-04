#!/bin/sh
# Atlas sends the prompt on stdin. `grok -p` takes it as an argument and prints the reply.
# Subscription auth is ~/.grok/auth.json. This script never prints that file.
# dontAsk alone is not a tool allowlist. Keep execution denied while inspecting the advertised toolset.
# Verbatim avoids the user-message wrapper. The one-turn budget stays unchanged.
format=${ATLAS_GROK_OUTPUT_FORMAT:-plain}
case "$format" in plain|streaming-messages-json) ;; *) exit 2 ;; esac
set --
if [ "$format" = streaming-messages-json ]; then set -- --include-partial-messages; fi
prompt=$(cat)
exec grok --no-auto-update --output-format "$format" "$@" --max-turns 1 --no-subagents --disable-web-search --tools "" --deny '*' --verbatim --permission-mode dontAsk -p "$prompt"
