# Actions

Actions is the page for a project's automation: the GitHub Actions workflows or GitLab CI pipelines of its repository, their runs and logs, and a list of pipelines you keep for running commands on the server. Its sidebar entry is **Actions**; the page header reads **CI/CD**.

## Where it lives

Open **Actions** in the sidebar. It needs a project. The top of the page has five tabs:

- **Guardrails**: checks of your change against the project's rules. See below.
- **Workflows**: the workflow library.
- **Runs**: run history.
- **Resources**: artifacts, environments, secrets and variables, runners, caches and schedules.
- **Settings**: the connection, what you can do through it, and policy.

**Refresh** reloads the page's data. **Local pipelines**, at the bottom of the left rail, opens the separate list described at the end of this guide.

## Connect a repository

Actions reads and acts through the repository's host, using the host's own command-line sign-in on the server. The page does not ask for your password.

1. Open a project whose folder is a git repository with a GitHub or GitLab remote.
2. If the page says **Connect this repository to inspect its automation.**, choose **Connect repository**.
3. Select one explicit remote and host, then confirm. Enterprise and self-managed hosts require a configured connection, and another server is never selected silently.

The strip under the heading shows the provider (**GitHub Actions** or **GitLab CI**), the repository path, its host and the connection state. **Remove connection** asks **Remove this repository connection?** and drops only the link in Orchestra.

If the folder has no remote, the page says **This project is not a Git repository. Actions needs one with a GitHub or GitLab remote; local pipelines still work.** If the host is not signed in, it says **Sign in to the provider CLI on this server, then try again.** Sign in on the server, then choose **Refresh**. If the server does not offer Actions, the page says **This server does not expose Actions. Local pipelines remain available.**

## Workflows

The **Workflows** tab lists the repository's workflows (on GitLab, its CI configuration files). Search with **Search workflows or source paths…**. Opening one shows its **Graph**, its **Executions** and its **Source**.

- **Run workflow** (**Run pipeline** on GitLab) opens a dialog. Pick the **Branch or tag**, fill in the **Run inputs** the workflow declares, and confirm. A new execution uses the revision at that ref.
- **Enable** and **Disable** turn a workflow on or off at the host.
- **New workflow** (**New configuration** on GitLab) opens a draft with a **Name**, **Path** and **Template** (**Build and test**, **Release** or **Blank configuration**). It creates a local draft only. It does not enable or run anything.

To publish a draft, use **Validate**, then **Review changes**. Publishing goes to a new **Branch** with a **Commit message** and opens a pull request (a merge request on GitLab) with the **Review request title** you give. Existing runs keep their original source. **Discard local changes** throws away an unpublished draft after you confirm.

**New workflow** is off when it cannot work. The note beside it says why: no repository connected, a provider that does not support it, still checking what the repository allows, or your account lacking permission.

## Runs

The **Runs** tab lists runs with their result, ref, trigger, commit and time. Search with **Search runs, workflows, refs or commits…**, and filter by ref, event and status. **Load more** continues a long list.

Open a run to see tabs for **Graph**, **Jobs**, **Logs**, **Artifacts** and **Source**. A job's log can be searched (**Search this log…**) and saved with **Download log**. A large log shows a bounded preview; the page says so and **Download** saves the complete log.

Controls on a run, shown when the host allows them:

- **Re-run failed jobs** and **Re-run all jobs** start the run again from its original revision.
- **Cancel run** asks the host to stop it, after you confirm.
- **Delete run** removes the run and its outputs, after you confirm.
- **Review deployment** appears while a run is waiting. You can **Approve** or **Reject** it, with a **Comment**.
- Older attempts are marked **Historical execution · read-only**.

When a run has failed, **View logs** jumps to the failing output and **Ask Maestro to fix** opens a new draft chat that names the run, its ref and commit. You read the draft and send it yourself.

After a command, a receipt line shows what the host answered. **Provider outcome is unknown. Inspect the receipt before starting another command.** means the page could not confirm the result: choose **Refresh** and check the run before you repeat the command, or you may start it twice. **Provider rejected this command. No automatic retry was sent.** means the host refused it.

## Resources and Settings

**Resources** lists, per kind, what the host holds for the project: **Artifacts**, **Environments**, **Secrets & variables**, **Runners**, **Caches** and **Schedules**. You can create, edit and delete entries where your permission allows. Secret values are shown **Masked**. If a list cannot load, the page says **{resource} could not be loaded**; check the connection and sign-in, then refresh.

A **Schedules** row that cannot be read says **Workflow source could not be read** and gives the cause, such as the workflow file not being on the default branch.

**Settings** shows the connection, the capabilities your sign-in has (**Read runs and logs**, **Start, retry and cancel**, **Manage project resources**, **Review deployments**, **Edit source**, **Live job logs**) and the retention and execution policy. **Configure connection** changes the remote and host: select one explicit remote and host. Enterprise and self-managed hosts require a configured connection, and another server is never selected silently. **Configure local policy** (**Configure provider policy** on a provider-managed policy) opens the retention and execution policy.

## Guardrails tab

**Guardrails** checks the lines and files your change adds against the rules on the base branch. It has **Overview**, **Rules** and **Review** views. Until you run it, the page says **Guards have not run yet**, because running them executes this repository's own `script/guards` code on your machine. Run them only when you trust the project, with **Check again**. Warnings are advice and never block; a blocking finding says so, and you either fix it or clear it the way its rule allows. If there is nothing to check, the page says **No changes to check**. If the base branch is missing, fetch it and check again.

## Local pipelines

**Local pipelines** is a separate list. It holds named command lists that run on the server in the project's working tree, with no repository host involved.

- **New pipeline** asks for a **Name**, a **Branch**, a **Trigger** and **Commands**, one shell command per line. Each line runs as one command, and the first failure stops the run. You can also tick **Include a deployment stage** and pick a **Deployment environment** (**Preview**, **Staging** or **Production**).
- **Run** starts it and **Stop** asks the server to end it. If the stop is not confirmed, the row says **Termination has not been confirmed. Retry stopping this process.** and offers **Retry stop**.
- **Logs** shows every run, and **Download logs** saves them. A run is **Passed**, **Failed**, **Cancelled**, **Start failed** or **Interrupted**. **Interrupted** means the server no longer has the run and its result is unknown. Output produced while Orchestra was closed is not available.
- **Edit** changes a pipeline; **Remove pipeline** removes it after a confirmation, but only when it is not running.

Triggers, branch checkout and deployments are not executed yet. **Run** always uses the working tree as it is, and a deployment stage is recorded in the log as **not executed, no deployment target is connected**. Triggers other than **Manual** are saved but do not start anything.
