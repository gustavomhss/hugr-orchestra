# `atlas migrate-layout`

Move the single-file logs a repository wrote before the `.atlas/` tree into the tree, once. Atlas still reads the old
files, so a repository that never runs this keeps every record. Running it stops two branches from appending to the
same shared file, which is what the tree is for.

This page describes the **CLI** command `atlas migrate-layout`. It is CLI-only (not an MCP tool). Run it at the
repository root.

## Invocation

```
atlas migrate-layout
```

No positional, no flag.

## What it does

| Before | After |
| --- | --- |
| `.atlas/memory.jsonl` | split by each record's owner and kind: `.atlas/members/<seat>/memory/project.jsonl`, `logbook.jsonl`, `task/<taskId>.jsonl`, `pr/<prId>.jsonl` |
| `.atlas/orientation.jsonl` | `.atlas/project/orientation.jsonl` |
| `.atlas/review.jsonl` | `.atlas/project/review.jsonl` |

- Each line is copied byte for byte, so every event keeps its id, and the old file is removed.
- A memory line that names no owner and kind (a torn or hand-edited line) has no file to go to. It stays in
  `.atlas/memory.jsonl`, and the stores keep counting it as rejected, as before.
- Running it again, or after a crash part way, is safe: a line found in both places is read once.
- It changes files only. Commit `.atlas` afterwards, like any other change.

## Output and exit codes

| Code | Meaning |
| ---- | ------- |
| `0`  | the move ran; one line per log says how many lines moved, and `next:` names any memory lines that stayed |

A file that exists but cannot be read stops the command with an error before it removes that file.
