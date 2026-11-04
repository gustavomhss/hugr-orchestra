# Desktop startup errors

When the desktop app cannot start, it now says why instead of showing an empty window or nothing at all.

## The local server does not come up

Orchestra starts its own local server when it opens. If that server exits, the start screen shows the reason at once, followed by the last lines the server printed (for example a database or permission error). A server that is still running but has not answered yet gets up to two minutes before the app gives up on it. Before, you only saw that the server could not be reached.

The first launch after you install or update an unsigned build is slower: macOS scans the new server program before its first run, which can take about half a minute. Later launches skip that scan.

If you have a healthy remote server configured, the app connects to it instead and keeps the failure in its diagnostics.

## The server's own folder

The local server runs in a folder of its own, `global` inside the app's data folder, which stays empty. Requests that name no project, such as the provider and model lists Home shows first, use that folder. The server used to run in your home folder, so every start booted a workspace for your whole home: it watched every file under it and took about three seconds longer. Projects and sessions are unaffected; they always name their own folder.

## What happens first

The window paints before the app looks for updates or tidies its saved window data; both now wait until the first window is shown. While the local server starts, the app already loads the Home and session screens, and it does not ask the server whether it is up a second time once the server has answered the app's own startup check.

## The app itself fails before a window opens

If the app fails very early (for example an unreadable settings file), it shows a dialog titled "HuGR Orchestra could not start" with a short message and the log folder, then exits. The log folder is `logs` inside the app's data folder; each run has its own timestamped folder, and `main.log` has the full error.

Send that folder, or use Help > Export debug logs when the app does open, when you report the problem.
