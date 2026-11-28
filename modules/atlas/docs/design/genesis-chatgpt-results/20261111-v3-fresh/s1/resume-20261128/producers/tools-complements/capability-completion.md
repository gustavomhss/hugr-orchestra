# Capabilities: frame emitido, efeito autorizado e observação persistida

L1 · `s1.subslice02.capability-completion` · need `component` · scope `orchestra.s1`.
Fonte: `gustavomhss/hugr-orchestra@1cde2ff7a71bcf7aecb5d030917b577165135d38`.

O candidato histórico `s1.core.capability` não tem aceite. Este complemento conserva sua condição e acrescenta leitura direta dos gates de execução, transporte MCP nativo, schemas/descritores, publicação de resultado, artefatos e folhas de controle do host. Nenhum efeito de capability, teste, login, instalação de runtime, consumidor ou provedor foi executado. As constatações são de implementação estática e não uma garantia de êxito operacional.

## Autoridade emitida pelo host e confirmação no estado persistido

`CapabilityInvocation` emite um frame com marca privada, valida o input do host, confere Session/agente entre owner e invocation e congela a representação. `require` exige esse frame emitido e confere IDs do contexto, projeto, diretório e workspace. JSON de plugin com Session, agente ou call ID não possui essa marca. Tampouco a marca substitui a existência de uma chamada atual no estado persistido. [C01]

`CapabilityPolicy` verifica a placement atual da Session, a mensagem de assistant do mesmo agente e o tool part raiz em estado pending/running. Para chamadas filhas, exige a cadeia persistida de execução running com os respectivos campos. O deny floor restringe; não concede ação. A aprovação pode ocorrer fora dos locks, mas a política revalida depois da aprovação e antes do efeito. [C02]

O permit é um objeto emitido em estrutura privada, ligado ao mesmo binding; a chamada de commit recusa transação SQL ambiente, toma o lock do ator, abre writer imediato, confere frame, estado persistido e denies atuais, e só então chama o callback autorizado. A fonte limita a quantidade de efeitos de um permit. Não se deve transformar esse mecanismo local em autorização de qualquer código de plugin ou de qualquer chamada remota que não atravesse o gate. [C02]

O dispatcher de filhos captura a identidade canônica, calcula ordinal/ID, persiste a admissão running e executa o settlement no contexto filho emitido. Uma execução filha já existente não é disparada novamente como se fosse nova: o caminho conservador retorna resultado desconhecido quando não pode atestar replay seguro. A gravação posterior de fato terminal pode continuar válida após a raiz terminar, mas não autoriza admitir outro efeito. A atualização de progresso é auxiliar à prova persistida. [C03]

## Registro, descritor e schema não concedem acesso por si sós

`CapabilityTools` registra as folhas canônicas uma vez por Location; o conjunto inclui channels, media, documents, sheets, service, process e schedule. Dependências de vendor/runtime são carregadas no primeiro uso pertinente; o registro não prova que o recurso externo está disponível. A varredura inicial de processos tem caminho explícito de log de falha. [C04]

No serviço, `service_find`/`service_describe`/`service_call` trabalham com o registry capturado; `service_call` passa pelo dispatcher para a ferramenta canônica correspondente. A ferramenta de plataforma é marcada sob demanda. O contrato de metadados declara que catálogo/descrição não são grants. [C05, C06]

O descritor possui identidade privada e associação com Session, agente, placement, conexão, target, gerações do catálogo e hash do schema, além da identidade canônica da ferramenta. O cache é limitado e temporário. Descritor ausente, vencido ou incompatível exige nova descrição/autorização apropriada; copiar seu JSON não restaura a identidade. `reissue` não resolve a autorização do chamador por si: a própria fronteira exige que o host já a tenha decidido. [C07]

O compilador local lê JSON limitado, clona apenas dados JSON e usa Ajv estrito sem coerção, defaults ou remoção automática de campos. Aceita os drafts explicitados, formatos permitidos e referências locais; recusa keywords/formatos/recursos desconhecidos, referência externa e schema assíncrono, inclusive em definições não usadas. Os limites incluem profundidade 64, 4.096 nós e 256 KiB. A ausência de output schema é marcada como output não validado. Isso é uma garantia específica desse caminho de serviço; não se aplica automaticamente a `Tool.dynamic` comum ou a todo plugin. [C08]

