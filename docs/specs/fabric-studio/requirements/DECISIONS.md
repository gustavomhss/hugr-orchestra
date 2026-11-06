# Fabric Studio — decisões delegadas

## Autoridade e estado

Em 2026-11-04, após a decomposição em requirements, o proprietário declarou: **“delego a voce as decisoes”**. O TechLead desta sessão assume as decisões de produto e arquitetura Q01–Q13 abaixo. Não atribuímos consentimento a administradores, donos de dados ou pessoas que não participaram.

**As direções estão decididas; a execução e a qualificação não ocorreram.** Decidir usar OAuth não cria app Entra, decidir um driver não prova conformidade em Bun e escolher uma política não demonstra sua implementação. Nenhuma decisão autoriza acesso ao tenant, gasto, publicação, concessão de acesso ou mudança remota nesta etapa.

Este registro sucede a tabela anteriormente aberta, preserva os IDs Q do desenho e não reescreve os documentos revisados. Não é spec de implementação: não define HttpApi, tabelas, assinaturas ou work packages. Os 200 requisitos canônicos continuam intactos e propostos; a delegação não autoaprova os julgamentos H nem transforma critérios M em testes executados.

### Como tratar os bloqueios

- **Decisão tomada:** o autor da spec não escolhe outra direção por conveniência. Mudança exige novo registro com razão e impacto.
- **Contrato a demonstrar na spec:** a direção está escolhida, mas a spec só congela quando estados, limites e garantias correspondentes forem demonstrados. Não é uma segunda decisão de produto deixada para o implementador.
- **Pré-requisito operacional:** registro, autorização, identidade ou ensaio reais ainda ausentes. Bloqueia a ativação/qualificação/distribuição correspondente; não impede escrever seu contrato honestamente.
- **Proibido:** não pode ser liberado como fallback ou por simples confirmação de uma tela. Esta delegação não é waiver de requisitos ou invariantes.

O TechLead responde pelas treze decisões, pela integração entre elas e pela revisão das specs futuras. Especialistas podem produzir evidência; não recebem autoridade para redesenhar a direção. Ações que dependem de poderes reais de um tenant continuam exigindo o responsável autorizado desse tenant.

## Resumo das decisões

| ID | Direção escolhida | O que continua bloqueando ativação/congelamento pertinente |
| --- | --- | --- |
| Q01 | Identidade delegada; auth code + PKCE; app desktop público e web confidencial separados; MSAL no backend. | Registros Entra, publisher, callbacks, consentimentos e conformidade reais. |
| Q02 | Qualificação isolada, dados sintéticos e ambientes de teste e produção simulada separados. | Tenant/IDs/pessoas autorizadas e budget de execução ainda não fornecidos. |
| Q03 | Mínimo de dados; egress opt-in por tarefa; payload sensível cifrado; retenções e exclusão explícitas. | Aplicação das políticas, proteção e testes de limpeza/negação. |
| Q04 | Comandos Studio duráveis, identidade estável, claim único e observação independente da sessão; autoridade não serializada. | Contratos e provas de concorrência, crash, revogação e exclusão de sessão. |
| Q05 | Domínio dedicado em `modules/fabric`, camada product; Core continua plataforma; UI Solid no app-shell. | Registro do módulo e contratos/boundaries na futura implementação. |
| Q06 | MSAL Node, Tedious e SDK Kusto; REST para BI; sem XMLA nativo no escopo inicial. | Conformidade em Bun, licenças/lockfile e distribuição em cada plataforma. |
| Q07 | Produção: escrita somente com proteção remota forte demonstrada. Proteção fraca só em sandbox explicitamente vinculada. | Prova por operação; sem rota forte qualificada não anunciar jornada de mudança em produção como concluída. |
| Q08 | Primeiro lançamento integrado com dezoito templates e todas as jornadas obrigatórias; expansão por família sem apagar o mapa. | Dependências reais e aceitação de cada template/jornada; não trocar conclusão por handoff. |
| Q09 | Operação limitada por padrão; seeds de ensaio definidos, não SLAs medidos. | Medidas representativas antes de congelar budgets finais ou alegar desempenho. |
| Q10 | Um operador por instância; compartilhamento inicial export/import sanitizado e rebind. Sem SaaS de equipe nem identidade de serviço inicial. | Verificação de isolamento; colaboração/SP só em ciclo próprio, mantendo a visão completa documentada. |
| Q11 | Nuvem pública Microsoft, desktop e web de operador único; destinos server-side conhecidos. | Qualificação por SO/rede; nuvens soberanas, private link e TLS intermediado não anunciados como suportados. |
| Q12 | Allowlist de operações/revisões; previews e conflitos desabilitados até qualificação específica. | Evidência de cada tupla operação/contexto e mecanismo de degradação. |
| Q13 | Contexto Studio próprio, store Orchestra e Location real; uso sem Git obrigatório. | Prova de isolamento mesmo com `Project.ID.global`; nunca usar workspace Fabric como placement Orchestra. |

