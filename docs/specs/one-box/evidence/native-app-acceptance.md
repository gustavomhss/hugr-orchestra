# Native desktop Inbox acceptance — isolated build

This is the actual Electron desktop built from this worktree and its freshly rebuilt compiled CLI, not the web
preview or an installed owner build. The approved Inbox materials were not changed during these checks.

## Isolation and ownership

- Predev plus electron-vite build completed; CLI reported 1.18.27 before launch. These are local build results,
  not a packaged release, notarization, CI pass or independent review.
- Launched a new app with `ORCHESTRA_TEST_ONBOARDING=1`, `ORCHESTRA_SIDECAR=owned` and task-local TMPDIR.
  Its new profile root was `native-tmp/orchestra-onboarding-12f671c8-e7d3-44ca-8a3f-ce6e6211bf32` under the existing
  private QA root. The database was in memory and credential inheritance disabled.
- Renderer origin was `oc://renderer`; native preload `window.api.awaitInitialization` was present. It returned
  the same loopback server as the process/listener oracle: task Electron PID 21440/CDP 9333 and its compiled
  CLI PID 21462/server port 61240. No task credential was copied from the live Slack browser/backend instance.
- Startup used an allowlisted environment. The desktop itself subsequently loaded 30 shell-environment variables;
  this check therefore does **not** certify that no provider environment variable could exist. No model was
  invoked. The actual Inbox API verified no connected accounts/Slack grant or feeds before seeding.

## Project admission boundary

The fresh app initially displayed Home onboarding. Its local directory chooser uses an OS-native picker,
which is not controllable through the available browser tools; no computer-use tool is connected here.
Instead of faking a picker result or changing persistent project selection directly, this test dispatched the
documented cancelable `orchestra:deep-link` renderer event with an `orchestra://open-project` URL pointing only
to the disposable `native-project` directory. The production ingress acknowledged it, checked the directory via
the actual server and selected it. This validates renderer ingress onward, **not** OS URL delivery or the picker.
No global OS protocol URL was invoked, so the owner's installed app could not receive this test link.

## Observed native behavior and independent API oracles

1. The actual Inbox navigation opened an empty Inbox with Sources enabled for the selected disposable project.
2. A guarded native-renderer script used only `window.api.awaitInitialization` and the owned server's public
   Inbox API to seed four explicitly synthetic read-only items: Slack, mail, Calendar and RSS. The owned API
   independently verified exactly four identities; the UI's Refresh showed four items, two messages/two notices.
   No provider account or external message was created.
3. Calendar → More actions → Mark read used the actual native UI. The owned API retained all four items with
   three waiting and Calendar `waiting=false`. All-items plus Calendar filters displayed the retained read item.
4. The exact synthetic Calendar link `https://example.com/qa/calendar` was inspected before clicking Open original.
   The native window opened that exact URL in the owner's existing Chrome as a **new** tab, independently matched
   against its before-click target IDs. Only this generated tab was closed. No real provider link or account was used.
5. The real theme control switched to light. Dark/light captures were inspected; the approved denser content frame
   and floating surfaces are present in the compiled native renderer.
6. Native Sources reported every provider disconnected. Submitting a private HTTPS feed address showed a component
   error; an independent feed API read showed it was not stored. Saving a named example.com subscription then
   succeeded as the positive control, with `initialized=false` and no `checkedAt`: save did not acquire it.
   Stop following removed only that QA subscription; the four imported samples and Calendar read state remained.
7. The keyboard/unsaved-credential probe was also run against the native app. Both modals trapped Tab/Shift+Tab,
   Escape restored the right trigger, password input was masked, and unsaved synthetic text cleared on source
   changes/unmount without connect/send/origin-draft traffic. The same storage/network positive controls applied.
   A first native probe read focus too early during asynchronous modal dismissal; condition-based waits for the
   actual focus return corrected this instrument race. No production focus handler or delay was modified.

## Diagnostics, boundaries and cleanup

The native startup log contains a report-only inline-script CSP warning and the isolated key-file fallback warning
(OS keychain unavailable in this disposable launch). No blanket clean-console, CSP, keychain or native accessibility
pass is claimed. The agent-browser errors command alone is not used to erase these main-process log observations.
Native Slack consent, provider revocation, OS picker/URL delivery, restart durability and unrelated native surfaces
remain outside this run. The in-memory DB intentionally does not survive app exit.

After the final API oracle verified no native provider grants, no retained QA subscription, four synthetic items
and preserved Calendar attention, PID 21440's exact worktree executable/CDP flag/listener were matched before TERM.
The owned server logged orderly stopping/exit 143. A listener instrument that still found task web/backend
positive controls 3005/PID 68944 and 4102/PID 90346 found neither CDP 9333 nor native server 61240 afterward.
No owner app/server was stopped or restarted; the earlier web/live-grant acceptance instance remains available.

Private receipts/captures: `native-launch.json`, `native-stop-request.json`, `native-interaction-report.json`,
`native-inbox-read-{dark,light}.png`, `native-sources-light.png` under the existing task QA root. Native build:
`sh_1b0515119001AUSXB4TStOQk2A`; native run: `sh_1b052dbce0012QwTTJczNRzmuz`.
