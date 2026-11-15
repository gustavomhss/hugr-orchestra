# Entrega do produtor L1 Session/state

Concluídas as duas tarefas dentro de `a1_completion/`, sem acesso a oracle/reserved e sem execução de produto, provider, testes ou mutações Git.

## Corpos exatos

- Correção pontual de context: `bodies/context.md`, 5909 bytes, SHA-256 `94e04589d726a017c3cbeb8f758d5d23aae773733597a15ea5236e8e1288aea7`. Original `205b44488e2b6349a55480d3becf2e59806c185bec90d43af283e11b3933b1fd` preservado; delta e proveniência em `context-correction.json` e `evidence/context-truncation.delta.patch`.
- Suplemento `s1.subslice01.session-state-completion`: `bodies/session-state-completion.md`, 25450 bytes, SHA-256 `2621a48ba336ad17db711b556ee65a62fe527221052b1736452460bbe661efa7`. Cobre projeções/fork/revert/import, archive/restore, materialização workflow/tools e portas hosted, drivers/transações, migrações/backup, compaction/seals, contexto e folhas Session/Lean/reuniões/processos.

## População e prova

`row-dispositions.jsonl` dispõe 197/197 caminhos exatos: 66 implementações, 72 migrações históricas, 52 testes, 1 harness, 2 gerados, 3 documentos e 1 prompt. Captura não foi tratada como leitura semântica; testes são fontes **NOT_RUN**; migrações/testes/gerados têm propósito, profundidade e limites próprios. Há 171 capturas novas mais 26 reutilizadas, e duas fontes cruzadas de driver recapturadas separadamente, fora do denominador197.

`packets/principal-review.md` é o pedido principal para o mesmo par de juízes sem ferramentas: corpo completo uma vez, fatos novos decisivos e tabela compacta197. Tem 210654 bytes e SHA-256 `942c1335ad35e4076792f222d97db5388c8380aa02e251d5a303d2c68879eff8`. Reaproveita os trechos A1 que root informou já enviados ao par. Os19 anexos extensos, corpos/drafts/deltas, fontes e índices completos permanecem preservados. Nenhum pacote foi enviado por este produtor aos juízes.

Limites que o texto torna explícitos: notificação após retorno da transação EventV2 não é hook universal após COMMIT externo quando há savepoint; fork copia projeções, não todo estado/eventos; restauração WAL da fonte de teste é current-source, quiescente e clean-reopen, sem promessa de crash/cross-version; migrações beta podem apagar projeções; a documentação que promete reset do epoch no move diverge dos caminhos atuais; host/provider metadata, reuniões e métricas não ganham autoridade além da fonte.

## Trabalho restante preciso

Root deve enviar o principal ao mesmo par, reconciliar eventuais findings contra este hash, incorporar o fragmento de metadata no namespace `producers/session-state-completion/`, fazer o binding/consumo/selagem reais exigidos e só depois construir os dependentes L2–L4. `candidate-artifact.json` está bloqueado por esses gates; não contém PASS, recibo de runtime ou SHA de publicação inventado. Não há leitura de fonte atribuída ainda pendente neste produtor dentro do contrato de profundidade declarado.
