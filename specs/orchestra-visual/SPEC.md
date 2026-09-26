# SPEC — aparência e comportamento normativos

Versão do pacote: **4.1**. Layout, tema e acabamento aprovados permanecem intactos. A marca HuGR agora usa o kit oficial fornecido; a substituição é localizada ao símbolo ilustrativo, conforme BRAND-INTEGRATION.md.

Referência de layout: `reference/approved.png`, 1672×941, SHA-256 `e839b759e0f93beca37b10cd45700725020a840fee6e97da1e67556b2ffb128d`. Aparência aprovada pelo usuário; medidas/tokens são defaults de engenharia derivados do raster. Não voltar às explorações Claude/Replit nem regenerar o master. Não são camadas Figma ou CSS original.

Escopo: toda UI desktop/web do Orchestra. Conteúdo web do Dock, console/site/marketing upstream e TUI não recebem o layout desktop; verificar não regressão nos consumidores compartilhados. O modo claro preexistente é preservado, não uma nova identidade aprovada.

## Marca recebida — autoridade complementar, não outro tema

`BRAND-INTEGRATION.md` e `BRAND-ASSETS.json` são normativos. O kit íntegro está em `vendor/HuGR-Brand-Kit-v1.0/`. Use seus SVGs aprovados, sem reconstruir o elo ilustrativo do mock. O master da interface permanece intacto; o novo símbolo é a única exceção de marca registrada para a comparação. Não mascarar a sidebar inteira.

O nome do produto continua **Orchestra**, em texto separado do símbolo HuGR. Não criar um lockup vetorial nem modificar o wordmark HuGR. Tema, fontes, espaçamentos de conteúdo e contraste da Orchestra continuam nesta SPEC; não importar globalmente os tokens de tema do kit. A paisagem de montanhas não foi fornecida como asset independente por esse kit.

## 3. Alvo visual implementável

### 3.1 Árvore de composição obrigatória

```text
AppShell
├─ Sidebar [altura toda]
│  ├─ símbolo HuGR oficial + nome Orchestra em texto separado
│  ├─ busca / nova sessão / navegação existente
│  └─ paisagem dessaturada + workspace + identidade do usuário
└─ Workspace
   ├─ ContextBar [projeto · branch · sessão]
   └─ Body
      ├─ Main [dominante]
      │  ├─ SessionHeader [título · subtítulo · ações]
      │  ├─ Transcript [rolagem]
      │  │  ├─ mensagem de usuário
      │  │  ├─ resposta / atividade de execução
      │  │  ├─ ChangesEvidence [lista de arquivos | diff selecionado]
      │  │  ├─ TestEvidence [resultado / output]
      │  │  └─ mensagem / ações de conclusão
      │  └─ Composer [único; preso à base do Main]
      └─ ContextRail [rolagem independente]
         ├─ DockPanel [maior card; no topo]
         ├─ TasksSummary
         └─ ActivitySummary
```

Nomes acima são responsabilidades, não arquivos ou APIs existentes. Extraia somente os componentes necessários. O rail deve mostrar **Dock, Tasks e Atividade simultaneamente** em janela larga; não reaproveite as abas antigas de modo que continuem mutuamente exclusivas. Não monte três runtimes para conseguir isso.

### 3.2 Geometria

Sistema do raster: origem no canto superior esquerdo; caixas `[x0,y0,x1,y1)`. Medidas aproximadas.

| Região | Caixa-alvo no raster |
|---|---|
| Moldura externa | `[13,12,1659,929]` |
| Sidebar | `[14,13,243,928]` |
| ContextBar | `[243,13,1658,58]` |
| Main | `[244,58,1209,928]` |
| ContextRail | `[1210,58,1658,928]` |
| Cabeçalho da sessão | `[270,72,1182,143]` |
| Lista de alterações | `[345,388,751,598]` |
| Diff | `[759,388,1175,603]` |
| Evidência de testes | `[345,662,1175,779]` |
| Composer | `[272,871,1184,917]` |
| Dock | `[1220,66,1650,519]` |
| Tasks | `[1220,527,1650,726]` |
| Atividade | `[1220,736,1650,918]` |

Implemente com grid/flex, não coordenadas absolutas de todos os elementos. Defaults no tamanho de referência: sidebar `230px`, topbar `44px`, rail `448px`, Main flexível, divisores `1px`, padding central `28px`, gutter de mensagem `62px`, gap entre cards `8px`, padding dos cards `12px`.