## Revalidação junto ao efeito de serviço

O executor copia a requisição, confere o nome canônico no binding raiz/filho e a identidade capturada do registro, pede a permissão e resolve conexão/target. Compila o schema capturado e valida o input antes de carregar a credencial. O gate verifica estado ativo, placement, gerações, endpoint, identidade de credencial, binding da Session/agente, ação e hash do recurso alvo. Mudança desses inputs não deve reutilizar cegamente uma aprovação ou descrição antiga. [C09]

Depois de abrir o transporte, confere o catálogo fresco e admite a intenção durável com `requestHash`. Uma admissão reutilizada projeta o receipt existente, sem redisparar a mutação. Para a nova execução, passa a submitting, revalida após esperas, compara catálogo/descritor novamente, repete o gate pertinente e só então envia a chamada. Essa sequência trata esperas como pontos onde a autoridade pode ficar velha. Ela não torna o provedor remoto participante da transação local. [C09]

Uma alteração no contrato de plugin que só afete contribuições/SDK deve ser rastreada nas fontes de extensão. Se atravessar o contrato de capability, os pontos pertinentes incluem frame/host, schema/descritor, política/gate, transporte e projeção. Uma mudança de policy ou schema não força reescrever toda folha independente; exige invalidar os bindings e afirmações que de fato consumiram o input alterado. Este registro de impacto é L1, sem construir dependências sobre os candidatos históricos ainda não aceitos. [C01–C09]

## Transporte MCP nativo e resultado desconhecido

O MCP de capabilities é uma fábrica de transporte HTTP para o host. Não descobre servidores OAuth nem decide sozinho policy, schema de negócio ou intenção durável. Recebe selection com HTTPS, host/path permitidos e credencial com formato/expiry aceitos. Os limites padrão incluem 4 MiB para catálogo/resultado, 256 ferramentas, 16 páginas, 256 KiB de requisição, 30 segundos, quatro sessões, 512 gerações e 64 mensagens. São configurações do código observado, não medidas de uma conexão real. [C10]

O catálogo é canonizado/hasheado, recusa nomes duplicados e ciclos de paginação; a contabilidade de gerações é limitada. O host possui e fecha os scopes e serializa chamadas por conexão. A fila também integra o timeout: a classificação conservadora de mutação pode permanecer `outcome_unknown` mesmo sem prova de envio após a espera. Não apresentar todo timeout como prova de que o servidor já executou, nem como prova de que nada ocorreu. [C10]

No transporte HTTP, `dispatched` é marcado antes do fetch. Erros de transporte/interrupção depois desse marco, sem resposta definitiva, deixam resultado remoto desconhecido. Uma resposta correlacionada/decodificada ou um erro autoritativo tratado pelo protocolo permite uma classificação mais precisa. O código recusa redirects e limita bytes antes do parse JSON/SSE; relaciona resposta pelo ID e valida envelopes. Receber schema de ferramenta válido no protocolo não é executar a validação de input de negócio do serviço. [C11, C12]

O finalizador aborta e aguarda a rotina local; o DELETE de sessão tem orçamento próprio. Esses atos são limpeza do transporte, não prova de rollback de uma mutação no servidor. Notificações SSE não disparam ferramentas/modelo no host; os requests do servidor são tratados pelo conjunto limitado do protocolo. Não há justificativa nesta fonte para retry cego de uma mutação cujo receipt diga `outcome_unknown`. A informação útil para diagnóstico é o binding/receipt capturado, o estado observado, o marco de submissão e a resposta definitiva disponível, sem inventar confirmação remota. [C10–C12]

## Intenção, ACK e materialização são fatos diferentes

