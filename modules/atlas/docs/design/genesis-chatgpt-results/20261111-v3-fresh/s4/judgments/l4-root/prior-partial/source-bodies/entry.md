# Entrada S4: consultar e parar no ponto suficiente

Scope exato: `atlas-continuity-rag-genesis`. Atlas serve conhecimento governado; Continuity preserva recuperação de contexto; RAG diagnostica documentos/provas. Compartilhar host não une IDs, transações ou autoridade. Base integrada: `S4:L3:system-flows` § Um host, três percursos de estado.

## Comece pela porta real

Fixe código/release autorizado e raiz isolada; defina `S4_REPO` para essa raiz. No checkout de código, entre em `modules/atlas` e grave ali, no CWD dos comandos, `entry-index.json` e `entry-read.json` com os JSONs abaixo:

```sh
bun scripts/genesis-native.ts index "$S4_REPO" entry-index.json
bun scripts/genesis-native.ts read "$S4_REPO" entry-read.json
```

`entry-index.json`:
```json
{"scope":"atlas-continuity-rag-genesis","need":"entry"}
```

`entry-read.json`:
```json
{"scope":"atlas-continuity-rag-genesis","need":"entry","maxBytes":5000}
```

Se esta entrada resolve a tarefa, responda e pare. A rotina não exige ler todo o grafo. Para aprofundar, use uma key exata; `section` é o título H2 sem `##`. Exemplo de outra consulta read:

```json
{"scope":"atlas-continuity-rag-genesis","key":"S4:L1:host-boundaries","section":"2. HTTP RAG → Store por requisição → SQLite","maxBytes":4000}
```

Não combine key e need. Omita section para corpo completo; não acrescente campos ao index. Histórico só com `historical:true` explícito em read; omita-o para consumo corrente. A CLI usa `ownership.index/read`; abrir Markdown não é consumo Atlas. Formas verificadas estaticamente em `modules/atlas/scripts/genesis-native.ts` e `modules/atlas/packages/adapter-io/src/genesis-native-format.ts` (`validateNativeReadQuery`); sem execução aqui. [S4:L1:native-runtime-delta § Consumo e manutenção pela porta real]

## Orçamento público e rota profunda opcional

Limites: **2 index, 12 read, 62000 bytes de corpos devolvidos no total; raso <=6000; cada read maxBytes <=18000**. A primeira leitura acima cabe no raso. Um segundo index, se necessário, seleciona outro need; ele não devolve corpos. Contabilize chamadas e bytes efetivos; budget de corpos não mede IO do servidor, tokens ou custo. [S4:L2:atlas-system § O percurso até uma leitura utilizável]

A tabela oferece uma rota opcional: entrada + onze consultas = 12 read. Os intermediários somam 55831B no catálogo fixado; com entrada <=5000B, total <=60831B. Use cada corpo/section uma vez; substituições e leituras adicionais exigem recontagem. Em outra seleção/release, confira tamanhos e orçamento restante antes de continuar. O catálogo não obriga percorrer a tabela.

| Key | Para quê | Seleção read | Bytes |
|---|---|---|---:|
| `S4:L3:system-flows` | Fluxos/falhas | corpo completo | 8995 |
| `S4:L2:atlas-system` | Motor/identidade | corpo completo | 7954 |
| `S4:L2:genesis-governance` | Autoria/autoridade | corpo completo | 7971 |
| `S4:L2:continuity-rag-operations` | Contexto/RAG | corpo completo | 7949 |
| `S4:L1:ownership-boundaries` | Identidade | `What each identity means` | 2518 |
| `S4:L1:atlas-engine` | Forma/status | `Knowledge: shape, routing, human ratification, and ownership results` | 3493 |
| `S4:L1:atlas-host-genesis` | Publicar/rebuild | `Ownership publication, observation and rebuild` | 2708 |
| `S4:L1:continuity-rag` | Recuperação | `Continuity: recoverable request reduction around the Session core` | 7246 |
| `S4:L1:coverage-governance` | Recusas/leitura | `Observer limits are not scope limits` | 1977 |
| `S4:L1:host-boundaries` | Estado SQL | `2. HTTP RAG → Store por requisição → SQLite` | 3659 |
| `S4:L1:native-runtime-delta` | CLI/consumo | `Consumo e manutenção pela porta real` | 1361 |

Os quatro needs L4 têm funções diferentes. Para ações, as chaves planejadas `S4:L4:ownership`, `S4:L4:maintenance` e `S4:L4:operational` são navegação; confirme disponibilidade e substitua consultas da rota, sem exceder limites. Outro L4 não é fonte nem dependência desta entrada.

## Pare diante de limite ou evidência insuficiente

Pare quando a resposta já tem sustentação, o orçamento acabar ou surgir HOLD/erro/gap material. Exit 2 conserva HOLD/recusa; exit 1 indica erro. Não conclua ausência a partir de indisponibilidade nem force leitura histórica como resposta corrente. Preserve diagnóstico e procure o responsável pela porta; não contorne seleção/publicação abrindo o CAS. [S4:L3:system-flows § Após falha, separar recuperação de nova publicação]

Uma leitura servida vale para os objetos, vínculos e scope verificados; não prova instalação global, autenticação, execução completa ou custo financeiro. Fixe os recibos da seleção usada antes de agir. Esta documentação não declara aceite, binding, publicação ou consumidor L4; modelo/tokens/cobrança não expostos são UNKNOWN. [S4:L1:native-runtime-delta § Limites e estado da evidência]