O espaço de 12–14px fora da janela é apresentação do mock. Pode existir apenas no teste visual. Não desenhe uma segunda janela dentro da janela Electron. No macOS, um único conjunto de controles nativos; não copie também os botões Windows do raster.

Para comparação normalizada, recorte o master em `[13,12,1659,929]` (`1646 × 917`). Compare à mesma área útil da implementação, registrando diferenças de decoração nativa. Não estique capturas para esconder larguras incorretas.

### 3.3 Tokens iniciais

Mapeie estes papéis aos tokens V1/V2 existentes; use aliases locais apenas onde faltar um papel. Não cole overrides globais indiscriminados nem `!important` em cascata.

```yaml
colors:
  canvas: '#10161D'
  shell: '#131A23'
  surface: '#18212A'
  surfaceRaised: '#1B2531'
  surfaceSunken: '#0E151C'
  input: '#1B232E'
  selected: '#1F2B3A'
  borderSubtle: '#2A3745'
  divider: '#202B36'
  textPrimary: '#E4EAF2'
  textSecondary: '#B4C0CF'
  textMuted: '#8C9DB2'
  textDecorative: '#607187' # nunca texto informativo
  accentText: '#78ADE8'
  primaryFill: '#285DC7'
  onPrimary: '#F5F8FC'
  success: '#75CFA4'
  warning: '#DAB579'
  error: '#F18C93'
  diffAddBg: '#152724'
  diffDeleteBg: '#302024'
  focus: '#78ADE8'
  controlBoundary: '#6A7D94'
radiusPx: {window: 12, panel: 8, control: 6, chip: 4}
typePx: # [tamanho, entrelinha, peso]
  brand: [21, 26, 600]
  sessionTitle: [22, 28, 600]
  body: [14, 20, 400]
  panelTitle: [14, 20, 600]
  metadata: [12, 16, 400]
  code: [12, 16, 400]
  button: [12, 16, 500]
geometryPx:
  navRow: 34
  buttonHeight: 30
  icon: 16
  iconHitArea: 28
  avatar: 40
  composerMin: 46
  composerMax: 180
shadow:
  panel: '0 1px 2px rgb(0 0 0 / 16%)'
  floating: '0 10px 32px rgb(0 0 0 / 28%)'
motionMs: {hover: 120, panel: 180, tooltipDelay: 350, reducedMotion: 0}
```

Use a sans e a mono já distribuídas pelo repo. Na ausência delas, use `system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif` e `ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace`. Não baixe fontes proprietárias. Ajuste métricas somente após comparar as quebras de linha.

Mantenha fundos estáveis atrás do texto. Gradiente discreto somente se necessário para reproduzir o shell; nenhum fundo animado. A paisagem fica apenas na porção inferior da sidebar. Nada de imagem atrás de código, diff ou conversa.

### 3.4 Regras por superfície

