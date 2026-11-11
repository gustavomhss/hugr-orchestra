# S4 — preservação, migração e rollback

Estado: **PREPARAÇÃO EXECUTADA; INTEGRAÇÃO DEPENDENTE BLOQUEADA**. Campanha `20261111-v1`, Orchestra inteiro. Tentativa de preparação `S4-PREP-PRESERVE-001`, subagente real `/root/protected_migration`.

## Identidades e alcance da evidência

Fonte inicial: `1cde2ff7a71bcf7aecb5d030917b577165135d38`. Protocolo: `2689c516d63488be37de678cc853dd4556fd5c13`. Nenhum candidato S2/S3 integrado foi executado por este subagente. O contrato de escopos, o envelope aplicável e o target isolado ainda devem vir dos handoffs fixados de S1/S2/S3/S5.

As inspeções abaixo conferem bytes e vínculos de evidência histórica. Não equivalem a executar `atlas-emit`, reader, migração, rollback, CI ou publicação do novo candidato. `old-producer` permanece **INDETERMINATE**; AC-10 permanece aberto para a integração nova.

## Objetos protegidos e observações novas

O inventário histórico `ac10-protected-inventory-v1.json` tinha 88 caminhos identificados e 62 pins de SHA-256 declarados, sem rehash dos arquivos. Nesta preparação, os 88 objetos foram acessados e seus bytes foram conferidos contra os respectivos Git blobs no pin. Os 62 pins foram recalculados: todos coincidem. Caminhos que apontam ao mesmo blob foram deduplicados na leitura; a árvore Git fixa cada pertencimento. O recibo `protected-byte-verification.json` contém os resultados por caminho, inclusive o caminho efetivamente baixado para cada blob compartilhado.

A árvore recursiva de `modules/atlas` contém 2.033 entradas, 1.889 blobs e `truncated=false`; nela há 425 arquivos sob `docs/design/genesis*`. Eles estão enumerados por caminho, modo e blob no inventário protegido. A árvore `.atlas` contém três blobs de Memory existentes: preservá-los contra escrita desta fatia não os transforma em Knowledge aceito de Genesis. Fontes de código podem mudar em futuros candidatos autorizados; a versão histórica citada continua imutável e cada mudança atual deve invalidar/revincular os artefatos afetados.

