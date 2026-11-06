# Declaração pura — evidência DEC/PAR/CMP

## Estado e alcance

**Fatia integrada pelo lead em 2026-11-05. Não é entrega do Fabric Studio nem freeze geral de S04/B-CONTRACT.** O mandato de continuidade está em [DELIVERY.md](./DELIVERY.md). Requisitos e aceitação canônicos permanecem inalterados.

Código recuperável em `fabric-declaration` @ `c3b4d7567bbe5da8466b8f4518ac2b0c840fc748`, publicado no repositório autorizado. Commits de integração separados: parser `bae424de93`, compiler `3d73580685`, provas suplementares `c3b4d7567b`. O lead materializou os mesmos bytes na árvore principal `fabric-workbench`, preservando o corpus/manifests não commitados. Não houve merge em dev, release, restart ou chamada Fabric autenticada.

## Implementação existente

- Schema canônica `FabricWorkspace`: ID local `fwsp_`, Ref, documento v1, cinco receitas, três slots, componentes/fontes/bindings e overrides fechados. Referência de capacidade reutiliza a identidade de `FabricCapability.Ref`; opcionais omitem undefined e tipos públicos são readonly.
- `modules/fabric/src/parse.ts`: JSON estrito e YAML data-only; admissão por descritores, sem chamar getters/toJSON ordinários. Limites de 262.144 bytes UTF-8 no texto e no JSON codificado, profundidade 16; política menor prevalece, override maior não eleva seeds. Bytes são debitados incrementalmente antes de construir saída ou paths de chaves não admitidas.
- `src/declaration.ts`, `graph.ts`, `layout.ts`: admissão antes do schema e após defaults, catálogo confiável com revisões exatas, props/args/slots/fontes compatíveis, somente efeitos de leitura, portas próprias tipadas/exclusivas, ciclos recusados e Kahn determinístico. Layout preserva dados explícitos e registra defaults reais/idempotentes. Disponibilidade continua metadado, não autorização.
- API pura permanece `parse(text, format, limits?)`, `admit(value, limits?)`, `compile(input, catalog, availability?)`. Catálogo carrega schemas/metadados, nunca executores. Nenhuma rota HttpApi, renderer, ativação, store, driver ou tool de IA foi instalada por esta fatia.

## Aceitação e crítica

