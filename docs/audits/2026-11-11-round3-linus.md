# Rodada 3 — contratos e controle de processos omni

Agente novo `sol_linus`, modelo explícito `gpt-6.1-sol`, lente de contratos e correção de baixo nível. Snapshot `e70717ac937f26d38dbf9235860597f86447fa09`. Dois novos P2 por leitura estática; nenhum teste/cargo/runtime/Worker executado. N1 é API pública de biblioteca sem consumer de produção Orchestra em Worker identificado.

## N1 — P2 condicionado: teardown de Worker não encerra árvore de run()

**Confiança alta na cadeia estática.** [`bindings/node/src/run.rs:19`](../../native/omni/bindings/node/src/run.rs#L19) passa cmd.run ao executor sem registrar ownership. Spawn registra Arc<Kid> em owned(env) em child.rs:59–61. O cleanup hook em error.rs:31 chama Owned.stop_all, que só percorre os Kids registrados em [`teardown.rs:37`](../../native/omni/bindings/node/src/teardown.rs#L37).

**Sequência:** Worker chama run longo sem signal/timeout; depois de PID confirmado, principal termina o Worker e segue vivo. exec::promise mantém future/Child no executor global até work concluir. Não há registro/cancelamento de Task por Env; convert.rs:112 só cria cancelamento se usuário forneceu signal. O supervisor observa o processo host, que continua vivo.

**Impacto:** árvore pode continuar consumindo recursos e produzindo efeitos após morrer o ambiente que a iniciou. Morte do host e timeout/signal explícitos são mitigadores distintos. api-contract.md:256 promete teardown das árvores do ambiente.

**Teste existente:** worker.mjs:9 aguarda run acabar antes de testar a árvore criada por spawn, portanto não cobre esse caminho. **Correção/teste:** registrar run no ownership com cancelamento/confirmação; cancelar promise JS isolada não basta. Worker inicia árvore com pidlog, principal termina Worker e verifica PIDs antes de encerrar host, mantendo árvore do principal como controle positivo. Não se atribui esse cenário ao app instalado sem consumer correspondente.

## N2 — P2: erro recuperável de inventário desarma proteção de recursos

**Confiança alta na cadeia estática.** [`process/memory.rs:38`](../../native/omni/crates/hugr-omni/src/process/memory.rs#L38) retorna definitivamente em qualquer erro de life.processes. List usa Class::Normal em client/mod.rs:211; channel.rs:293 pode recusá-lo por 1024 requisições pendentes sem matar a geração. Inventário incompleto também produz erro explicitamente recuperável.

**Sequência:** árvore abaixo de maxRssBytes; uma amostragem falha por saturação/inventário temporário; watcher termina; serviço recupera e árvore cresce acima do cap, sem nova amostragem ou aviso de desativação.

O mesmo mecanismo afeta lingering de deadline: [`process/deadline.rs:118`](../../native/omni/crates/hugr-omni/src/process/deadline.rs#L118) classifica erro como Over; linha 101 o converte em false e encerra vigilância. Raiz e pipes já terminaram, mas descendente continua vivo e perde o acompanhamento de timeout/AbortSignal. É uma causa compartilhada, contada uma vez.

**Impacto:** cap deixa de atuar silenciosamente ou descendente sobrevive ao controle posterior. Há consumidores de maxRssBytes em research-toolkit/probe/run.ts:63, review-toolkit/probe.ts:191 e research-toolkit/code-index/extract.ts:216 quando omni está on/strict. Timeouts externos de alguns consumidores limitam duração do dano, sem restabelecer RSS.

**Mitigadores/limites:** morte definitiva do supervisor, natureza amostrada do cap e escapes deliberados de sessão são casos diferentes. Comentário interno termina quando supervisor cannot list; contrato público não declara perder para sempre a obrigação por busy recuperável. Não se afirma que RSS é sandbox rígida instantânea.

**Correção/teste:** distinguir erro recuperável de geração morta, repetir sem perder deadline original e falhar observavelmente/encerrar árvore se obrigação não puder ser mantida. Injetar uma recusa de List, recuperar geração e aumentar RSS; testar também descendente sem pipes e timeout/cancelamento depois da recusa. Suítes atuais cobrem cap e lingering sem essa falha intermediária.

## Cobertura e hipótese não promovida

Leitura de AGENTS/contrato/API/ADR/protocolo/conformance, binding JS/Rust/types/conversão/cancelamento/executor/teardown, Child/Life/run/deadline/memory, IPC registry/geração/admissão/routing, caminhos Unix SCM_RIGHTS e Windows handles, supervisor spawn/trees/inventário/sweep/PTY, Windows Job/ConPTY amostrados e consumidores Core. Não é auditoria exaustiva ou prova multiplataforma.

Não recontados M1–M3 desktop, limites declarados setsid/supervisor morto/CLOEXEC macOS/ConPTY/teardown. Decoder PTY adicional não foi acusado: text=true usa decoder Rust que mantém UTF-8 entre chunks.

**Pendente, fora da contagem:** io/queue/reader.rs sinaliza running antes de pump/read. Uma desescalada entre esses pontos pode contrariar a prontidão PTY esperada no macOS, mas falta validação determinística do comportamento do kernel. Teste repetido sem injeção de ordem não fecha essa hipótese.
