// Orchestra opens the review rail once per app storage on first paint. Specs that drive the
// rail toggle themselves start after that default, so their open/close oracles stay exact.
export function railDefaulted() {
  localStorage.setItem("opencode.global.dat:orchestra.chat.rail", JSON.stringify({ defaulted: true }))
}
