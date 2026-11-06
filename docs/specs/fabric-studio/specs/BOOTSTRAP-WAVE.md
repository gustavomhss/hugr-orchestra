# Entrada nativa e contexto — preparação do próximo recorte

**Estado:** predecisões do lead, ainda sem suite de aceitação, Schema/HttpApi compiláveis ou freeze. Não despachar implementação a partir deste rascunho. S01/S02/C01 continuam normativos; a aceitação canônica não muda. O preflight RECOVERY-WAVE não qualifica C07 ou login MSAL.

## Resultado pretendido

Abrir Fabric Studio no servidor escolhido sem criar/selecionar Git; obter um contexto realmente pertencente ao operador/store e montar os providers da Location resolvida **só depois**. Criação de contexto é ação local explícita. Abrir chapter, trocar aba ou carregar layout não inicia login, inventário, query, capacidade ou criação implícita de contexto.

O primeiro placement gerenciado é implicit-local. A pasta deriva de ID emitido pelo servidor sob a área de dados confiável; request, manifesto e pacote não escolhem path/principal/storageID. A resolução deve produzir Location real e Project observado; mesmo Project.global não junta dois contextos nem é ACL. Não adicionar Fabric a serverWideChapters com directory vazio para evitar esse bootstrap.

## Fronteira backend decidida

- Domínio e tabelas Fabric em modules/fabric; Server compõe os serviços e a autoridade real. Core continua plataforma, sem import runtime de Fabric. O gerador atual de migrations coleta somente schemas Core: integrar o schema do produto na geração sem criar banco paralelo ou dependência runtime inversa.
- Reusar ServerOperator/CapabilityOperator e seu frame privado. RequestAuthority ou objetos/IDs copiados do payload não substituem require/validate atuais. Database.storageID é obrigatório para propriedade persistente; não criar outro hash/namespace silencioso quando falta.
- GET/list e criação revalidam owner/store/ref generation/estado e placement. Uma referência não é grant. Transport Location contextual divergente é erro, não retarget automático. Contexto ausente/excluído e pasta ausente/incompatível não são recriados por um GET.
- Não instalar ferramentas de agente neste recorte por atalho. SessionFabricBinding imutável e invocação real continuam condição antes de um agente usar o domínio. UI manual não fabrica sessão/tool part e não reapresenta uma ferramenta negada como operador.

## Admissão local e filesystem

Criação demanda chave de entrega e retry exato, não um novo contexto a cada timeout. O ledger atual permite callback **SQL-only**: mkdir, realpath e boot de Location devem ficar fora dele. A direção escolhida é reservar intenção/ID duráveis localmente, preparar somente a pasta gerenciada correspondente e publicar o contexto por transação que revalida a autoridade e os vínculos reais.

O estado privado de preparação não é contexto ativo nem comando Microsoft. Retry explícito da mesma intenção pode concluir preparação local idempotente com autoridade atual; isso não autoriza replay de workload S09. Erro ambíguo não permite apagar uma pasta que talvez já tenha sido publicada, adotar path alheio ou anunciar contexto pronto. Reservas e órfãos precisam de limite/reconciliação verificáveis antes do freeze; não resolver com lease que concede novo efeito remoto.

Nenhum payload sensível em disco antes de C07/recuperação. Routing/control fields mínimos devem ser distinguidos de nomes, composições e conteúdo protegido; não esconder um título/rascunho como credencial. A projeção pública pretendida é ContextRef mais Location.Info permitida, sem principal, storageID, credencial, authority ou cache. DTO, budgets e estados exatos ainda precisam da suite/freeze.

## Lifetime da entrada Solid

O mapa factual foi conferido em 248107b. A entrada Fabric deve ficar no branch próprio após ServerSDK/ServerSync, antes do branch genérico que já monta SDK/Models para o repo selecionado. Não importar o domínio product no app-shell: usar Schema e Client/Protocol.

- Esperar layout.ready; directory ausente antes da hidratação não prova que não há perfil.
- Servidor selecionado ausente não cai silenciosamente em server.current. ServerSDKProvider pode fazer fallback se receber undefined: não montar o provider nesse estado.
- O client do ServerSDK é reativo; sua troca não remonta automaticamente filhos. Fabric mantém instância keyed pelo client efetivo/owner, aborta operações e invalida respostas tardias. Não ler client atual de novo para terminar uma ação iniciada noutro owner.
- Global.createServerContextCache já troca/dispose quando credenciais/origem do mesmo server key mudam. Reusar esse lifecycle; não duplicar cache nem colocar senha numa key renderizada/persistida.
- Após bootstrap autorizado, montar SDKProvider com directory real e ModelsProvider no owner certo. SDKProvider atual não tem prop workspaceID. Generated LocationQuery usa location.workspace; workspace Fabric nunca preenche esse campo.
- RequestOptions.signal existe; createScopedFetch combina os sinais de lifetime/Request/init. Abort de transporte pode chegar como ClientError Transport, não necessariamente DOM AbortError. A correção não depende só de cancelar fetch: epoch/owner também impede publicação tardia.

