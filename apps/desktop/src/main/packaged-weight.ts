// The packaged Electron app does not execute source maps or TypeScript sources that node_modules ship beside their
// JS, and it does not import tree-sitter. The CLI loads that from tree-sitter/ beside its binary, which ships as the
// cli extraResource. These globs drop that asar copy. `!**/*.map` also drops maps under out/ and resources/.
// Chromium's own locale packs are not Orchestra's UI. The app still ships its translations, including French and
// Japanese. Only English and Portuguese Chromium packs stay, so Chromium chrome (not the OS file dialog) is English
// for every other language.
export const packagedFileExclusions = [
  "!**/*.map",
  "!**/node_modules/**/*.ts",
  "!**/node_modules/**/*.tsx",
  "!**/node_modules/tree-sitter*/**",
  "!**/node_modules/**/tree-sitter*/**",
  "!**/node_modules/web-tree-sitter/**",
]

export const packagedElectronLanguages = ["en", "en-US", "pt-BR", "pt-PT"]