## Q01 — identidade e distribuição

**Escolha.** Começar por contas organizacionais Entra e acesso delegado do usuário, não service principal. Usar authorization code com PKCE `S256`, state/nonce e tentativa de uso único vinculada a operador, servidor e contexto. Consentimento incremental por superfície; scopes são os necessários à operação qualificada, não um grant admin universal. O usuário vê identidade, organização e capacidades resultantes.

- **Desktop local:** registro de cliente público controlado pela distribuição Orchestra, browser do sistema e callback loopback registrado. Sem segredo embarcado. O backend local detém verifier/cache; não o componente Solid.
- **Web ou desktop ligado a servidor remoto:** fluxo web confidencial no servidor de destino, com callback HTTPS e origem registrados pelo administrador dessa instalação. Preferir certificado a segredo. Não usar loopback da máquina do navegador como se fosse callback do servidor remoto. O renderer recebe somente status/referências, não tokens Microsoft.
- Separar registros de desenvolvimento, desktop distribuído e instalações web. Um app público desktop pode ser multitenant organizacional; cada conexão resolve/pina o tenant efetivo, sem misturar caches por uso de `organizations` no login inicial. Não embutir credencial de uma instalação web em outra.
- Biblioteca escolhida: `@azure/msal-node`. Renovação coordenada por credencial/conta/audience, com persistência que não permite escrita obsoleta. Cache MSAL é opaco e secreto: seu serializer fica no domínio host. Não extrair refresh token por parsing privado nem preencher `Credential.OAuth.refresh` fictício para caber no contrato atual. A spec deve estender deliberadamente o armazenamento/lifecycle existente para cache cifrado, sem arquivo paralelo de tokens e sem expor o cache no SDK.

**Motivo.** Preserva login normal para o usuário desktop e reconhece que servidor remoto tem outra fronteira. MSAL evita reimplementar o protocolo, mas não fornece, por si só, a conexão Fabric ou a coordenação durável exigida.

**Pré-requisitos.** App registrations, client IDs, domínios, publisher verification aplicável e consentimentos devem existir antes da ativação. Não foram criados nem declarados aprovados. Fluxos exatos precisam do ensaio de callback trocado/repetido, audiência errada, renovação concorrente e credencial herdada. Sem esse material, oferecer demo/manual local possível, nunca login “simulado” como real.

**Afeta:** FS-AUT-001–003; FS-AUT-011–012; FS-AUT-015; FS-OPS-001; FS-INT-004.

## Q02 — ambiente de qualificação

**Escolha.** Exigir ambiente explicitamente autorizado, sem dados ou recursos de produção existentes. Criar dados sintéticos de pedidos/cancelamentos, chaves, atrasos e duplicidades conhecidas. Usar dois destinos remotos distintos: sandbox de desenvolvimento e destino de publicação **prod-like**. Este último é um ambiente de teste, não produção de cliente. Rótulos não substituem IDs remotos reais.

Ensaiar identidade escritora e identidades leitoras reais, incluindo Viewer/RLS e negada, sem impersonation fictício. Isolar capacidade de teste quando disponível; compartilhar capacidade não é isolamento de compute. Definir manifesto de recursos criados, limite de consumo, observação e limpeza antes de executar. Não ligar testes determinísticos de CI a tenant ou modelo hospedado.

**Motivo.** Permite demonstrar as jornadas de mudança/publicação e segurança sem aprender em produção. O gate de produção de Q07 também vale no perfil prod-like, embora os dados sejam artificiais.

**Pré-requisitos.** Esta sessão não tem tenant/workspace IDs, titulares de identidades nem verba autorizada. A decisão sobre a **política** está tomada; a escolha/fornecimento de recursos reais permanece bloqueio operacional. Quando disponível, registrar autorização e referências, não credenciais, no registro de qualificação. Não usar um tenant encontrado na máquina por conveniência.

**Afeta:** FS-OPS-009–011; FS-E2E-001–007; FS-FAB-017.

## Q03 — dados, retenção e exclusão

**Escolha.** Adotar o seguinte baseline de produto, alterável apenas por política explícita mais restritiva ou decisão registrada. Prazos são política escolhida, não medições de segurança/desempenho.

