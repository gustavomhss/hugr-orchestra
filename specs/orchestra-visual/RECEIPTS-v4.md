# RECEIPTS v4 — esquema 3, sem resultados pré-aprovados

## 1. Contrato efetivo

`tools/effective_contract.py` calcula `contract_manifest` e `contract_sha256` a partir da task, seus campos de execução/gates/estágio, invariantes e padrões de qualidade dos ancestrais, superfícies pertinentes, documentos normativos, fixture/master e leases aplicáveis. DoD/completude/sucesso do agregado são obrigações de fechamento DO AGREGADO, não exigência retroativa de conclusão antes de seus filhos.

Cada critério tem `criterion_evaluation_stage`. A etapa produtora não exige um consumidor futuro. `acceptance_requires` representa produtores de evidência exigidos pela etapa; S25-W1-T1 não depende de S23/S24, S25-W1-T2 depende. Campos não normativos como notas/relatórios editoriais não entram automaticamente no digest. Documentos listados em normative_files são normativos integralmente: revisão substantiva invalida os consumidores, não deve ser feita como simples ajuste de hash.

S01 pode retificar o censo e scopes canônicos. Regenerar MAP/OWNERSHIP/issues. Não usar quatro mapas paralelos. SURFACES mistura fontes e UI: somente `ui-surface` com disposition migrate/inherit entra no gate de captura.

## 2. Fonte e ownership

`source.baseline_file` aponta ao snapshot gerado ANTES da task: HEAD, hash dos arquivos inicialmente dirty e seu estado de index, sem copiar os conteúdos. O snapshot e demais artefatos são catalogados por SHA-256. `source.commits` lista todos commits BASE..HEAD em ordem reverse/topo-order. `paths_changed` deve ser exatamente a união de arquivos efetivamente tocados por esses commits, sem detecção de rename que esconderia a origem.

Não atribuir trabalho preexistente do usuário à task. Não alterar esse trabalho nem seu staging. Sobreposição preexistente com o scope exige worktree isolado; não stash/reset. O verificador confronta Git real quando --repo está presente. Uma baseline capturada retroativamente é uma violação de procedimento: hashes locais não são carimbo temporal autenticado.

S25 pode integrar outros owners por `source.imported_receipts: ["evidence/S17/W1-T1.json"]`. A origem precisa ser receipt válido de outra task de implementação, sem imports aninhados, fonte ancestral do candidato e hashes íntegros. Além do footprint completo, o arquivo importado no candidato precisa ter o mesmo modo/blob verificado na origem. S25 não ganha direito de editar esse arquivo: conflito devolve ao owner. Não omitir merge commits da faixa atribuída.

