// The packaged Electron app does not execute source maps or TypeScript sources that node_modules ship beside their
// JS. Chromium locale packs for languages Orchestra does not surface stay out; English and Portuguese stay, so a
// native file dialog on a Portuguese machine is not forced to English.
export const packagedFileExclusions = ["!**/*.map", "!**/node_modules/**/*.ts", "!**/node_modules/**/*.tsx"]

export const packagedElectronLanguages = ["en", "en-US", "pt-BR", "pt-PT"]