`CapabilityJobs.admit` exige frame e hash da requisição, aplica policy e persiste a intenção com identidade de invocation/operação. Reutilização exige correspondência dos campos pertinentes; divergência não equivale a uma nova execução segura. `observeHost` conserva fatos de uma execução já admitida: não inicia polling, rede ou cancelamento e não concede admissão/submissão nova. É uma fronteira de observação, não uma autorização ambiente. [C13]

No serviço, o ACK remoto durável precede a projeção do output. Falha posterior de schema, publicação ou disclosure pode produzir resultado parcial sem apagar o fato de que o efeito remoto aconteceu. Ausência de output schema continua explícita como não validada; output grande pode exigir artefato e nova revalidação. A rotina delega redaction a outro módulo; esta leitura não certifica completude de remoção de segredos desse módulo. O transporte é liberado antes da projeção. [C09, C14]

As folhas de mídia mostram o mesmo corte: admissão com hash, estado submitting, token obtido novamente junto ao envio e ACK antes da publicação dos artefatos de imagem. Uma imagem remotamente concluída pode continuar com materialização falha e referências já retidas; não se apaga esse fato nem se infere que nenhuma cobrança ocorreu. Vídeo guarda submissão/ID do provedor e separa observação. Foram lidos os trechos de seleção e submissão, não todos os algoritmos de aquisição/observação. Resultado, disponibilidade e cobrança de provedor nesta produção são `UNKNOWN`. [C15]

## Artefatos e gestão do host

As operações de artefato usam policy, placement e owner reais. Publicação exige `artifact.write` e requisitos adicionais quando fornecidos; persiste revisão imutável, proveniência e a classificação de verificação recebida. Atualização exige expected revision corrente. `read`/`describe` revalidam a autorização e conferem blob/metadata; compartilhar refere-se à revisão exata para Session da mesma placement, e pins podem impedir remoção. Quota lógica por placement e retenção de scratch não equivalem a um teto físico instantâneo de todo armazenamento. [C16]

O blob verifica comprimento, SHA-256 e compatibilidade MIME, usando diretório privado da base. A própria implementação exclui proteção absoluta contra host malicioso com mesmo UID nas janelas check/syscall. O hash é evidência de integridade dos bytes lidos, não autenticação da intenção do usuário nem confinamento universal do sistema. O algoritmo detalhado de reconhecimento MIME não foi ampliado nesta leitura. [C17]

As APIs de gestão exigem contexto de operador emitido, limitado por scope, lifetime e autoridade atual. Tokens são aleatórios, armazenados por hash e sujeitos a expiry/revogação; `issue` só estreita um grant existente. A gestão de artefatos verifica alvo e Session de compartilhamento no scope e usa o ledger de requests de gestão, cujo algoritmo completo não foi lido aqui. Isso separa o operador do host do frame de execução de ferramenta do modelo. Não converter acesso a um ID/ref em permissão para o outro domínio. [C18–C20]

## Folhas locais e serviços do host

| Folha/fronteira | Observação de fonte | Limite conservado |
| --- | --- | --- |
| Processo controlado | Recebe argv explícito, recusa PTY, exige raiz de invocação esperada, pede permissões, usa wrapper de sandbox e admite job antes do spawn. A registry reserva ID, tem fila de stdin limitada e captura output limitada. | `stop` pode retornar incompleto após esperar cinco segundos; isso não prova término do processo. Transferência é restrita ao vínculo pai/agente/placement pertinente. Nenhum processo foi iniciado. [C21, C22] |
| Scheduler | Mutação pede `schedule.manage`, revalida permit antes da chamada ao serviço do scheduler e usa chave estável pertinente para execução. A quota verificada antes de aprovação pode competir com outras criações. | A transação própria do scheduler não se torna a mesma transação atômica do gate de capability; erro de execução pode significar resultado desconhecido. [C23] |
| Port do scheduler | Binding de processo resolve a dependência de host sem acoplar o grafo de Session; scope restaura o binding anterior. | Host não ligado é erro explícito; registrar a ferramenta não prova host disponível. [C24] |
| Runtime de toolkit | Seleciona target/runtime fixado, valida executable path/receipt e limita instalação concorrente. Cache legado sem receipt tem tratamento específico com validação. | Caller interrompido pode parar de aguardar enquanto instalação continua. Nenhuma instalação, compatibilidade de OS ou vendor foi executada. [C25, C26] |
| Documentos e planilhas | Entradas canônicas são tipadas; a folha confere expectedRevision antes de delegar. As descrições anunciam PDF sem OCR, planilhas com fórmulas/cache distintos e sem cálculo. | Esses textos são contrato declarado das folhas. Engine, schemas detalhados e todos os formatos não foram lidos; não constituem validação de OCR, fidelidade PDF ou cálculo real. [C27, C28] |

