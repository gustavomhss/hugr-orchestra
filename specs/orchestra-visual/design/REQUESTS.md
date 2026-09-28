# Pedidos da sessão executora — resposta e localização

`REQUESTS-SOURCE.md` preserva o texto recebido. As duas imagens de “resposta” geradas anteriormente não são especificações, não entram no repositório e não comprovam entrega. Esta resposta está em texto pesquisável, ligada a arquivos reais e aos tickets existentes.

**Atendido como insumo/decisão não significa produto implementado.** Nenhuma linha abaixo concede PASS à S01, S02 ou a um widget. A migração segue as 66 tasks existentes, os cinco axiomas e o DAG. As referências DS são de design e estão marcadas como sintéticas; as capacidades externas continuam condicionadas à sua prova real.

## A — Frentes em que havia decisão faltante

| Pedido | Entrega/decisão | Local | Unidade que aplica |
|---|---|---|---|
| A1 raster→Solid | Nova fonte HTML/CSS de estados, master intacto, amostras pixel a pixel com dispersão; sem Figma inventado | README, EXECUTOR-DECISIONS A01, zen/MEASUREMENTS e tokens | S03/S04/S06/S25 |
| A2 alinhamento óptico | Slots e baseline definidos; offset inicial 0; exceção local ±1px com prova, sem editar glyph compartilhado | A02; icons/catalog | S04/S24 |
| A3 microacabamento | Checklist Q01–Q16 com parte objetiva e inspeção localizada; não score de beleza automático | A03 | S04/S24 |
| A4 estados não desenhados | 22 PNGs 1672×941; nove padrões de estado, copy, ação, prioridade e transição | STATES, states/, A04 | owners dos estados |
| A5 primitives V1/V2 | Opt-in no provider existente, mapeamento de papéis, defaults e consumers preservados | A05; zen/token-bindings | S03/S04 |
| A6 iconografia | Usar o sprite atual, não nova biblioteca; 33 SVGs separados; viewBox 16/20 corrigido pelo código | A06; icons/ | S04 |
| A7 RTL | Sidebar à direita, rail à esquerda; marca/paisagem/código não espelhados; ilhas LTR e foco definidos | A07; DS21 | S06/S22/S24 |
| A8 compacto de 56 px | Slot, ícone, tooltip, workspace/avatar/seleção e ausência de paisagem decididos | A08; DS20 e 1152 nativo; elements/sidebar-collapsed | S06/S22 |
| A9 Electron | APIs/arquivos reais, identidade em resize/hide, oclusão por owner, Dock ancorado e conversão existente | A09; C-06 | S15/S16 |
| A10 performance | Procedimento A/B e soak, dados brutos/sinal, ruído inconclusivo sem PASS; budgets preservados | A10; PERFORMANCE/BUDGETS | S02/S23 |
| A11 honestidade | Unknown≠0; operação ≠ toast; fonte ≠ prosa; referências≠produto; integração omitida ≠ unavailable | A11; ST01–ST09 | todas as frentes |

## B — Constatações de prontidão