| Classe | Padrão decidido |
| --- | --- |
| Tokens/cache MSAL | Backend, cifrados pelo lifecycle de credenciais Orchestra; nunca em manifesto, log, exportação ou contexto IA. Herança do dev app continua read-only e sem refresh. |
| Rows, logs brutos e resultados de query | Memória temporária; sem persistência automática. Limpar ao fechar a sessão de dados/contexto ou após 30 minutos sem uso, o que vier primeiro. Não copiar automaticamente para histórico IA. |
| Definições/código e metadados sensíveis | Leitura não implica permissão de envio ao modelo. Minimizar; persistir só o necessário ao trabalho salvo, com payload sensível cifrado e controle de leitura por contexto. |
| Rascunhos | Autosave **local** cifrado e visível, recuperação por sete dias de inatividade; opção explícita de conservar no trabalho salvo. Autosave nunca aplica remoto. |
| Composição salva | Até exclusão explícita, com referências sanitizadas/revalidadas. Nomes e contexto também podem ser sensíveis; não prometer anonimato por remover rows. |
| Evidência com dados | Persistência opt-in por evidência, cifrada, sete dias por padrão; mostrar prazo e permitir apagar antes. Uma retenção expirada não mantém o payload no histórico/modelo por cópia paralela. |
| Recibos/proveniência de comandos | Metadados mínimos cifrados quando sensíveis por 90 dias após estado terminal. Enquanto ativo/unknown, conservar o mínimo para reconciliar e explicar a situação; permitir exclusão explícita com perda de observação claramente informada. |
| Deduplicação | Tombstone mínimo de command ID/hash/estado, sem payload de dados, enquanto o contexto existir. IDs antigos nunca são aceitos como novo trabalho depois de limpar recibos. Excluir contexto desabilita seus handles e cancela intenções não enviadas; não cancela job remoto por implicação. |

Egress para modelo começa **desligado para conteúdo Fabric**. Cada tarefa pode autorizar recorte de metadados, código ou amostra, com provedor/destino, limites e exclusões visíveis. Credenciais e campos explicitamente restritos continuam proibidos; o consentimento não supera a política local. Aplicar a restrição antes de inserir conteúdo no prompt/transcrito persistente, não apenas no transporte. Limpar retenção local não recolhe conteúdo já enviado ao provedor ou exportado; essa consequência deve ser informada antes do envio.

Não declarar toda a base criptografada: reutilizar a infraestrutura de chave/cifra existente por um adaptador de payloads do domínio, mantendo autenticação do contexto e controles de acesso. Não guardar dados Fabric como credenciais improvisadas. Conteúdo sensível em disco permanece desabilitado até a proteção ser demonstrada; dados são mantidos somente em memória quando a proteção requerida não está disponível. Logs técnicos não incluem SQL literal/payload sensível por padrão. Diagnóstico é opt-in sanitizado; sem telemetria externa automática.

TTL de cache não é garantia de revogação remota. Acesso offline só a payload local cuja política permita essa leitura, com idade/identidade e revogação conhecida respeitadas. Destruir uma prova ou apagar sessão não transforma informação histórica em autorização; Q04 define observação com autoridade atual.

**Afeta:** FS-PRV-001–006; FS-DAT-005–006; FS-HIS-002–009; FS-RUN-004; FS-RUN-010; FS-AI-002; FS-OPS-007.

## Q04 — autoridade, comandos e observação

**Escolha.** Reusar credenciais, políticas, operator request, Database e Session V2 pelo alcance que realmente têm. Criar no domínio Fabric o lifecycle durável de comandos/observações Studio; não tratar `CapabilityJobs` como scheduler/observador Fabric pronto nem enfraquecer seus checks de produtor para acomodar UI manual.

