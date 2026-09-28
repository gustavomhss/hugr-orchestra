# Peças da identidade Zen-inspired, separadas

Esta é a identidade **Orchestra Graphite** aplicada ao layout já escolhido. Não é distribuição do Zen Browser e não é uma mudança da marca HuGR.

| Peça | Fonte editável | Referência isolada | Aplicação |
|---|---|---|---|
| Materiais grafite, azul contido e profundidade | `tokens.json`, `tokens.css` | `../states/DS01-baseline.png` | S03 registra tema no provider existente |
| Sidebar 230/208/56px | `chrome.css` (`.ov-sidebar`, `.ov-navitem`, `.ov-collapsed`) | `../elements/sidebar.png`, `sidebar-collapsed.png` | S06 navegação; S25 root |
| Seleção de navegação | `chrome.css` | sidebar/Chat selecionado | fundo fixo + marcador lógico 2px; hover não apaga current |
| Topbar e chip de sessão | `chrome.css` | `../elements/topbar.png` | S06/S25 |
| Workspace selector | `chrome.css` | `../elements/workspace-switch.png` | consumidor existente, não nova conta |
| Botões, abas, campos, badges, ícones | `controls.css` | `../elements/tabs.png`, `address-bar.png`, `composer.png` | S04/S10/S15 |
| Cards, diálogos, popovers, tooltips, toast | `states.css` | `../elements/dialog.png`, `popover.png`, `tooltip.png`, `toast.png` | S04 e consumers |
| Loading/empty/error/pending | `states.css` | `../states/DS02…DS08…png` | sem polling, sem shimmer contínuo |
| Paisagem | `../landscape/sidebar-mountains.webp` | asset independente | decorativo somente na sidebar expandida dark |

## Integração sem replatforming

1. S03 usa `tokens.json` como valores fechados de input para `DesktopTheme`: `packages/ui/src/theme/types.ts`, `context.tsx`, `default-themes.ts`, `v2/resolve.ts` e `v2/mapping.ts`. Reutilizar os slots `overrides` e `v2Overrides` existentes. O escopo opt-in não muda nenhum outro tema.
2. S04 mapeia material e escala para os papéis existentes das primitives. Não copiar o nome `.ov-*` para todos os componentes só para imitar o preview; as classes são um vocabulário da referência. Preservar props, eventos, exports e seleção/foco atuais.
3. S06/S15 aplicam geometria nos wrappers locais. S25 continua único integrador de root. Não editar o arquivo do outro owner.
4. Não importar `reference.css`/`reference.js`, sprites de preview nem fotos de controle no runtime. Não adicionar biblioteca de ícones, tailwind concorrente, estado global, worker ou renderer.
5. A moldura externa de 13px pertence à apresentação raster. A janela nativa real não ganha uma segunda janela; usar só seus controles da plataforma.

## Custo decidido

No runtime: cores/gradientes CSS discretos, borda 1px, sombra pequena e uma imagem WebP decorativa. **Sem backdrop-filter, blur full-screen, parallax, ruído animado, filtro por frame ou gradientes animados.** Hover pode transicionar cor/opacity por 120 ms; expansão não interpola width/height. Reduced motion elimina transições não essenciais. Nunca fazer medição de layout a cada token.

O CSS da referência não é um benchmark do app. Os budgets P01–P12 permanecem; seu custo efetivo é medido no build integrado com os mesmos efeitos ligados. A paisagem não é espelhada em RTL, não aparece na sidebar de 56 px nem substitui o tratamento claro anterior.

## Referências de intenção consultadas

- Zen, Compact Mode: https://docs.zen-browser.app/user-manual/compact-mode
- Zen, apresentação de workspaces/compact/split view e prioridade de beleza/performance: https://zen-browser.app/

Nenhum arquivo dessas páginas, logo Zen ou mod de terceiro foi copiado. Nosso compacto é o 56px definido para Orchestra, **não** importação do modo hover/autohide do Zen nem seus atalhos. O master continua soberano onde as intenções diferirem.