| Achado | Tratamento correto | Local e condição |
|---|---|---|
| B1 só uma task liberada | Bootstrap deliberado, não defeito a resolver marcando 65 tasks prontas. S01 conclui o censo antes do fan-out. | RUN e S01; não declaramos fan-out já liberado. |
| B2 zero implementação | Mantido. Há novos assets, copy e referências, não frontend aprovado. | progress.json permanece intacto. |
| B3 tokens estimados | Fundos foram amostrados; valores medidos e decisões de engenharia são distinguíveis. | MEASUREMENTS, tokens e SPEC §3.3. |
| B4 paisagem ausente | WebP e PNG fornecidos, extraídos do master sem texto/controles. Céu oculto reconstruído é identificado na proveniência. | landscape e ASSETS; S05 ainda valida a integração. |
| B5 marca não instalada | Símbolos oficiais separados, com destino e hash. S05 copia bytes para src e testa o consumo. | ASSETS e BRAND-ASSETS; não declarar render antes disso. |
| B6 dependências externas | W2 live continua gated em #106/#108/#109/#112/#113/#114. W1 tem estado honesto, sem duplicar Maestro/Atlas. | C-07/C-11 e S19/S20; não fechar issues externas para liberar UI. |
| B7 custo das capturas | A regra já evita o cartesiano total: todos os estados no viewport primário; defaults nos demais/perfis extras. Reusar a mesma captura quando mostra várias superfícies. | COVERAGE.rule, A03 e gallery; nenhum gate removido. |
| B8 documento antigo | BRAND-INPUT vira índice atual, sem ZIP do chat nem avisos antigos de falta de sincronização. | BRAND-INPUT; histórico fica em reviews. |
| B9 worktree janitor | Usar worktree isolado, sem reset, stash ou troca da branch original; preservar PERFORMANCE-PLAN.md. | Procedimento abaixo. |
| B10 fontes | Inter existente e mono regular 400; sem peso sintético ou font download. Testar glyph coverage e fallback. | A05; nenhuma fonte redistribuída. |

## C1 — Os seis pedidos de maior alavanca

1. **Rasters por estado:** 22 referências em 1672×941, indexadas por `STATES.json`: modal, popover, picker, toast, empty, loading, error, disabled, permission, question, offline, sem sessão, sem workspace, diff/loading, output parcial, compacto e RTL. São referências de interface, não texto de especificação em imagem.
2. **Fonte editável:** Figma original não foi fornecido. Entregamos HTML/CSS editável, os insumos de render e medições do PNG. Não apresentamos essa reconstrução como o original.
3. **Ícones:** usar a família atual do Orchestra, com nomes/viewBoxes confirmados e SVGs separados. Sem outra biblioteca.
4. **Paisagem:** montanhas dessaturadas grafite-azulado, derivadas do master; decoração de 257 px de altura na sidebar expandida escura, largura 230 px, com alpha. Não espelhar em RTL, não usar no modo compacto/claro e não adicionar parallax. WebP, PNG, máscara e origem estão separados.
5. **Identidade:** light preserva seus valores anteriores, mas recebe os novos slots/estados funcionais. Compacto de 56 px foi definido e desenhado. RTL tem composição decidida e referência geométrica, sem falsa alegação de tradução aprovada.
6. **Copy PT-BR/EN:** `copy.json` contém 113 chaves novas com frases completas, contexto, placeholders e plural. S22 resolve aliases para chaves existentes e instala os dicionários, preservando English antigo fora das mudanças autorizadas.

## B9 — Obter o plano sem tocar no trabalho do usuário

Execute no repositório identificado como `gmhelmold/HuGR-Orchestra`. Não usar um diretório escolhido por nome sem conferir remote e raiz.

```sh
# CWD: checkout atual, possivelmente janitor, com alterações preservadas.
REPO="$(git rev-parse --show-toplevel)" || exit 1
git -C "$REPO" remote get-url origin
git -C "$REPO" status --short
# Verifique a identidade do remote antes dos próximos comandos.
git -C "$REPO" fetch origin visual-migration-plan
TARGET="$(dirname "$REPO")/orchestra-visual-execution"
test ! -e "$TARGET" || { echo "Destino já existe; não sobrescrever."; exit 1; }
git -C "$REPO" show-ref --verify --quiet refs/heads/visual-execution && {
  echo "Branch já existe; retome o worktree correspondente, sem recriá-la."; exit 1;
}
git -C "$REPO" worktree add -b visual-execution "$TARGET" origin/visual-migration-plan
cd "$TARGET/specs/orchestra-visual" || exit 1
python3 tools/executor.py doctor --repo "$TARGET"
python3 tools/executor.py resume --repo "$TARGET" --jobs 4
python3 tools/executor.py packet S01-W1-T1 --repo "$TARGET"
```

A branch e o arquivo não rastreado do checkout original permanecem intactos. O procedimento não instala dependências nem liga serviços. Depois de um merge confirmado na dev, pode-se criar o worktree sobre origin/dev contendo este complemento. Não resetar o checkout principal.