- Comando/passo tem identidade estável emitida pelo servidor, conteúdo/revisão/destino/identidade fixados e chave de entrega persistida. Retry exato retorna a mesma intenção/recibo; conflito de conteúdo é rejeitado. Nova tentativa deliberada é uma nova decisão identificada, não reciclagem silenciosa do comando antigo.
- Admitir intenção é transação local. Enviar HTTP/SQL remoto ocorre fora dessa transação, após reautorização/preflight e aquisição atômica do direito único de envio da tentativa. Claim de envio já iniciado não é retomado para redispatch por expirar um lease. Queda durante envio mantém unknown até reconciliação por evidência suficiente; não prometer exactly-once remoto.
- Aprovação autoriza o conteúdo exato, mas não é um grant de política. Automatização irrestrita permanece desligada. No fluxo inicial, ações de agente precisam de invocação real válida no despacho; se esse contexto terminou, novos efeitos aguardam nova invocação autorizada ou **nova ação manual independente**, com atribuição distinta. Deny de agente não é reroteado para operador, mesmo depois de aprovação humana.
- O servidor não serializa o objeto opaco `Authority`, `Tool.Context` ou bearer para “revivê-lo” após restart. Armazena fatos de autoria/consentimento e reavalia a autoridade atual no boundary confiável. Retomar observação não retoma provider/modelo nem novos efeitos de um plano automaticamente.
- Para jobs criados pelo Studio, guardar proveniência mínima no store de domínio, independente da retenção do chat: origem real, vínculo ao comando/revisão, destino/identidade, correlação e referências de evidência. Observação é serviço autorizado separadamente para o operador atual e somente dentro desse contexto. Excluir sessão remove o chat, não converte o job em anônimo nem em autoridade de operador. O registro informa que a sessão foi apagada.
- Se a política manda apagar a proveniência necessária, apagar e declarar o acompanhamento indisponível, sem fabricar prova. Jobs legados cuja observação exige sessão/tool part não são adotados por atalho. Observar job remoto já existente exige contrato/capacidade própria e autorização, sem direito de reexecutá-lo.
- Cancelar, escrever ou reexecutar continuam efeitos autorizados à parte. Nenhum worker “de observação” recebe credencial ou permissão mais ampla para iniciar workload.

**Motivo.** Fecha RT-01 e RT-02 como direção, sem mentir sobre os contratos existentes. O request idempotente do operador coordena SQL local, não uma transação distribuída com Microsoft. A prova atual de job depende de sessão/mensagem/lineage; mantê-la intacta é mais seguro do que fingir que IDs remotos substituem a prova.

**Antes de congelar a spec pertinente:** demonstrar identidade de retry, claim exclusivo, crash em cada fronteira, tombstone/exclusão de contexto, revogação antes de envio e observação após apagar sessão, incluindo negativos de owner/Location. Não há código nem prova executada disso nesta etapa.

**Afeta:** FS-AUT-004–008; FS-INT-001–004; FS-CHG-003–005; FS-RUN-001–015; FS-HIS-007; RT-01/RT-02.

## Q05 — propriedade do código e dependências

**Escolha.** O domínio específico será `modules/fabric`, pacote de produto `@orchestra/fabric`, não um novo conjunto de serviços genéricos dentro de Core. Ele possui catálogo/adaptadores Fabric, regras de mudanças, persistência e observação Studio. A camada product do grafo permite depender de plataforma/Core; Server é composição e pode instalá-lo. Core não passa a importar o produto Fabric.

UI e compositor Solid ficam no chapter Fabric de `packages/app-shell`, com lazy loading e sistema visual/i18n existentes. Schema contém apenas contratos serializáveis mínimos necessários; Protocol declara HttpApi; Server compõe domínio/handlers/contribuições de ferramentas; Client é gerado. Ferramentas Fabric são instaladas pelo composition root mediante a extensão adequada, não por dependência reversa de Core no módulo. Não criar um engine de modelo ou novos seats nativos por workload.

Segredos, driver options, cache MSAL e registries runtime não entram em Schema. A spec pode exigir uma extensão genérica de plataforma, mas deve justificar o consumidor/alcance, sem deslocar o domínio inteiro para driblar boundaries. Registro em workspace/module-registry/arquitetura, migrations e SDK regeneration são trabalho posterior, não alterações já feitas.

**Afeta:** FS-INT-002–004; FS-OPS-002–003; FS-DEC-001.

## Q06 — bibliotecas e protocolos

| Superfície | Escolha | Limite |
| --- | --- | --- |
| OAuth/token cache | `@azure/msal-node`, servidor/backend local | Não expor cache ao browser ou tratar o OAuth atual como cache MSAL já pronto. |
| Fabric, OneLake e Power BI REST | Adaptadores tipados sobre HTTP do runtime existente, endpoints oficiais | Não expor HTTP genérico ao modelo/compositor nem assumir mesma audience. |
| SQL/TDS | `tedious`, lazy server-side, acesso por token Entra e TLS validado | Não usar senha SQL como fallback; `trustServerCertificate` não é solução para erro de rede. Sem ODBC/.NET obrigatório no usuário. |
| KQL | `azure-kusto-data`, lazy server-side, token/contexto explícitos | Query e management têm classificação própria; pacote de ingestão não é habilitado por implicação. |
| DAX/modelo BI | Power BI REST qualificado; definição suportada só onde contrato for demonstrado | Sem exigir Build em rotas que não o exigem. |
| XMLA/TOM/TMSL | Não incluído como driver nativo no primeiro lançamento; handoff oficial explícito | Não criar ponte .NET, shell ou browser invisível. T13 não conta como template pronto por handoff. |

