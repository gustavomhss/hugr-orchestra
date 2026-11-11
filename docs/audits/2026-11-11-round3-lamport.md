# Rodada 3 — movimento, agendamento e decisão de memória

Agente `sol_lamport`, modelo `gpt-6.1-sol`. Snapshot `e70717ac937f26d38dbf9235860597f86447fa09`. Três novos P2, com confiança alta por cadeias estáticas e consumidores reais. Nenhum teste/fault injection executado. Não se repetem limites de concorrência de memória já declarados.

## L9 — P2: mover mudanças descarta trabalho posterior à captura

[`control-plane/move-session.ts:93`](../../packages/core/src/control-plane/move-session.ts#L93) captura patch; linhas 101–103 aplicam no destino; 106–111 publicam Moved; 120–126 descartam a origem. [`git.ts:816`](../../packages/core/src/git.ts#L816) não recebe snapshot/hashes/lista fechada dos arquivos capturados; checkout na linha 826 e clean -fd na 842 limpam o escopo atual.

**Interleaving:** A captura X; B edita tracked ou cria untracked enquanto A aplica no destino; A publica movimento e limpa origem. A edição nova de B desaparece sem ter sido transportada. Não há check de identidade entre bytes capturadas e bytes descartadas.

**Reachability:** [`handlers/session.ts:327`](../../packages/server/src/handlers/session.ts#L327) desvia moveChanges=true ao MoveSession, que não usa SessionExecution. O caminho sem mudanças usa SessionV2.move com exclusividade. Checar placement apenas no próximo turno não interrompe ferramenta já ativa ou escritor externo.

**Impacto:** perda de alterações não commitadas, incluindo arquivo novo. **Mitigadores:** scope e index são respeitados; testes seriais preservam arquivos externos ao escopo, mas não bytes produzidas depois da captura.

**Correção/teste:** coordenar owner e usar cleanup condicionado ao estado capturado, preservando/recusando edições posteriores; só travar Session não protege escritor externo. Barreira após captura, alteração/criação na origem e liberação devem resultar em preservação ou conflito explícito, nunca perda silenciosa.

## L10 — P2: agente default implícito cria schedule depois revogado como owner-missing

**Confiança muito alta no cenário serial.** Session pode manter agent ausente. [`agent.ts:95`](../../packages/core/src/agent.ts#L95) e runner/llm.ts:196 resolvem o agente efetivo; invocation.owner.agentID recebe esse ID resolvido nas linhas 293–299. schedule_manage cria usando esse owner.

[`scheduled-task/capability.ts:147`](../../packages/core/src/scheduled-task/capability.ts#L147) verifica presença comparando session.agent bruto com owner.agentID efetivo. Undefined difere de qualquer default resolvido.

**Sequência:** criar Session sem agente explícito; executar normalmente pelo default; criar schedule autorizado; primeiro tick/run vê owner ausente e revoga/desabilita. A Session e o agente efetivo continuam válidos.

**Impacto:** criação parece bem-sucedida, mas schedule nunca executa. Não é problema restrito a Maestro. **Mitigadores:** policy verifica identidade da mensagem assistente, que já é efetiva, portanto criação passa; checks de project/placement são adequados. Testes usam owner com agente explícito e não cobrem omissão.

**Correção/teste:** resolver agente efetivo na Location também na presença do owner, mantendo revogação quando ele realmente muda. Session sem agent com default customizado deve criar/executar primeiro slot; mudar esse default depois deve aplicar a política definida, sem hardcode de nome.

## L11 — P2: aplicação de memória e decisão de proposta podem divergir após I/O

[`handlers/atlas.ts:88`](../../packages/server/src/handlers/atlas.ts#L88) expõe memoryDecide; surface/review.ts:180 chega a [`native-memory.ts:409`](../../modules/atlas/packages/adapter-io/src/native-memory.ts#L409). Linha 417 escreve regra durável; só depois a 419 appenda a decisão indexed no review log. Não há transação/registro intermediário/reconciliação entre arquivos.

**Sequência serial:** memória grava; append de decisão falha por EACCES/ENOSPC/interrupção; request falha e foldReview ainda considera proposta aberta. Após corrigir I/O, usuário descarta a proposta; discarded fecha o log sem remover a regra, que já continua ativa. O header lê memória em native-memory.ts:460 sem exigir decisão indexed correspondente.

**Impacto:** proposta apresentada como descartada pode continuar influenciando o contexto; retry com texto alterado pode deixar outra regra anterior sem decisão. **Mitigadores:** scanner/gates recusam antes da primeira escrita e testes cobrem recusa/sucesso seriais; não cobrem falha entre as duas publicações. Não é a concorrência de gates já documentada.

**Correção/teste:** identidade/estado intermediário recuperável para decisão+aplicação como operação lógica única. Falhar append depois da memória, reabrir e descartar/repetir deve produzir estado coerente, sem regra ativa se a decisão final for descarte.

## Cobertura e descartes

EventV2 publica projeção/seq/seal na mesma transação; replay estrito compara binding/conteúdo; compaction distingue janela de histórico. Não se encontrou novo defeito fechado nesses caminhos. replayAll/claim sem caller produtivo de clustering não foram tratados como sincronização ativa. Checkpoint save/retention/digest foram lidos, sem restore produtivo identificado. Claims/takeover de schedules têm transação e IDs determinísticos; a janela explícita de revogação durante admissão não foi recontada. Atlas owner/root/ref/receipt foram examinados; L11 limita-se ao I/O serial.
