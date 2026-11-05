---
name: maestro-orchestra-errors-config
description: What an invalid Orchestra config file looks like, what the error names, and how to fix or sidestep it.
internal: true
when: Orchestra stops at start naming an orchestra.json or orchestra.jsonc, or the owner asks why a setting is rejected.
not-when: A setting is accepted but seems ignored (use the config leaf for load order).
covers: []
---

# Config errors

An invalid config file stops Orchestra with `Config.InvalidError`. Orchestra used to skip a broken file and run on defaults; it no longer does. The same applies to `orchestra.json` and `orchestra.jsonc` in the global folder, in the project, and under `.orchestra/`.

## What the error names

- Syntax error: the file path, the kind of problem (for example a missing comma) and the position.
- Schema mismatch: the file path and the key (for example `model` must be a string). Decoding reports all errors, not only the first (`errors: "all"`).
- A file that cannot be read gives the path and the read error.

## Fix

1. Open the file the error names.
2. Fix the syntax or the value. Comments and trailing commas are allowed in `.json` and `.jsonc`.
3. Start again. To run without the file for now, rename or move it.

## Things that are not errors

- An unknown extra key is ignored (`onExcessProperty: "ignore"`).
- A file in an older format is upgraded on load rather than rejected.

## Related errors

- Instructions that are a URL fail with `instructions must be local file paths; remote URLs are not supported (<url>)`.
- A project config that declares MCP commands, plugins, formatters or LSP commands only runs them when the project is trusted in the global config. Not trusted is not an invalid file; the entries are skipped.
- To check a project config is not the cause, set `ORCHESTRA_DISABLE_PROJECT_CONFIG` for one run.

## For Maestro

Never edit the owner's config to fix the error unasked. Name the file and the key, say the fix, and ask. If the error is in the global folder, that folder is `~/.config/orchestra` unless `ORCHESTRA_CONFIG_DIR` is set.
