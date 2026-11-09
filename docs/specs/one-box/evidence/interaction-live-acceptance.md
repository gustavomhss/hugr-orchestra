# Actual Inbox interactions — keyboard and unsaved credentials

These checks used the existing authenticated task Chrome tab and actual production Sources/Customize components.
They did not use the synthetic preview, intercept responses, save a provider credential or send a message.
The owner-approved visual materials were not changed.

## Keyboard

- In Sources, focus the footer's last enabled button and press real Tab: focus wraps to the modal close button.
  Real Shift+Tab returns to the footer rather than escaping into the underlying app.
- Escape closes Sources and returns focus to its trigger.
- The same forward/reverse boundary checks pass in Customize; Escape returns focus to Customize.
- No Enter/Space activation of connect, disconnect, sync, send or a setting toggle was used.

## Unsaved credential handling

An explicitly synthetic `INBOX_QA_UNSAVED_<random>` sentinel was typed into the password control **without
submitting**. It is not an invented provider grant and was never saved or sent to a provider.

- The control is type password and its form disables autocomplete.
- A calibrated localStorage/sessionStorage scan did not find the sentinel while editing. A temporary known
  localStorage control proved the scanner could detect the same sentinel, then was removed.
- Switching source cleared the unsaved value. Closing and reopening cleared it as well; neither web storage
  restored it.
- A live PerformanceObserver saw the genuine account-status GET as its positive control. Across typing, source
  switching and reopening it observed no increase in requests to connect, send or origin-draft routes.

The initial resource instrument used `performance.getEntriesByType('resource')`, whose 250-entry buffer was full
of earlier app-module loads. It could not see the known account read and explicitly failed its control. That run
was rejected. The accepted probe subscribed to new resource entries before reopening Sources, without clearing
the app's existing timing buffer. This verifies only the observed routes/browser interaction window, not every
possible request, storage surface or a general secret-retention theorem.

All keyboard/storage/observer assertions passed. The synthetic control key, observer and its temporary JS arrays
were removed in finally; the task dialog was closed. No provider configuration, visual preference, grant, item or
owner tab was changed. Reproducibility: private task QA root `interaction_probe.py` and `interaction-report.json`.