**Motivo.** Evita driver nativo adicional no caminho inicial e conserva engines distintos. Bibliotecas escolhidas possuem distribuição Node, não certificação implícita para Bun. Metadados consultados: MSAL Node `7.1.2` (MIT, Node ≥20), Tedious `20.3.8` (MIT, Node ≥22), Kusto `7.2.0` (ISC, Node ≥20); são candidatos de ensaio, não versões instaladas ou compatibilidade verificada. A futura spec fixa versão/lockfile após conformidade, segurança/licenças e empacotamento. Falha não autoriza download executável ou fallback para host shell; bloqueia a superfície.

**Afeta:** FS-OPS-001–002; FS-FAB-006; FS-FAB-014; FS-FAB-022; FS-INT-005.

## Q07 — escrita e concorrência

**Escolha.** Adotar **fail-closed em produção** para lost update. Uma escrita de produção requer condicional remoto forte ou mecanismo de engine cuja atomicidade entre precondição e alteração seja demonstrada. Hash/preflight/readback ou lock local isoladamente são apenas detecção; não são essa prova. A aprovação não relaxa a regra.

Em sandbox explicitamente designada no servidor, admitir escrita de definição reversível com proteção fraca informada, baseline fresco, diff exato, confirmação deliberada por passo, readback e recibo; isso não cobre destruição, concessão de acesso, dados sensíveis ou efeito externo não limitado. Nome “dev” no manifesto não cria sandbox. Produção/prod-like sem proteção demonstrada fica bloqueada ou oferece handoff oficial, sem sucesso fictício.

Priorizar uma rota SQL transacional/condicional para a mudança de regra de negócio de lançamento, com prova no engine real. Não presumir que todo T-SQL ou toda transação Warehouse ofereça a garantia necessária. Mutação de definição notebook/pipeline sem condição forte não é liberada em produção só porque o mesmo CRUD passou no teste. No critério de lançamento de Q08, **ao menos uma rota real deve fechar a jornada de mudança/publicação sob esta política**; se nenhuma qualificar, o lançamento integrado está bloqueado, não se remove a jornada nem se conta handoff como execução.

Destruição, grants e ações de risco não limitado conservam confirmação forte **e** a política da operação; não incluir destruição irreversível no primeiro lançamento. Compensações são mudanças novas revisadas; não há rollback global de dados/deployment.

**Afeta:** FS-AUT-010; FS-CHG-005–010; FS-E2E-002; FS-FAB-021.

## Q08 — recorte e sequência de lançamento

**Escolha.** Entregar primeiro uma experiência vertical integrada, não backend de wrappers nem galeria de placeholders. Biblioteca inicial escolhida: **T01–T12, T14 e T17–T21**. São dezoito objetivos do catálogo original: legado/inventário, exploração, carga nova, notebook/SQL/pipeline, falha/reexecução/freshness, checks/reconciliação, relatório, acesso/segurança, publicação e handoff. Cada template precisa de dependências reais qualificadas, modo manual e prova da tarefa; clones/mocks/handoff de ação essencial não contam.

Superfícies prioritárias: controle/workspaces/itens; leitura OneLake/Lakehouse; SQL analytics endpoint somente leitura; Warehouse/SQL Database nas operações qualificadas; definições e jobs suportados de notebook/pipeline; leitura de modelo/relatório por rotas Power BI apropriadas; acesso/roles e checks sob identidades reais. Carga incremental começa por combinação de fonte/conector e pipeline/notebook qualificados; não depende de resolver a documentação de Dataflow Gen2 por otimismo.

Gate de lançamento: os dezoito templates escolhidos e J01–J08, incluindo mudança/validação e uso sem Git, satisfazem os requisitos no conjunto de operações/identidades explicitamente publicado. Não exigir que cada jornada rode em todo workload. Não anunciar biblioteca completa reduzindo o gate para onze: onze continua o piso do requisito, dezoito é a decisão de catálogo inicial. Um recorte menor requer nova decisão explícita, sem apagar demandas existentes.

