# Extensões: admissão de SDK, ativação, MCP/OAuth e instruções

L1 · `s1.subslice02.extensions-completion` · need `component` · scope `orchestra.s1`.
Fonte: `gustavomhss/hugr-orchestra@1cde2ff7a71bcf7aecb5d030917b577165135d38`.

O candidato histórico `s1.core.extensions` permanece sem aceite e imutável. Este complemento foi necessário para ler as folhas de admissão do SDK, lifetime de hooks, OAuth, agentes e skills que a projeção pública deixou pendentes. O corpo descreve fonte observada; os documentos históricos não são uma execução de instalação, login ou retomada. Nenhuma escrita remota, execução de plugin, teste de produto ou acesso a credenciais foi realizado.

## Host de plugin e fronteira do SDK

O host expõe contribuições para agentes, catálogo, comandos, integrações, referências e skills, além do gerenciamento de plugins. Ele decodifica os contratos relevantes na fronteira e adapta os tipos de OAuth/credencial declarados. Essa superfície não equivale a uma autorização nativa de capabilities a partir de JSON recebido, nem implementa nesta folha um registro canônico arbitrário de `Tool.make` pelo plugin. Esse limite deve acompanhar qualquer alteração no contrato público de plugin. [E01]

O adaptador Promise captura contexto e scope para hooks e transforms e associa descarte ao unload. Isso resolve lifetime dentro da execução Effect; não transforma efeitos externos feitos pelo plugin em operações duráveis ou reversíveis. O bootstrap interno aguarda a inicialização antes de disponibilizar a Location; seus caminhos de erro não demonstram que todo plugin externo foi executado com sucesso. A resolução de pacotes/configuração externa delegada a outros módulos continua fora das folhas aqui lidas. [E02, E03]

| Parte da admissão | Regra observada | Limite da conclusão |
| --- | --- | --- |
| Runtime SDK | Mapeia exports conhecidos a objetos empacotados. No Node, usa hooks de registro e recusa imports desconhecidos do namespace; exige a versão de API indicada no código. | O hook Bun isolado não é um guard de processo inteiro. A preparação de import externo é uma fronteira adicional. [E04] |
| Footprint do pacote | Usa origem concreta, realpath, lock de raiz, leitura limitada de metadados e dependências; recusa dependências obrigatórias não resolvidas e slots SDK por symlink. | O próprio código exclui escapes deliberados e mutações posteriores do filesystem da promessa de sandbox. [E05] |
| Bridge SDK gerada | Compara árvore esperada, bytes, tipo regular e tamanho; extras/divergências são recusados. Criação/reparo depende da propriedade do cache. | Não autoriza editar uma instalação emprestada como se fosse cache pertencente ao host. O gerador completo de todos os exports não foi reavaliado aqui. [E06] |
| Orçamento de inspeção | Limita diretórios, entradas, entradas por diretório, bytes totais de metadados e tamanho de `package.json`. | Um limite de leitura/admissão não confina o programa posteriormente executado. [E07] |
| Reconciliação | Recusa pacote estrangeiro no namespace reservado e limita reparo ao cache npm pertencente ao host. | A implementação completa do registry e todos os provedores de configuração não foram lidos. [E08] |

Os limites de inspeção são 4.096 diretórios, 32.768 entradas, 4.096 entradas por diretório, 8 MiB de metadados e 256 KiB por `package.json`. São limites declarados e verificados no caminho de admissão; nenhuma instalação foi exercitada nesta produção. [E07]

## Falha durante ativação de plugin

`Plugin.install` verifica ancestry/ciclos, serializa por ID, abre scope filho e agrupa reloads. Se substitui uma ativação existente, remove e fecha o scope anterior **antes** de executar a nova ativação. Só depois de efeito e reloads bem sucedidos publica `Added`, insere o scope em `active` e libera waiters. [E09]