| ID | Implementar | Comportamento obrigatório |
|---|---|---|
| U01 | Sidebar estreita; marca, busca, New Session, navegação, divisor, Projects/Workspaces/Settings, workspace e usuário; ritmo do master | Mapeie cada entrada a rota/ação existente. Sem destino: indisponibilidade explicável ou omissão localizada, nunca página vazia fictícia. Seleção com fundo desaturado e barra azul fina. Atalhos reais da plataforma. |
| U02 | Barra compacta acima do centro/rail | Projeto, branch, sessão e atividade reais; truncamento por item com acesso ao texto completo. Tabs de sessão não se confundem com tabs de arquivo. |
| U03 | Título de sessão e subtítulo discretos, ações à direita | Tolerar duas linhas. Sem greeting nem cards de onboarding durante sessão ativa. Share somente com handler real. |
| U04 | Conversa sobre canvas, autores e metadados; cards só para resultados | Preservar markdown, anexos, streaming, seleção, virtualização e identidades. Não remontar histórico a cada token. Não puxar scroll de quem está lendo acima. |
| U05 | Atividade/checklist compacto | Renderizar apenas estado disponível. Pendência, execução, cancelamento, falha e conclusão distinguíveis; sem exposição artificial de raciocínio privado. |
| U06 | Lista e diff lado a lado, proporção ~1:1 | Selecionar arquivo troca diff, não sessão. Contagens e versão vêm do host. Preservar seleção, copiar, syntax e semântica verde/vermelho. Sinalizar revisão alterada. |
| U07 | Resultado de testes/terminal como evidência integrada | Use renderer/parser existente; sem parser confiável, output e exit code, sem estatística inventada. Histórico não prova a revisão atual. Output completo acessível; parcial indicado. |
| U08 | Ações compactas de revisão/conclusão | Abrir diff/editor/output, repetir ação e criar PR somente onde houver contrato real. A aparência nunca autoriza publicação. Sem botão que só produz toast de sucesso. |
| U09 | Único composer inferior, anexos à esquerda, modelo e enviar à direita | Preservar IME, multiline, paste, anexos, draft, envio e interrupção. Crescer até ~180px; reservar espaço para não cobrir última mensagem. Nenhum segundo input no topo. |
| U10 | Seletores e popovers no mesmo tema | Modelo/provider/rótulo de credencial distinguíveis. Não modificar credenciais. Escape devolve foco; teclado funciona; nunca exibir secrets. |
| U11 | Dock como maior card do rail, com header e navegação separados do site | Reutilizar view nativa e partições; não substituir por iframe. Site mantém estilo próprio. Sem relaxar HTTPS, sandbox, DevTools, isolamento ou permissão para imitar localhost. |
| U12 | Tasks compacto abaixo do Dock | Use sessão-filha/callID do host. Deduplicação, estado real, modelo/duração quando conhecidos; abrir transcript e interromper a entidade correta. Sem polling novo. |
| U13 | Atividade abaixo de Tasks | Agentes são agentes; Atlas é conhecimento, Dock é browser, Janitor é scanner. Card misto chama-se Atividade. Sem quatro agentes fictícios ou presença inferida. |
| U14 | Empty/loading/error/unavailable cuidadosos | Ausência de dados não é healthy. Mostrar falha no local, ação disponível e output parcial. Janitor permanece read-only. Permissão pendente e stop nunca são escondidos pelo tema. |

**Progresso:** o master contém percentuais fictícios. Sem total mensurável, mantenha a geometria compacta com estado/duração e indicador indeterminado discreto; não calcule avanço por tempo/tokens. `0` somente quando for um dado, não fallback para desconhecido.

**Scroll e lifecycle:** Main, rail e página web têm rolagens próprias. Não dê scroll independente a cada pequeno card. Toolbar e input permanecem acessíveis. Trocar painel não descarta draft, seleção, perfil, aba ou tarefa. Não duplique subscriptions/timers.

### 3.5 Janela e acessibilidade

- `>=1440px`: sidebar `230px`; rail `clamp(360px, 27vw, 448px)`; Main recebe restante.
- `1280–1439px`: sidebar `208px`; rail `340px`.
- `1024–1279px`: sidebar `56px`; rail `320px`, recolhível.
- `<1024px`: centro prioritário; rail sob demanda; abaixo de `768px`, coluna única.
- Se lista+diff não comportarem leitura, empilhe ou alterne mantendo seleção; não reduza globalmente a fonte para caber.
- Use `min-width:0`, `min-height:0` e overflow correto. Paths, títulos e outputs longos não podem expandir a janela.
- Metas de teste: contraste `>=4.5:1` para texto comum; `>=3:1` para controles essenciais/foco; hit area de ícones `>=28×28px`. Meça cores compostas, não pixels antialiasados. Bordas só decorativas podem ser sutis.
- Texto/ícone acompanha cor de estado. Teste teclado, Escape, foco, zoom 200% e reduced motion. Não anuncie certificação de acessibilidade por passar esses checks.


## 4. Regras fixas para as outras superfícies

Os números a seguir são defaults desta migração, não uma aprovação visual separada do usuário. Preserve a direção e execute; não abrir outra fase de moodboards.