T13, T15–T16 e T22–T30 não são anunciados prontos nessa primeira biblioteca. As famílias correspondentes, Power BI apps/audiences e Industry Solutions permanecem visíveis com disposição/leitura/handoff seguro; esse tratamento não prova execução ou conta no mínimo de templates. A visão abrangente permanece nos requirements. Expansão segue o mesmo contrato por operação: sem noção de “suporta Fabric inteiro” por inventário ou única chamada REST.

**Afeta:** FS-TPL-001–006; FS-E2E-001–014; FS-FAB-001; FS-OPS-009.

## Q09 — limites e alvos de ensaio

**Escolha.** Inicialmente sem refresh de dados automático por abrir/focar. Usuário ativa consulta e recorrência separadamente; pode pausar. Backoff/`Retry-After` e limites do provedor prevalecem sobre as frequências locais. Filas locais são visíveis; desconexão não vira fila de efeitos a enviar ao reconectar.

Seeds escolhidos para dimensionar e testar a implementação — **não são SLOs medidos nem budgets finais congelados**:

| Área | Seed de ensaio |
| --- | --- |
| Declaração | 256 KiB, profundidade 16, 24 ferramentas e 64 bindings por espaço; rejeição explícita ao exceder. |
| Query interativa | 60 s de timeout inicial; 1.000 linhas por página, no máximo 10.000 linhas e 5 MiB por resultado interativo, valendo o primeiro limite atingido. Exportação é fluxo explícito separado, com limite próprio antes de habilitar. |
| Concorrência | Duas consultas de dados e quatro reads de metadados em voo por conexão; excesso em espera visível. Compartilhamento de fetch só na mesma autoridade/contexto. |
| Refresh | Recorrência de dados desligada por padrão, mínimo configurável inicial de 60 s quando ativada; polling de job inicia em 5 s e desacelera até 60 s, respeitando instruções do serviço. |
| Cache | Metadados até 60 s dentro da mesma autoridade; rows não são cache durável por padrão. Revalidação mais forte da operação supera o TTL; resultado expirado mantém indicação de idade, não autorização nova. |
| Modelo | Sem payload Fabric implícito; recorte autorizado tem limite inicial de 32 KiB de conteúdo Fabric por pedido, sem truncamento silencioso de código/instrução. Limite do provider/contexto pode ser menor. |
| Trabalho remoto | Timeout de UI/request não é timeout nem cancelamento do job Fabric. Cada workload declara limite/continuidade próprios antes da qualificação. |

A spec define unidades de profundidade/cardinalidade e mede os seeds abaixo/no/acima do limite, incluindo tamanho real codificado e políticas mais restritivas. Medir em hardware/perfil de SO registrados, dados artificiais, rede documentada e baseline Orchestra sem Studio; separar tempo de renderer, backend, Microsoft e modelo. Sem número de produtividade/latência pública agora. Para interação, orçamento objetivo é não gerar trabalho remoto por foco/layout e não bloquear o renderer com parsing/drivers fora do seu escopo; thresholds quantitativos finais dependem do ensaio e precisam ser registrados antes do congelamento correspondente.

**Motivo.** Começar limitado evita consumo invisível; escolher números iniciais não autoriza alegar que são seguros, rápidos ou suficientes. Não usar ausência de benchmark como licença para runtime ilimitado.

**Afeta:** FS-OPS-002; FS-OPS-005–007; FS-DAT-004; FS-DAT-009–013; FS-EXP-010.

## Q10 — equipe e identidades de serviço

**Escolha.** Primeiro escopo: **um operador por instância/perfil Orchestra**, desktop ou web privado; composição exportável/importável e sanitizada, com rebind/autenticação do destinatário. Não oferecer colaboração simultânea, ACL de equipe, aprovação multiator hospedada ou connection SP compartilhada na instalação inicial. Service principal/managed identity ficam não habilitados, não aliases ocultos da identidade delegada.

Uma instância web com Basic auth compartilhado não se torna multiusuário por ter dois browsers abertos. Não mapear o nome da conta Microsoft para um suposto principal humano do Server. O operador pode conectar identidades Microsoft explicitamente autorizadas, sempre rotuladas e separadas; isso não autoriza que outra pessoa use sua instância. Equipe requer uma futura fronteira de principal/request e store autorizados, não mero toggle.

**Motivo.** O Server atual identifica a conta do host; isso não implementa autenticação de pessoas distintas. Export/rebind já satisfaz o handoff inicial, sem emprestar privilégios. A visão de colaboração/SP continua documentada, mas não é capacidade entregue.

**Afeta:** FS-AUT-008; FS-AUT-014; FS-HIS-004; FS-E2E-009.

