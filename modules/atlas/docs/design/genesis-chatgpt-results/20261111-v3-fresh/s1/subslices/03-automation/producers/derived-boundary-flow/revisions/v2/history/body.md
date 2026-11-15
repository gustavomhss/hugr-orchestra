# Fluxo das fronteiras externas no lado Core

| Campo | Identidade |
| --- | --- |
| Artefato | `s1.subslice03.boundary-flow` |
| Camada / necessidade | L2 / `flow` |
| Escopo | S1-03; entendimento local das portas externas do Core |
| Predecessor obrigatório | `s1.core.boundaries`, 23.665 bytes UTF-8 |
| SHA256 do predecessor | `ca7e76aa47100f32e2076b0a5055b2cebfe3d36cfb5c0d29601125db34d7b3c6` |
| Fonte investigada pelo L1 | `1cde2ff7a71bcf7aecb5d030917b577165135d38` |

## 1. Escopo, evidência e entrada na leitura

O Core liga serviços locais a Atlas, Relay e controle de localização: fornece projeto, Location, configuração, processo, identidade e persistência; os módulos externos conservam suas próprias garantias. Este L2 explica a ordem das operações e onde uma resposta favorável deixa de bastar. Seu único predecessor de build é o L1 identificado acima, aceito nos dois gates informados pela receita congelada. Não houve nova leitura de código bruto.

**Mecanismo estático** significa descrição derivada da implementação relatada pelo L1. **Inferência** significa consequência delimitada dessa descrição. **Expectativa de teste** significa asserção preparada, sem execução. O contrato arquitetural mantém Schema/Protocol como contratos, Server consumindo Core e a proibição de Core depender de Client/Server; a leitura dessas folhas não verifica todos os imports do repositório. Estas distinções permanecem válidas em cada seção abaixo. [L1 §1]

Para uma leitura curta, escolha a porta: Atlas (§2), gates Relay (§3), hooks (§4), aquisição/projeção de workflow (§5), settlement (§6) ou movimentação/RAG (§7). As referências `L1 §n` remetem aos títulos do predecessor, detalhados em `evidence.md`. São pontos de aprofundamento; não recibos de `ownership.read` executado.

## 2. Atlas: abrir a superfície, executar um plano e propor conteúdo

**Mecanismo estático.** A entrada local escolhe o worktree para projeto não raiz, ou o diretório da Location para projeto raiz, e abre a superfície com raiz e `projectID`. O host acrescenta a identidade de projeto à chamada de território. A identidade não é extraída de uma resposta do modelo. Exceções de superfície são traduzidas em `AtlasSurface.Unavailable`; o comentário alerta que chamadas síncronas podem ocupar a fiber. Ausência de `.atlas` no caminho legado de mine retorna conjunto vazio, uma condição local que não demonstra saúde do engine. [L1 §2]

Quando há um plano de indexação, o Core prefere TypeScript a Python, resolve o executável pela versão do plano e o executa por AppProcess com limites de tempo e coleta. O diagnóstico é abreviado e a leitura posterior de saúde vem da superfície. **Inferência:** esta cadeia materializa um comando e contém sua execução; não qualifica o pacote, plataforma, linguagem ou a completude do SCIP produzido. [L1 §2]

Na delegação de respostas, a pergunta precisa pertencer ao lote corrente. O esquema solicita `answer` e `why` como strings, mas a verificação explícita de conteúdo testa `answer.trim()`; não há base para exigir que `why` esteja preenchido. Falhas por pergunta retornam diagnóstico e respostas malsucedidas são omitidas/abstidas. O fluxo descrito pelo comentário como “Genesis mining from the screen” usa teto de 1–200 e concorrência quatro, envia resposta, justificativa e modelo à superfície e passa por gate/admission até staging, sem promoção. [L1 §2]

**Fronteira de decisão:** geração ou staging de uma proposta não libera tratá-la como conhecimento publicado e aceito. O protocolo da superfície decide o passo seguinte. O comentário não institui uma distinção formal chamada “legado” para esse fluxo da tela; tampouco o nome mine constitui prova de importação/publicação Genesis. Aprofundamento: L1 §2, “Atlas: disponibilidade, identidade e proposta de conhecimento”.

