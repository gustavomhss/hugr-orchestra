# Desktop startup errors

When the desktop app cannot start, it now says why instead of showing an empty window or nothing at all.

## The local server does not come up

Orchestra starts its own local server when it opens. If that server exits or does not answer within 20 seconds, the start screen shows the reason, followed by the last lines the server printed (for example a database or permission error). Before, you only saw that the server could not be reached.

If you have a healthy remote server configured, the app connects to it instead and keeps the failure in its diagnostics.

## The server's own folder

The local server runs in a folder of its own, `global` inside the app's data folder, which stays empty. Requests that name no project, such as the provider and model lists Home shows first, use that folder. The server used to run in your home folder, so every start booted a workspace for your whole home: it watched every file under it and took about three seconds longer. Projects and sessions are unaffected; they always name their own folder.

## The app itself fails before a window opens

If the app fails very early (for example an unreadable settings file), it shows a dialog titled "HuGR Orchestra could not start" with a short message and the log folder, then exits. The log folder is `logs` inside the app's data folder; each run has its own timestamped folder, and `main.log` has the full error.

Send that folder, or use Help > Export debug logs when the app does open, when you report the problem.