## Q11 — implantação e rede

**Escolha.** Perfil inicial: Microsoft public cloud, desktop nos sistemas suportados pela distribuição Orchestra e web privado de operador único sobre backend Orchestra. SQL/TDS exige rede própria; não é HTTPS disfarçado. Chamadas a Microsoft são server-side, com hosts derivados do adaptador/perfil, IDs e origem validados. Tokens separados por audience, TLS validado e redirects/poll/artifacts checados antes de encaminhar credencial.

Sem promessa inicial de nuvens soberanas, private link, proxy corporativo autenticado ou inspeção TLS. Rede direta ou proxy já suportado/explicitamente configurado no host só recebe claim após ensaio do perfil, por protocolo. Bloqueio de 1433 ou callback inacessível produz indisponibilidade específica, não túnel, credencial alternativa ou automação de browser. Distribuição não baixa driver executável ao abrir template. O perfil comercial não é inferido por conta parecer “Azure”.

**Afeta:** FS-AUT-002; FS-AUT-012; FS-FAB-004; FS-OPS-001–002; FS-OPS-008.

## Q12 — versões, previews e manutenção

**Escolha.** Habilitar por allowlist de operação × tipo/geração/formato × identidade × direitos × capacidade/região/rede, com versão, fonte e data de qualificação. GA do workload não habilita o adaptador. Previews são opt-in explícito e só aparecem prontos quando seu contrato exato foi qualificado; conflito sem resolução continua não verificado.

Dataflows Gen2 ficam sem autoria/execução ampla anunciada até resolver e ensaiar geração/rota/publish/execute e parâmetro de aplicar mudanças explicitamente. Telemetria própria não consulta o modelo do Capacity Metrics app como fonte externa. Power BI workspace apps/org apps/audiences não são Fabric Apps; sem adaptador qualificado, mostrar publicação/visibilidade do consumidor como pendência/handoff, nunca como consequência automática de update do workspace.

Revalidar fontes antes de habilitar/requalificar uma operação, em mudança detectada de contrato e antes de cada lançamento que a anuncia. Registrar erro/versão e degradar a operação sem inutilizar a composição salva. Sem auto-upgrade permissivo de schemas/tool IDs nem endpoint “genérico” quando a rota deixa de funcionar.

**Afeta:** FS-CAP-002–007; FS-OPS-008–009; FS-FAB-011; FS-FAB-016; FS-FAB-020; FS-FAB-024–031.

## Q13 — contexto sem Git e persistência

**Escolha.** Cada trabalho vive num contexto Studio com identidade própria, dono operador, servidor/store, referências de conexão e Location resolvida pelo servidor. Sem Git, criar área gerenciada no diretório de dados do perfil, por ID de contexto, sem `git init`. Com Git, vincular a Location existente sem transformar repositório em dono de credencial ou autorização remota.

Persistir no banco Orchestra com migrations/backups existentes, não banco separado por feature. Chaves de autorização e cache distinguem contexto Studio, principal, servidor/store e Location, além do destino Microsoft. `Project.ID.global` pode continuar igual entre contextos não-Git; **não** identifica isolamento. Diretório também não é ACL por si só. Um manifesto importado não escolhe path arbitrário, principal, store ou connection privilegiada.

Sessões conservam seu placement real conforme os contratos existentes. `Location.workspaceID` omitido continua placement implicitamente local; nunca preencher com workspace Fabric ou um ID Studio inventado. O ID remoto Fabric só aparece nas referências do domínio. Reusar Session ID adota a sessão já existente; não move sessão ao novo contexto por editar uma declaração. Dois contextos podem usar a mesma conta Microsoft apenas por vínculo explícito autorizado, sem compartilhar resultados/rascunhos/ativação por implicação.

**Antes de congelar a spec pertinente:** demonstrar separação de dois contextos sem Git e mesmo projeto global, requests diretos/import malicioso, retomada de sessão, troca de conta/servidor e respostas atrasadas. A jornada sem repositório é obrigatória, não uma extensão pós-lançamento.

**Afeta:** FS-EXP-005; FS-AUT-013; FS-DIS-002; FS-DAT-005; FS-E2E-010.

## Base de evidência e limites

Inspeção documental/código em `9fcb899d50867c1ddc3f25d8345ac9fd8009d788`, 2026-11-04. Nenhuma evidência abaixo significa execução Fabric ou conformidade Bun já verificada.

