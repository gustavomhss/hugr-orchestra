## C-change — comparar K=4 e K=6

Com o mesmo conjunto de documentos:

1. **Admissão e leitura:** confirme que as fontes foram admitidas e lidas. Se o arquivo mudou, `noteBytes` pode marcar a fonte `not_yet_read`; a busca exclui fontes não lidas ou com hash incompatível.
2. **Pipeline:** mantenha a configuração lexical (`lexical=true`, `embedding=false`) e registre revisões com `k=4` e `k=6`. A superfície listada oferece operações para `sources`, `pipeline`, `revisions`, `search`, `ask`, `proofs`, `comparison` e `passes`. O retorno não fornece nomes de rotas HTTP exatos; não os presumo.
3. **Provas e comparação:** compare com o mesmo `proofSetId` e uma única mudança de campo, sem passes. Verifique a associação entre pergunta e trace antes de confiar na prova: `ask` grava trace com `revisionId`, mas `retrievalProof` procura por `questionId`; o caminho do adaptador não converte essas chaves.

A identidade da revisão muda com K; fontes e hashes devem permanecer iguais. K maior pode mudar os hits, mas o resultado sustenta apenas a diferença observada na seleção/prova comparada. `ask` retém K sem modelo; isso não prova resultado de modelo, replay ou equivalência. [ `S4:L1:host-boundaries`, “2. HTTP RAG → Store por requisição → SQLite”; `S4:L3:system-flows`, “Da requisição RAG à evidência de seleção” ]

## C-violation — mascarar `context_recall` e `task`

Mascarar essas saídas não respeita o contrato descrito: só se tenta mascarar quando `context_recall` está no conjunto materializado de ferramentas. Ferramentas protegidas de planejamento, recall, delegação e revisão são excluídas dos candidatos. Se a ferramenta de recuperação não está disponível, não se deve mascarar sua saída para simular uma redução adicional. Candidatos precisam gerar economia estimada e ser arquivados antes de a máscara ser adicionada.

Ponto de manutenção: `modules/continuity/src/v2/masking.ts`, `modules/continuity/src/masking-rules.ts` e `modules/continuity/src/v2/strategy.ts`. A persistência do arquivo fica em `modules/continuity/src/v2/archive.ts`. [ `S4:L1:continuity-rag`, “Masking contract”; `S4:L3:system-flows`, “Do turno à redução recuperável do pedido” ]

## C-impact — `authority.basis` e link de navegação

A unidade que teve `authority.basis` alterada precisa ser reavaliada: o resultado inclui autoridade, validade, gaps e evidência, então prosa idêntica não garante identidade de resultado ou receipt. Reavalie dependentes conforme as dependências semânticas declaradas e gere vínculos atuais para resultados afetados.

O link de navegação é consulta, não dependência de build. Resultados e receipts de unidades independentes podem ser reutilizados se inputs precisos, contrato, predecessores e demais dependências continuarem válidos. Confira o grafo e as versões observadas; navegação não exige, por si, refazer autoria. [ `S4:L2:atlas-system`, “Por que texto igual pode exigir outro resultado”; `S4:L3:system-flows`, “Mudanças propagam por resultados e vínculos”; `S4:L2:genesis-governance`, “Dependências que tornam as camadas auditáveis” ]

## C-failure — fonte obrigatória mudou e ativação falhou

Não considere o manifesto antigo automaticamente atual nem retome o candidato com pareceres antigos como se os inputs não tivessem mudado. Consulte a seleção corrente pela porta; HOLD/recusa não prova perda do CAS. `historical:true` permite inspecionar o passado, mas não demonstra validade atual.

Preserve o candidato exato, CAS e receipts. Reprepare/reconstrua e reobserve os inputs obrigatórios. Se algum estiver indisponível, mantenha HOLD; se fonte, candidato ou binding mudar, obtenha binding novo. Reutilize resultados duráveis apenas quando seus vínculos exatos ainda forem válidos. Publique pela porta governada, que refaz a preparação e exige binding exato e gates atuais; não altere receipts antigos. [ `S4:L1:native-runtime-delta`, “Consumo e manutenção pela porta real”; `S4:L1:atlas-host-genesis`, “Ownership publication, observation and rebuild”; `S4:L3:system-flows`, “Após falha, separar recuperação de nova publicação” ]

**Limite:** os retornos descrevem inspeção estática e controles delimitados; não demonstram a execução destas mudanças, nem autorizam inferir custo ou tentativas ocultas.

**IDs usados:** `S4:L3:system-flows`, `S4:L2:atlas-system`, `S4:L2:genesis-governance`, `S4:L1:atlas-host-genesis`, `S4:L1:continuity-rag`, `S4:L1:host-boundaries`, `S4:L1:native-runtime-delta`.

**IDs não usados:** `S4:L2:continuity-rag-operations`, `S4:L1:ownership-boundaries`, `S4:L1:atlas-engine` e `S4:L1:coverage-governance`. O trecho efetivamente visível do retorno truncado não me dá passagem rastreável dessas quatro unidades para sustentar afirmações adicionais.