## Disposição e pendências

Este delta fecha a leitura necessária para distinguir catálogo, frame emitido, chamada persistida, aprovação atual, gate de efeito e observação posterior, inclusive o host MCP implementado. Lê também fronteiras representativas de artefato, processo, schedule, runtime e mídia para evitar extrapolar um README a todas as capabilities. Não declara leitura integral dos 170 caminhos dessa população.

Continuam pendentes por fonte específica: vendors/engines de documentos e planilhas, aquisição completa de mídia, channels e todas as conexões/gestões, redaction de dados, todos os schemas de folha, backends/OS e recuperação operacional. Essas pendências bloqueiam claims sobre suas implementações, não são ocultadas como completude do domínio. A cobertura distingue fonte não lida, capturada somente, releitura de fonte histórica e leitura nova. Testes/fixtures continuam evidência potencial não executada. Aceites semânticos e o uso por consumidores são posteriores e independentes; L2–L4 e M1/M2 não foram produzidos.

## Índice exato das fontes usadas

O manifest fornece bytes, SHA-256 e Git blob de cada captura; os intervalos abaixo são a base das afirmações, não leitura integral presumida.

| Ref | Caminho | Linhas lidas pertinentes |
| --- | --- | --- |
| C01 | `packages/core/src/capability/invocation.ts` | 1–142 |
| C02 | `packages/core/src/capability/policy.ts` | 1–182 |
| C03 | `packages/core/src/capability/children.ts` | 1–163 |
| C04 | `packages/core/src/capability/tools.ts` | 1–69 |
| C05 | `packages/core/src/capability/service/index.ts` | 1–93 |
| C06 | `packages/core/src/capability/service/contract.ts` | 1–31 |
| C07 | `packages/core/src/capability/catalog/descriptors.ts` | 1–207 |
| C08 | `packages/core/src/capability/catalog/schema.ts` | 1–189 |
| C09 | `packages/core/src/capability/service/execute.ts` | 1–162 |
| C10 | `packages/core/src/capability/mcp/index.ts` | 1–235 |
| C11 | `packages/core/src/capability/mcp/http.ts` | 23–232 |
| C12 | `packages/core/src/capability/mcp/protocol.ts` | 34–163 |
| C13 | `packages/core/src/capability/job/index.ts` | 225–357 |
| C14 | `packages/core/src/capability/service/execution/projection.ts` | 1–117 |
| C15 | `packages/core/src/capability/media/index.ts` | 49–110, 251–347 |
| C16 | `packages/core/src/capability/artifact/index.ts` | 28–271 |
| C17 | `packages/core/src/capability/artifact/blob.ts` | 12–110, 142–196 |
| C18 | `packages/core/src/capability/operator/index.ts` | 1–159 |
| C19 | `packages/core/src/capability/artifact/management.ts` | 48–111 |
| C20 | `packages/core/src/capability/artifact/management-mutation.ts` | 28–133 |
| C21 | `packages/core/src/capability/process-control/index.ts` | 44–205 |
| C22 | `packages/core/src/capability/process-control/registry.ts` | 29–135 |
| C23 | `packages/core/src/capability/schedule/index.ts` | 20–124 |
| C24 | `packages/core/src/scheduled-task/port.ts` | 1–41 |
| C25 | `packages/core/src/toolkit/runtime.ts` | 1–128 |
| C26 | `packages/core/src/toolkit/install.ts` | 1–63 |
| C27 | `packages/core/src/capability/document/index.ts` | 1–29 |
| C28 | `packages/core/src/capability/sheet/index.ts` | 1–30 |
