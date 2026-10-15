// A stand-in dev server for the docs' blocks: prints a startup line and `ready`, then stays alive like a real one.
// It records its pid in dev.pid so the docs runner can prove that a block stopped it; it ends itself after two minutes
// so a hung run never leaves it behind for good.
const { writeFileSync } = require("node:fs");

writeFileSync("dev.pid", `${process.pid}\n`);
console.log("starting dev server");
console.log("ready in 12 ms");
setTimeout(() => process.exit(0), 120_000);
setInterval(() => {}, 1000);
