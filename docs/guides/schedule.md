# Schedule

Schedule runs a task for Maestro at a time you choose, once or on a repeat. Each run is a normal session in the project, so you can open it and read what happened.

## Where it lives

Open **Schedule** in the sidebar's Advanced group. It needs a project; without one the page shows an empty state. The page lists the project's tasks, has a search box (**Search scheduled tasks**) and a **Schedule task** button.

A note under the list says where the tasks are kept:

- **Saved on the server for this project.** Due tasks run on the server even while the page is closed.
- **Saved on this device for this project.** Due tasks run only while the page is open.

If tasks were saved on the device before the server could hold them, Orchestra moves them to the server. If that fails, the page says **Could not move the tasks saved on this device to the server** and gives the reason.

## Schedule a task

1. Choose **Schedule task**.
2. Fill in the dialog. Time is shown in your local timezone.
   - **Name**: what the task is called in the list.
   - **What to run**: the instruction Maestro receives, written as you would write it in chat.
   - **Cadence**: **Once**, **Every hour**, **Daily** or **Weekly**.
   - **Next run**: the date and time of the first run.
3. Choose **Schedule**.

The dialog refuses an empty name (**Name the task.**), an empty instruction (**Describe the task.**), an invalid time (**Choose a valid time.**) and a time in the past (**Choose a future time.**).

## Reading the list

Each row shows the task name, its cadence and a status: **Scheduled** or **Paused**. Below it you see **Next:** the time of the next run, **Last:** the time of the last run, and how many runs the task has made.

- **Enable {name}** is the switch that resumes or pauses a task.
- **Run now** starts the task immediately, without waiting for its time. It is off while that task is running.
- **Edit** opens the same dialog. There, **Remove task** asks **Remove this item?** before it removes anything.
- **Open session** opens the session the last run started.

## When a run does not happen

- **Missed.** A run more than a day late, or overtaken by the next one, is marked **Missed** with its date. It is not run afterwards. Use **Run now** if you still want it.
- **Failed.** The row says **The last run failed on {date}. Run it again, or edit the task if it keeps failing.** **Technical details** shows the reason from the server.
- **Server unreachable.** **Could not load scheduled tasks from the server.** appears with **Retry**. If a refresh fails after the list has loaded, the list stays and a warning says it may be out of date.
- **Run, update or remove failed.** The page names the task and the reason, for example **Could not run {name}**. Nothing changed; try again.

## Limits

- A task runs in the project where you created it.
- Tasks kept on the device do not run while the page is closed.
