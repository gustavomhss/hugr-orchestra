# Project Board

**Project Board** in the sidebar is where Maestro keeps its projects. The subtitle reads "What Maestro is building, stage by stage. Only Maestro moves cards." You never drag a card. You answer Maestro's questions, add notes and context, pause work, hold a merge, and undo. For how Maestro plans and runs the work, read [Maestro](maestro.md).

With no projects, the screen says **No projects yet**: ask Maestro to plan a project and it shows up as soon as it has a board.

## The projects list

The first screen lists your projects. Filter with **All**, **Running**, **Shipped** or **Archived**. Each project shows its health, "N of M shipped", its target date and a forecast. Health is one of **On track**, **At risk**, **Waiting on you** or **Paused**. **Archive** and **Unarchive** move a project in and out of the archived list; **Open** opens it.

When Maestro has questions for you, a **Needs you** chip with a count sits at the top. Choose it to open the inbox.

## One project

Choose **Board**, **Timeline** or **List** under **View**.

**Board** has a column per stage. A card moves left to right as Maestro works.

| Stage | Meaning |
| --- | --- |
| **Intake** | Issues mirrored from GitHub, waiting for you. |
| **Backlog** | Accepted, not planned yet. |
| **Ready** | Planned, listed "in this order". |
| **Building** | An agent is on it. |
| **Review** | "CI and checks". |
| **Queue** | Waiting in the merge queue. See [Merge queue](merge-queue.md). |
| **Shipped** | Done, grouped as **Today**, **Yesterday**, **This week** and **Earlier**. |
| **Cut** | Dropped from the plan. |

A card shows its seat, step progress ("Step 2 of 5"), an estimate, the CI result ("3 of 4 checks passed") and badges such as **Paused** or **Held before merge**. The strip above the columns shows the project's health, how many agents are on it and, if the project is paused, why.

**Timeline** draws each epic against the project's target date, with a forecast range (`P50` to `P85`) and a **Scope and progress** chart. It says "Maestro has not split this project into epics yet." until epics exist. An epic's own page has **Issues** and **Timeline** tabs and what it **Waits on**.

**List** shows issues in a table (**ID**, **Title**, **Seat**, **Progress**, **Size**, **Age**, **PR**). **Filter issues** with **All** or **Needs you**. **Group** by **Epic** or **Stage**.

## An issue

Choose a card to peek at it. **Open full page** opens it in full, and **Back to the board** returns. In the peek or page, `J` and `K` step through issues and `Esc` goes back to the board.

An issue has **Open questions**, **Steps**, **Git trail** (the branch and pull request, or "No branch yet."), **Context**, **Notes**, **Activity** and **Properties** (**Stage**, **Epic**, **Seat**, **Type**, **Estimate**, **In stage**, **Blocked by**, **Blocks**). The Git trail needs GitHub synced; otherwise it says **GitHub not synced**.

### What you can do

- **Answer** a question. Maestro's recommendation is always first. You can **Add a note to your answer (optional)**.
- **Add note**: "Tell Maestro something about this issue". If a note looks like a key or token, the board offers **Store as secret**, because notes are plain text.
- **Add files** (up to 25 MB each, or drop them on the area) and **Add secret**. A secret has a **Label** and a **Value** and goes straight to the vault; only the label shows on the board (**Sealed**).
- **Pause issue** / **Resume issue**, and **Hold before merge**. A held card waits for you at the merge.
- **Pause project** / **Resume project**. While paused, Maestro starts nothing new.
- **Undo** a change you made. The board says **Undone**.

If a change fails, the board says "That did not save. Try again."

## The inbox

The **Needs you** chip opens **What waits on you**. Each open question shows who asked and when, what Maestro recommends ("Maestro recommends ..."), which issues are paused on it or blocked by it, and the cost of waiting. Filter with **Filter by project**. Maestro asks only when a choice changes the plan. When nothing is open the inbox says "You are caught up. Maestro has no open questions."

## Intake from GitHub

Issues on GitHub appear in **Intake**. With **Auto-accept off**, nothing joins the board until you **Accept** or **Decline** it. With **Auto-accept on**, new issues join the backlog. If GitHub is not signed in on the server, the board says "GitHub is not signed in on this server. Run gh auth login to mirror issues."

## Replay

**Since you looked** counts changes made since your last visit. **Replay** plays them back, with **Play**, **Pause** and **Replay speed**, and **Exit** returns to the live board.

## Money, decisions and settings

The strip also holds three tools:

- **Money**: a chip such as "12.40 of 50.00" opens spend by **Models** and **Infra**, and by model, seat, epic and card, with a **Forecast at finish**. At 80% of the budget it says "Over 80% of the budget"; at 100% Maestro pauses new work. Some costs are marked **Not metered**.
- **Decisions**: every answered question with what was recommended, what you chose and what came of it. You can **Overturn** a decision and choose a different option.
- **Settings**: **Project settings** with **Target date** and **Budget (USD)**.

## See also

- [Maestro](maestro.md): the conductor that keeps the board.
- [Merge queue](merge-queue.md): the Queue stage.