## Antes de implementar

### Mapa de aceitação que o lead deverá materializar

| ID | Instrumento real e asserção central | Contraprova ou controle necessário |
| --- | --- | --- |
| BSC01 | SQLite e dois diretórios reais sem `.git`; criação explícita gera dois ContextRefs distintos e duas Locations reais, mesmo com Project.global. | Visitar/listar antes de criar mantém os contextos vazios e não chama Fabric; nunca inferir owner de Project.global. |
| BSC02 | CapabilityOperator real scoped com frame válido permite criação; sem frame, autoridade de outro factory, binding revogado ou payload forjado falha antes de preparar a pasta. | O positivo usa a mesma implementação e banco; um fixture que rejeita tudo não passa. |
| BSC03 | Outro principal/store, geração stale e contexto tombstoned não resolvem nem retornam metadados privados. | Restaurar owner/ref válidos deve voltar a resolver; ID conhecido não é grant. |
| BSC04 | Duas entregas concorrentes com a mesma chave atual resultam num contexto/pasta; retry após reconstruir o serviço/banco devolve o mesmo resultado sob autoridade atual. | Mesma chave com payload/target conflitante é conflito, nunca novo contexto ou recibo reaproveitado sem validação. |
| BSC05 | Exercitar falha entre reserva, preparo e publicação por barreira observável no I/O real; a reserva não aparece como contexto ativo e retry explícito conclui sem duplicar. | Interromper a barreira realmente, demonstrar que o caminho foi atingido e restaurar; não usar um teste que só pré-popula um estado inventado. |
| BSC06 | Remover a pasta publicada, substituí-la por arquivo/symlink divergente ou alterar seu vínculo de Location resulta em erro de resolução sem recriação/adoção. | Pasta íntegra resolve; arquivos externos/sentinels permanecem iguais. Preparação/realpath ficam fora do callback SQL-only. |
| BSC07 | Leitura pagina de modo limitado com autoridade atual, e quota limita tanto reservas quanto contextos ativos antes de novo mkdir. | Limites exatos/ordenação/cancelamento de reserva serão congelados antes do teste; não aceitar promessa sem orçamento mensurável. |
| BSC08 | HTTP real no handler autenticado rejeita owner/path/storage extras, Location divergente e refs inválidas; DTO permitido decodifica pelo schema canônico. | Request sem Location é admissível só nos endpoints bootstrap definidos; não relaxar middleware global para isso. Client precisa ser gerado do HttpApi real. |
| BSE01 | Componente Solid real: enquanto layout hidrata ou contexto resolve, SDK/Models não montam; servidor selecionado ausente mostra estado recuperável sem fallback. | Contexto resolvido válido monta ambos para o diretório retornado pelo servidor, sem exigir Git. |
| BSE02 | Troca de client efetivo/servidor/credencial/contexto destrói owner antigo; conclusão atrasada de request antigo não publica erro, lista ou contexto na instância nova. | A conclusão atrasada deve ser entregue de fato pelo transporte controlado após a troca; cancelar Promise sem entregá-la não prova o epoch. |
| BSE03 | Abrir/fechar chapter não cria contexto, login ou operação remota; escolher/criar é explícito e acessível, com loading/erro e retry sem duplicação. | Interface continua disponível sem modelo IA; interceptar tráfego prova fronteira de montagem, não conformidade com Microsoft. |

Esses IDs são itens de preparação, **não testes já escritos ou executados**. A suite backend deve usar os serviços Core, filesystem e SQLite reais; a de entrada pode controlar a fronteira HTTP para tornar a ordenação determinística, sem chamar isso de E2E ou backend qualificado. A verificação integrada posterior cruza UI/HTTP/domínio/persistência reais. Não usar essa tabela para conceder status `ready` ao Studio.

Escrever provas vermelhas de não-Git/mesmo Project.global, frames reais/forjados, owner/store/generation/Location divergentes, retry concorrente e crash entre reserva/preparo/publicação; erros/pasta ausente e limites não podem virar contexto pronto. Para a UI: hydration delay, servidor ausente, nenhum mount SDK/Models antes de resolução, troca de servidor/credencial/contexto e resposta tardia, sem auto-create ou operação Fabric por mount.

Fechar as interfaces compartilhadas somente após crítica independente; então separar domínio/persistência, Protocol/Server/Client gerado e entrada UI em writes disjuntos. Mudança pública de HttpApi exige bun run generate em packages/client. Conformidade real de persistência/recuperação e acabamento visual continuam gates próprios; nenhum mock ou registro de navegação satisfaz a entrega do Studio.
