# Decisões de integração — A01–A11

Fonte: pedidos da sessão executora; escopo: completar o contrato visual, não construir outro produto. Cada decisão abaixo integra os cinco axiomas das unidades atribuídas no PLAN. O runtime ainda precisa ser implementado, observado e aprovado. A referência mestre não muda.

<a id="a01"></a>
## A01 — Raster, medidas, fonte editável e autoridade

**Decisão:** não existe Figma original fornecido. `reference.html` + `reference.js` + `reference.css` + `zen/*.css` são a nova fonte de autoria de estados, não o CSS oculto da imagem. `reference/approved.png` permanece a autoridade da composição aprovada.

`zen/MEASUREMENTS.json` registra coordenadas reais, quantidade de pixels, mediana RGB e dispersão das amostras. Apenas os fundos canvas/shell/surface usam essas medianas. Texto, foco, estados e limites essenciais usam valores de engenharia contrastados de `zen/tokens.json`; não usar pixels antialiasados como valores CSS de texto. Tamanhos de fonte e raios são decisões explícitas: não foram magicamente extraídos de uma fonte vetorial inexistente.

Reconciliar o render em 1672×941/DPR1/zoom 100, sem esticar. A moldura externa `[13,12,1659,929]` pode ser recortada para comparar a área útil 1646×917; o app real não desenha duas janelas. Medidas do master em SPEC continuam com divisores ±3 px e caixas ±4 px. **Isso não vira uma exigência impossível de zero diferença entre antialiasings.** Repetições internas da implementação têm alinhamento ≤1 CSS px e nenhum offset perceptível; letra, ícone e fundo são inspecionados a 100%/200%.

As 22 referências DS são complementos de estados; não substituem o master nem autenticam funcionalidades. Recortes originais em `reference-crops` são comparadores, nunca sprites. S03/S04/S06 implementam pelos próprios owners; S24 compara geometria, material, estados e exceções semânticas previstas.

<a id="a02"></a>
## A02 — Alinhamento óptico sem ajustes arbitrários

Usar caixas inteiras CSS, centralizar ícone no hitbox com flex/grid e manter largura/altura do wrapper estáveis. `icons/catalog.json` define glyph 16/20, viewBox real 16/20 e offset inicial `[0,0]`. Hitbox mínimo 28; navegação expandida 34 alto e compacto 40 largo×34 alto. Não alterar o path SVG compartilhado para deslocar um uso.

Registrar uma exceção óptica somente se a inspeção da bounding box pintada e da baseline demonstrar assimetria. Limite ±1 CSS px, só no wrapper local, com antes/depois a 100%/200%; exceção não altera padding, foco, clique nem layout dos vizinhos. Chevron/bullet têm slot próprio; nenhuma sucessão de `top: -1px` por tentativa sem registro. Em RTL, o eixo inline muda; não duplicar o offset horizontal do LTR sem conferir.

Texto normal 14/20; metadata 12/16; títulos 14/20 ou 22/28; código 12/16/peso 400. Buttons 12/16/peso 500. Linhas de código nunca têm bold sintético. Quebra, truncamento e altura são testados com acentos, ligaturas desativadas no código e números tabulares.

<a id="a03"></a>
## A03 — Q01–Q16: coleta objetiva e inspeção localizada

