# Desktop startup errors

When the desktop app cannot start, it now says why instead of showing an empty window or nothing at all.

## The local server does not come up

Orchestra starts its own local server when it opens. If that server exits or does not answer within 20 seconds, the start screen shows the reason, followed by the last lines the server printed (for example a database or permission error). Before, you only saw that the server could not be reached.

If you have a healthy remote server configured, the app connects to it instead and keeps the failure in its diagnostics.

## The app itself fails before a window opens

If the app fails very early (for example an unreadable settings file), it shows a dialog titled "HuGR Orchestra could not start" with a short message and the log folder, then exits. The log folder is `logs` inside the app's data folder; each run has its own timestamped folder, and `main.log` has the full error.

Send that folder, or use Help > Export debug logs when the app does open, when you report the problem.