| Evidência | O que sustenta / alcance |
| --- | --- |
| `packages/core/src/project.ts:26–30,130–142`; `packages/schema/src/location.ts:8–21` | Fora de Git usa projeto global; Location mantém directory e workspaceID Orchestra opcionais, não workspace Fabric. |
| `packages/server/src/principal.ts:7–20`; `packages/server/src/operator.ts:8–15` | Principal atual é a conta do host; servidor não tem por isso contas humanas multiusuário. |
| `packages/core/src/capability/operator/contract.ts:16–44`; `operator/request.ts:42–94` | Authority opaca/process-local; request deduplica SQL por principal/chave e não faz transação HTTP distribuída. |
| `packages/core/src/capability/job/index.ts:129–178,225–275` | Checa sessão/mensagem/lineage; creation key inclui identidade da invocação. Não resolve automaticamente os dois findings RT. |
| `packages/core/src/credential/cipher.ts:10–17,57–87`; `credential.ts:37–50,109–118`; `packages/schema/src/credential.ts:15–23` | Cifra/proteção e herança existem; OAuth atual pede access/refresh/expires, não um cache MSAL já integrado. |
| `script/module-architecture.json:3–17,186–193,386–395`; `script/module-registry.json` | Camadas product/platform/composition e registro explícito; proposta de módulo não é diretório já criado. |
| [Auth code + PKCE](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow); [redirects](https://learn.microsoft.com/en-us/entra/identity-platform/reply-url) | Microsoft descreve PKCE, distinção public/confidential client e redirects registrados/loopback. Não prova registro/consentimento da nossa aplicação. |
| [MSAL Node](https://learn.microsoft.com/en-us/entra/msal/javascript/node/acquire-token-requests); [metadados MSAL](https://registry.npmjs.org/@azure%2Fmsal-node/latest) | APIs auth code/silent e cache; versão/licença/engine consultados, não ensaiados em Bun. |
| [Conectividade Fabric SQL](https://learn.microsoft.com/en-us/fabric/data-warehouse/connectivity); [Tedious](https://github.com/tediousjs/tedious/blob/master/src/connection.ts); [metadados Tedious](https://registry.npmjs.org/tedious/latest) | TDS/1433 e opção de access token/TLS no driver; não prova SQL Fabric ou atomicidade de uma operação específica. |
| [Kusto Node SDK](https://learn.microsoft.com/en-us/kusto/api/node/kusto-node-client-library?view=microsoft-fabric); [metadados Kusto](https://registry.npmjs.org/azure-kusto-data/latest) | O pacote documentado é `azure-kusto-data`; suporte Node/publicação não demonstra Bun/endpoint Fabric real. |

Links `latest` são referências da consulta, não locks reproduzíveis. As versões observadas estão registradas em Q06; versões exatas e integridade serão fixadas no lockfile da futura implementação. As fontes Fabric já levantadas em COVERAGE/RESEARCH e as correções REVIEW continuam necessárias por operação.

## Revisão independente e decisão do lead

Revisor novo, sem conversa anterior ou relatórios dos críticos dos requirements, confrontou Q01–Q13 com os oito documentos canônicos, COVERAGE/TEMPLATES, anchors do código no baseline e fontes estreitas de identidade/bibliotecas. Veredito **APPROVE para o registro de decisões**, sem finding DC substanciado. Não é aprovação de implementação, viabilidade comprovada ou lançamento.

Entrada identificada pelo manifesto SHA-256 `238a48e1890c14b15b829b4ce5b09b556d98381f9b93a67707d8fe067aff8a9d`; texto decisório revisado, antes deste apêndice, SHA-256 `fa0671054b1a3a1bee6dc9b9d393d4f78472a18799e1d774a3931f5ae806a32c`. Relatório bruto externo `fs-decisions-review.md`. O lead leu o relatório, conferiu as evidências de código citadas e revalidou manifesto/arquivos contra os primários e o checkout sem alterações. Relay foi armado, mas enforcement de hook não foi comprovado nem usado como evidência.

O lead mantém as escolhas. Os riscos determinantes continuam visíveis: qualificar ao menos uma rota forte de mudança/publicação, provar o armazenamento sensível e o contrato de observação independente, e obter registros/ambiente autorizados. Se esses gates falharem, bloqueiam o suporte/lançamento afetado; não se convertem em aceitação tácita de risco. A pergunta do revisor sobre eventual falta no enquadramento não revelou fato novo: a revisão foi deliberadamente do registro, e não substituiu a prova operacional futura.

Nenhum requisito canônico ou documento congelado do desenho foi alterado para acomodar as decisões. Nenhuma spec, implementação, teste de produto ou operação autenticada Fabric foi executada nesta etapa.