| Gate | Verificação objetiva | Inspeção que permanece humana/visual |
|---|---|---|
| Q01 | árvore/ordem dos slots, Dock acima de Tasks/Atividade, um composer | macrocomposição contra master |
| Q02 | DOMRect de divisores/caixas, slots e baselines; comparar as tolerâncias A01 | alinhamento óptico e arestas a 100%/200% |
| Q03 | computed colors vs tokens; cores compostas medidas | neutralidade grafite, sem roxo/ciano espalhado |
| Q04 | fontes realmente carregadas; métricas, peso 400 mono, 1x/2x | nitidez, cortes e quebras significativas |
| Q05 | nomes e viewBox do catálogo; glyph 16/20, hitbox≥28 | homogeneidade do set existente |
| Q06 | raio 4/6/8/12, borda 1, shadows do token | ausência de double-border/halo/glow |
| Q07 | DOMRect antes/depois idêntico; focus-visible presente; seleção conservada no hover | diferenciação hover/pressed/selected/focus |
| Q08 | cada estado ST abaixo e sua transição mapeados | comparar DS02–DS08/DS17–DS19 |
| Q09 | overflow/truncamento, title/tooltip, IDs intactos | paths/contas ainda distinguíveis |
| Q10 | draft/scroll/seleção preservados, última linha alcançável | comportamento ao resize e ao retorno de foco |
| Q11 | sem animação infinita cosmética; reduced motion; sem layout em cada token | transições discretas e legíveis |
| Q12 | contraste composto ≥ 4,5:1 para texto / ≥ 3:1 para controles essenciais; estado também textual | destaque sem falsificar resultado |
| Q13 | bounds/identidade/oclusão no Electron, click-test real | ausência de vazamento/gap e foco correto |
| Q14 | hashes HuGR, alpha/peso/aspect da paisagem, URL/MIME | borda/halo e paisagem limpa no tamanho nativo |
| Q15 | viewport nativo, zoom 200, RTL, teclado | compacto 56/overlays e composição estreita |
| Q16 | relatório de cobertura completo | consistência de todas as famílias, não só cockpit |

A comparação de pixels localiza diferenças; não atribui automaticamente beleza nem um score 99%. Uma mesma captura pode cobrir múltiplos critérios/superfícies presentes, com manifesto explícito. Nunca duplicar arquivos idênticos só para inflar a cobertura; também não declarar um estado invisível como coberto.

<a id="a04"></a>
## A04 — Estados fechados e precedência

O vocabulário é o mesmo em todas as superfícies, com escopo local. Prioridade de bloqueio: **HOLD/permissão/pergunta atual → erro de operação → indisponibilidade da capacidade → loading inicial → vazio → conteúdo**. Dados antigos só permanecem sob rótulo explícito de stale/offline; um loading de refresh não apaga conteúdo válido já recebido. Não sobrepor um “sucesso” transitório a uma recusa autoritativa.

| Estado | Aparência/estrutura | Conteúdo/ação | Atualização e prova |
|---|---|---|---|
| ST01 empty | caixa reservada, ícone 24, título 14/20, texto 12/18, padding 24 | texto contextual em copy; CTA só com handler real | ausência confirmada, não erro mascarado; DS02/15/16 |
| ST02 loading | skeleton estático no formato de 3 linhas; header estável | `Carregando…` via aria-busy/status; sem falsa contagem | montagem inicial; refresh conserva dados; DS03/18 |
| ST03 error | borda neutra e marcador lateral 2 px de erro, ícone + título | ação retry da operação certa; detalhe técnico expansível/copiável | retry não troca sessão/perfil, não apaga draft; DS04/13 |
| ST04 disabled | mesma dimensão; texto muted legível, sem pointer affordance de sucesso | motivo visível/aria-describedby; permitir leitura/cópia quando pertinente | `disabled` nativo para controle; não usar opacity do container inteiro; DS05 |
| ST05 permission-pending | card inline junto à execução, faixa warning | comando/contexto/ID; permitir uma vez/recusar pelos handlers existentes | nunca autoaprovar; stale recusa; DS06 |
| ST06 needs-input | card inline, escolhas rotuladas, submit explícito | resposta não equivale a aprovar plano; opção mantém identidade | draft de resposta/foco preservados; DS07 |
| ST07 unavailable/HOLD | ícone + motivo; mesma identidade do slot | inspeção/origem/alternativa REAL; nenhum botão falso | ambiente web pode carecer de view nativa; Electron suportado não pode faltar porque sua integração foi omitida; DS08 |
| ST08 offline/stale | aviso local persistente; dados anteriores rotulados | reconectar pela conexão existente; draft mantido | não reexecutar comando nem disparar modelo na reconexão; DS14 |
| ST09 partial result | badge warning “Saída parcial”, output disponível | abrir a fonte original; code/exit desconhecidos não viram 0 | truncamento não é sucesso; DS19 |