## 3. Relay: da sugestão de comando ao resultado registrado

**Mecanismo estático.** A descoberta sugere comandos a partir de manifests, lockfiles, marcadores e targets. Classificação por nome é heurística; a ordem de preferência é Bun, pnpm, Yarn, npm. A busca pytest se limita a raízes previstas e a 200 arquivos, e certas falhas de leitura viram lista vazia. Detectar um comando não o executa, por isso o comentário desse passo dispensa trust. Essa dispensa não se estende à execução. [L1 §3.1]

`trial` exige trust antes de executar. Seu dry grading evita avanço/ledger, mas os comandos ainda podem produzir efeitos. O tail segue um caminho distinto do executor de gates; não se pode atribuir a ele automaticamente toda a sanitização dos gates. Também existe `check` sem state directory que avalia sem registrar. [L1 §3.2]

Nos gates, o ambiente é composto explicitamente, sem `extendEnv`, com stdin ignorado e remoção de variáveis de startup de shell. `ToolSafetySandbox.wrap` recebe o perfil do caller; prazo, término e coleta são limitados. Valores de parâmetros de comprimento pelo menos oito são substituídos por `[redacted]` na saída. Esse mecanismo não constitui redator universal nem qualificação de jail em toda plataforma. O helper Git remove `GIT_*`, desliga locks opcionais/fsmonitor e limita a execução, mas a leitura não demonstra o mesmo `wrap`. [L1 §3.1]

`verify` serializa chamadas com semáforo de capacidade um, recusa comando vazio e distingue falha de execução de falha de registro. `record` valida installID, fixa o timestamp do host e acrescenta ao ledger com chave e geração. A chave local tem formato validado; arquivo existente inválido não é regenerado silenciosamente. **Fronteira de decisão:** gate aprovado sem registro torna-se `unavailable/unrecorded`; reprovação continua sendo reprovação quando falta o recibo. Cálculo favorável e persistência são condições distintas. [L1 §§3.1–3.2]

A recuperação de arm seleciona locks anteriores ao `performance.timeOrigin` e não retidos em `ArmState.held`; escreve `gate-recovered` antes de remover o diretório. Lock recente desconhecido permanece intacto. Trata-se de seleção local e temporal, sem prova de morte de outro host. Tokens inválidos são recusados pelo caminho genérico; metadata de workflow recebe `WORKFLOW_NATIVE_SETTLEMENT_REQUIRED` e exige o fluxo nativo das próximas seções. [L1 §3.2]

## 4. Hooks: pin validado, decisão durável e shipping separado

**Mecanismo estático.** A instalação recebe snapshot/version/digest e conserva um install por documento, IDs e ordem explícita. Atualização preserva ID, ordem e enabled. Pausar publicação mantém pin e preferência; republicar o mesmo pin pode restabelecer a instalação. Remover documento requer retirar installs antes da exclusão pelo caller. Os dados de recibo devolvidos por essas operações não são automaticamente append no ledger. [L1 §4.1]

O snapshot RelayJson é decodificado estritamente e conferido por digest. A validação limita o grafo a mil nós, exige IDs/nomes únicos, um trigger e uma ação, ports/arestas válidos, ausência de ciclo e alcance integral; `block`/`approve` só cabem em trigger anterior à execução. **Fronteira de autoridade:** estrutura e checksum verificam o material recebido; a origem em publicação autorizada continua a cargo do port/caller. [L1 §4.1]

`hooks.json` tem limite de 512 KiB. A leitura verifica arquivo regular, realpath, metadados estáveis, UTF-8, esquema e unicidade; a escrita valida bytes, usa temporário exclusivo e rename. O lock cobre apenas o processo: dois servidores no mesmo diretório estão fora do escopo. Reparo explícito pode preservar arquivo regular corrompido/oversized em backup e escrever estado vazio. Symlink, diretório, caminho inseguro ou leitura instável não viram “sem installs”; backup seguido de escrita não é transação infalível. [L1 §4.1]

