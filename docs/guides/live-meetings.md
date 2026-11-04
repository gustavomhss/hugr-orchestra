# Live meetings

The live seat is a meeting copilot. It hears your call, answers your questions in a small overlay, and turns the
meeting into a card of decisions, commitments and questions. In the app it is the "Flight Engineer" page in the
sidebar. Everything it records stays in the local database on this Mac.

## Before the first meeting

You need:

- **macOS.** Hearing the call (system audio) needs macOS 14.2 or later. On older versions only your microphone is
  heard.
- **A speech-to-text key.** Transcription uses Deepgram. Paste a Deepgram API key in Settings > General ("Speech-to-text
  key") or on the Flight Engineer page's settings. It is stored in the system keychain and never shown again. Without it
  a meeting does not start ("Add a speech-to-text key in Settings first").
- **An answer model.** Answers and the meeting card come from a model. With the field empty the seat uses your default
  model, so any connected provider works. To pick one, enter its id as `provider/model`.

The Flight Engineer page shows a readiness list (microphone, system audio, speech-to-text key, answer model) so you can
see what is missing before you start.

## The first start

1. Start a meeting from the Flight Engineer page, the menu bar item, the command palette ("Start meeting") or
   Settings > General > Meeting.
2. Answer the consent question: whether the other people know the meeting is transcribed, and what to keep afterwards.
   "Keep the transcript" keeps quotes you can search later; "Keep notes only" drops the transcript once the card is
   written.
3. Grant the two macOS permissions when asked: **Microphone** (your voice) and **Screen Recording** (the call's audio,
   and a screen frame when you ask the seat to look). macOS has no prompt for Screen Recording, so the app opens the
   Privacy pane; turn the app on there. A denied permission turns that sense off; the rest keeps working.

The recording indicator stays visible while a meeting runs.

## During the meeting

| Action | Default hotkey |
|---|---|
| Ask about the call | `⌘⏎` |
| Look at the screen (sends one frame) | `⌘⇧⏎` |
| Show or hide the overlay | `⌘\` |
| Stop the meeting | `⌘⇧.` |
| Previous or next answer | `⌘[` / `⌘]` |

The hotkeys exist only while a meeting runs and can be changed in the page's settings. Resetting the hotkeys and
removing the transcription key both ask you to confirm first. You can also click the overlay's
field and type a question; focus goes back to your call app when you send it. Quick actions ("What should I say?",
"Follow-up questions", "Fact-check", "Recap so far") are one click each.

The seat can also recall your earlier meetings and open commitments. Answers say where each fact comes from: heard in
the meeting, seen on screen, or from memory of an earlier meeting.

Suggestions (the seat speaking without being asked) are off by default.

## Hiding the overlay from screen sharing

"Hide from screen sharing" (on by default) keeps the overlay out of screen shares and recordings. It was checked with
Google Meet in Chrome sharing the full screen. Zoom and Teams have not been checked yet. If it matters, test it once
before a real meeting by watching your own share from a second device.

## After the meeting

Stop ends capture and the hotkeys at once. The card arrives when the model finishes. On it you confirm, dispute or
dismiss items, track commitments, and confirm new people. A dismiss or handoff that fails comes back with an error
instead of staying hidden, and its buttons wait until the request ends. "Send to Maestro" hands the items you choose to Maestro as one
message; Maestro does not act on them until you ask. Follow-up drafts are for you to copy: nothing is sent outside
Orchestra.

A card that fails shows its reason and is not retried.

## Deleting

Delete a meeting from its card or the meetings list. Its transcript, items and proposals go; people stay in your
address book. Deleting the chat session keeps its meetings.

## Privacy

Meeting data stays in Orchestra's local database. It is never synced, uploaded or sent to telemetry. Only the audio
goes to Deepgram for transcription, and the text you ask about goes to your answer model's provider.