Codegen exige lease único, lock compartilhado, paths explícitos e `status: local-command-footprint-verified` no contrato após S01 verificar o checkout. Prefixos observados: packages/client/src/generated/** e src/generated-effect/**. Inputs/registradores são client/src/contract.ts, protocol/src/api.ts, server/src/api.ts e handlers.ts; confirmar o footprint local. `source.codegen` contém manual_edits=false e outputs exatos. Comandos obrigatórios: `bun run generate` e `bun run check:generated`, ambos em packages/client. Uma saída inesperada não é autorizada só por ter sido gerada. Edição manual de generated é proibida e deve ser verificada pela geração idempotente/revisão; o formulário não autentica sozinho a origem da edição.

## 3. Prova local versus gate integrado

- S01 e S25-W0: fatos históricos no SHA. Exigir fonte ancestral, contrato atual e censo válido; não manter app.tsx congelado.
- Entrega local: verificar `source_watch_paths`, derivados do owner. A prova não certifica toda dependência contextual em `read_paths` nem toda a aplicação.
- Gates finais: qualquer alteração em packages, manifests de build ou contrato pertinente invalida aceite integrado. Não publicar um SHA novo com as provas do candidato anterior.
- Reparo: o seletor informa invalid_claims e continua selecionando reparos prontos. Não descarta trabalho independente. --affected-by lista impacto potencial, não faz mutação.

Os recibos antigos continuam auditáveis. Repetir testes, revisar e produzir um recibo novo; nunca simplesmente resselar um resultado antigo como se fosse uma execução nova.

## 4. Categorias explícitas

Performance, visual e native são sempre objetos com PASS ou NOT_APPLICABLE justificado; categorias requeridas pela task não aceitam dispensa. NOT_RUN/FAIL não encerram task. PASS de categorias diferentes deve referir o mesmo head/build. Review é explícita, vinculada ao SHA e a arquivo de prova. Cada um dos cinco axiomas cobre exatamente os criterion_ids da task.

### Performance

Entrada bruta `kind: paired-performance-observations`, ambiente A/B, identidades baseline/candidate/build/fixture/capabilities, perfis de carga, produção/host quieto e observações por métrica. Cada observação contém metric, profile, unit e pares `{id,order,baseline:[...],candidate:[...]}`. Ao menos cinco pares; mínimos de amostra definidos em BUDGETS.json. Contagens físicas não aceitam negativos; NaN, Infinity, bool numérico, ambiente/workload divergente ou amostra insuficiente reprovam.

```sh
python3 tools/evaluate_performance.py evidence/S23/observations.json --gates P01 P02 P03 P04 P05 P06 P07 P08 P09 P10 P11 P12 --out evidence/S23/evaluation.json
```

No receipt.performance, observations_file aponta ao bruto e metrics_file ao resultado. Ambos são selados. O validador recalcula os gates a partir do bruto e dos budgets atuais. P11/P12 são controles de consistência, não observações de latência. O avaliador não coleta Chrome/Electron; S02 integra o produtor à suíte real. Fixtures de testes do tooling NÃO são provas de performance do Orchestra.

### Visual

`visual.manifest_file` aponta a visual-capture-manifest. Campos de topo: kind, head, build_sha256, master_sha256, fixture_sha256, coverage_sha256 (hash das combinações requeridas), theme, flags, captures. Cada captura: surface_id, state_id, viewport=[w,h], dpr=1|2, zoom, host, path, platform, producer=playwright|electron-capture, review_status=PASS, review_file, known_defects=[], masks=[].

COVERAGE.json define a matriz: todos estados no viewport principal; defaults nos demais viewports e perfis extras. O piloto tem subset de superfícies e tamanhos, não substitui cobertura final. Dimensões reais devem ser viewport×DPR; zoom altera reflow, não dimensões físicas da captura. Cada declaração native exige captura Electron. Imagem 1×1, omitida, truncada ou com checksum inválido reprova. PNG aceito: não-interlaced, 8 bits, grayscale/RGB/GA/RGBA; até8192px por eixo e limites explícitos de payload/decode. Reencodar screenshot losslessly quando necessário; não redesenhar.

O validador usa cobertura, CRC, zlib e scanlines; NÃO verifica identidade estética, autenticidade, conteúdo semântico nem se a captura realmente veio do app. Mesmo screenshot pode cobrir mais de uma superfície visível, mas uma imagem não prova estados mutuamente exclusivos; revisão deve conferir isso. Não mascarar colunas. Diferenças justificadas de conteúdo/plataforma ficam no review, não em buracos no screenshot.

### Native

Relatório native-evaluation com head/build, ambiente e gates requeridos pela task, cada qual com resultado e arquivos de prova. Logs/contadores/traces e hit-testing reais sustentam as conclusões. Web screenshot ou testes de parser não provam WebContentsView, perfis ou recursos nativos.

## 5. Dependência externa

`progress.external["#109"]` tem status, evidence e evidence_sha256. A prova é external-capability-proof schema1, com ref, status, candidate_head ATUAL, binding e public_path, testes public-positive/public-negative, review_file e inventário SHA dos logs/revisão. Cada teste inclui command,cwd,exit_code inteiro0,log.

Binding same-repository exige repo gmhelmold/HuGR-Orchestra e head ancestral. Binding installed-artifact exige paths seguros no checkout e hashes de artifact e lockfile, conferidos no disco. Uma prova do candidato anterior, bytes alterados, artefato ausente ou caminho público não exercitado não libera W2. Código de produto dirty exige prova em worktree isolado. --repo é obrigatório para consumir essa prova. Hash e log não substituem revisão da autoridade real.

## 6. Confiança e limites

Estas ferramentas evitam erros de estrutura, omissão e frescor conhecidos. Não são uma raiz de confiança contra um executor malicioso capaz de alterar contrato, testes e logs juntos. O ciclo de execução, inspeção real e revisão continua obrigatório. Não adicionar essas ferramentas ao runtime/bundle do Orchestra. Nenhum cenário do produto foi executado na preparação deste pacote.