Após existir decisão durável, o shipper percorre eventos em sequência e tenta produzir uma linha por decisão/install. Considera decisões devidas até a atual, exclui trabalho de outro `inFlight` e serializa consulta/append por grupo. O recibo identifica decisão, install, versão, nó, ação, trigger, sessão, chamada e outcome; atraso pode ser identificado. O cache usa inode/tamanho/mtime do ledger. Arquivo ausente pode ser vazio; outras falhas interrompem o grupo e podem ser absorvidas para deixar outros prosseguirem. Falha de shipping não desfaz a decisão. [L1 §4.2]

A recuperação recusa explicit workspace sem consultar DB. Para implicit-local, seleciona projeto, diretório exato, `workspace_id` nulo e Session existente, paginando 64 IDs. `attemptedSessions` conta tentativas; `errors=0` não prova todos os recibos, pois certas falhas do shipper não chegam a esse contador. **Inferência:** diagnosticar o fechamento exige distinguir decisão, tentativa e recibo, mesmo quando o caller não vê erro. Os testes lidos no L1 preparam exclusão, retry, `inFlight` e indisponibilidade; aqui permanecem expectativas não executadas. [L1 §4.2]

## 5. Workflow: adquirir a versão e projetar o passo

**Mecanismo estático.** O binding recebe `PublicationPort` de host confiável, evitando import de Server dentro de Core. A aquisição confere projeto, documento, publicação viva não arquivada, versão/checksum e workflow executável/compilável. Materializa skills com SHA256 e organiza checks de aceitação com deduplicação de identidade e associação ao último work package quando exigida pela regra. [L1 §5.1]

Se há conhecimento global ou por WP, a aquisição exige resolver e autor; valida esquema, projeto, autor, referência, unidades únicas, hash de corpo, referência canônica e limites de unidades/bytes. São verificações das âncoras entregues pelo resolver, sem qualificação do engine Atlas. A publicação é consultada de novo ao final. Draft save ou nova publicação não religam silenciosamente uma execução pinada; unpublish produz hold. A revalidação readquire a versão pinada e compara skills, materialização e conhecimento: “mesmo documento” não substitui mesmos bytes e versão. [L1 §5.1]

A projeção `currentstep` é view pura: não migra posição, não cria entrada/retry e não recupera runlock por escrita. Confere metadata, projeto/sessão/holder quando fornecido, digest/comprimento do sprint, estado, posição/attempt/ledgerSeq e pending compatível. Entrega conhecimento global e do WP corrente. Parâmetros expandem macro/instruções/checks autorais, mas conteúdo Atlas não é template; fonte e saída de checks são dados não confiáveis, e escalada permanece `awaiting-human`. [L1 §5.2]

O adaptador de Session registra host nativo com identidade única e finalizer. Lê até dois bindings duráveis: nenhum significa sessão ordinária; multiplicidade ou identidade inválida significa hold. Ausência de host não ganha substituto fake. **Fronteira de decisão:** ler ou resumir o passo não o executa nem avança workflow. Reconcile/settle usa `assistantMessageID` e a posição/attempt/ledgerSeq esperados; só disposições reconhecidas autorizam continuação. [L1 §5.2]

## 6. Workflow: fence, checkpoint e settlement autenticado

**Mecanismo estático.** O nome do checkpoint deriva de SHA256 do `assistantMessageID`. Sob lock do engine, a transição revalida antes de ler checkpoint e exige identidade exata de binding/settlement. Se a tentativa é nova, compara o passo à tripla esperada e grava primeiro o fence pending global, depois o checkpoint individual. Após avaliação, grava settled e só então limpa pending com identidade compatível. Temporário exclusivo/rename não criam uma nova durabilidade de drain ou da Session. [L1 §5.3]

