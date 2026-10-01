# Orchestra visual identity migration

## Baseline and reference

- Integration branch: `orchestra-identity`.
- Integration worktree: `../_worktrees/orchestra-identity`.
- Base: `5e4bea3b519c04cebfb787e98dfa171f5771d25c`, including native App Dock.
- Approved reference: `/Users/gustavoschneiter/Downloads/orchestra-replica-static/app.html`,
  `mock-features.js`, `MOCK-GUIDE.md`, and `CHAPTERS.md`.
- Desktop identity is approved. The individual capability-screen rework chapters
  remain pending; a visual migration does not approve their domain workflows.

## Frozen visual contract

Use the measured reference, not an approximate redesign:

- Official compact HuGR SVGs, byte-preserved; `Human Guardrail` descriptor.
- One continuous `mtn-src.jpg` workspace background, never one image per panel.
- Sidebar **230px**, toolbar **45px**, workspace gutter/padding **6px**;
  panel radius **9px**. Reference outer frame: margin **12px**, radius **13px**.
- Dark/light palette, glass gradient/filter/border/shadow values match reference.
- Sidebar, session strip and active session tab use the same glass tokens.
- Repository profile picker stays at the bottom; its menu opens upward through
  a portal. Navigation scrolls independently.
- Session tabs belong below the toolbar, spanning conversation and side panel;
  close preserves history, new uses the selected repository.
- Branch label: dark `#d5ae68`, light `#8a641f`, monospace `10px`, weight `500`.
- Principal executed model owns each session logo. Known manufacturer first,
  router fallback, neutral fallback. No transport/name guessing.
- Running logo pulses `2.4s`; human wait bounces `1.15s` with impact/shadow;
  idle/error/interrupted static. Production respects reduced motion.
- Preserve real session execution, admission, permissions, questions, tab memory,
  virtualizer, filesystem, and native App Dock behavior. No mock fixtures in
  production and no heavy runtime dependencies for the skin.
- RTL uses logical geometry; native window controls remain physical/native.

## Execution waves and isolation

Each agent owns an isolated worktree at the same base. No shared file is edited
by two authors. Lead owns stylesheet imports, localization keys, app startup
branding, integration and final acceptance.

| Work package | Owned files | Dependencies |
| --- | --- | --- |
| Brand/theme | `src/orchestra/theme.css`, `brand.tsx`, official SVG assets | Frozen reference |
| Shell/profile | `pages/layout-new.tsx`, `pages/home.tsx`, `src/orchestra/sidebar.tsx`, `shell.css` | Theme, `Titlebar.tabsMount` |
| Session tabs/model | `components/titlebar.tsx`, `titlebar-tab-*`, `src/orchestra/model-logo*`, `tabs.css` | Production baseline, shell mount |
| Session surfaces | App-local `src/orchestra/session.css`, session frame/side-panel/composer/tasks data hooks | Production baseline, theme |
| Verification | Baseline performance evidence; visual integration checks | Baseline, integrated code |

`Titlebar` receives `tabsMount?: HTMLElement`. Its existing controllers and
commands stay mounted once; the desktop strip portals into
`#orchestra-session-tabs` in the shell. Mobile/legacy behavior stays on its
existing branch. Profile tab filtering is presentation-only; durable tab
identity remains server/session based.

The owner explicitly authorized **Commit + push** on 2026-10-01. Lead publishes
`orchestra-identity` to `fork` (`gmhelmold/HuGR-Orchestra`) after verification.
PR creation and merge remain separate owner requests.

## Acceptance

1. Record a production benchmark at the unchanged base before session/timeline
   modifications, then repeat the same workload after integration.
2. Package `bun typecheck`; applicable unit/browser checks; production build.
3. Real-app browser coverage: dark/light, LTR/RTL, session navigation/close/new,
   profile selection, permissions/questions, reduced motion and native Dock
   layout boundaries. Calibrate new checks by breaking their protected property.
4. Compare captured geometry/colors/assets with the fixed approved reference;
   inspect screenshots rather than relying only on test authors' reports.
5. Cold independent review per disjoint slice, lead review of every file, and
   explicit report of measured evidence. Do not claim pixel equality for data,
   fonts, platform-native controls or pending chapters that were not compared.

## Status

Implementation integrated; app checks and the 21-case delivery UI suite pass.
`VERIFICATION.md` records evidence, measured performance, and verification reach.
No pending chapter has been promoted to approved. Native caption geometry is
reported by the renderer and converted using the owning window's native zoom;
macOS controls retain physical placement in RTL, zoom and fullscreen transitions.
