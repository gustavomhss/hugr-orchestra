// Keep runtime entrypoints, native resources and locale packs. Only conventional JS/CSS debug maps leave the asar.
export const packagedDebugMapExclusions = ["!**/*.{js,mjs,cjs,css}.map"]
