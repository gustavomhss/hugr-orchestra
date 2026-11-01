# Workspaces

Workspaces are where the work actually runs. Each workspace is a git worktree with its own branch, so agents never step on each other. The page's heading is **Where the work actually runs.**

## Where it lives

Open **Workspaces** in the sidebar's Advanced group. It needs a project whose folder is a git repository. The page lists every workspace of the repository. Each row shows its name, its branch and a badge: **local** or **sandbox** for where it runs, and **Active** or **Idle** for whether it is the one in use.

## Use a workspace

Choose **Use workspace** on a row to make it the active one. New chat drafts then start in that workspace. The button reads **Open Chat** on the workspace that is already active. If the chosen workspace is no longer valid, new drafts fall back to the repository's root folder.

## Create a workspace

1. Choose **New workspace**.
2. Enter a **Name**. It must not contain slashes.
3. Check the **Directory**. It is the parent folder where the new worktree is created, and it defaults to a folder beside the project named after it with `-workspaces` added.
4. Confirm.

The new workspace gets its own branch. If the directory or name is wrong, the dialog says **Enter a parent directory and a name without slashes.**

## Configure and delete

**Configure** opens the details of a workspace:

- **Name** is a local display name. It is kept for this profile only and does not rename the folder.
- **Directory** and **Branch** are shown for reference. The branch cannot be edited here.
- **Type** says where the workspace runs.

**Delete workspace** removes the git worktree and its files from disk, after you confirm **Delete workspace?**. It is not offered for the root folder or for the active workspace; make another workspace active first. If the workspace has uncommitted changes, the dialog asks **Discard uncommitted changes?**. Choose **Delete anyway** only when you do not need them. If the server cannot remove the directory, the page says **This server cannot remove this directory. Remove it with git.**

## When the list is empty or fails

| Message | What it means |
| --- | --- |
| Loading workspaces… | The list is being read. |
| No workspaces were found for this repository. | The repository has none to show. |
| Could not load workspaces. | Choose **Try again**. |
| Workspace information is unavailable on this server. | The server does not offer workspaces. There is nothing to retry. |
| This folder is not a git repository | New workspaces are git worktrees, so this project needs a git repository. Create one in the folder first. |

## Limits

- Deleting a workspace deletes its files from disk. Uncommitted work in it is lost unless you commit or copy it first.
- The display name you set in **Configure** stays on this device and profile.
