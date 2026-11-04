#!/bin/sh
# Atlas sends the prompt on stdin. `grok -p` takes it as an argument and prints the reply.
# Subscription auth is ~/.grok/auth.json. This script never prints that file.
# dontAsk denies every tool, so the model answers from the prompt only.
prompt=$(cat)
exec grok --no-auto-update --output-format plain --max-turns 1 --no-subagents --disable-web-search --permission-mode dontAsk -p "$prompt"
