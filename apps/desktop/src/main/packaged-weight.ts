// Chromium's own locale packs are not Orchestra's UI. The app still ships its translations, including French and
// Japanese. Only English and Portuguese Chromium packs stay, so Chromium chrome (not the OS file dialog) is English
// for every other language.
export const packagedElectronLanguages = ["en", "en-US", "pt-BR", "pt-PT"]
