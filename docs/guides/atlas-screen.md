# The Atlas screen

**Atlas** in the sidebar (inside the Advanced group) opens a screen that shows what Atlas knows about the open project. This page walks through the screen. For what Atlas is, how facts are pinned to code and what drift means, read [Atlas](atlas.md).

## Set up Atlas

A project with no `.atlas/` folder at its root shows **Atlas has no store in this project**. Choose **Set up Atlas**. Orchestra:

- writes `.atlas/policy.json`, which lets you write facts anywhere in the project;
- adds `.atlas/*` to `.gitignore`;
- indexes the code into `.atlas/index.scip`. A large project can take a few minutes.

Atlas refuses to set up in two cases. It needs a git repository, so run `git init` first. It also needs to know who you are, so set `git user.email` in the project. If indexing fails, Atlas is still set up, without an index, and the message says why.

If the server does not provide Atlas, the screen says **This server does not provide Atlas.**

## The rail

The left rail has these pages:

| Group | Page | What it shows |
| --- | --- | --- |
| Main | **Home** | The store at a glance, its health checks, and how Atlas travels with the repository and stays free of drift. |
| Main | **Explore** | The units and facts. Switch between **Graph**, **Map** and **List**. |
| Main | **Review** | What waits for a decision. |
| Main | **Activity** | What agents read, saved and were held on. |
| Engine | **History** | How Atlas learns a repository: where it picks places, how it checks answers, what it stages. |
| Engine | **Architecture** | How Atlas keeps knowledge: write, read and store. |
| Engine | **Ownership** | Ownership, packaged as skills: one `SKILL.md` per part of the code. |
| Engine | **Follow one fact** | A real sentence from the store, from the moment History proposed it to the moment its code moved. **Another fact** picks a different one. |
| MEMORY | One entry per seat | What each seat has saved. A seat with no memory bound shows **off**. |

The footer of the rail tells you where the store lives: **Local store**, **Store in git · read-only**, **Store in git · locked**, or **Not connected**. **Refresh** reloads the data. The rail also shows **A health check needs attention** when Home has a failing check.

## Home

Home leads with **Health**: either **All N checks pass** or how many need attention. It covers store access, stored objects, proofs, the code index, memory and the secret scanner. Each check names the command that fixes it. Every memory save is scanned for secrets first, and a save is refused when no scanner is available.

Below it, **It travels with your repo** explains what is committed (memory, orientation, policy, ownership skills) and what is rebuilt on each machine (facts, the code index, staging). **How Atlas stays free of drift** explains what happens to facts and ownership skills when the code under them changes.

## Explore

Explore shows a summary such as "12 units · 340 facts · 70 dependency links".

- **Graph**: each circle is a unit, arrows are dependencies.
- **Map**: rings of units, folders and files. Hover to name a slice, click to go in, and the centre steps back out. **Open the unit** goes to the unit's page.
- **List**: cards with the unit, its fact count and how many changed. **Sort** by **Most facts**, **Most changed**, **Most drift (%)** or **Name**.

Filter by **All**, **Code**, **Docs**, **Harness** or **Root**. **Search facts** narrows the facts; **Clear** resets it. **Check a claim…** asks the code index whether a claim is provable (for example that something in a scope uses a target). Nothing is saved.

If the map library did not load, you see **The map library did not load (offline?).**

## Review

Review lists decisions. It says "N things wait for a decision." or **Nothing waits for a decision.** It has three tabs:

- **Changed code**: facts whose code changed. Read each one against its diff. Filter by unit or commit. **Merge check…** asks whether a merge from a base would be blocked by changed facts.
- **Mined**: suggestions from history. Agents see none of them until you accept. **Accept all…** takes them in one step.
- **To ratify**: facts proposed to govern how agents work. Open one to ratify it.

**Find new facts…** opens **Mine candidate facts**: History asks a connected model about the places the most code depends on and checks every answer. What survives waits in **Mined** until you accept it. Without a connected provider the sheet says **No connected model. Connect a provider first.** **More producers** lists the other ways to produce facts: derive links, record code changes, find hollow tests.

## The fact panel

Opening a fact shows a panel on the right. It has the sentence, **What changed** when the code moved, **Code it's about**, **How it was derived**, its **History** (mined, accepted, made core, ratified, replaced) and **Related** facts: the same file, equivalents, broader and narrower claims, and the files that import it. On a store kept in git, a fact with no proof shows **Not sent to agents: this store is in git and the fact has no proof.**

## Activity

Activity records what agents read from Atlas, what they saved, and when they were held. Filter by **All**, **Reads**, **Memory**, **Holds** or **Code**. A held call returns its reason and evidence. It is built from the receipts Orchestra keeps on each tool call, so it reads **Nothing recorded yet.** until an agent has used Atlas.

## Memory

Each seat under MEMORY has a page: **Memory on** or **Memory not bound**. It shows **Project memory** (the rules the seat carries into every request), the **Memory log** (every checkpoint it wrote, grouped by task or PR) and counts of rules and checkpoints. Filter checkpoints by **Done**, **Paused** or **Blocked**. Memory is saved in the worktree, merges with the branch, and shows in the pull request diff.

## Search and shortcuts

Choose **Search** in the top bar, or press `/`, to search facts, files, areas, memory and pages. In a list that has its own search box, `/` focuses that box instead. Results are grouped as **Go to**, **Units**, **Files**, **Facts**, **Memory** and **Actions**.

| Keys | Action |
| --- | --- |
| `/` | Search |
| `?` | Keyboard shortcuts |
| `Esc` | Close the fact panel |
| `j` / `k` | Next / previous in a list or open fact |
| `Enter` | Open |
| `g` then `o` | Overview (Home) |
| `g` then `k` | Knowledge (Explore) |
| `g` then `r` | Review |
| `g` then `a` | Activity |
| `g` then `h` | Health (on Home) |
| `g` then `y` | Memory |

Shortcuts do not fire while you type in a field.

## Stores kept in git

If `.atlas/` is committed, Atlas treats the store as read-only and sends agents only machine-proven facts. A banner says so: "This store is in git, so Atlas sends agents only machine-proven facts: 0 of N today. Changes are read-only." **Why** explains it and **Dismiss** hides it. To curate facts in that project, stop tracking `.atlas/projection*.json` and `.atlas/cas/`. Home lists the exact steps.

## See also

- [Atlas](atlas.md): the knowledge layer itself.
- [Context](context.md): how Atlas rules reach each request.
- [Maestro](maestro.md): how the conductor uses Atlas ownership.