O artifact histórico `13444687733`, do run [42087075694](https://github.com/gustavomhss/hugr-orchestra/actions/runs/42087075694), foi novamente obtido pelo conector e observado por leitura. O run está `completed/success` no head `c9b8e54cbf2c6c2c4bb59bbda2dc878430a54085`, tentativa 1; ele é um controle offline histórico, não um run desta campanha. O ZIP possui 1.662.130 bytes e SHA-256 `9df9f969d7f798e3fd9a4665d062da5293ac2aa77bbc1249bffdca41734860da`, igual ao manifesto original. Todos os 886 membros foram lidos e tiveram SHA-256 calculado; nenhum programa do ZIP foi executado.

O recibo `historical-archive-receipt.json` e os quatro inventários associados demonstram os seguintes fatos delimitados:

- 104 requisições no replay; 103 respostas originais cujos bytes, identidade, prompt, arm e comprimento coincidem com o manifesto, e cujos stdout/stderr decodificados e exit code coincidem com o replay do controle.
- 365 objetos CAS originais, todos byte a byte iguais às cópias reconstruídas; o digest do inventário ordenado coincide com `56708a724e2f232d2bd4ede1653180d733d8970bd2d29e55f81df30ea7c10fe8` no source receipt.
- Staging original e as duas cópias do plano coincidem com os digests congelados. Os 272 claims em 91 lugares continuam presentes com seus vínculos de evidência originais.
- O controle contém 200 dispatches e 200 completions correspondentes: 103 replays, um retry sintético com nova identidade e 96 entregas sintéticas novas. Essas entradas não são somadas a inferência paga real.
- O pedido original `be07949d-5cdc-48f1-9309-bddd4b32cd2b`, prompt `ae9245cf01c3ea1c15aac6c077739194973a3c09a684ea799c21fd8462e7d9fe`, permanece sem resposta original. O retry sintético não o liquida.

A cadeia completa original de 295 envelopes não está neste ZIP. Seu source receipt permanece a âncora histórica; a inspeção não afirma ter revalidado a cadeia ausente. Também não observou o ledger físico do provedor, cobrança, fonte-pack integral externo, todos os corpos dos snapshots contábeis posteriores ou todo o fechamento transitivo de pesquisa/consumidores. Uso físico, tokens e cobrança continuam **UNKNOWN**.

## Portas de migração existentes

`modules/atlas/scripts/ownership-pilot.ts` é um importador limitado a `session-input`. `prepare` confere source freeze, corpos e a cópia exata de sua receita, gera resultados CAS e grava um candidato privado com `wx`. Seu `publish` exige dois reviewers históricos específicos e aprovações novas do mesmo `manifestID` para `runtime-import-binding`; ele não se torna automaticamente o importador do novo contrato nativo.

O `publish` compõe o runtime, chama `runtime.check(...)` e escreve pela porta `runtime.handler.handle("atlas-emit", ...)`. `ownership-attachment.ts` verifica o anexo, scope, manifesto e closures por `readOwnership` contra inputs observados no host. `governed-emit.ts` executa autorização, validação do anexo e ratificação antes de atualizar a projeção por `commitProjection`. A existência desses checks é evidência de código, não de execução nesta tentativa.

Uma escrita CAS, um resultado `candidate`, um arquivo de research ou um sidecar copiado não dão autoridade ao consumidor. O readback aceito passa por `runtime.ownership.read(query)` e `runtime.ownership.index(scope, need)` no runtime composto, com manifest/resultado/receipt/trust/current-inputs vinculados. A resposta recusada é preservada; bytes de sidecar untrusted ou CAS não são servidos como fallback.

## Regra de compatibilidade

Compatibilidade é a correspondência explícita entre target, scope e membros registrados, fontes atuais, receita/contrato, dependências, resultados, reviews, manifesto, carrier e trust. SHAs não definem uma ordem semântica de versão.

O contrato histórico G4 registra que `ownership-rebuild.ts` compara `recipeVersion` à receita observada, sem estabelecer ordem entre produtores. A proposta histórica `87abf90956` bloquearia também as atualizações válidas RB-07 (`recipe-a-2`) e RB-11 (`recipe-b-2`); ela não é um gate reutilizável. Não foi aplicada e nenhuma razão artificial `old-producer` foi criada.

O caso do produtor antigo precisa fixar a implementação realmente antiga, a identidade do produtor autorizado no novo contrato e uma chamada à porta real de publicação. Executar o piloto em um corpus incompatível, constatar scope fixo ou receber recusa por falta de token não prova isoladamente recusa por incompatibilidade do produtor. Sem esse vínculo do contrato novo, a linha permanece indeterminada. O controle positivo deve provar que uma atualização legítima da receita ainda pode ser admitida sob os mesmos gates.

## Sequência isolada, pendente dos candidatos exatos

1. S5 fixa um único candidato integrado com commits/hashes de S1/S2/S3. S4 valida o contrato, a alocação, o target isolado e a autoridade existente. Não se combinam arquivos de branches móveis.
2. Fotografar os objetos protegidos e a geração anterior aceita, com manifest/carrier/trust, inputs e membresia observados. Executar o controle positivo atual e o scope independente antes de mutações.
3. Importar/produzir pelo adapter entregue por S2 e preparar a geração candidata por S3. Observar que staging não altera a autoridade de leitura: o consumidor continua no manifesto anterior válido ou retorna HOLD, conforme o contrato.
4. Exercitar a tentativa de publicação sem autoridade, depois a publicação isolada expressamente autorizada, preservando saídas brutas e a identidade dos bytes servidos. Uma ratificação ou policy de produção não será criada para satisfazer o caso.
5. Exercitar o produtor antigo contra o scope novo, com os controles positivos de compatibilidade. Registrar `emitted`, motivo real, caller, versão do produtor e geração efetivamente lida; ausência de efeito deve ser demonstrada por readback e hashes.
6. Ativar a geração nova somente pela porta governada. Verificar todos os readers afetados e o scope independente contra o manifesto efetivamente publicado, não contra arquivos locais preparados.
7. Rollback compatível só pode apresentar a geração anterior como atual quando fontes, contratos e dependências atuais ainda são compatíveis. Se o teste requer restaurar fontes, fazê-lo apenas no target isolado e registrar exatamente os novos hashes antes da ativação.
8. Com source drift ainda vigente, tentar rollback e exigir HOLD para leitura atual. `historical: true` é uma solicitação explícita e deve conservar o rótulo histórico e os demais gates; não permite leitura untrusted. Não substituir o motivo real por um motivo inventado.
9. Recusa de substituição com identidade estrangeira e recusa de sidecar untrusted são casos separados. No primeiro, verificar a projeção aceita anterior onde o contrato a conserva. No segundo, não afirmar que a projeção untrusted continua legível; registrar HOLD sem fallback.
10. Comparar os inventários novamente após staging, ativação e rollback. Novas identidades autorizadas entram como novos objetos, nunca por reserialização/substituição do original. Gerados são obtidos apenas por seus geradores nos candidatos exatos, com receipt do comando e resultado.

Os passos 1–10 acima são casos preparados, ainda **NOT_RUN** neste subtrabalho. Seus oracles e blockers estão em `migration-cases.json`. O inventário antes/depois da branch documental S4, quando feito pelo integrador, prova apenas preservação no Git nessa revisão; não substitui a comparação de estado durante migração.

## Obrigações e autorização preservadas

M1 continua uma rota de execução aposentada; não se declara mining completo e não se reinicia a fila. J1/R3 continua aberto até evidência ou disposição autorizada específica. Os HOLDs originais de consumidores v1/v2, aceites limitados v3 e decisões anteriores não são reescritos nem ampliados para Orchestra inteiro.

Leitura atual dos PRs confirmou `open`, sem merge: #1291/head `c9b8e54cbf2c6c2c4bb59bbda2dc878430a54085`, #1300/head `bfb3ce5f3552d97495b0ab566bdbaf12db292998`, #1302/head `7fe6d7a7f7120caf82da246aa7a12ae0d17306fb`. Nenhum deles foi alterado. Nenhuma branch, worktree ou processo herdado foi limpo. Os arquivos locais desta inspeção são cópias verificadas, não um checkout autenticado do proprietário.

Integração técnica, dois julgamentos aplicáveis, aceite do proprietário, landing e ativação de produção são atos separados. Esta entrega solicita somente julgamento do pacote preparado quando S5 puder vinculá-lo ao candidato exato; não concede qualquer desses estados.

## Fontes e recibos

Todos os paths lidos e seus SHA-256/Git blobs estão em `source-identities.json`. Fontes centrais no source anchor: `genesis-ownership-plan.md`, `genesis-campaign-reconciliation.md`, `genesis-recovery-worklist.md`, `genesis-landing-plan.md`, `genesis-g4-host-migration-contract.md`, `ac10-protected-inventory-v1.json`, `script/rename-ledger.ts`, `checkpoint-replay-source.json`, `ownership-pilot.ts`, `ownership/types.ts`, `ownership-attachment.ts` e `governed-emit.ts`. O formato do inventário CAS e o encoding base64 das respostas foram lidos nos codecs de arquivo do run histórico; esses programas não foram executados.
