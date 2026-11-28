# L2 — Diagnóstico de armazenamento, gravação e replay

**Chave:** `s1.subslice05.storage-evidence.l2` · **Need:** `operational` · **Scope:** `orchestra.s1`.
**Fonte do produto:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`.

## O que este diagnóstico permite decidir

Use esta síntese para localizar falha de transação, migração ou replay e determinar qual evidência falta antes de alegar um resultado do produto. P1–P3 são os três L1 C aceitos no alcance delimitado. C1 é o L1 Core de persistência aceito e fornece apenas as relações explicitamente citadas. O texto não executa banco, provider ou fixture e não encerra R2.

| Objeto | O que representa | O que ainda requer evidência própria |
| --- | --- | --- |
| Adapter SQLite genérico | Contrato de consulta/transação sobre `SqlClient` | Driver/adaptação realmente escolhidos pelo produto |
| Evento durável Core | Registro, projeção e sequência no caminho aceito de C1 | Restauração, recovery e comportamento após crash |
| Cassette HTTP/socket | Interações preservadas para um contrato de replay | Execução atual, conformance e fidelidade não gravada |
| Ledger de casos não gravados | Lacuna nominal e razão da ausência | Uma gravação válida e execução do caso exato |
| Recibo de execução | Resultado observado no candidato/ambiente identificados | Qualquer cenário ou versão não cobertos pelo recibo |

## Transação: seguir trabalho e finalização

`effect-drizzle-sqlite` é adapter genérico vendorizado. Monta o banco com client, logger e cache e oferece queries yieldable em Effect e migrações. Tabelas Orchestra, paths, hooks e política de startup ficam no consumidor. Uma transação reserva conexão ou reutiliza a conexão do serviço de transação da fiber. A externa inicia com comportamento configurável, deferred por default; aninhamento usa savepoints `effect_sql_N`. [P1]

O callback recebe a conexão de transação e executa com interrupção restaurada. Sucesso é seguido de commit/release. Commit que falha tenta rollback; falhas aninhadas também tentam release. Falha do callback segue rollback/release, e o fechamento do scope adquirido integra a finalização. `finalizedExit` preserva a falha original e as falhas de cleanup, concatenando causas sem eliminar tentativas iguais. Assim, sucesso do callback não basta para declarar sucesso da transação quando o commit ou cleanup falhou. [P1]

Ao diagnosticar, separe: aquisição/início, callback, commit ou savepoint, rollback/release e fechamento. Preserve a causa composta e a ordem de tentativas relevantes; não substitua erro original por um único erro de cleanup nem trate cleanup com falha como sucesso. Esse procedimento deriva dos caminhos inspecionados e não é relato de injeção de falha executada. [P1]

Na atualização do journal legado, o adapter procura migrações por tempo normalizado e hashes candidatos/fallback. Recusa linhas sem correspondência antes de montar/executar backfill. O comentário sobre fallback futuro de ID serial não permite adivinhar uma migração. Execução normal usa transação para SQL pendente e journal; init recusa journal já existente e mais de uma migração local, registrando a migração inicial sem executar seu SQL. [P1]

`effect-sqlite-node` é outro pacote: encapsula `node:sqlite`, adquire serialmente, fecha por scope, habilita foreign keys e normalmente WAL. `executeStream` morre como não implementado. `create`/`readwrite` são declarados sem as opções correspondentes nesse construtor. Seu README diz que o pacote não é usado e que Core tem cliente Node próprio; isso continua declaração documental, sem censo atual de imports. Logo, não há base para prometer streaming nem adoção produtiva desse adapter. [P1]

## A ponte aceita para Core é delimitada

C1 descreve o startup SQLite e o motor Core de migrações: banco vazio recebe schema gerado e journal em transação immediate; um banco existente recusa IDs desconhecidos, faz backup com `VACUUM INTO` antes de migrações pendentes e conserva os três backups mais novos. A engine relê cada entrada de journal na transação antes de aplicar e registrar a migração. Esse mecanismo é distinto do upgrade genérico descrito acima. Não o atribua ao adapter só porque ambos usam SQLite. [C1]

No caminho durável de EventV2, C1 liga validação da identidade/sequência, projeção, hook local de commit, avanço de sequência e inserção selada por uma transação. `persist:false` é uma exceção explícita de projeção/notificação sem esse append durável, e não pode receber o hook local. Seals são integridade, não autenticação nem posse de execução da Session. C1 não executou migração, restore ou controles negativos; também não inspecionou exaustivamente drivers e migrações históricas. [C1]

Esse vínculo aproveita persistência aceita sem transformar C-N02 inteiro em resolvido. Uma nova afirmação sobre escolha do driver, ausência de consumidores, recuperação ou restauração exige seu fornecedor e prova específicos. Models/Runtime e completions pendentes não participam da síntese.

## Replay HTTP: sequência de investigação

1. **Fixar o modo e a identidade.** Registre API usada, path/nome do cassette e a versão do caso. O recorder público em modo automático reexecuta cassette existente localmente, grava quando falta localmente e força replay quando CI tem valor não vazio diferente de `false`/`0`. Um diagnóstico que usa auto com arquivo ausente pode chamar serviço real. O harness LLM fornece modo explícito; grava apenas com `RECORD` exatamente `true`. Não execute gravação incidental para investigar. [P2–P3]
2. **Conferir o contrato de matching.** Replay HTTP consome sequencialmente apenas depois de casar o pedido. O matcher padrão compara método, URL, headers permitidos e JSON canônico: ordena chaves de objetos, preserva ordem de arrays. Matcher customizado muda o contrato relevante. Ausência, mismatch e esgotamento falham. Não pule uma interação para fazer um pedido posterior parecer compatível. [P2]
3. **Examinar conclusão e consumo.** A finalização verifica interações não usadas depois de pelo menos uma consumida; zero interações consumidas é exceção explícita. Gravação bufferiza respostas completas e preserva ordem de início por encadeamento de append. Existência ou status 200 armazenado não prova que houve consumo, passagem das assertions ou contato atual com o serviço. [P2–P3]
4. **Conferir filtros e ledger.** Em record, variável obrigatória ausente pode pular o caso; prefixo/provider/tag/filtros também podem pular. Em replay, cassette ausente normalmente falha, salvo lacuna nominal no ledger. Entrada de ledger com cassette já existente falha como stale; duplicatas de paths são recusadas. Cassette antigo de caso renomeado continua não verificado contra o novo request. [P3]
5. **Identificar a API de socket.** O socket público conserva a sequência intercalada: entrega eventos do servidor até exigir escrita do cliente, valida essa escrita e continua. O helper interno `makeWebSocketExecutor`, usado pelo adapter LLM, separa listas de eventos de cliente/servidor e oferece o stream do servidor. Não transfira a garantia de interleaving do público para o helper interno. [P2–P3]
6. **Registrar resultado autorizado.** Depois de corrigir fonte/fixture apenas se necessário, obtenha o recibo real no ambiente autorizado e no caso exato. Nesta produção todos esses passos de execução são NOT_RUN; os itens anteriores são instruções de diagnóstico apoiadas em fonte, não um replay bem-sucedido.

O socket público recusa runs concorrentes e frames de cliente divergentes; close verifica tráfego cliente restante. Gravações falhadas/interrompidas não viram transcrições ordinárias de sucesso. O contrato grava frames de aplicação, sem cobrir integralmente timing, cancelamento, backpressure ou close-code terminal. O export workspace `./internal` é removido no pack, de modo que seu uso em testes não prova disponibilidade no pacote publicado. Build/install e verificação do pacote não foram executados. [P2]

## Limites que precisam acompanhar a evidência

Nomes de cassette recusam caminhos absolutos, traversal e escape léxico. Redação cobre padrões de headers, URL e JSON; prewrite verifica prováveis segredos e usa temporário/rename. Isso não prova proteção contra symlink nem detector completo: payload binário em base64 não é decodificado para a varredura. Bufferizar respostas também não garante memória limitada. Nenhuma credencial foi lida nesta produção. [P2]

A classificação C continua com 323 paths: 284 capturados e 39 metadata-only. As seis estruturas de fixture amostradas não representam o resto; o espécime OpenAPI de 637.024 bytes segue não observado no alcance e não é ausente. N06 preserva a exclusão de seus conteúdos. N03 impede converter fonte, cassette, nome de teste, script ou hash em PASS runtime. X01 preserva `executeStream` não implementado e os contratos diferentes dos sockets. N04 mantém limites de query/paridade. CI, replay, migração, Atlas e consumo real permanecem sem recibo novo.

## Proveniência exata

P1–P3: `native-package.c-r1-v2.json` em `a8df22ae3a140c58c63f62ce2a634c84f415c943`, SHA-256 `6fb6ce93ba167d667f97e987032c9a3d4d8e293653848e2d924c992121ed2060`. Prefixo: `modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/`.

| Ref | Predecessor aceito | SHA-256 do corpo |
| --- | --- | --- |
| P1 | `s1.runtime.effect_sqlite.l1` | `b1dc22165fbdcee0a5811dc983548ac26f1189adc311e9855cfc22763b7d9597` |
| P2 | `s1.runtime.http_recorder.l1` | `4857371404625869016238e6ac23fbf7aad5ab0c7538f64df2ebfe91f1935fe7` |
| P3 | `s1.runtime.llm_recording.l1` | `28e1d579f17b5463c58c701c8f98c0b131bef0b1bbb2390317d30655c837519d` |
| C1 | `s1.core.persistence` | `0b43f9bd316aca25361f934e63723f2aa6220a3deb97a4447266fbbc5d350762` |

C1: `subslices/01-sessions/native-package.json` em `9fd024a34e76d2e9328e1f793ef1f69fbf606e51`, SHA-256 `7541d67c8a4c3183429b9600ec6ea947a8b7035bbc6d0e83f7bb2d910b7fc030`; estado no índice: `ACCEPTED_BY_SAME_NATIVE_PAIR`. Os pacotes preservam as fontes transitivas; `fragment-metadata.json` fixa estas dependências e a cobertura. Este candidato L2 aguarda juízo próprio e não libera L3/L4.
