# @orchestra/tui

The Orchestra terminal application, written in SolidJS with [opentui](https://github.com/sst/opentui). The legacy CLI in `packages/orchestra` and the V2 CLI in `packages/cli` share this implementation. Extraction history and ownership boundaries are in [`specs/tui-package.md`](../../specs/tui-package.md).

## Language policy

The TUI is English-only for now. Strings are written in place and there is no i18n layer. Do not add ad hoc translation dictionaries; a localization layer needs its own design, as the web and desktop apps have one in `packages/app-shell`.
