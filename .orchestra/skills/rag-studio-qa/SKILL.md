---
name: rag-studio-qa
description: Run Rag Studio as a user and check the result outside the screen. Use when someone wants QA, a simulation, user stories, a sitting, or an end-to-end check of Rag Studio, even if they only say "usa o estúdio", "simula um usuário", or "roda o QA".
---

# Rag Studio, as a user

The screen can look finished and still be wrong. Drive the same actions a person takes, then check the HTTP API. A green screen with a disagreeing API is a failure. J01–J10 are a sitting, not a script result. The latest sitting is `SITTING.md`. Do not mark them passed from this skill.

## Before you start

Use an isolated server. Never point this at the owner's Orchestra database or the app they are using.

The preview recipe is `packages/server` started with a fresh `ORCHESTRA_DB`, and the web app pointed at that port. The stories runner talks only to that API.

```sh
python3 .orchestra/skills/rag-studio-qa/scripts/run-stories.py
```

It reads `RAG_STUDIO_URL` (default `http://127.0.0.1:4097`), `RAG_STUDIO_TOKEN` (Basic token, or `RAG_STUDIO_PASSWORD` with username `orchestra`), and `RAG_STUDIO_DIR` (the open project directory). It creates `corpus/` and `repo-atlas/` under that directory. Exit 0 means every oracle passed. Exit 1 means stop and fix the module before calling the sitting done.

## What a person does

Say the stories in these words. Do not tell the runner which button to press. The runner performs the action the screen would send.

1. Open the studio on an empty folder. Nothing is listed.
2. Admit a note that lives in that folder and is not project source. It shows not yet read.
3. Read it. It shows read. The cut is the file's own text.
4. Ask for a sentence that is in the note. Exactly one diagnosis comes back, and the span bytes contain that sentence. The payload does not say the model used it.
5. Ask for a sentence that is not in the note. The light is not in the corpus, and there is no span.
6. Point at a file inside a git project. The studio refuses it as Atlas and does not list it.
7. Point at a file outside the open folder. The studio refuses it. Nothing new is listed.
8. Ask to turn embedding on. It stays off.
9. Ask to run two maintenance passes at once. That is refused.
10. Remove the note. The list no longer has it.

## After the runner

Open `/orchestra/rag-studio` on the same isolated server. Look, and write what you see. Do not convert a look into a pass.

- J01 the four lights are readable in one glance, without hover.
- J02 the cut is on the source text, not only a detached card.
- J03 maintain has four separate controls and no reindex button.
- J04 when retrieval is unnecessary, the screen says so in words.
- J05 every admitted file shows read, failed, or not yet read, and no other path.
- J06 a hit shows the span on the source text. A miss shows no span.
- J07 a sent light does not say the model used the span.
- J08 after one boundary change and a separate recut, saved questions say what changed.
- J09 a removed file disappears from the list.
- J10 exactly one light is on when the files are read. None is on when the only file is unread or failed.

If the runner failed, fix that story before asking the owner to judge the screen.