Quando a ativação falha, remove o estado ativo, fecha o scope filho, reaplica reloads e combina as causas da ativação, fechamento e replay. A falha combinada fica disponível aos waiters; o marcador `loading` é removido no finalizador. Isso sustenta diagnosticar a cadeia de causas e as contribuições scoped. Não sustenta prometer a restauração da ativação anterior, rollback de efeitos externos arbitrários ou retomada após reiniciar o host. Essas garantias precisariam de outro mecanismo e outra evidência. [E09, E02]

## MCP comum: chamada dinâmica e autoridade localizada

O MCP comum mantém clientes e gerações na Location e traduz ferramentas para `Tool.dynamic`. A chamada pede a permissão do nome MCP correspondente, transmite signal/timeout ao SDK e acompanha mudanças de lista de ferramentas. O contrato dinâmico apresentado ao modelo não é prova de validação local integral de cada input/output. Não confundir essa rota com o host MCP de capabilities, que tem schemas, target/connection e intenção durável próprios. [E10; complemento de capabilities]

Há um limite concreto à afirmação “todo processo de ferramenta usa o mesmo sandbox”: o ramo local cria `McpStdio` com `env: { ...process.env, ...server.environment }`. Ele não passa pelo wrapper Bash inspecionado no outro complemento. Isso não prova que seja desprovido de qualquer proteção em todas as camadas; prova que a proteção e a política de ambiente do caminho Bash não podem ser atribuídas automaticamente a esse ramo. O adaptador `McpStdio` completo foi capturado, mas não semanticamente lido nesta produção. [E10]

No ramo remoto, tenta o transporte HTTP e pode recorrer a SSE para falhas que não sejam a saída de autenticação pertinente. A tentativa de conexão e o registro de ferramentas são state/lifetime de cliente, não uma garantia de disponibilidade futura do servidor ou continuidade pós-crash. [E10]

## OAuth: credencial salva não é fluxo pendente recuperável

O diagnóstico exige separar três classes de estado observadas:

| Estado | Localidade e comportamento | Recuperação que a fonte permite afirmar |
| --- | --- | --- |
| Credencial/client info | `McpAuth` grava dados selados; o provider verifica a associação com a URL do servidor. Configuração explícita de cliente tem precedência. | Credencial válida armazenada pode ser consultada; isso não recupera um transporte de autorização perdido. [E11, E13] |
| PKCE/state de autorização | Provider persiste verifier/state pertinentes; callback correlaciona o state e mantém waiter em memória com timeout. | State sem waiter/fluxo correspondente não é prova de conclusão. Callback sem state ou state desconhecido é recusado. [E11, E12] |
| Autorização pendente | O MCP mantém em memória transporte e provider pendente; tokens/client info do provider pendente ficam staged até commit de sucesso. | `finishAuth` exige essa entrada viva. Iniciar outro fluxo abandona o pendente anterior; ausência do fluxo não autoriza inventar conclusão nem supor retomada durável. [E10, E11] |

O callback aguarda até cinco minutos, trata porta ocupada como erro explícito e troca o listener quando muda a configuração de porta/path. A execução de callback/finalização usa fibers e scopes; o caminho de finalização fecha o transporte e retira o pendente. Existem callbacks cujo erro é ignorado no processamento de fundo, portanto não se deve anunciar sucesso com base apenas na abertura de URL ou na presença de credenciais em disco. Para concluir, observar a conclusão real do fluxo e a reconexão, sem expor segredo. Nesta produção, todos esses resultados operacionais continuam desconhecidos. [E10–E12]

`McpAuth` usa arquivo de credenciais selado com modo `0600`, pode migrar o objeto legado legível ao lê-lo e move conteúdo corrompido para um nome de preservação. Um armazenamento criptografado indisponível/bloqueado não é apagado como se fosse corrupção; as escritas ficam bloqueadas. A interface de listagem pode mostrar vazio ao registrar o erro, o que não demonstra ausência real de dados. Essa distinção importa para não transformar falha de leitura em remoção. O cipher e todos os backends de chave não foram novamente lidos aqui. [E13]

## Agentes e skills contribuem política/conteúdo, não autoridade por identidade textual