Dialog genérico: max 560 px de largura e 80dvh de altura; settings é a exceção explícita de 760 px e file picker de 680 px, sempre limitados ao viewport; padding 24, raio 12, foco inicial no primeiro campo/ação seguro; Escape devolve foco; fechar não salva. Picker max 680/760 conforme SPEC; popover 360 px inicial com max 560 e max 60vh; tooltips 350 ms e Escape, não interferem no tab order. Toast usa resultado observado, título 14/20 + helper 12/18, max 380; erro não desaparece antes de ser lido, não é única apresentação de uma falha. Veja DS09–DS13/DS22 e CSS correspondente.

<a id="a05"></a>
## A05 — Primitives V1/V2 sem regressão compartilhada

**Decisão:** tema opt-in `orchestra-graphite`, provider existente, `overrides`/`v2Overrides` existentes. Não criar um tema global default que recolora console/site/session-ui. Preservar default exports, props, valores semânticos e ordem de eventos. `zen/token-bindings.json` liga papéis aos nomes já presentes; o censo confirma os imports do checkout, não inventa outra paleta.

Ordem local S04: buttons/icon-buttons → fields/selects/tabs → dialogs/popovers/tooltips → lists/badges/checkbox/switch/toasts. A T1 libera o contrato tipado consumível; a T2 verifica as famílias V1/V2 e consumidores. Não precisar esperar a auditoria inteira para outras lanes usarem um contrato estável.

Para cada família: teste tema antigo claro/escuro e novo grafite; old-layout/V2; consumer app e imports em `packages/console`, `packages/web`, `packages/session-ui` quando realmente presentes. Não aprovar por snapshot do app só. Valor sem papel apropriado fica em alias local do owner; sem `!important` ou seletor global para vencer qualquer consumer.

Light mode: **preservar os valores/identidade anteriores**, aplicar as novas superfícies/layout/estados usando papéis já resolvidos; marca primary; paisagem nova não entra no light. Não excluir light dos testes só porque não há uma nova identidade clara desenhada.

Fontes: referenciar as existentes em `packages/ui/src/assets/fonts/Inter.ttf` e `JetBrainsMonoNerdFontMono-Regular.woff2`. Inter suporta os pesos já distribuídos; mono fornecida é regular. `font-synthesis:none` e 400 para código; não criar/downloadar/exportar fonte. PT-BR e EN no layout, fallback do sistema para scripts sem glyph, sem quadrados vazios. S22 é único writer dos dicionários; a copy completa inicial está em `../copy.json`.

<a id="a06"></a>
## A06 — Ícones: decisão final

**Reutilizar o set existente, zero biblioteca nova.** A descrição “Tabler/24 px/inline” do pedido não corresponde exatamente ao checkout auditado: `packages/ui/src/components/icon.tsx` usa um sprite por documento, viewBox 16 para três nomes e 20 para os demais. `icon.css` oferece small 16/normal 20/medium 24/large 24. Não transformar todos em viewBox 24 nem impor stroke novo a paths preenchidos.

33 SVGs separados estão em `icons/` com o nome nativo usado pelo `Icon`; o catálogo é de autoria/inspeção. Em produção, reutilizar o sprite existente, não carregar 33 imagens e criar outra família. Marcas oficiais não viram `currentColor`; file type icons continuam pelo componente de arquivo existente. Nenhum logo de modelo/provedor é redesenhado como ícone de ação.

<a id="a07"></a>
## A07 — RTL decidido

Shell/rail/nav/indentação/control groups usam propriedades lógicas: sidebar no inline-start (direita), contexto auxiliar no inline-end (esquerda), selected marker no inline-start, labels alinhadas ao início da escrita. A ordem de foco acompanha a leitura/ação sem `row-reverse` indiscriminado que diverge do DOM.

**Não espelhar:** HuGR, palavra Orchestra, paisagem, fotos/avatares, conteúdo web do Dock, strings de código, diffs, URLs, caminhos e números. Esses valores são `bdi` ou ilhas `dir=ltr`; o código mantém semântica +/- e posição de linhas. Ícones direcionais do componente existente espelham uma única vez; fechar, check, busca, stop, menu e marca não espelham. Chevron lógico de expansão acompanha a hierarquia.

Overlays calculam posições lógicas e colidem com viewport; foco/Escape iguais a LTR. Botões nativos da janela continuam na posição do sistema operacional, não são espelhados pela locale. DS21 é referência de geometria RTL com conteúdo de desenvolvimento LTR; não é prova de tradução árabe/hebraica. S22 testa locale RTL real pelo sistema existente e texto longo com ilhas LTR; não inventar traduções para preencher screenshot.