O avaliador envolve `ArmEvaluate`, exige identidade, modo e chave compatíveis, verifica metadata/projeto/sessão/sprint e cadeia HMAC. Reuso de resultado settled depende de recibo autenticado para a disposition correspondente, com checkpoint, avaliação, conjunto de writes e sequência fonte. Pending pode ser reconciliado; reparo exige lock retido, revalidação, fence/binding exatos, disposition única, writes permitidos/necessários e próximo WP coerente. Nesse caminho repair não repete grading. [L1 §5.3]

**Inferência delimitada:** um PASS antigo de ledger ou JSON com nome da mesma assistant message não satisfaz, sozinho, esse contrato. Interrupção antes de disposition autenticada completa conserva hold. Busy, defect, refused, noop, parked e revision drift não são traduzidos em sucesso. Isso descreve as condições cobradas pelo Core, sem atestar correção interna de Relay/S3 ou resistência criptográfica. O consumidor deve aprofundar L1 §5.3, “Fence, checkpoint e recibo autenticado têm funções distintas”, antes de interpretar reuso ou reparo.

## 7. Movimentação e RAG: separar persistência de coordenação

**Mecanismo estático.** Move resolve origem/destino, exige projeto da Session compatível com destino e transfere alterações apenas quando solicitado e os roots diferem. A ordem é capturar alterações, aplicar no destino, publicar `Session.Moved` e descartar alterações no diretório de origem da Session com `index: "preserve"` e `untracked: "remove"`. `ResetSourceChangesError` pode acontecer depois de destino/evento alterados. Não há transação única entre esses meios. O discard recebe diretório/opções, sem o patch capturado. [L1 §6]

**Expectativa de teste, sem execução:** o caso de sessão aninhada prepara mudanças em `packages/` e afirma preservação de arquivo staged nesse path e de arquivos da raiz fora dele. Não exercita alterações concorrentes posteriores à captura dentro do mesmo diretório. Não cabe ampliar essa expectativa para ausência de perda em concorrência. [L1 §6]

O evento constrói `Location.Ref` com diretório; não comprova migração completa de workspace. Esta folha tampouco paralisa o runner. Exclusão/quiescência pelo caller e relação com Context Epoch/drain exigem a autoridade de S1-01 em versão aceita. `workspace.sql.ts` define identidade, tipo, nome, branch/diretório/extra, projeto com cascade e tempo de uso; essas tabelas não executam warp/sync ou coordenação remota. [L1 §6]

RAG Studio persiste fontes/localização/path/hash/status, chunks/texto/linhas/hash/boundary, revisions/associações, perguntas/traces e configuração de pipeline. Chunks deliberadamente não têm FK, conforme comentário sobre limpeza de órfãos; o índice location/path não declara unicidade. A folha examinada não define coluna de embedding ou tabela vetorial. **Limite:** isso não prova ausência de retrieval no produto inteiro; capacidade e qualidade de busca, embedding ou indexador exigem fonte/dono próprios, sobretudo S4. Schema não qualifica busca. [L1 §6]

## 8. Limites de conclusão e encaminhamento

Este fluxo permite localizar a condição que falta antes de prosseguir: promoção no Atlas, recibo após gate/decisão, identidade autenticada no settlement ou coordenação do caller ao mover. Nenhuma dessas condições é suprida por hash estável ou pela ausência de erro visível. As verificações determinísticas desta autoria conferiram identidades dos inputs e outputs; não executaram os fluxos descritos.

Aprofundamento externo continua condicionado a versão/autoridade selecionada: Session, admissão e estado com S1-01; trust/capability/sandbox com S1-02; contratos/adaptação API com S1-04; LLM/SDK/persistência compartilhada com S1-05; engine Relay com S3; Atlas e qualificação pertinente com S4. O L1 não fornece aceites desses donos. Estes encaminhamentos são navegação, sem novas arestas de build. [L1 §7]

Não foram executados provider, testes de produto, binding/publicação Atlas, consumidores ou manutenção. Os dois aceites do predecessor liberam apenas esta derivação; este L2 ainda depende de seus próprios pareceres. Não há alegação de qualificação externa, entrega integral de S1-03, aceite global S1 ou liberação de camada posterior.
