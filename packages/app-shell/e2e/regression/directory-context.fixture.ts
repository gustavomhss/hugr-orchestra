import { dict } from "../../src/i18n/en"

export const useLanguage = () => ({ t: (key: keyof typeof dict) => dict[key] })
export const useDialog = () => ({ close() {} })
export const useGlobal = () => ({ ensureServerCtx: () => ({
  sync: { data: { path: { home: "/repo", directory: "/repo" } } },
  sdk: { protocol: Promise.resolve("v1"), api: { file: {
    list: async (input: { location: { directory: string } }) => ({ data: await fetch(`/fixture/list?directory=${encodeURIComponent(input.location.directory)}`).then((response) => response.json()) }),
    find: async () => ({ data: [] }),
  } } },
}) })
