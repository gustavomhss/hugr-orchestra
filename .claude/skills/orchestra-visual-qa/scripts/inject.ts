// usage: bun inject.ts <css files...>  (replaces the previous injection)
const css = (await Promise.all(process.argv.slice(2).map((f) => Bun.file(f).text()))).join("\n")
const expr = `(() => { let s = document.getElementById("__inj"); if (!s) { s = document.createElement("style"); s.id = "__inj"; document.head.appendChild(s) } s.textContent = ${JSON.stringify(css)}; return css_len = ${css.length} })()`
await Bun.write(import.meta.dir + "/inject-expr.js", expr)
