# Home

Home is the project's dashboard. Its title is **What the agents actually shipped.**, and it totals what your agents did in the project over a period you choose: tokens, hours, messages, commits and more.

## Where it lives

Home is the first entry in the sidebar. The line above the title reads **Project · {name}**. The period selector sets the window for every tile: **7d**, **30d**, **90d** or **All**. The default is **30d**.

## Start without a project

With no project open, Home asks **Pick the folder Maestro works in**, with a warning that an agent reads and changes files in the folder you trust. Choose **Choose folder and trust it** to pick one, or **Open Providers** to set up a model provider first.

## The tiles

| Tile | What it counts |
| --- | --- |
| **Tokens spent** | Tokens used in the period, compared with the period before. |
| **Hours worked** | Wall-clock time of agent turns. |
| **Messages** | Human and agent messages. |
| **Commits** | Commits on the project's current branch. |
| **Pull requests** | Open pull requests (merge requests on GitLab). |
| **Merges** | Merge commits. |
| **Models run** | How many models ran, with the provider count beside it. |
| **Failed runs** | Failed runs, as a percent and as "of N total". |

Totals come from the activity Orchestra recorded for this project (the footer calls it **local history**), and from git and the repository host for commits and pull requests.

A tile can show a state word instead of a number:

- **Not connected**: the folder has no GitHub or GitLab remote, so pull requests cannot be counted.
- **No repository**: the folder is not a git repository.
- **Unavailable**: the value could not be read.
- **Partial**: the number is incomplete. The tile gives the reason, for example that the host's command-line tool is not installed or not signed in on this server, or that the history scan stopped at its limit.

## Blocks

- **Sessions by impact** ranks the period's sessions by impact, with their tokens, messages and changed files. **View all** and **Top 5** switch the length. A session that is still going shows **running**. With no activity, the page says **No session activity in this period.** and offers **Start a session**.
- **Spend by model** shows spend per model, in tokens and cost. **Manage** opens **Settings** at **Models**. With no runs, it says **No model runs in this period.**

## Export and tracking

At the bottom of the page:

- **Export** saves the figures as a CSV file named `{project}-metrics-{period}.csv`.
- **Configure tracking** opens **Providers**, where you connect what Home reads from.

## When it does not load

| Message | What to do |
| --- | --- |
| Reading recorded activity… | Wait. The totals appear when the read ends. |
| Recorded activity could not be loaded. No totals are shown. | Choose **Retry**. |
| Recorded activity is unavailable on this server. | The server does not keep activity. There is nothing to retry. |

## Limits

- Home totals one project. Switch projects to see another.
- Pull requests and merges need a connected repository host.
