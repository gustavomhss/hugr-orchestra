## PASS — automation-3, §§6–9, corpo candidato v3

**Juiz:** J2 — execução `34269cf4-d631-41c5-a30b-85b0ec217390`.

A decisão cobre exclusivamente **§§6–9**, intervalo de bytes **[30198,48200)**, do corpo candidato v3 identificado com **60.588 bytes** e SHA256:

`b31d52e5bf25f6eca3807e9c1f418b70d865c9d63c5690125c530c54f8247d84`

O suplemento examinado é **automation-3-supplement-v3**, identificado com **408.213 bytes** e SHA256:

`f2c8d12e8e0b22964fadfaba9c40632f0ba5489d795d76dc3efde70fd30bd276`

Considerei o `FIM_DO_LOTE` e as correções literais de transporte. Esses identificadores são os declarados no lote; esta decisão não alega cálculo independente de checksum do transporte.

### Correções incorporadas

Os envios defeituosos permanecem registrados como incidentes, com aplicação restrita das correções autorizadas:

- **AUT3-C04, `shared.ts`, função `diff`:** considerada a comparação canônica entre `row[key]` e `next[key]`. A expressão incorreta enviada anteriormente não foi atribuída ao arquivo-fonte.
- **AUT3-C24, `record.ts`:** substituídos, no exame, exclusivamente os dois valores de SHA256 indicados pela principal — `source_sha256` e metadados do trecho 1–67 — pelo valor canônico `919161b5e11cf65f1fc0a2f857a63d45b54d56d1bd5b211d13b10794db87faed`. O código literal e o corpo candidato permanecem vinculados ao conteúdo recebido.

Essas ocorrências não deixam pendência local após as correções.

### Disposição das pendências de J2

| Pendência | Disposição | Fundamento do encerramento |
|---|---|---|
| **RE-AUT3-01 — estado do Board, intake, arquivo, dependências, notas, anexos, decisões e undo** | **ENCERRADA** | As cadeias de `board.ts`, ferramentas, projeções, helpers, tabelas, decisões e threads permitem acompanhar validações, alterações e registros. A descrição mantém distintos o acesso pelas ferramentas, as regras dos serviços e as operações do host. Também conserva os limites de undo e da persistência de anexos. **Evidência: AUT3-C01–C07 e intervalos anteriores explicitamente reutilizados.** |
| **RE-AUT3-02 — mirror, cache, CI, estado scoped e gasto** | **ENCERRADA** | Foram fornecidos os caminhos de sincronização, progressão por PR, cache de minutos, composição de gasto, orçamento, previsão, métricas e proof. Os deltas de v3 corrigem precisamente a suficiência de `scoped-green`, a repetição de dispatch após `error` e os casos de classificação monetária. **Evidência: AUT3-C08–C14; AUT3-DELTA-01–03.** |
| **RE-AUT3-03 — admissão e saída da fila, follow-ups, lanes e tratamento de falhas** | **ENCERRADA** | A cadeia permite seguir admissão, leitura do head e tree, persistência na fila, recomposição de affected sets, montagem dos bundles, capacidade, falhas de infraestrutura, divisão, isolamento e decisão sobre flaky. O texto preserva o alcance local desses mecanismos. **Evidência: AUT3-C14–C20.** |
| **RE-AUT3-04 — head, base, skew, push, registros Atlas e alcance de pausas/holds** | **ENCERRADA** | As fontes sustentam a separação entre montagem, liquidação, rechecagens, mudança de base, push e atualização posterior das rows. O recorte conserva os limites das verificações de pause/hold e da integração com Atlas, sem transformar a sequência em uma transação única entre GitHub, Git, banco e arquivos. **Evidência: AUT3-C15–C20 e AUT3-C23–C24.** |
| **RE-AUT3-05 — snapshots, attempts, conflitos, port de registro e replay** | **ENCERRADA** | Estão visíveis a construção pelo índice temporário, scanner, escolha do remote, push e registro, restauração de worktree, lifecycle de attempts, inspeção de conflitos e aplicação dos eventos. O replay permanece descrito dentro de suas exclusões; não é apresentado como recuperação integral do estado operacional. **Evidência: AUT3-C21–C25.** |

### Avaliação das três alterações do corpo

**AUT3-DELTA-01 está adequada ao predicado implementado.** A redação usa o resultado mais recente por `(kind, command)` no tree, distingue `fail`, ausência de requisitos e suficiência para `scoped-green`. Ela deixa explícito que um `pass` scoped pode coexistir com outros checks scoped em `pending` ou `error`; portanto, o estado não certifica a aprovação de todos os comandos scoped. **Evidência: AUT3-C14, incluindo o intervalo anterior de `ci.ts` 440–454.**

**AUT3-DELTA-02 descreve corretamente a deduplicação observada.** Para o mesmo card, workflow e tree, uma row com outcome diferente de `error` impede novo dispatch nesse caminho. Quando existem somente rows em `error`, outra tentativa continua possível. A expressão anterior, absoluta, foi substituída pelo critério efetivo do ledger. **Evidência: AUT3-C14, `workflows`.**

**AUT3-DELTA-03 resolve a generalização sobre gasto não medido.** A nova descrição diferencia custo positivo, provider `claude-code`, presença de tokens, ausência de Sessions vinculadas e o caso em que ambas as classes ficam vazias, permitindo `usd:0`. Também limita `partial` à composição efetivamente calculada. **Evidência: AUT3-C09–C10, incluindo o intervalo anterior de `spend.ts` 30–49.**

### Critérios pertinentes

**GO-A1–A7, QS1–QS6 e CC1/CC3/CC7: atendidos neste recorte.** A explicação possui sustentação suficiente para distinguir entradas, estado persistido, projeções, verificações, decisões narradas e fronteiras externas. Os trechos novos completam os caminhos que motivaram os pedidos anteriores; os intervalos reutilizados mantêm identidade explícita. A reconciliação da população de automation permanece a anteriormente examinada, sem converter fontes externas referenciadas em arquivos próprios dessa população.

**GO-I1, GO-I2, GO-I7 e GO-I8: atendidos no alcance desta decisão.** Os incidentes de transporte e suas correções permanecem separados do conteúdo canônico. Campos narrativos, comentários e metadados não foram tratados como prova de execução ou autoridade adicional. Os hashes identificam os materiais declarados; a conclusão semântica decorre do conteúdo e das cadeias examinadas.

**AC01 local: atendido para §§6–9.** Não resta correção obrigatória nem pedido de evidência obrigatório para este recorte do corpo v3.

### Pendências que permanecem fora deste PASS

- **`automation-4` continua sujeito ao exame próprio.** Os veredictos anteriores de automation-1 e automation-2 permanecem com seus respectivos alcances. A soma desses resultados com o presente PASS não constitui aceite automático do corpo inteiro.
- **Execução, testes e comportamento operacional real permanecem separados desta avaliação documental.** O exame de fontes não altera as disposições `NOT_RUN`.
- **Implementação interna e integração efetiva de Atlas, consumidores, manutenção realizada, união e entrega global** dependem das evidências e decisões próprias desses escopos.

**Decisão deste lote: PASS, restrito a automation-3 §§6–9 do corpo v3. Todas as cinco pendências locais de J2 estão encerradas.**