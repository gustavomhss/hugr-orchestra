# Artifacts and background processes

Two parts of a session show what the agent produced and what it left running: the **Artifacts** panel for files the agent made, and the **Background processes** pill for work it started and did not wait for. Neither is a sidebar page. Both live inside a chat.

## Artifacts

Artifacts are files an agent attaches to a session, such as an image, a PDF or a spreadsheet. The **Artifacts** toggle in the session header and the **Artifacts** tab appear only once the session has at least one artifact.

### Reading one

Open the tab and pick an artifact from the list. The detail shows its kind (**Image**, **Video**, **PDF**, **Spreadsheet** or **File**), its size and its revision as **rev N**. Images, video and PDFs preview in place. A spreadsheet previews its first rows only (**Showing the first {rows} rows.**); download it for the rest. Other files say **This file has no inline preview.** **Load more** continues a long list.

An artifact marked **Not verified** was seen or acknowledged by the agent, but nothing checked its content against your request. Look at it yourself before you rely on it.

### Actions

| Button | What it does |
| --- | --- |
| **Download** | Saves the file to your computer. |
| **Pin** / **Unpin** | Marks the artifact **Pinned**. Unpin it before you remove it. |
| **Share** | Sends the artifact to other sessions in the same location. |
| **Remove** | Takes it out of this session. |
| **Retry** / **Cancel** | Repeat or abandon an action that is pending or failed. |

**Share** opens **Share artifact**. Choose the sessions and confirm with **Share**. If the location has no other session, the dialog says **This location has no other sessions.**

**Remove** asks **Remove from this session?**. The artifact leaves this session only; sessions it was shared with keep their copy. If the server refuses, the page says **The server refused the change. Unpin the artifact before removing it.**

### When an action fails

The message says what went wrong: **This session is not allowed to change that artifact.**, **The server sent a reply this app could not read.**, or **The request failed. Check the connection and try again.** The last kind is **The change may have been saved. Retry to confirm it.** Choose **Retry**: when the server already has the change, the page reports **Original request reused.** instead of applying it twice.

## Background processes

When an agent starts something it does not wait for, such as a server or a long job, the session header shows a pill with the count, for example **2 running**. Its title is **Background processes**. Open it to see each process and its state.

The list shows the latest status the agent observed, not live state. The pill says so: **Latest status the agent observed, not live state.** A process can have ended since. Ask the agent to check, or look at the process yourself, before relying on it.

States you may see:

| State | Meaning |
| --- | --- |
| **Starting**, **Submitting**, **Submitted** | The agent is starting it. |
| **Running** | Last seen running. |
| **Completed**, **Failed**, **Cancelled** | It ended. |
| **Stopping** | The agent asked it to stop. |
| **Unknown**, **Lost** | The agent can no longer see it. |

## Limits

- The panel has no button to stop a process. Ask the agent to stop it, or stop it on the machine where it runs.
- Artifacts belong to a session. Removing one does not delete the sessions it was shared with.
