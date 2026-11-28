# Research: relações e impacto de mudanças

**Chave:** `s1.subslice03.research-impact` · **L3** · **need:** `operational` · **escopo:** S1-03 / `orchestra.s1`.

## I0. Decidir o impacto com uma base exata

Este L3 delimita explicações e usos que precisam de reavaliação quando mudam receitas, índice ou autoridade da investigação. Seu único predecessor semântico corrente é **`s1.subslice03.research-flow`, L2 v3**, **17.124 bytes**, SHA-256 **`f2c19caaa501ea0e135cbbfb4768b4bd68c4e729e5545cb5f80e45c655f52ab7`**. A receita fornece os dois PASS para esses bytes; não comprova execução do produto nem aceite deste L3.

As referências F0–F8 apontam a esse predecessor. **Base estática** resume seus mecanismos; **impacto inferido** indica consequências a verificar; **contrato público** identifica exigências do plano e dos critérios da campanha. A execução desta entrega limita-se à autoria e à verificação de arquivos. Não foi calculada worklist pelo runtime, reconstruído índice ou avaliado consumidor.

Impacto exige identificar o input alterado, a condição que controla e a conclusão extraída. Mesmo nome, prosa igual, arquivo presente ou ready não demonstram validade isoladamente. I1 trata aquisição; I2, índice; I3, probes; I4, autoridade; I5–I6, dependências e consumo.

## I1. Receita local ou mecanismo compartilhado

**Base estática — F1.** Research possui raiz/manifesto próprios e reutiliza a interface backend. Versão, locks/wheels, runtime, floors, layout, executável e launcher compõem a receita. Readiness combina instalação, dependências, tentativa, executável e shim; hosted inclui runtime. O alcance depende da parte alterada.

| Mudança | Impacto inferido | Limite de alcance |
| --- | --- | --- |
| Versão, lock/wheels, ambiente, layout ou launcher de um pack | Receita, aquisição, readiness e usos daquela engine | Não estender a packs sem esse input; conferir dependências |
| Runtime ou dependência compartilhada | Engines que a utilizam e usos dependentes de sua prontidão | O alcance segue a relação real, não proximidade de nomes ou cache |
| Floor/target ou verificação de executável/shim | Admissão no host, estados/razões e decisões de disponibilidade | Versão de engine igual não preserva condição de admissão alterada |
| Aquisição/readiness comuns | Caminhos backend e research que reutilizam o mecanismo | Raízes próprias não demonstram independência do código comum |
| Versão de geração OpenAPI ou receita Cassandra | Guard de projeto ou overlay fixado e compatibilidade pertinente | Não generalizar para todas as engines nem inferir aplicação do guard pela aquisição |

Espera, cooldown e estados também afetam consumidores. O waiter pode desistir enquanto a aquisição continua; prefetch devolve estados individuais; `.complete` pode coexistir com executável ausente. **Inferência:** reavaliar decisões de uso/retry que dependem desses sinais. `ready` conserva alcance local; mudança de receita não qualifica provider, plataforma ou saída.

## I2. Inputs do shard e conteúdo servido

**Base estática — F2–F3.** A chave reúne indexer/versão, shard, pares path/blob e locks/configs, inclusive extends. Não é simplesmente HEAD. O texto retido vem do worktree, sem snapshot atômico de todos os arquivos. Base, cobertura, freshness e bounds participam do significado da consulta.

| Mudança ou observação | Superfície a reavaliar | Conclusão indevida |
| --- | --- | --- |
| Código, adição/remoção de fonte ou mudança de projeto/ownership | Membership, pares path/blob, seleção e consultas dependentes | Limitar tudo ao arquivo do diff ou invalidar todos os shards sem verificar a partição |
| Lock, config/extends ou indexer/versão | Identidade do shard e atribuição dos resultados à base | Declarar índice atual porque o arquivo consultado parece igual |
| Extração, ranges ou filtros de consulta | Símbolos/relações, cobertura e conclusões de presença/ausência | Tratar estrutura, callers/callees ou opaqueSites=0 como cobertura total ou execução |
| Worktree dirty ou shard retido stale | Texto atual, rows retidos, basis e alcance do overlay | Atribuir automaticamente a base atual aos rows antigos |
| Retenção/store/status | Disponibilidade, escolha de retido e interpretação de existência | Banco existente como índice saudável ou budget como teto rígido de disco |

