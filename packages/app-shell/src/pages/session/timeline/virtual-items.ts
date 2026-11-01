export function filterVirtualIndexes(indexes: number[], count: number) {
  return indexes.filter((index) => index >= 0 && index < count)
}

// Rows rendered beyond the viewport on each side. A streaming turn remeasures its rows every frame, so every
// extra row is extra layout per frame: cap it while the session works and widen again once it is idle.
export const streamingOverscan = 8

export function timelineOverscan(input: { settled: number; streaming: boolean }) {
  return input.streaming ? Math.min(input.settled, streamingOverscan) : input.settled
}