| Família | Composição e dimensões iniciais | Conteúdo e estados |
|---|---|---|
| Home/projetos/sessões | Mesmo shell; conteúdo max1080px; listas com linhas40px e divisores sutis; cards apenas para grupos funcionais | Busca, recentes,0/1/muitas sessões, arquivamento; greeting apenas aqui, não na sessão ativa |
| Nova sessão | Composer real central max760px; identificação workspace/modelo acima ou dentro dos controles existentes; sugestões discretas quando já existentes | Draft/anexos/primeira seleção/pending models preservados |
| Settings | Dialog max960px e max80dvh; navegação180–200px, conteúdo min-width0; paddings24px; rows44–56px segundo helper text | General/Appearance/Models/Providers/Servers/Keybinds e seções adicionais alcançáveis; salvar/erro/disabled/mixed |
| Command palette | Max640px; top approx18vh; input44px; resultado36px; label/hint/shortcut alinhados; teclado-first | Search/empty/loading/erro/disabled; buscar não muda seleção de conta |
| Provider/OAuth/custom | Dialog max560px; field heights36px; labels12/16 e helper13/18; ações no rodapé, detalhe expansível | Mask de key, cancelar/retry, credencial removida, vários labels iguais, token não vaza |
| Model/MCP/select | Popover min320px/max560px; lista limitada60vh e virtualizada quando grande; agrupamento provider/credential | Rodapé explica indisponibilidade; não esconder discriminação de conta por ellipsis |
| File/directory/server picker | Dialog max760px; lista densa32–36px; path mono12/16; busca44px; breadcrumbs e active row consistentes | Empty/no-access/remote/cancel/pending; policy de diretório intacta |
| Permissão/question | Card junto à execução correspondente; texto principal14/20; ação primária compacta; motivo/contexto expansível | IDs exatos, pergunta≠aprovação, pending/stale/declined, teclado e origem claros |
| Diff/file tree | Header32px; rows28–32px; código12/16; áreas internas min-width0; handle sutil | No-git/binário/zerochanges/loading/fail/partial; texto selecionável, versão correta |
| Terminal | Container existente e fonte mono; tabs32px; glyph/frame sem subpixel blur | PTY real; reflow e resize corretos; theme não reinicia processo |
| Context/resources | Card/surface de inspeção no shell; números tabulares; rows28–32px; legenda distingue estimado/medido | Tokens/cost disponíveis; unknown não é0; Own stale/HOLD nunca verde |
| Tasks expanded | Mesma projeção do card compacto; título/status/model/duration; detalhes só por abertura |0/1/64+children, child transcript, nested, failed/needs-input |
| Janitor | Resumo discreto; expandido max420px e altura bounded, nunca cobre composer/permissão sem alternativa | Fonte/dismiss/snooze/report real; não um monitor de CPU com charts fake |
| Toast/connection/quota | Superfície pequena elevada, max400px; texto13/18; ação com nome e foco; errors persistem também no contexto | Sem engolir erro de runtime em toast efêmero; retry existente |
| Desktop startup/updater | Fundo shell desde primeiro frame; logo limpo, estado centrado curto; controles OS corretos | Loading/retry/offline/install/failure; sem alterar release channel |

Todas as superfícies herdam typography/radius/contrast/tokens do mesmo provider. Não criar CSS theme separado por feature. Não estilizar tudo de cinza plano: conservar pigmento discreto e profundidade do master.

## 5. Microacabamento Q01–Q16

| ID | Critério de aceitação visual/ergonômico | Reprova quando |
|---|---|---|
| Q01 | Mestre e composição corretos; sidebar/centro/rail e Dock superior | Batch errado, editor central ou cards reorganizados sem pedido |
| Q02 | Alinhamento óptico e grid; divisores±3px no fixture1672×941; caixas±4px | Offset1–2px visível em linhas/ícones/baselines, padding inconsistente |
| Q03 | Canvas grafite azulado, selected #1F2B3A, azul contido | Purple/cyan wash/neon ou fundo preto/cinza morto |
| Q04 | Escala tipográfica consistente, antialias e lineheight legíveis1x/2x | Fonte encolhida para caber, letra borrada/clip, peso arbitrário |
| Q05 | Stroke/glyph homogêneos, ícone16–20px/hit-area28px | Ícones de famílias misturadas, sem nome acessível, offsets no botão |
| Q06 | Raio4/6/8/12, borda1px e sombras de baixa amplitude | Double-border, pills gigantes, borda branca pesada, glow |
| Q07 | Hover/pressed/selected/focus distintos sem alterar dimensão | Layout jump, seleção some no hover, foco invisível |
| Q08 | Empty/error/loading/disabled completos e estáveis | Espaço vazio inexplicável, skeleton saltando, erro verde |
| Q09 | Texto/path longo conserva identidade e acesso ao completo | Conta/branch/arquivo errados por truncamento, sobreposição de controles |
| Q10 | Roll/resize/focus mantêm estado; scroll independente | Sticky cobrindo última linha, scroll roubado, nested scrollbar gratuito |
| Q11 | Motion discreto120/180ms, reduced motion; só propriedades baratas | Width/blur/shadow animados em loop ou fade prejudicando input |
| Q12 | Contraste informativo e semântica correta | Texto opaco demais, erro só por cor, verde sem evidência |
| Q13 | Native/browser bounds e overlays exatos | Gap/oclusão/clique vazando ou janela duplicada |
| Q14 | Assets HuGR oficiais intactos; paisagem final limpa; proporção, variantes e clear space corretos | Redesenhar/otimizar HuGR, copiar elo ilustrativo, alterar tokens globais, placeholder final, halo no alpha |
| Q15 | Todos viewports e zoom/RTL suportados sem quebrar ação | Input inacessível, hard fixed height corta conteúdo, reduzir fonte global |
| Q16 | Mesma identidade em toda surface e estado listado | Só cockpit foi migrado; settings/toast/picker continua aparência antiga |

