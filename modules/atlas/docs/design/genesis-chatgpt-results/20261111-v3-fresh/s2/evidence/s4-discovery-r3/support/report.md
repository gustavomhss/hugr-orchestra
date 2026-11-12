# S4 r3: auditoria de compatibilidade para S2

**O release r3 acrescenta evidência real de controles compartilhados, mas mantém o runtime nativo S2 em e3a8ab8 e mantém o limite de 256000 bytes. Não resolve os três inputs grandes de S2.** Nenhum código ou estado S2 foi alterado.

## Identidades verificadas

- Release r3 lido pela principal em `f3c1f6a83bb0b81fd2ab394ab9f21b19e8685604`: SHA256 `6de0b5f7a8911eb40c7fbcf74e74210805175ee580c0c8482249c016af1c0016`, Git blob `7513fcca63664ca02094e9ed9b8fab090c20295d`; os bytes locais conferem com o envelope preservado.
- Candidato nativo demonstrado: `e3a8ab8cf56dbff1ee91272df51ffa398d882aa1`. Candidato dos controles novos: `7102f2e3a1a9a3822bcd0ae054b36ecffe9da553`.
- Recibo CI no commit `8a041ca66982dcc2b89aaed46ebe347cb3de57db`: SHA256 `56358fb679b28f9f06b15f6c06959058c5aa9a65aec13674fb148b964586f330`. Recibo e dois julgamentos runtime-r2 foram buscados pelo connector com SHA completo e conferidos por SHA256 e Git blob.

## CI observado diretamente

