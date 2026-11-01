# 14-ux-ui

session ses_8a03a284787fe4d7590c1054fe4e86624832844c3d8364aa6a80edb2e135472e

## Answer

**Conclusion.** A reviewer stops relying on taste when every finding names three things: a rule (a Nielsen heuristic, a WCAG 2.2 success criterion or APG pattern, a design token, a CLDR plural rule), a state that can be reproduced (the scheme, the locale, the viewport, which empty/loading/error state), and a piece of evidence (a computed value, a contrast ratio, a recorded tab order, a screenshot diff, or a test that fails). Automated tools only filter out the obvious. axe-core finds about 57% of WCAG issues and reports some results as "incomplete", which then need manual review. Vision models are poor at fine spatial judgment, so screenshots should support measured checks, not replace them. This repository already has most of the toolkit: DESIGN.md plus two skills, a CDP screenshot and injection kit, a palette WCAG AA generator gate, and Playwright accessibility specs that check focus, contrast, RTL and reduced motion. A reviewer should start from these. Two gaps: no screenshot-diff baseline exists, and Storybook's a11y test is set to "todo", so it never fails.

**How to review, by area**
1. *Interaction.* Map each finding to one of the 10 heuristics (read). Destructive actions need undo or confirmation and a clear exit (heuristics 3 and 5; read). Latency has measurable thresholds: 0.1 s feels instant, 1 s keeps flow and needs a busy signal beyond it, and over 10 s needs a percent-done indicator plus a way to interrupt (read). Error messages should be close to the source, readable without relying on color, in plain language, free of blame, and should keep the user's input (read).
2. *Accessibility.* Run axe for its ~57% (read). By hand, check the 2.2 additions: 2.4.11 Focus Not Obscured, 2.5.7 Dragging Movements, 2.5.8 Target Size of 24×24 CSS px, plus 3.2.6, 3.3.7 and 3.3.8 (read). On ARIA, "No ARIA is better than bad ARIA": a role promises keyboard behavior (read). WebAIM 2026 found low-contrast text on 83.9% of pages, and pages using ARIA averaged 59.1 errors against 42 without (read). Electron exposes the Chromium accessibility tree only when assistive technology is present or when `app.setAccessibilitySupportEnabled` is called, so screen-reader checks need VoiceOver or NVDA actually running (read).
3. *Visual and design system.* Playwright `toHaveScreenshot` uses pixelmatch (threshold 0.2 by default) and warns that output varies by OS, GPU and headless mode, so baselines must come from the same environment (read). Chromatic measures difference as YIQ color distance, defaults to 0.063, and can miss subtle background-shade changes (read). Vision models scored 58% on average on simple spatial tasks such as overlap and intersections, but nearly 100% once shapes were spaced out (read). GPT-4 heuristic feedback caught subtle errors and text issues, but its usefulness dropped over iterations (read). So: use tokens and computed values for spacing, radius and color; use zoomed crops for vision; never accept "looks fine" from a model alone (inferred).
4. *Content and i18n.* Plurals go through CLDR categories. "one" is not only the number 1, and some languages need few/many/two (read). In this repo, product code must call `language.plural`/`language.t`, must not concatenate sentence fragments, and must verify terms against CLDR/Microsoft/Apple/Mozilla corpora (read).
5. *Repo assets to reuse.* `orchestra-design-system` covers the rules: tokens only, contrast 4.5:1 for text and 3:1 for icons, one saturated element per view, a craft checklist, and copy through i18n. `orchestra-visual-qa` covers CDP shots in dark and light, CSS injection, `orchestra-palettes.ts` which exits non-zero when AA fails, `aa.ts`, and the e2e specs that freeze visuals (read). `orchestra-accessibility.spec.ts` checks names, tab order, focus return, contrast in dark and light, Arabic RTL and reduced motion (read). Storybook includes `@storybook/addon-a11y`, but `a11y.test` is "todo" (read), which per the Storybook docs produces no failures in CI (read). No `toHaveScreenshot`, `AxeBuilder` or `@axe-core` occurs in any .ts/.tsx/package.json file (ran; search coverage complete). The `patty` seat is frontend *execution*: it is forbidden to review its own work and has `skills: []`, so it cannot act as the reviewer (read).

**Not examined:** Apple HIG, Material, Percy, Lost Pixel and NN/g cognitive-walkthrough pages were not captured (time budget). DESIGN.md was not read in full. I did not check whether the `auditAccessibility` helper in `e2e/utils/a11y` wraps axe internally.

**Reproduce:** `bun run script/orchestra-palettes.ts` from packages/app-shell (AA gate); `bun run test:ci @orchestra/app e2e/regression/orchestra-accessibility.spec.ts` (accessibility spec, on Actions).

