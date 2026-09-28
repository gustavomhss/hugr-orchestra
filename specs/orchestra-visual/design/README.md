# Design pronto para integrar — arte, estados e decisões

**Comece aqui para os insumos visuais; `../RUN.md` continua sendo a entrada de execução.** Este diretório atende à lista A1–A11, B1–B10 e C1 da sessão executora. O master escolhido continua sendo `../reference/approved.png`, sem alteração. As novas referências de estados são direção complementar definida pelo planejador, não novos masters aprovados pelo usuário nem capturas de um produto pronto.

## Onde está cada coisa

| Preciso de… | Abra/use | Natureza | Responsável |
|---|---|---|---|
| Resposta item a item aos pedidos | `REQUESTS.md` | decisões e limites explícitos | S01 confere bindings |
| Material visual inspirado no Zen | `zen/README.md`, `zen/tokens.json`, `zen/tokens.css`, `zen/chrome.css`, `zen/controls.css`, `zen/states.css` | valores + CSS editável, opt-in; não CSS interno do Firefox | S03/S04/S06/S15 |
| Medidas e proveniência das cores | `zen/MEASUREMENTS.json` | caixas e estatísticas reais do master, sem OCR | S03 |
| Referência editável dos novos estados | `reference.html`, `reference.js`, `reference.css` | HTML/CSS estático da referência, não frontend Solid pronto | S02 consulta; owners integram |
| Raster dos estados | `STATES.json` → `states/DS01…DS22…png` | 22 PNGs 1672×941 e um caso adicional nativo 1152×768 | owners indicados |
| Peça visual isolada | `elements/catalog.json` → `elements/*.png` | 19 recortes de elementos da referência HTML, **não sprites para UI** | consultar CSS correspondente |
| Recorte do master original | `reference-crops/catalog.json` → `reference-crops/*.png` | 11 comparadores exatos; nunca incluir controles rasterizados no app | S24 |
| Ícone separado + nome no código | `icons/catalog.json`, `icons/*.svg` | 33 SVGs derivados dos paths existentes; preservar viewBox | S04; runtime usa `Icon` existente |
| Símbolo HuGR para dark/light | `brand/hugr-symbol-inverse.svg`, `brand/hugr-symbol-primary.svg` | cópias oficiais intactas; origem/hash em ASSETS | S05 |
| Montanhas sem textos/controles | `landscape/sidebar-mountains.webp` | asset decorativo extraído do master, pronto para copiar | S05 |
| Fonte editável da paisagem e origem | `landscape/sidebar-mountains.png`, `landscape/PROVENANCE.json`, `landscape/reconstruction-mask.png` | PNG lossless e máscara/proveniência; não um original vetorial oculto | S05 |
| Texto PT-BR/EN dos novos estados | `../copy.json` | frases completas, chaves, placeholders e plural | S22, único writer dos dicionários |
| Microacabamento, RTL, compacto, native, medição | `EXECUTOR-DECISIONS.md` | decisões A01–A11, sem escolhas abertas de produto | cada owner |
| Fontes de verdade e destinos | `ASSETS.json` | inventário de cópias reais e destinos, bytes e hashes | S05 |

## Três categorias que não podem ser misturadas

**Runtime:** os dois símbolos SVG e a paisagem WebP. Copiar somente o que tem consumidor real; favicon é condicional. O PNG da paisagem é fallback de autoria, não segunda imagem a baixar junto do WebP.

**Código de aparência:** os quatro CSS em `zen/` são receitas pequenas da identidade Orchestra. Transpor seus valores para os papéis e componentes existentes sob opt-in do tema; não criar outro ThemeProvider nem importar o CSS inteiro em consumidores compartilhados indiscriminadamente.

**Referência de design:** HTML, screenshots, recortes, máscara e catálogo de peças. Não publicar no bundle, não usar como evidência de execução, não colocar PNG no lugar de botão, diff, navegador, texto ou lista.

`gallery.html` abre o índice visual local dos estados; `elements/catalog.json` indexa as peças isoladas. `reference.html` também abre localmente; usa `copy-data.js`, derivado do contrato de copy, para não depender de fetch remoto. Não consulta serviços, modelos, credenciais ou o workspace real. Para reproduzir os renders, veja `../tools/render_design_references.py --help`. Playwright/Chromium são ferramentas opcionais de autoria da referência, não dependências do produto.

## Zen: o que significa nesta entrega

O usuário pediu a sobriedade, a composição lateral, os controles compactos e a profundidade suave inspiradas no Zen. Essas características estão separadas em CSS e elementos identificáveis. **Não existe um “PNG de tema Zen” a colar no Orchestra**, nem foram fornecidos assets internos do Zen como origem do master. Não importamos logos, mascotes, Firefox chrome, flags experimentais, animações contínuas, mods de terceiros ou licenças de themes.

O desenho aprovado é a autoridade visual; a documentação pública do Zen é referência de intenção, não uma dependência. A paisagem é extraída do master Orchestra, não atribuída ao Zen. Os SVGs HuGR continuam sendo a única arte de marca autorizada para o produto.

## Não há Figma original

Nenhum Figma, vetor de toda a tela ou CSS original foi fornecido. Não apresentamos uma reconstrução como se fosse o original. Há agora uma **nova fonte editável de referência em HTML/CSS**, o raster original intacto, medições explícitas e assets separados. A geometria e tipografia são decisões de engenharia reconciliadas com o raster; cores de texto/estado são verificadas por contraste, não inferidas de antialias.

## Antes do fan-out

S01 confere o checkout e classifica fontes; S22 consome a copy já decidida; S03/S04 recebem materiais definidos; S05 copia assets. Nenhuma dessas tasks foi pré-aprovada por esta entrega de design. Não alterar o DAG para ganhar `ready_total`, não atualizar `progress.json` com PASS fictício e não mexer no worktree `janitor` ou no `PERFORMANCE-PLAN.md` do usuário para obter os insumos.

## Aprovação e uso

O único master aprovado pelo usuário continua `../reference/approved.png`. Os estados e o HTML são complementos de direção decididos pelo planejador para tirar ambiguidades; não alegam equivalência pixel-perfect com uma fonte original. Nada aqui modifica `progress.json`. A arte da marca permanece oficial; a paisagem tem pixels ocultos reconstruídos documentados. Os PNGs em `elements/` mostram peças para inspeção; os arquivos reutilizáveis são SVG/WebP/CSS/JSON, nunca screenshots de controles.