**Impacto inferido:** começar pelos shards cujos inputs relevantes mudaram e pelos usos que dependem de seus resultados/bases. Isso delimita uma investigação, sem fornecer uma lista calculada nesta produção. Consultas com resultados de bases diferentes exigem conferir as bases pertinentes; um diff de arquivo não demonstra sozinho o conjunto completo.

Vazio precisa conservar sua origem: adapter default, falha de plan, filtro de prewarm e plano realmente vazio podem deixar ausência de trabalho. `source_unavailable` na observação Git não equivale a remoção. Sem shard aberto, F3 condiciona novo build a extrator, construção necessária e ausência de build em curso; building/unavailable não prova novo disparo. Resposta vazia não demonstra impacto inexistente nem estado building demonstra reparo iniciado.

Dirty overlay não atualiza universalmente imports/references/callers/callees/map. Locate confere ranges no conteúdo atual, mas fallback, limites e seleção não certificam ausência de usos. Mudanças nessas condições exigem reavaliar conclusões negativas. Conservar razões de cobertura e `semantic: absent`; não atribuir embeddings ao fluxo descrito.

## I3. Probes e a passagem para evidência retida

**Base estática — F4–F5.** Snapshot, revisão/dirtyDigest, runner, argv, versão, verdict e saída limitada identificam o resultado. Snapshot de commit pode referenciar dependências por symlink; timeout de subprocesso não cobre todo preparo/fila; coordenação de host é local ao processo. Garantias de sandbox/memória continuam externas.

**Impacto inferido:** alteração de runner, snapshot, dependências, verdict ou limites pode mudar o que passed/reproduced/blocked sustenta. Reavaliar F4 e os usos desse resultado, incluindo limites de reprodução. Não transportar resultado antigo para nova base nem confundir cap declarado com enforcement demonstrado.

Objeto de resultado e URI de probe não cobram, capturam ou admitem automaticamente evidência. Mudança na retenção pelo chamador atinge a associação entre resultado, cobrança, captura e SourceAdmitted, além dos registros que usam a fonte. Mudança apenas de aquisição não demonstra alteração da admissão. `blocked_by_repo_guard` permanece recusa; análise de impacto não autoriza contornar o guard.

## I4. Autoridade muda mesmo com texto igual

**Base estática — F5–F7.** Identidade nativa, operação, orçamento, bytes, admissão, locator, revisão e fechamento têm contratos diferentes. Suas relações localizam propagação; um evento não substitui os demais.

| Contrato alterado | Relação afetada e consequência inferida |
| --- | --- |
| Session/task/authorSession, location ou CapabilityInvocation | Quem pode produzir/reler e o binding das fontes/records; texto igual não supre vínculo divergente |
| Operation id, payload de charge ou allowance | Replay/conflito, gasto e incerteza; reserva não devolve saldo e publicação incerta não vira gasto zero |
| Bytes, digest, representation, complete ou metadata derivada | Manifest/receipt/admissão, leitura e fontes derivadas dependentes; fim de página não completa captura parcial |
| Coordenadas, quote, JSON pointer ou cursor | Locators e usos que citam a passagem; endereço válido não prova verdade |
| Finding, evidence/contrary, citação ou baseRevision | Revisões e documentos dependentes; manter conflito, razão e CAS |
| Dispatch, views ou inquiry | Completude e fechamento; card antigo fechado não responde pelo dispatch novo |

A cadeia inferida de uma fonte alcança sua identidade/bytes admitidos, locators pertinentes, findings/relations e documentos/citações dependentes. Isso não afirma que um mecanismo já marcou ou reconstruiu cada objeto. Fonte retirada, corrompida, parcial ou com binding inválido exige conservar a razão e delimitar quais conclusões perderam suporte. Preservação histórica não confere atualidade à versão antiga.

Falta de evento ou divergência de digest não permite fetch live substituto. Aquisição anterior incerta não permite readquisição invisível. Erro de publicação não prova ausência de efeito: o evento exato pode existir. Portanto, mudar retry/idempotência afeta causalidade, orçamento e autoridade, além da mensagem exibida.

**Contrato público de conhecimento.** Mudança de autoridade, validade ou lacunas deve propagar mesmo com prosa igual. Locator/citação válido não encerra revisão semântica; texto hostil não recebe permissão. Essa exigência da campanha não demonstra invalidação automática de research/Atlas já executada aqui.

## I5. Construção, navegação e independência

**Contrato público — plano e critérios de reúso.** A única dependência corrente deste L3 é `s1.subslice03.research-flow`. O L1 permanece contexto cumulativo e aprofundamento herdado pelo L2, sem segunda aresta direta para este L3. O manifesto anterior registra proveniência, sem autoridade semântica adicional.

