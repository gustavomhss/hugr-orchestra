# Bounded L3 design/TUI r2 delta

Public correction request: `deliverable/requests/l3-design-tui-r2-correction.md`, SHA256 `15d91eb9a18a571488e912a56970783de61eb7d28fef8fce6e138a840d299274`.

## Exact body identities

| Body | UTF-8 bytes | SHA256 |
| --- | --- | --- |
| Preserved r1 `l3/body.md` | 15143 | `860f76fc65c807a4c96e4c5c21d73683cf50ada8d75b0acb53c15f218f1408c5` |
| New r2 `l3-r2/body.md` | 15780 | `cbd099450a7072e72449b9fd3ef31b5032f171f64f7222405abfce0b88072730` |

`body.diff` SHA256 `71bcc6df1e428d213cc6c9670bd690faf16b89286eded0c8764d279a493a8190` contains one insertion hunk. The insertion is 637 bytes, entirely within `Language and appearance cross app and host contracts`, after its existing opening paragraph and before its handoff table. No prior body text was replaced or removed. Removing precisely the inserted region reproduces the complete r1 body byte-for-byte. The r2 body remains below 16,000 bytes.

## Exact old and new changed region

Old region: empty string (`""`), zero bytes, SHA256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`. This was a zero-width insertion immediately before the existing table header:

```text
| Handoff and owner | Stable contract | Failure observation and affected artifacts | Verification route, unexecuted |
```

New region below contains the instruction paragraph and its terminating blank line (637 UTF-8 bytes):

```markdown
**Instruction:** app callsites use `language.t(...)` for ordinary copy and `language.plural(...)` for counts; native main-process callsites consume shared typed translation bundles through `nativeT(...)`. Shared language/UI modules own locale selection, plural resolution, fallback and interpolation. Feature/native callsites must not branch on locale, choose plural categories or concatenate grammatical fragments. Preserve existing English keys and text byte-for-byte; extend the shared bundle/API for richer grammar. The documented startup exception remains. (`packages/app-shell/AGENTS.md:23–28`; `apps/desktop/AGENTS.md:5–9`.)

```

The language section changes from 2705 bytes / SHA256 `e10dfc9a08db71c9802624bd9b86c40f6f2e17d95d379af2a253a72944051eff` to 3342 bytes / SHA256 `581cd7f93fa985513c0d3e69cb2a103f7b004870d14893599187a8a4ea27ba2d`. All original text inside that section is retained, including the hardcoded-English startup exception, theme mechanisms and RTL limits.

## Unchanged surrounding body

| Region outside the language section | Bytes in each revision | Shared SHA256 |
| --- | --- | --- |
| Prefix before the language heading | 8939 | `e5eb651d9aac784c5c383a7182fd4d707fe96e330b924a37c9a4191ed54baa78` |
| Suffix beginning with the next H2 separator | 3499 | `97859852209ede4ed517bfa5918680b707738168796e85e3f72e9ca38a56f33e` |

All seven original authored r1 files were checked against their pre-correction hashes and remain unchanged. No r1 file or canonical/peer artifact was written. The source manifest retains its 22 existing records exactly and adds only S23; no build or navigation key was added. Existing desktop-web build rationale now names the directly used public E10 support.

## Bounded primary support

Both sources are pinned to `1cde2ff7a71bcf7aecb5d030917b577165135d38`; these are attributed maintenance instructions, not observed runtime compliance.

### S10 — `packages/app-shell/AGENTS.md`

Git blob `a2bbdc5cb79a2fa1fc6bbcfea72c96e0d29130fe`; SHA256 `a41f7ec47513e9a399d9ef066fbdb20ffaae712fcbb0c1881e1701cfaf76d15d`. Exact captured lines 23–28:

```markdown
- NEVER hardcode user-visible English strings in production code. ALWAYS use an i18n key for visible copy, placeholders, accessible labels, tooltips, menus, dialogs, toasts, empty states, and displayed errors.
- When migrating existing copy to i18n, preserve the English text byte-for-byte unless the task explicitly requests a copy change.
- NEVER change existing English text or English keys to facilitate translation. English is intentional, designer-written source copy; adapt locale-specific translations and i18n mechanics around it.
- Keep locale complexity behind the shared typed i18n APIs. Feature and component code should use `language.t(...)` for ordinary copy and `language.plural(baseKey, count, params)` for count-sensitive copy. It must not inspect the locale, call `Intl.PluralRules`, construct or select plural-category keys such as `.one` or `.other`, or branch on locale-specific grammar.
- Prefer complete translated phrases. Do not concatenate grammatical fragments or make call sites assemble sentences. Keep placeholders to irreducible dynamic values such as names, paths, and counts.
- If a translation cannot be expressed by the current API, deepen the shared language/UI i18n module so one typed call owns locale selection, plural resolution, fallback, and interpolation. Do not leak that machinery into product code.
```

### S23 — `apps/desktop/AGENTS.md`

Git blob `5040a3d090c75ff05ab0aab956b7efbbe0c1f6df`; SHA256 `854f55f901c5bbf938c65d674de5dc3182feb1593f38009318bd029a3717ca81`. Exact captured lines 5–9:

```markdown
- NEVER hardcode user-visible English strings in production code. ALWAYS use an i18n key for native menus, picker titles, dialogs, buttons, accessible labels, and displayed errors.
- When migrating existing copy to i18n, preserve the English text byte-for-byte unless the task explicitly requests a copy change.
- NEVER change existing English text or English keys to facilitate translation. English is intentional, designer-written source copy; adapt locale-specific translations and i18n mechanics around it.
- Keep locale and grammar logic in the shared typed i18n layer. Renderer code should resolve copy through the app language API, and the main process should consume typed native-translation bundles through `nativeT(...)`; native menus, dialogs, and IPC handlers must not inspect locales, choose plural categories, or assemble translated sentence fragments.
- Prefer complete translated phrases with only irreducible dynamic placeholders. If native UI needs richer grammar, deepen the shared bundle/API instead of adding locale branches to desktop feature code.
```

Public accepted L2 corroboration was limited to `s2.l2.desktop-web` decisive evidence §E10 — Native copy instruction, file SHA256 `a8845c781ecf752a755eca55a8f0dc76658fa5928bc3c8c71cbb2f28e8acc15d`. No peer L3 content or full review response was read. No product tests, runtime, CI, generation, source edit, GitHub write, reviewer contact or L4 production occurred.
