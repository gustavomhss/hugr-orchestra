# Standard native shell model projection

The standard Orchestra shell now uses the one approved `hugr-lean/core` backend
dependency after native execution and baseline policy/plugin processing. Commands,
permissions, exit status, streamed metadata and lifecycle are not rewritten.

## Eligibility and configuration

Native ShellTool issues an owner-bound capability only for complete nonempty
in-memory output from an actual exit-zero call. Timeout, abort, generic truncation,
blocked toolkit output, missing call identity and synthesized no-output text do
not issue a capability. Tool names or serialized metadata cannot impersonate it.

When configuration is available, filtering is enabled unless explicitly disabled:

```json
{
  "tool_output": {
    "lean": { "enabled": false }
  }
}
```

Unknown commands/grammars, failed processing, wrong owners, policy mutations or
whole-model-view budget failure preserve the existing approved result. Core
processor, not the adapter, owns command recognition and evidence preservation.

Before/after plugins and installed ToolSafety hooks retain their baseline view.
Any external plugin mutation invalidates the native mapping, including root
outcome fields and unknown extensions. Known append-only installed policy text
survives the selected projection. Only output text changes; other result fields
remain those of the approved object.

## Persistence and measured proof

Existing SessionProcessor persists the returned selected output once. The immediate
next provider request and canonical replay lowering reuse that saved text; no
history re-filtering or new model call is introduced.

Focused native proof executes real `go test -v .` through actual ShellTool and
SessionPrompt with only the HTTP model scripted. It covers enabled/disabled,
command failure, plugin text/root-error mutations, unsupported command arguments,
and native truncation. Each next provider tool result is correlated by call ID
and equals durable/replayed text exactly. Tests run through the repository's
scoped GitHub CI on Linux and Windows; not against a paid model or restarted app.

The dependency is the approved immutable 0.2.0 package with source/license/hash
record in `packages/core/vendor/README.md`. Expansion/release stays separate.
Certified complete-spool filtering, original-recovery UI, an alternate Core
registry adapter and Claude SDK result eligibility are separate integration cuts;
this standard-shell proof does not claim those boundaries.