<a id="a08"></a>
## A08 — Sidebar de 56 px e responsividade

Em 1024–1279 CSS px a sidebar é 56 px; em 1280–1439 é 208 px; a partir de 1440 é 230 px. DS20 mostra o estado compacto forçado no viewport de referência 1672×941 para comparação. `DS20-native-1152x768.png` é um render em 1152×768 real, não uma imagem esticada. Em produção vale o breakpoint, não o tamanho da figura.

No modo compacto, usar o símbolo HuGR de 32 px centralizado no slot de 40 px, com o respiro externo especificado no kit. Texto Orchestra, tagline e labels ficam visualmente ocultos, mas os botões conservam nome acessível. A linha de navegação tem 40×34 px, glyph 20 px e marcador de seleção de 2 px no início lógico. Tooltip aparece ao lado da sidebar e colide com o viewport; badge de atenção não substitui o nome acessível. O workspace usa símbolo e menu pelo controle existente. O avatar tem 30 px; outros detalhes ficam no seu menu. Paisagem e copy promocional não aparecem.

Não expandir automaticamente no hover nem importar atalhos, hover/autohide ou preferências do Zen. Expandir segue o comando do aplicativo e explica quando a largura força o modo compacto. Busca, nova sessão, permissão e interrupção continuam acessíveis por teclado. Abaixo de 1024 px o rail é sob demanda; abaixo de 768 px há uma coluna principal, com a navegação existente acessível. Nunca reduzir a fonte global para caber.

<a id="a09"></a>
## A09 — Dock nativo: integração obrigatória e limitada

**Entradas verificadas:** `packages/app/src/pages/session/apps-panel.tsx`; `packages/desktop/src/preload/index.ts` e `types.ts`; `main/ipc.ts`; `main/app-dock.ts` e `app-dock-utils.ts`. O checkout possui Open/Resize/Hide/Select, eventos com tabID/generation e partições. Não é aceitável entregar sempre `unavailable` no Electron por falta de implementar o binding. S16 deve ligar ou estender o protocolo necessário; não criar segundo browser ou iframe.

**Clipping decidido:** no host nativo, o Dock fica ancorado no topo do rail e o grupo Tasks+Atividade rola abaixo. O viewport nativo não atravessa cards durante a rolagem. É a adaptação permitida por C-06; a ordem, largura e apresentação simultânea dos três painéis permanecem. Em janela baixa, reduzir o Dock até 240 px sem encolher sua toolbar, deixando o grupo inferior alcançável.

**Bounds:** ler o retângulo do viewport sem toolbar, header e padding; validar dimensão positiva; quantizar uma vez; usar `panelBoundsToContent` existente no main. No checkout essa função divide pelo zoom. Não substituir por `devicePixelRatio`, nem multiplicar/dividir novamente. Testar zoom 1/1.25/2 e DPR1/2, deslocamento da janela e arredondamento das bordas. Tamanho zero ou inválido implica Hide; não enviar 1×1 artificial só para passar na validação.

**Identidade:** Resize/Hide do novo consumidor carregam `tabID + generation`. S16 estende as APIs existentes com argumento de identidade opcional para compatibilidade dos callers legados; o caminho novo exige identidade. Main valida sender/mainFrame, pertença à janela, aba selecionada e generation antes da mutação síncrona. Chamada de outra aba ou geração é recusada sem side effect. O renderer não ganha autoridade para determinar outra sessão ou partição.

**Concorrência:** só um envio de apresentação fica em voo; o desired state mais recente substitui o pending. Um requestAnimationFrame agrega resize enquanto houver mudanças; não há loop em idle. O callback verifica a identidade atual antes de enviar e antes de aplicar a resposta. Cleanup cancela frame, observer e subscription; resposta após close não reabre a view.

**Overlays:** o owner existente mantém tokens idempotentes de aquisição/soltura, não um booleano global. O primeiro bloqueio esconde a view antes de ativar o overlay interativo; somente o último release pode restaurar a mesma aba, se ela continua ativa, visível e com Browser selecionado. Escape devolve foco ao invocador; dispose/release é idempotente. Alternar para Files/Docs/Terminal chama Hide, não Close. Fechar uma aba usa CloseTab, não Close global.

