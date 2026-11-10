// The packaged Electron app does not execute source maps or TypeScript sources that node_modules ship beside their
// JS, and it does not import tree-sitter. The CLI loads that from tree-sitter/ beside its binary, which ships as the
// cli extraResource. These globs only drop the asar copy electron-builder would take from production node_modules.
// Chromium locale packs for languages Orchestra does not surface stay out; English and Portuguese stay, so a
// native file dialog on a Portuguese machine is not forced to English.
export const packagedFileExclusions = [
  "!**/*.map",
  "!**/node_modules/**/*.ts",
  "!**/node_modules/**/*.tsx",
  "!**/node_modules/tree-sitter*/**",
  "!**/node_modules/**/tree-sitter*/**",
  "!**/node_modules/web-tree-sitter/**",
]

export const packagedElectronLanguages = ["en", "en-US", "pt-BR", "pt-PT"]