O plano declara `research-flow` → `research-impact` → `research-maintenance` → `entry`, com chaves `s1.subslice03.*`. São dependências planejadas, sem afirmar que L4 exista, esteja aceito ou liberado. Mudança relevante no L2 requer decidir seu suporte e reavaliar este L3 antes de liberar descendentes; não saltar o predecessor porque um trecho de L1 está no contexto.

Research-impact não é predecessor de automation-impact: o plano liga este último à própria automation-flow. Link de consulta, caso público compartilhado ou futura entrada comum não criam aresta entre famílias. Mudança exclusiva de receita/indexação research não exige, por si, reconstruir a explicação de Actions. Essa independência é **do grafo declarado**, sem garantir isolamento universal do produto. Alteração de infraestrutura compartilhada exige identificar seus usos/dono, sem presumir inocuidade ou afetar todos por conveniência.

Inputs/receita inalterados e resultado válido devem permitir reúso conforme os critérios públicos. Receita de autoria alterada pode exigir recompor este L3 sem mudança de produto; edição apenas de navegação não invalida explicações independentes. Mudança pertinente de intenção/documentação também entra na análise, sem ser reduzida a diff de código.

O contrato público distingue mudança no resultado visível de alteração somente de recibo: bindings podem precisar de atualização sem nova interpretação; resultado válido consumido inalterado deve interromper reconstrução a jusante. Essa regra não equipara SHA-256 de transporte a versão de input Atlas, nem transforma receipt research incerto em detalhe de binding Atlas. Cada porta conserva seu contrato. Cache hit, zero chamadas e parada de propagação exigem prova real separada.

## I6. Alvos de reavaliação e registro de impacto

As linhas indicam alvos, não testes ou consumidores executados.

| Mudança | Conhecimento pertinente | Uso a reavaliar |
| --- | --- | --- |
| Pack/runtime/readiness | F1; I1 e relações com I2/I3 quando usadas | Seleção e interpretação de ready/failed/unsupported |
| Fonte/config/engine/consulta | F2–F3; I2 | Vazio/stale/dirty, localização e conclusões sobre referências |
| Probe/retenção | F4–F6; I3–I4 | Base do experimento e uso como fonte admitida |
| Binding/allowance/retry | F5–F7; I4 | Identidade, gasto, replay e efeitos incertos |
| Captura/locator/revisão/citação/inquiry | F6–F7; I4 | Sustentação, contrários e fechamento do dispatch correto |
| Receita/autoridade do conhecimento | F0/F8; I5 | Atualidade da cadeia aceita e preservação dos independentes |

O plano atribui **A-IMPACT** ao uso direto de research-impact junto de automation-impact e **R-FAILURE** a research L1/L2. Esses nomes localizam obrigações futuras; não são respostas esperadas, execuções ou PASS. Declarar outros usos afetados exige dependência demonstrável, sem inventar testes a partir de títulos.

Uma decisão verificável registra: identidade antes/depois do input/receita; condição alterada; artefatos/usos afetados e motivo; independentes preservados e sua base; incertezas; versões necessárias à reavaliação; provas obtidas. O conjunto é candidato até confronto com contratos/evidência. Fonte não observável exige indisponibilidade explícita e decisão dependente aberta, sem worklist vazia apresentada como sucesso.

## I7. Limites e abstenção

A autoridade estática vem do L2 aceito. As tabelas são inferências e exigências públicas, sem ensaio de manutenção. Nesta produção foram verificadas autoria, identidades dos inputs autorizados e integridade dos outputs. Não há prova nova de engine/provider, sandbox, memória, banco, publicação/leitura Atlas, consumidor ou reconstrução incremental.

F8 conserva o relato sobre o lock Modelina de 266.885 bytes e o limite de fonte de 256.000 bytes do S4 r3 citado. Ele não foi reaferido. A obrigação de transporte permanece separada; não autoriza retirar fonte necessária, chamar unavailable de absent ou aceitar o fechamento dependente.

Ausência de hits, cobertura declarada, marcador, evento isolado ou hash atual não bastam para completude. Preservar perguntas e donos nos limites externos; este L3 não apropria garantias não demonstradas. Entrega para revisão pelo mesmo par, sem self-PASS, L4, manutenção executada ou conclusão global S1. Tentativas físicas, tokens e custo não expostos: **UNKNOWN**.