DEC01–DEC04, PAR01–PAR04 e CMP01–CMP04 foram escritos antes do runtime. REDs [41944883874](https://github.com/gustavomhss/hugr-orchestra/actions/runs/41944883874) e [41944884256](https://github.com/gustavomhss/hugr-orchestra/actions/runs/41944884256) atingiram os doze corpos e falharam pela implementação ausente. Críticas independentes sucessivas fecharam lacunas antes da distribuição; v6 teve duas rodadas secas sequenciais. Os críticos conservaram contexto das próprias rodadas anteriores, sem receber implementação.

Suplementares ADV01–06 e SEAM01 exercitam expansão de defaults, nomes herdados, bytes cumulativos, paths escapados, contagem comparada ao engine JSON em fixtures pequenas, rejeição de chave excessiva antes de path e paridade JSON/YAML/direta. A revisão independente destes testes exigiu diagnóstico específico de porta, não só falha genérica; a asserção foi fortalecida e novamente revisada.

## Gates executados e verificados pelo lead

| Gate | Evidência observada |
| --- | --- |
| Fabric final v3 | [41959426463](https://github.com/gustavomhss/hugr-orchestra/actions/runs/41959426463), snapshot `2bff827919bc392c11a5e36f7d644adb63f27d33`: **15 pass, zero fail, 2166 expectations**, PAR/CMP/ADV/SEAM. |
| Schema | [41956805511](https://github.com/gustavomhss/hugr-orchestra/actions/runs/41956805511), snapshot `43ca387a9d7088399e48609b5e48b0aee4f038d9`: **13 pass, zero fail**, DEC/FND/contract-hygiene. |
| Typecheck | `bun typecheck` nos diretórios Schema e Fabric, incluindo combinação real e árvore principal. Não é prova de comportamento nem green CI. |
| Boundaries | 5011 arquivos/4359 arestas analisados; 94 violações históricas ledgered, zero novas/zero stale. Nenhum ledger foi ampliado. |
| Guards | 78 regras, zero gate findings; sete warnings de novas dependências. Proveniência/necessidade conferidas e explicadas no README, sem ignores. |

Lead recuperou os snapshots dos runs, comparou todos os hashes do manifesto de código/testes e confirmou igualdade com a árvore principal; não aceitou apenas autorrelato. Manifest v3: `6d994436d3201a4487605d444310d4cff831c45efbcacdf1fe3a9ad131dfb56e`. Evidências completas e verificações ficam no temporário aprovado `opencode`, incluindo `fs-declaration-v3-lead-verification.json`.

## Contraprovas medidas

| Defeito temporário ou pré-fix | Resultado real |
| --- | --- |
| Document permite campo extra | [41949079795](https://github.com/gustavomhss/hugr-orchestra/actions/runs/41949079795): DEC02 falhou; restaurado e CI Schema passou. |
| Ref com propriedade mutableKey | Typecheck falhou em DEC04; restaurado byte a byte. Tentativa anterior de usar API mutable inválida não foi contada como prova. |
| Remover rejeição de chave JSON duplicada | [41950634261](https://github.com/gustavomhss/hugr-orchestra/actions/runs/41950634261): PAR01 falhou; restore [41950930453](https://github.com/gustavomhss/hugr-orchestra/actions/runs/41950930453) passou. |
| Contagem agregada tardia/paths escalares perdidos | [41951962188](https://github.com/gustavomhss/hugr-orchestra/actions/runs/41951962188): ADV03/04 falharam antes do fix; ambos passam no v3 final. |
| Permitir segundo writer e não readmitir defaults | [41951813312](https://github.com/gustavomhss/hugr-orchestra/actions/runs/41951813312): CMP02/ADV01 falharam; restore e combinação final passaram. |
| Remover só own-port de saída | [41958258329](https://github.com/gustavomhss/hugr-orchestra/actions/runs/41958258329): ADV02 falhou na exigência de `/bindings/0/from`. |
| Remover só own-port de entrada | [41958257873](https://github.com/gustavomhss/hugr-orchestra/actions/runs/41958257873): ADV02 falhou na exigência de `/bindings/0/to`. |

Todos os mutantes foram restaurados; lead conferiu os dois últimos snapshots e confirmou exatamente uma checagem removida por run. Nenhum caso GiB foi executado: regressões de alocação usam inputs moderados e limites baixos. Falhas HTTP 403 durante uploads foram registradas como infraestrutura, nunca RED/green de produto. Atualizar a referência local do remoto escolhido pelo runner reduziu o upload final de 32 para três arquivos; não houve alteração de gate, credencial ou conta.

## Revisão e limites que permanecem

Wire, parser e compiler receberam revisão estática independente; achados P1 de alocação e P2 de diagnóstico foram corrigidos, re-revisados e cobertos no CI final. Suplementares receberam revisão separada. Relay foi armado, mas hook não foi demonstrado e não é evidência de conclusão.

Reflexão de objetos pode alocar proporcionalmente ao grafo existente e disparar traps de Proxy; esta API não é sandbox de um realm JavaScript hostil nem prova que todo o processo cabe em maxBytes. Seeds são limites de admissão ensaiados, não SLOs medidos.

Catálogo dos testes é fixture, não registry operacional ou qualificação de adaptadores. Permanecem renderer/propagação de seleção, persistência protegida/CAS, identidade/MSAL, catálogo e drivers reais, queries/resultados, comandos/jobs, checks, IA, portabilidade, dezoito templates e E2E/humanos. Nada aqui transforma fixture, handoff ou indisponibilidade em prova de tarefa real.