**Limite de escopo:** um binding ausente no host suportado deve ser implementado em S16 com testes. Não é uma dependência externa a ser resolvida com indisponibilidade permanente. Unavailable é legítimo no host web ou em falha real anunciada. As dependências de governança C-07/C-11 são outra frente.

**Aceite nativo:** sender estrangeiro, generation antiga, dimensão zero, duas abas/perfis, nested overlay, scroll, resize/zoom, callback tardio, crash/recover e fechamento de uma aba preservando as outras. Exigir evidência Electron real; os PNGs desta pasta não são essa prova.

<a id="a10"></a>
## A10 — Medição de performance sem aprovação por ruído

`BUDGETS.json` é a única autoridade numérica. Esta seção fixa o procedimento, não muda limites. Medir o build de produção que recebeu o acabamento, com controllers reais e fixture determinística. Fixar hardware, OS, runtime, cache, energia, viewport, DPR, refresh, tracing e instrumentação; registrar esses campos. Não usar uma versão visualmente reduzida para obter resultado melhor.

| Perfil | Procedimento |
|---|---|
| P01 / artefatos | Comparar manifests dos dois builds uma vez; não repetir estatisticamente valores estáticos. |
| P0 | 60 s de estabilização + 60 s de observação. |
| P1 | 8 sessões × 8 children, 10 mil mensagens / 50 mil parts e 100 eventos/s. |
| P2 | 1.000 arquivos / 100 mil linhas de diff / 1.000 modelos / 10 MiB de log; burst de 200 eventos/s por 10 s. |
| P3 | 30 min de soak + 50 ciclos + 300 s de estabilização/observação, na campanha integrada, não em toda primitive. |

**Pareamento:** cumprir os cinco pares mínimos e as amostras mínimas de cada registro — inclusive 200 onde exigidas. Alternar A→B/B→A para reduzir drift. Registrar warmup fora da amostra. A reserva do hardware existe somente na fase collect do helper; não compilar nem executar agentes/testes simultaneamente nesse host. Interrupção externa invalida o par afetado inteiro, com razão e logs; não remover observações lentas depois de conhecer o resultado.

**Memória:** preservar timestamps monotônicos e série bruta. Para a tendência, S02 calcula a regressão linear OLS no trecho após estabilização, em bytes/min, e registra método e janela. Os valores de cada repetição alimentam `residual_slope`; não aplicar valor absoluto, clamp para zero ou arredondamento que mude seu sinal. A política existente de sinais mistos retorna INCONCLUSIVE; crescimento sustentado reprova; tendência negativa legítima não é erro.

O hardware do usuário não foi calibrado nesta entrega. Sinal insuficiente exige limpar o ambiente ou repetir, não relaxar o budget. S23 interpreta observações; S25 reutiliza a prova válida do mesmo candidato sem repetir o soak. Testar esta referência HTML não mede Solid, Electron ou o desempenho final da Orchestra.

<a id="a11"></a>
## A11 — Honestidade e fronteiras de conclusão

Desconhecido é `unknown` ou ausência explícita, nunca 0. Resultado verde exige execução/status/exit reais; plano do todowrite não é comprovação. Contagens Bun exigem parser, formato e origem reconhecidos; output parcial não vira resultado completo. Tarefa indeterminada não ganha percentual por tempo ou tokens. Atlas, Dock e Janitor não são agentes fictícios online.

Não adicionar botão que apenas produz toast de sucesso, polling cosmético, segundo store/provider/runtime, escolha de conta por display label ou aprovação inferida do modelo. Estados indisponíveis legítimos não autorizam omitir uma integração obrigatória já suportada.

As referências daqui têm `synthetic: true` e `is_product_evidence: false`; ficam fora dos recibos de aprovação. Medições reais sobre workload fictício são um caso diferente, permitido com identidade e verificação. Assets copiados ou testes do tooling não encerram produto: S01 exige censo real classificado; S02 exige fixture e coletores exercitados; piloto exige app conectado; S23/S24 medem e revisam o mesmo build.