## Claims

[
 {
  "subquestion": {
   "id": "rque_fd0b28c4803d4f022bf4cc78f7",
   "revision": 1
  },
  "proposition": "Nielsen's 10 heuristics include User Control and Freedom (support undo, clear exit) and Error Prevention (confirmation before committing), giving checkable criteria for destructive actions.",
  "nature": "extraction",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_71622400e2f3574e3dbaebf85e",
      "revision": 1
     },
     "representation": "text",
     "digest": "445c2b8b3a8c622a7e568bf59ccb1421ceebbb3da848bd4d2147dae7acf44772"
    },
    "quote": "Either eliminate error-prone conditions, or check for them and present users with a confirmation option before they commit to the action."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_71622400e2f3574e3dbaebf85e",
      "revision": 1
     },
     "representation": "text",
     "digest": "445c2b8b3a8c622a7e568bf59ccb1421ceebbb3da848bd4d2147dae7acf44772"
    },
    "quote": "Support Undo and Redo."
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_fd0b28c4803d4f022bf4cc78f7",
   "revision": 1
  },
  "proposition": "Latency thresholds: 0.1 s feels instantaneous, 1 s keeps flow (show busy indicator beyond), and over 10 s needs a percent-done indicator and a way to interrupt.",
  "nature": "extraction",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_38ce978924bb50cbd758d2a190",
      "revision": 1
     },
     "representation": "text",
     "digest": "40a88391562e0e164cc8436c2ce8030a40024853b51f36020592b4eb0b152d33"
    },
    "quote": "Anything slower than 10 seconds needs a percent-done indicator as well as a clearly signposted way for the user to interrupt the operation."
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_aa557514ec818d24f9454b4aa6",
   "revision": 1
  },
  "proposition": "NN/g error-message guidelines: place errors near their source, never rely on color alone, use plain language, avoid blaming the user, and preserve the user's input.",
  "nature": "extraction",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_7dd97b341393122d8857169373",
      "revision": 1
     },
     "representation": "text",
     "digest": "478586c23321f65eff2b6ad4359efa6730f1bdc3d727e7bf7122bde6993df1aa"
    },
    "quote": "never use exclusively color or animation to indicate errors"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_7dd97b341393122d8857169373",
      "revision": 1
     },
     "representation": "text",
     "digest": "478586c23321f65eff2b6ad4359efa6730f1bdc3d727e7bf7122bde6993df1aa"
    },
    "quote": "Preserve the user's input. Let users correct errors by editing their original action instead of starting over."
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_5e3063a10a68e5466bd7d26575",
   "revision": 1
  },
  "proposition": "axe-core finds on average 57% of WCAG issues automatically and flags uncertain results as incomplete for manual review.",
  "nature": "extraction",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_0b51f22a2dd2182780d5fb3073",
      "revision": 1
     },
     "representation": "text",
     "digest": "4acd382d7733dfbef4fbda35be3afff0bb4d38e95d22af35ed70c5186fcde7d6"
    },
    "quote": "With axe-core, you can find on average 57% of WCAG issues automatically. Additionally, axe-core will return elements as \"incomplete\" where axe-core could not be certain, and manual review is needed."
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_5e3063a10a68e5466bd7d26575",
   "revision": 1
  },
  "proposition": "WCAG 2.2 adds Focus Not Obscured (2.4.11 AA), Dragging Movements (2.5.7 AA) and Target Size Minimum 24x24 CSS px (2.5.8 AA), among 9 new criteria, and removes 4.1.1 Parsing.",
  "nature": "extraction",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_4524abfd02a5315ffb9ad95743",
      "revision": 1
     },
     "representation": "text",
     "digest": "e2e9a0512aed3ffc3d6aa6dc9afb325736d628533e279e1952d6763ff6d69bf6"
    },
    "quote": "The size of the target for pointer inputs is at least 24 by 24 CSS pixels"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_4524abfd02a5315ffb9ad95743",
      "revision": 1
     },
     "representation": "text",
     "digest": "e2e9a0512aed3ffc3d6aa6dc9afb325736d628533e279e1952d6763ff6d69bf6"
    },
    "quote": "When a user interface component receives keyboard focus, the component is not entirely hidden due to author-created content."
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_5e3063a10a68e5466bd7d26575",
   "revision": 1
  },
  "proposition": "The APG warns that no ARIA is better than bad ARIA: a role is a promise of keyboard behavior that ARIA does not supply.",
  "nature": "extraction",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_42b5e7c387748838a37dd556e4",
      "revision": 1
     },
     "representation": "text",
     "digest": "da6ce1d92c2b796b67c312e3f8beef21c399d33ec7cf4fa9e9ebdf2d16799fb4"
    },
    "quote": "Unlike HTML input elements, ARIA roles do not cause browsers to provide keyboard behaviors or styling."
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_5e3063a10a68e5466bd7d26575",
   "revision": 1
  },
  "proposition": "WebAIM Million 2026: low-contrast text on 83.9% of home pages; pages with ARIA averaged 59.1 detected errors vs 42 without.",
  "nature": "extraction",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_4b59eefb7245f3975d2e4b796b",
      "revision": 1
     },
     "representation": "text",
     "digest": "af485b795cefca3017c793b8d2b396b6bd75666b380b221b667e404bf3c246cf"
    },
    "quote": "Home pages with ARIA present had significantly more errors (59.1 on average) than pages without ARIA (42 on average)."
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_aa557514ec818d24f9454b4aa6",
   "revision": 1
  },
  "proposition": "Electron enables accessibility features automatically only when assistive technology is present, or manually via app.setAccessibilitySupportEnabled.",
  "nature": "extraction",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_007f42097d7fd933d52c25ac93",
      "revision": 1
     },
     "representation": "text",
     "digest": "d7e33e6eb3dba495fab4b16ad50d8a646c42083cd133b5fb5f38f95d4f770365"
    },
    "quote": "Electron applications will automatically enable accessibility features in the\npresence of assistive technology"
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_e153ff9c4eaec14a79c246830a",
   "revision": 1
  },
  "proposition": "Playwright toHaveScreenshot uses pixelmatch with a default threshold of 0.2 and warns rendering varies by OS, hardware and headless mode, so baselines must be generated in the same environment.",
  "nature": "extraction",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_6fded2d15f2d12a8128ff0068b",
      "revision": 1
     },
     "representation": "text",
     "digest": "c7fb7273b5d369df76d52be1eea0d20afa40d6e27817eedd059e05246d8fd308"
    },
    "quote": "For consistent screenshots, run tests in the same environment where the baseline screenshots were generated."
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_e153ff9c4eaec14a79c246830a",
   "revision": 1
  },
  "proposition": "Chromatic compares color distance in YIQ space with a default diffThreshold of 0.063, and the default can miss subtle background-shade changes.",
  "nature": "extraction",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_8635f3ce1355d28fb37f5b1303",
      "revision": 1
     },
     "representation": "text",
     "digest": "59bbd0ae6759849c6f550e68b5b4df4ca8a96e3de96e78e51475bc032258df75"
    },
    "quote": "our default threshold may miss subtle changes, such as nuanced changes to a background’s shade of gray"
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_e153ff9c4eaec14a79c246830a",
   "revision": 1
  },
  "proposition": "Vision-language models average 58.07% on simple spatial tasks (overlap, intersections) and fail when primitives are close, while near 100% when spaced apart; GPT-4 heuristic feedback on UIs was useful for subtle errors and text but declined in utility over iterations.",
  "nature": "extraction",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_bfe7e7d05152c8832416ee92be",
      "revision": 1
     },
     "representation": "text",
     "digest": "035514bc560247a631ecec79a951d85d26cf639786ef553a6f2e66f622b7494f"
    },
    "quote": "VLMs including slow-thinking models consistently struggle with those tasks that require precise spatial information when geometric primitives overlap or are close."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_2cd97acc2470fe22e6b0f40e79",
      "revision": 1
     },
     "representation": "text",
     "digest": "f0fae122a2dfaf82e1a153ad0a2b077dfe1e8c271ebde4138398f864b80ca058"
    },
    "quote": "GPT-4-based feedback is useful for catching subtle errors, improving text, and considering UI semantics, but feedback also decreased in utility over iterations."
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_aa557514ec818d24f9454b4aa6",
   "revision": 1
  },
  "proposition": "CLDR plural categories are zero/one/two/few/many/other, and 'one' covers any number behaving like 1, not just 1; this repo requires product code to use language.plural/language.t and forbids sentence concatenation and locale branching.",
  "nature": "extraction",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_f151e66876de8340dd8cb8e333",
      "revision": 1
     },
     "representation": "text",
     "digest": "2aed14283a0c14f77c898f6e5ee4a918df678d91007057645a348a276ca50347"
    },
    "quote": "A common mistake is to think that “one” is only for only the number 1."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_74e2d56096ac30c2329a896c12",
      "revision": 1
     },
     "representation": "text",
     "digest": "267636ae16b1519c71c72f7c4c77097a34252ec2f80bfb6aee90c7210b42db78"
    },
    "lines": {
     "start": 26,
     "end": 27
    }
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_8deef92112afc627cbdd5d4a9b",
   "revision": 1
  },
  "proposition": "The orchestra-design-system skill points to packages/app-shell/src/orchestra/DESIGN.md and sets checkable rules (tokens only, text 4.5:1 and icons 3:1, generated palettes, copy through i18n); orchestra-visual-qa provides CDP screenshots in dark/light, CSS injection, and a palette generator that exits non-zero when a palette cannot hold AA.",
  "nature": "extraction",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_b4d374448753f1f8a8893a02e0",
      "revision": 1
     },
     "representation": "text",
     "digest": "a1a3d0622dcd5a57011ebec7ed8457cf447e3df076fffb16a9e232283c743918"
    },
    "quote": "- **Contrast**: text 4.5:1, icons 3:1 on the glass over the photograph. Fix by lightness, keep hue."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_6cd0d893764f704dfed1b58a2c",
      "revision": 1
     },
     "representation": "text",
     "digest": "d29ad617cc588fbe77ebb6970b612befb8486d5592d29c81031d2c1f94591aa6"
    },
    "quote": "It exits non-zero\n  if a palette cannot hold AA."
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_8deef92112afc627cbdd5d4a9b",
   "revision": 1
  },
  "proposition": "packages/app-shell/e2e/regression/orchestra-accessibility.spec.ts tests naming, tab order, focus return/trap and contrast in dark and light, Arabic RTL, and reduced motion.",
  "nature": "observation",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_e1fd0153cff2e3b8797bcc570d",
      "revision": 1
     },
     "representation": "text",
     "digest": "85d4d92d36c6238c02f8c972e49995605e316db828024fe5a3ea1d6d022d6e38"
    },
    "quote": "reduced motion stills Orchestra transitions and animations"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_d74d39252415c00629d998804a",
      "revision": 1
     },
     "representation": "text",
     "digest": "3b746cfa488afc437da6d33ae810bb5a782d98ccab7ff7ac9a1c73549a53fc9e"
    },
    "lines": {
     "start": 38,
     "end": 55
    }
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_8deef92112afc627cbdd5d4a9b",
   "revision": 1
  },
  "proposition": "Storybook includes @storybook/addon-a11y but sets parameters.a11y.test to 'todo', which per Storybook docs yields no accessibility failures in CI; no toHaveScreenshot, AxeBuilder or @axe-core occurrence exists in repo .ts/.tsx/package.json files.",
  "nature": "observation",
  "scope": "universal",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_cfdfe16c1e500e7acb1c82e3c7",
      "revision": 1
     },
     "representation": "text",
     "digest": "746edca63762646ee91dfca93679c877d01ec70dde68e0b4a344c03d2b147ad6"
    },
    "lines": {
     "start": 108,
     "end": 110
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_023aa5f707eb88f23a26c5f21b",
      "revision": 1
     },
     "representation": "text",
     "digest": "d32eb0e7e0362abe983fd115923c27789716aae4ddd848292d655a0f66dbbd76"
    },
    "quote": "If you set it to 'todo', there will be no accessibility-related errors, warnings, or output in CI"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_73a3373686ec7e34c35d265e67",
      "revision": 1
     },
     "representation": "text",
     "digest": "59f6c2722e00394fa88de72ebc777990023b5a57a9cd00b8b57cbf6258d90cac"
    },
    "quote": "0 hit(s)"
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_8deef92112afc627cbdd5d4a9b",
   "revision": 1
  },
  "proposition": "The patty seat is frontend execution, forbidden to review its own work, with no skills, so it is not a reviewer seat.",
  "nature": "observation",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_7ccd6e14f82485dae60e42cfdd",
      "revision": 1
     },
     "representation": "text",
     "digest": "fa3072acf28c98d70d65742ac604fcd85686d73fac3b466291f4a3af8b167bec"
    },
    "lines": {
     "start": 5,
     "end": 13
    }
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_e153ff9c4eaec14a79c246830a",
   "revision": 1
  },
  "proposition": "Therefore an AI reviewer should treat screenshots as supporting evidence (zoomed crops, paired dark/light) and decide spacing, radius, color and contrast from computed values and measured ratios rather than vision-model judgment.",
  "nature": "inference",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_bfe7e7d05152c8832416ee92be",
      "revision": 1
     },
     "representation": "text",
     "digest": "035514bc560247a631ecec79a951d85d26cf639786ef553a6f2e66f622b7494f"
    },
    "quote": "Yet, VLMs perform at near-100% accuracy when much more space is added to separate shapes and letters."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_6cd0d893764f704dfed1b58a2c",
      "revision": 1
     },
     "representation": "text",
     "digest": "d29ad617cc588fbe77ebb6970b612befb8486d5592d29c81031d2c1f94591aa6"
    },
    "quote": "check computed values (for example the plate's `backdropFilter`) rather than trusting the screenshot alone."
   }
  ]
 }
]