O plugin de agentes declara defaults e regras diferentes por agente. O agente de exploração começa em deny e recebe ações de leitura/busca/Bash específicas; o confinamento adicional de Bash pertence à folha Bash. Agentes internos de resumo/título/compactação têm regras restritas. O nome de agente ou o texto de uma skill não deve ser interpretado como permissão independente da regra efetiva e do host que executa a chamada. [E14; ferramentas T12, T26]

Na descoberta remota de skills, a folha valida nomes e caminhos relativos e mantém downloads dentro da origem e do prefixo de URL esperados. Quando uma versão muda, prepara os arquivos em staging e usa troca com backup/restauração; na mesma versão ou sem versão, baixa no lugar. Portanto, não há base para declarar todo update de skill atomicamente reversível. Essa validação de origem/caminho também não é julgamento de confiança do conteúdo nem entitlement de capability. [E15]

`SkillFile` limita escrita a markdown da skill registrada no próprio projeto, recusa builtins/reservados, usa verificação de mtime quando solicitada e recusa caminhos redirecionados. Escreve arquivo temporário e faz link/rename conforme o caso; a remoção da pasta é não recursiva e só ocorre se vazia. Uma nova regra de mutação deve ser reavaliada nessa folha e nas primitivas físicas pertinentes, sem atribuir esse comportamento a toda forma de instalação de plugin. [E16]

## Disposição e impacto delimitado

O delta fecha a leitura dos gates e folhas acima; conserva os candidatos históricos e não repete sua visão geral como novo aceite. Mudanças de contrato do host afetam E01/E02 e seus adaptadores; mudanças de footprint afetam E04–E08; mudanças de OAuth afetam E10–E13; mudanças no conteúdo/política de agente e skill exigem as respectivas fontes. A identidade materializada de ferramenta e os frames nativos continuam fronteiras independentes que devem ser conferidas quando o contrato atravessar essas ligações.

Permanecem sem prova: sandbox universal de plugin; reversão de efeitos externos; auth pendente durável; qualidade de todos os provedores/SDKs; algoritmos de todos os adaptadores MCP; atomicidade global de atualização; execução em todos os OS. As fontes capturadas mas não lidas e as folhas não capturadas continuam explicitamente assim na cobertura. Testes, fixtures e documentos agrupados têm obrigação de revisão quando uma mudança os tornar pertinentes; sua presença não é validação executada. Este L1 não libera L2–L4 nem realiza os ensaios futuros M1/M2.

## Índice exato das fontes usadas

SHA-256, Git blob e bytes exatos estão no manifest; intervalos confirmados estão no registro de leitura.

| Ref | Caminho | Linhas lidas pertinentes |
| --- | --- | --- |
| E01 | `packages/core/src/plugin/host.ts` | 1–219 |
| E02 | `packages/core/src/plugin/promise.ts` | 1–93 |
| E03 | `packages/core/src/plugin/internal.ts` | 1–156 |
| E04 | `packages/core/src/plugin/sdk-runtime.ts` | 1–76 |
| E05 | `packages/core/src/plugin/sdk-admission.ts` | 1–261 |
| E06 | `packages/core/src/plugin/sdk-package.ts` | 24–111 |
| E07 | `packages/core/src/plugin/sdk-limits.ts` | 1–57 |
| E08 | `packages/core/src/plugin/sdk-reconcile.ts` | 1–41 |
| E09 | `packages/core/src/plugin.ts` | 69–164 |
| E10 | `packages/core/src/mcp.ts` | 1–93, 204–330, 332–490, 570–674 |
| E11 | `packages/core/src/mcp/oauth-provider.ts` | 28–180, 184–241 |
| E12 | `packages/core/src/mcp/oauth-callback.ts` | 8–174 |
| E13 | `packages/core/src/mcp/auth.ts` | 62–127 |
| E14 | `packages/core/src/plugin/agent.ts` | 1–106 |
| E15 | `packages/core/src/skill/discovery.ts` | 15–64, 93–210 |
| E16 | `packages/core/src/skill/file.ts` | 54–113, 115–182 |
