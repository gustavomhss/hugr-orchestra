# General settings

**Settings > General** holds the switches that change how the app behaves day to day. This page lists every row, in the order the screen shows them. The sections that only exist in the desktop app are marked. For the other settings sections, read [Settings](settings.md).

## Top of the page

| Row | What it does |
| --- | --- |
| **Language** | "Change the display language for HuGR Orchestra". |
| **Auto-accept permissions** | Approves permission requests automatically in the open session only. Other sessions are not affected. With no session open the row is off and says "Open a session to turn this on. It applies to that session only." See [Permissions](permissions.md). |
| **Terminal shell** | The shell used by the terminal and by agent tools. **Auto (Default)** picks one for you. A shell the agent tools cannot use is listed as "<name> (terminal only)". If the list cannot load, the row says "Could not load the shells on this server." with **Try again**. |
| **Janitor assistant** | Shows Janitor findings and notifications. Off by default; turn it on when you want proactive maintenance advice. |
| **Show reasoning summaries** | "Display model reasoning summaries in the timeline". |
| **Expand shell tool parts** | Opens shell tool blocks in the chat timeline by default. |
| **Expand edit tool parts** | Opens edit tool blocks in the chat timeline by default. |

## Appearance

Color palette, wallpaper and the three fonts (**UI Font**, **Code Font**, **Terminal Font**).

## System notifications

Three switches: **Agent**, **Permissions** and **Errors**. Each one shows a system notification when that happens: the agent finishes or needs attention, a permission is required, or an error occurs.

## Sound effects

The same three rows: **Agent**, **Permissions** and **Errors**. Each plays a sound for that event. Pick **None** to silence one, or choose a sound such as **Alert 01**, **Bip-bop 01**, **Staplebops 01**, **Nope 01** or **Yup 01**. Choosing a sound plays it once so you can hear it.

## Updates (desktop app)

Appears in the desktop app when updates are available to you. **Check for updates** has a **Check now** button. While it works the button reads **Checking...** or **Downloading… N%**. When the app cannot install the update itself, the row says "Version X is available. Download it from its release page and install it." and the button becomes **Download**.

## Display (desktop app)

**Pinch to zoom**: "Allow trackpad pinch and Ctrl-scroll gestures to zoom".

## Live seat (desktop app)

Appears in the desktop app when the live seat is available. See [Live meetings](live-meetings.md).

- **Meeting**: "Listen to this meeting and answer in the overlay". Shows "A meeting is running" while one is on.
- **Speech-to-text key (Deepgram)**: paste a key and choose **Save**. The key goes to the system keychain, and once saved the row says "A key is saved. Enter a new one to replace it." Choose **Remove** to delete it. Without a key, meetings do not start.
- **Hide from screen sharing**: "Keep the overlay out of screen shares and recordings".

## Advanced

| Row | What it does |
| --- | --- |
| **File tree** | "Show the file tree panel in sessions". |
| **Command palette** | "Show the search and command palette button in the title bar". Off by default. The palette itself works either way. See [Search](search.md). |
| **Server status** | "Show the server status button in the title bar". |
