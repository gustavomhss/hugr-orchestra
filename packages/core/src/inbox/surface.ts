export const surfaces = ["overlay", "flight-engineer", "list"] as const

export function shown() {
  return {
    thread: false,
    reactions: false,
    presence: false,
    typing: false,
    huddle: false,
    call: false,
    screenShare: false,
  }
}
