// Copy owned by the chat screen (session view). Add new keys here instead of i18n/orchestra.ts so screens merge without conflicts.
export const CHAT_COPY = {
  "orchestra.chat.you": "You",
  "orchestra.chat.review": "Review",
  "orchestra.chat.share": "Share",
  "orchestra.chat.apps": "Apps",
  "orchestra.chat.filesChanged": "Files Changed {{count}}",
  "orchestra.chat.allFiles": "All files",
  "orchestra.chat.exportDiff": "Export diff",
  "orchestra.chat.exportDiffSkipped": "{{count}} listed files had no patch text and were left out of the export.",
  "orchestra.chat.contextFiles": "Add files to context",
  "orchestra.chat.stop": "Stop",
  "orchestra.chat.placeholder": "Message Orchestra…",
  "orchestra.chat.menu.rename": "Rename session",
  "orchestra.chat.menu.export": "Export session",
  "orchestra.chat.menu.archive": "Archive session",
  "orchestra.chat.menu.delete": "Delete session",
  "orchestra.chat.models.all": "All models",
  "orchestra.chat.models.count": "{{count}} models",
  "orchestra.chat.delivery.steer": "Steer",
  "orchestra.chat.delivery.queue": "Queue",
  "orchestra.chat.delivery.steerHint":
    "Steer: the next prompt joins the running work at its next turn boundary. Select to queue it instead.",
  "orchestra.chat.delivery.queueHint":
    "Queue: the next prompt waits until the running work would otherwise stop. Select to steer it instead.",
  "orchestra.chat.pr.create": "Create PR",
  "orchestra.chat.pr.title": "Create pull request",
  "orchestra.chat.pr.description": "Opens the pull request with the gh or glab CLI signed in on this server.",
  "orchestra.chat.pr.previewTitle": "Pull request preview",
  "orchestra.chat.pr.titleField": "Title",
  "orchestra.chat.pr.from": "From branch",
  "orchestra.chat.pr.base": "Base branch",
  "orchestra.chat.pr.body": "Description",
  "orchestra.chat.pr.summary": "Summary",
  "orchestra.chat.pr.files": "Files",
  "orchestra.chat.pr.noFiles": "No changed files in this view.",
  "orchestra.chat.pr.submit": "Create pull request",
  "orchestra.chat.pr.creating": "Creating pull request…",
  "orchestra.chat.pr.createdTitle": "Pull request created",
  "orchestra.chat.pr.created": "Opened at",
  "orchestra.chat.pr.cancel": "Cancel",
  "orchestra.chat.pr.done": "Close",
  "orchestra.chat.pr.close": "Close dialog",
  "orchestra.chat.pr.download": "Download proposal",
  "orchestra.chat.pr.reason.notInstalled":
    "Nothing was sent: {{cli}} is not installed on this server. Download the proposal and open the pull request from your host.",
  "orchestra.chat.pr.reason.notAuthenticated":
    "Nothing was sent: {{cli}} is not signed in on this server. Run {{cli}} auth login there, or download the proposal.",
  "orchestra.chat.pr.reason.noRemote":
    "Nothing was sent: this repository has no github.com or gitlab.com remote. Download the proposal and open the pull request from your host.",
  "orchestra.chat.pr.reason.notPushed":
    "Nothing was sent: push {{branch}} to {{remote}} first, or download the proposal.",
  "orchestra.chat.pr.reason.noBranch":
    "Nothing was sent: the repository is not on a branch. Download the proposal and open the pull request from your host.",
  "orchestra.chat.pr.reason.cliFailed":
    "No pull request address came back: {{message}}. Check your host before you try again, or download the proposal.",
  "orchestra.chat.pr.reason.unavailable":
    "Nothing was sent: this server cannot open pull requests. Download the proposal and open the pull request from your host.",
  "orchestra.chat.pr.reason.unconfirmed":
    "Orchestra could not confirm a pull request. Check your host before you try again, or download the proposal.",
  "orchestra.chat.delivery.queued": "Queued: the prompt waits until the running work would otherwise stop.",
  "orchestra.chat.delivery.unsupported":
    "This server delivers every prompt as a steer; queueing needs a server that speaks the V2 protocol.",
}