Tolerâncias de bounding box não autorizam ignorar defeito perceptível. Revisar o render a100% e200%, aplicar overlay com reference e conferir clique/foco. Não fazer score inventado de98% ou usar apenas SSIM global; screenshot raster de UI gerada não tem texto/código verdadeiro e permite somente diferenças semânticas explicitadas.

## 6. Contratos entre lanes

- **Shell slot**: fornece regiões `navigation`, `header`, `transcript`, `composer`, `contextRail`. Consome componentes/accessors existentes; não define Session/Task novos. S06 produz; S25 conecta.
- **Identity**: toda derivação identifica serverKey+sessionID; task tem childSessionID oucallID; arquivo tem revisão; Dock tem tabID+generation+profile. Nome de exibição não é chave.
- **Tasks read model**: mesmo source sincronizado alimenta summary/expanded; estados running/needs-input/completed/failed. Cancelled/unknown só quando fonte distingue. Sem percentual inferido.
- **Activity read model**: união tipada agent/tool/system com identidade e source; não fingir presence. Contadores só de agentes reais.
- **Evidence**: source message/tool call+command+execution status+exit code+time+revision se conhecida. Sem parser confiável, raw log. Nenhum comentário do LLM é evidência de teste.
- **Capability read**: discriminante available/unavailable/HOLD; reason e identidade; available inclui dado autoritativo versionado. Stale/foreign/malformed recusa. Novos tipos são contrato do plano, não API existente afirmada.
- **Dock visibility**: uma view nativa por tab conforme host; esconder/ocluir preserva perfil/lifecycle. Sender validation e rollback em erro; z-index web não substitui native visibility.
- **Localização**: S22 é writer exclusivo dos dicionários; novas labels são definidas emcopy.json e consumidas pelo código. Não hardcode texto em produção para contornar typecheck.

## 7. Escopo de backend necessário

Permitir apenas read projections/adapters que faltam para ligar UI existente a dados autoritativos. S19-W2 e S20-W2 tratam esses casos e têm dependências externas. Não construir novo sistema de governança/Atlas/store/métricas, nem elevar permissões para mostrar conteúdo do raster. A imagem não pede implementação da aplicação Approval Flow dentro do Dock: aquilo é site de demonstração.

O cockpit deve funcionar com as capacidades presentes. A indisponibilidade autoritativa é um estado de UI obrigatório, não uma entrega fictícia da capacidade live. Gate visual e gate de enablement ficam registrados separadamente.

## Cobertura objetiva v4

SURFACES.json/CENSUS.json distinguem UI de fontes/leitores/lacunas. Cada UI migrate/inherit tem estados e coverage_host. COVERAGE.json e tools/visual_coverage.py derivam as combinações obrigatórias. Gate final não aceita uma única captura arbitrária. PNG precisa decodificar, medir viewport×DPR e estar ligado a build/fixture/master. Microacabamento Q01–Q16 continua exigindo inspeção real; não é avaliado por similaridade inventada. Piloto W0 confere composição e interações iniciais; não substitui o aceite completo de W1.