Run [43077975153](https://github.com/gustavomhss/hugr-orchestra/actions/runs/43077975153), job [130722742703](https://github.com/gustavomhss/hugr-orchestra/actions/runs/43077975153/job/130722742703), tentativa 1: **completed/success**, head exato `7102f2e…`, 18:27:38–18:29:21 UTC em 11/11/2026. API do run, jobs, log integral e metadata do artifact concordam.

O log registra **23 arquivos de teste e 220 testes aprovados**, quatro controles NR1-01/02/03/04 e 22 saídas distintas de probes de mutação. O workflow exige que cada controle nomeado rejeite seu mutante; o step terminou com sucesso. Typecheck, geração e guards também concluíram com sucesso. Guards: **78 regras, 869 caminhos, 0 gate, 2 WARN large-file, 0 erros**, exit 0. Os avisos são os arquivos completos S4 L1B artifacts.json e coverage.json; continuam explícitos.

Artifact 13883635728, 431413 bytes, digest `sha256:cf4232dec016e07d63dc0b40497892e1f87dec7af812d6cd3fbc542f8816c7cd`, corresponde ao recibo e ao head do run. O ZIP não foi baixado. A paridade dos 18 gerados é atestada pelo recibo fixado; conferi independentemente os bytes e hashes dos três gerados alterados. Não afirmo ter recomputado a paridade dos outros 15 no arquivo ZIP. Evidência: `ci-summary.json`, `files/job-logs.txt`, `original-responses/{run,jobs,artifacts}.json`.

## Comparação limitada aos commits fixados

O compare tem 8 commits e 161 arquivos: 154 documentos/evidências e sete outros arquivos. Destes, um workflow adiciona o controle de recuperação, deixa logs fora do checkout e evita runs provocados apenas pelos resultados; três arquivos JS gerados são atualizados; um teste de recuperação é adicionado; dois arquivos de fonte do adapter mudam.

Conferi novamente todos os **406 arquivos do runtime materializado** contra o recibo original: íntegros. **404 não aparecem alterados** na comparação fixada. `genesis-native-binding.ts` muda um retorno e `genesis-native-format.ts` muda dois: os retornos do objeto validado passam a retornar `value` com cast simples. `nativeRecord` devolve o mesmo objeto original; por inspeção estática, esses três retornos preservam o comportamento. Isso é uma inferência de equivalência delimitada, não novo CI do e3a. Seus bytes diferem e ambos são incluídos em `candidate.implementation`, portanto a mudança muda a identidade preparada.

Os três gerados não são byte-idênticos: mine/native-header acrescentam import de spawnSync e surface incorpora geração de observação estrita de membership, entre diferenças de bundle. Não atribuo identidade a toda distribuição. O CLI nativo S2 importa o adapter de fonte e nenhum bundle novo foi instalado. `compatibility.json`, os diffs preservados e `materialized-runtime-readback.json` registram os limites.

## Matriz de reuso

| Evidência | O que pode ser usado em S2 | O que permanece específico |
|---|---|---|
| Reuso, invalidação e rebuild; controles RB/UP/TC, 22 mutantes | Evidência comportamental comum para as fontes verificadas sem alteração e hipóteses declaradas | Execução/aggregate PASS é do SHA 7102; não é execução de manutenção do pacote S2 |
| NR1-01/02/03: retomada durável, drift/HOLD, rollback e migração | Evidência dos controles nomeados; revisão reconhece os limites | Fixtures sintéticas, exceção no seam; não prova power-loss arbitrário nem publica S2 |
| NR1-04 corrigido | Teste novo mede `mainStarted/mainFinished` em torno da leitura principal e exige interseção real com ativação; log confirma PASS | Um Worker/um writer no run identificado; não prova concorrência universal |
| Dois julgamentos runtime-r2 | Pareceres preservados dos agentes declarados `/root/judge_j1` e `/root/judge_j2`, ambos PASS nos controles e sem findings obrigatórios restantes | Não são runtime-import-binding de S2; os próprios juízes informam que os dados/execuções foram fornecidos pela principal |
| Native sample publish/index/read | Capacidade já demonstrada no candidato e3a: publicação emitida e leitura atual de um artefato real | Scope, policy, ratificação, candidato, contratos e resultados S4 não se transferem |
| Typecheck, guards e paridade gerada r3 | Evidência do código/ambiente explicitamente fixado | Gate agregado de 7102 não substitui gate do futuro payload S2; o CI e3a antigo permanece FAILED |
| Teto de arquivo | Limite confirmado de 256000 bytes, sem override nessa operação | schema/tui.json 1131057; trees app 369462/design 390775 continuam incompatíveis |

Os pareceres r2 vinculam o mesmo par de agentes declarado e o teste SHA256 `8e33b9721ef0ea7b8979a696c9493c53d069483d727f64e327c4165341e7bcb4`, conferido no candidato. Ambos mantêm o histórico FIX-FIRST e a insuficiência do controle anterior; não reclassificam o run antigo. As identidades declaradas são evidência de transporte, não autenticação criptográfica de pessoas.

## Amostra nativa S4

Foram conferidos os recibos e stdout fixados de publish/index/read e `verification.json` no commit `6e43247103ac36e5adb635f2fccde2e61480c56d`. Os três comandos registram exit 0. Publish retorna emitted=true e gates shape/truth/authz/ratify=true; index retorna metadados sem corpo; read retorna ready, historical=false. Manifest/result são coerentes entre respostas. O corpo lido tem exatamente **17959 bytes**, SHA256 `242de88e5cbb656b9752e231b2125e41733e449b19e6e887d1889830a1d5764c`, igual ao recibo de verificação. Isso demonstra a amostra de **um artefato S4**, executada pela principal; não um consumidor independente nem o full13 S2.

## Estado entregue

Todas as respostas originais estão em `original-responses/`; conteúdos verificados e diffs em `files/`. Nenhum HEAD móvel foi seguido. Não executei testes, build, prepare, CAS, política, binding ou publicação; não materializei 7102 nem editei fonte, pacote, corpos, reviews ou oracles. O histórico anterior permanece intacto. Para S2, o bloqueio do tamanho permanece e os futuros bindings devem vir do candidato real S2.
