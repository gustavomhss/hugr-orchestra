// The first-run path on Home, in order: a trusted folder, then a model, then the composer. Projects that already
// exist skip the folder step, and a person who skipped the model step goes straight to the composer.

// The model step waits for the provider catalog, so an unloaded catalog never shows a false "connect" prompt.
export function needsModel(input: { providersReady: boolean; connected: boolean; skipped: boolean }) {
  return input.providersReady && !input.connected && !input.skipped
}

// Each example only fills the composer; the person still presses send.
export const HOME_EXAMPLE_KEYS = [
  "orchestra.home.start.example.1",
  "orchestra.home.start.example.2",
  "orchestra.home.start.example.3",
] as const
