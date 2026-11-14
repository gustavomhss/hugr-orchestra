# Auditoria ampliada — TUI e mutações entre Locations

Snapshot `e70717ac937f26d38dbf9235860597f86447fa09`, branch `orchestra-audit`, 2026-11-11. Achados adicionais do lead, com contraditório solicitado aos Sol responsáveis pelas lentes de arquitetura e concorrência. Análise estática; nenhum teste ou reprodução executados.

## X1 — P2: TUI não recupera permissões e perguntas já pendentes ao conectar

**Confiança:** alta.

[`context/sync.tsx:246`](../../packages/tui/src/context/sync.tsx#L246) e linha 295 alimentam os stores de permission/question apenas quando recebem eventos asked. O bootstrap em linhas 384–444 carrega catálogo, Sessions, ferramentas, status e VCS, mas não consulta requests pendentes. A hidratação da Session em linhas 498–531 busca somente Session, mensagens e todo.

**Sequência:** uma Session pede autorização ou faz pergunta; o servidor mantém o request pendente; depois o usuário conecta via attach e abre essa Session. O endpoint global [`handlers/event.ts:23`](../../packages/server/src/handlers/event.ts#L23) só fornece connected e eventos futuros. Não repete a pergunta que já existia. A interface em [`routes/session/index.tsx:168`](../../packages/tui/src/routes/session/index.tsx#L168) procura exclusivamente os arrays de `sync.data.permission/question`, que permanecem vazios.

**Impacto:** o turno continua aguardando decisão sem que o TUI ofereça a solicitação para resposta. Abrir a mesma Session de novo não hidrata esses arrays. Uma resposta por outro cliente ou interrupção externa pode destravar a execução; isso não recupera o fluxo esperado de attach.

**Mitigação examinada:** [`context/data.tsx:137`](../../packages/tui/src/context/data.tsx#L137) possui métodos de refresh de requests, mas usa outro store. Não foram encontrados callers desses métodos, e a tela de Session usa SyncProvider. Eventos futuros continuam funcionando; o problema é a retomada de requests anteriores ou perdidos.

**Correção recomendada:** hidratar solicitações pendentes por Session/família durante attach e reconexão; reconciliar com eventos concorrentes sem ressuscitar requests já respondidos. **Teste proposto:** servidor real mantém permission/question pendente antes da assinatura; iniciar TUI, abrir Session e exigir que a solicitação apareça e possa ser resolvida. Não usar somente evento sintético de asked após montar a interface.

**Relação com rodada 1:** E2 tratava transcript/status da app-shell. Este item tem consumidor e mecanismo de hidratação distintos e pode ocorrer na primeira conexão, sem queda de rede.

## X2 — P2: erro temporário de histórico vira cache permanente de Session vazia no TUI

**Confiança:** alta.

[`context/sync.tsx:508`](../../packages/tui/src/context/sync.tsx#L508) converte qualquer falha de `catalog.messages` em array vazio. Se Session e todo carregam, o caminho publica esse histórico e adiciona o ID a `fullSyncedSessions` na linha 530. A linha 499 retorna imediatamente para IDs nesse conjunto.

**Sequência:** abrir uma Session existente; GET de mensagens falha uma vez, mas as outras consultas funcionam; sync termina com histórico vazio; servidor volta a responder normalmente; sair e abrir a mesma Session chama sync, que não refaz a consulta.

**Impacto:** transcript durável existente fica oculto durante a vida do provider TUI. Eventos futuros podem acrescentar mensagens novas, mas não repõem as anteriores que nunca foram carregadas. Reabrir Session não corrige o estado; reconstruir o provider/processo pode corrigir.

**Mitigação examinada:** o comentário em linhas 507–508 declara fallback visual herdado, mas não existe estado parcial/retry que o distinga de histórico vazio confirmado. O refresh do DataProvider grava em outro store, não no histórico de SyncProvider usado pela tela.

**Correção recomendada:** permitir fallback visual sem marcar hidratação como completa; manter erro/estado parcial e refazer a leitura. **Teste proposto:** uma falha de mensagens seguida de sucesso, ambas com Session/todo disponíveis; uma nova sync deve consultar a API e recuperar o transcript. Cobrir também retry depois de navegar.

## X3 — P2: proteção contra escrita obsoleta não serializa Locations sobrepostas

**Confiança:** alta. O Sol Lamport confirmou a separação dos serviços e a ausência de hoist global do mutex.

[`file-mutation.ts:85`](../../packages/core/src/file-mutation.ts#L85) cria `KeyedMutex` dentro da layer. O serviço é registrado com `makeLocationNode` na linha 203. [`location-services.ts:84`](../../packages/core/src/location-services.ts#L84) inclui FileMutation entre serviços da Location; a montagem em linhas 138–143 hoista apenas nós globais e usa `Layer.fresh` por referência de Location.

**Interleaving:** Session A está em `/repo`, Session B em `/repo/subdir`. Ambas editam o canonical `/repo/subdir/file.ts`, permitido internamente nas duas Locations. A e B recebem instâncias distintas de FileMutation, portanto locks diferentes para a mesma string canonical. A lê bytes esperados antigos na linha 155; B também lê os mesmos bytes antes da escrita de A; ambas passam a comparação e escrevem em linha 159. Uma atualização pode sobrescrever a outra sem `StaleContentError`.

**Impacto:** perda de edição entre Sessions em Locations sobrepostas, apesar da garantia de comparação/escrita protegida contra conteúdo obsoleto. O caso exige concorrência entre Locations; o lock protege corretamente chamadas que compartilham a mesma instância. Escritas físicas recusam troca de symlink, mas não adicionam exclusividade entre essas instâncias.

**Consumidores:** edit e apply_patch usam `writeIfUnchanged`, respectivamente em [`edit.ts:199`](../../packages/core/src/tool/edit.ts#L199) e [`apply-patch.ts:196`](../../packages/core/src/tool/apply-patch.ts#L196). O teste concorrente atual de FileMutation usa uma só instância, cobrindo apenas o caso que já serializa corretamente.

**Correção recomendada:** compartilhar coordenação de mutação por canonical no escopo do processo, mantendo resolução, autorização e formatação vinculadas à Location. Não promover todo o serviço a global sem preservar essas dependências. **Teste proposto:** construir duas Locations sobrepostas reais, bloquear ambas após a leitura dos mesmos bytes e exigir que no máximo uma escrita condicional tenha sucesso. O processo-local continua sendo um limite explícito para escritores externos e processos separados.

## Cobertura adicional do lead

Foram examinados bootstrap, SDK/SSE, stores de dados, ações e consumidores de permission/question/history do TUI; LocationMutation, FileMutation, PhysicalPath e montagem do mapa de serviços; scheduler legado e capability, claims, leases, retomada, idempotência manual e checks de owner. Não se encontrou achado adicional fechado no scheduler. O comentário sobre a janela de revogação durante admissão foi tratado como limite explícito, sem recontá-lo como descoberta.

O inventário do snapshot contém 13.757 arquivos versionados e 6.595 arquivos com extensões de código examinadas pelo inventário (`.ts`, `.tsx`, `.rs`, `.py`, `.js`, `.mjs`, `.sh`). São números de tamanho do repositório, não de arquivos auditados. Os maiores conjuntos incluem Core, app-shell, Relay, Atlas, desktop, TUI e omni. Nenhuma alegação de cobertura integral decorre desse inventário.
