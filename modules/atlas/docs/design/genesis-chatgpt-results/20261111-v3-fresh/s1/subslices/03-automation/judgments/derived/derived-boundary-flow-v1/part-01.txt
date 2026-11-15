# s1.subslice03.boundary-flow — revisão semântica L2 v1

Execução34269cf4-d631-41c5-a30b-85b0ec217390. Mesmos J1/J2, independentes, sem ferramentas. Material literal termina apenas no FIM_DO_LOTE externo. Nenhum voto do outro juiz sobre este candidato foi emitido ou incluído neste pacote. Metadados de gate na receita/evidência referem-se exclusivamente ao predecessor já aceito.

Candidato: s1.subslice03.boundary-flow, 16112 bytes, SHA256 83c961e473f666034b6db197ead28594580f4a953fc9f6f4bb63f006ab65ddbd, Git blob 6420523de8f6d8e5fa5aac4b8f76bab2c5c6fceb. Reutilize seus próprios pareceres e os bytes exatos dos predecessores indicados, já recebidos. Não reabrir por rotina conteúdo inalterado nem inferir aceite do novo corpo a partir do anterior.

Aplicar todos os critérios públicos pertinentes já recebidos, em especial GO-A1–7, GO-I1/2/7/8, QS-1–6, CC-1/3/7 e a suficiência local AC-01; demais obrigações operacionais mantêm provas próprias. Julgar o corpo inteiro e a fidelidade ao predecessor, utilidade da camada, limites de autoridade, interpretação, navegação versus build e receita/proveniência. Emitir PASS, FIX-FIRST ou REQUEST_EVIDENCE com falta obrigatória concreta; sugestão opcional não amplia a barra. Não emitir binding Atlas, consumidor, manutenção ou entrega completa.

A principal conferiu deterministicamente os 17 inputs declarados e os outputs, seus tamanhos/SHA256/blobs; receita congelada antes do dispatch; predecessor gate verificado antes da autoria. Corpo e evidência foram lidos integralmente. Nenhum teste de produto foi executado. Recibo receipts/derived-boundary-flow-v1-verification.json. A tabela abaixo é projeção mecânica identificada do manifesto posterior, não texto da receita anterior nem nova autoridade semântica.


## BEGIN_CORPO_EXATO

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

## END_CORPO_EXATO

## BEGIN_EVIDENCIA_EXATA

# Evidência da autoria — s1.subslice03.boundary-flow

## Identidade e cadeia de autoridade

A única base semântica de build é `s1.core.boundaries`, arquivo `producers/boundaries/bodies/boundaries.md`, 23.665 bytes, SHA256 `ca7e76aa47100f32e2076b0a5055b2cebfe3d36cfb5c0d29601125db34d7b3c6`, Git blob `6821d54aec4f8015dd00d634f632dc9960d1bd74`. O corpo foi lido integralmente e as três identidades foram recalculadas. Fonte investigada pelo L1: `1cde2ff7a71bcf7aecb5d030917b577165135d38`; não houve releitura dessa fonte bruta pelo autor L2.

A receita efetivamente usada é `payload/recipes/derived/boundary-flow.json`, 8.459 bytes, SHA256 `3e4c7ebbb94d3fb6d7c4de5238aaea74e817cbfb1e80ea2c15bb259bc20eb544`, em conjunto com `payload/recipes/derived-contract.json` e o dispatch preservado. Foi congelada antes do dispatch. `production-manifest.json` registra a produção depois dela; não é uma receita anterior.

A receita informa PASS de `parallel-v3-fresh/S1-03/J1` e `parallel-v3-fresh/S1-03/J2` sobre o mesmo hash do predecessor. Os hashes das respostas originais nela citados são, respectivamente, `9c7496988762a6455d1682eea750037377778c316d37071203f1c8b719951adc` e `5ae3e9104142c41c0d261bb979dc29607a69065d019d3899d28c9fea52334801`. São metadados de gate fornecidos pela principal, não pareceres consumidos ou novo juízo deste autor. O cabeçalho original do L1 ainda diz candidato/aceite pendente; foi preservado sem correção. A autoridade para liberar a derivação vem do gate da receita sobre aqueles bytes, sem reescrever o histórico.

## Mapa de afirmações para seções exatas do predecessor

Todas as linhas da tabela usam a chave e o SHA256 integral acima. Os IDs B/T/S internos e caminhos brutos citados no L1 não foram abertos; sua presença não cria consumo direto de fonte.

| Seção do L2 | Seção exata do L1 | Afirmações e tipo de suporte |
| --- | --- | --- |
| §1 — Escopo, evidência e entrada na leitura | §1 “O que o Core fornece na fronteira” | Responsabilidades locais e módulos externos; regra arquitetural e limite da verificação de imports. Síntese de mecanismo e intenção declarados pelo L1. O gate é metadado da receita, não afirmação de código. |
| §2 — Atlas | §2 “Atlas: disponibilidade, identidade e proposta de conhecimento” | Escolha da raiz e identidade do projeto pelo host; Unavailable/fiber; mine sem `.atlas`; seleção/limites do indexador; perguntas do lote, answer.trim e ausência de garantia de why não vazio; teto/concorrência, staging sem promoção. Mecanismo relatado e distinção explícita entre comentário e classificação interpretativa. Nenhuma qualificação de indexador/engine foi inferida. |
| §3 — Relay | §3.1 “Sugestões e execução têm autoridades diferentes” e §3.2 “Uma avaliação aprovada precisa do registro correspondente” | Descoberta heurística e limitada; ambiente, wrap, redaction e helper Git distintos; chave/ledger; verify/record; aprovação sem recibo; recuperação local de arm; trial com efeitos; check sem registro e recusa do settlement genérico. Consequências são delimitadas à implementação relatada. |
| §4 — Hooks: instalação | §4.1 “Instalação pinada e escrita deliberada” | Pin, identidade, ordem, pause/update/remove; validação estrutural e limite da proveniência; leitura/escrita, lock de processo e reparo explícito. Não atribui publicação autorizada ao checksum, nem transação ao backup/rename. |
| §4 — Hooks: shipping/recuperação | §4.2 “Decisão durável não é recibo de ledger” | Sequência de decisões, grupos/inFlight, cache, falhas absorvidas e preservação da decisão; recuperação implicit-local/exclusão explicit workspace, filtros, 64 IDs; attemptedSessions/errors não equivalem a recibos. Cenários de teste são apenas expectativas não executadas. |
| §5 — Workflow: aquisição | §5.1 “Publicação e materialização são adquiridas por port do host” | PublicationPort, checks de projeto/publicação/versão, skills e checks; resolver/autor/âncoras de conhecimento; reconsulta final, pin, unpublish e revalidação. Limite de autoridade do conhecimento preservado. |
| §5 — Workflow: projeção/Session | §5.2 “Ler o passo não o executa” | View pura, verificações de identidade/posição/pending, expansão separada do conteúdo Atlas, dados não confiáveis, awaiting-human; host nativo, até dois bindings, hold, identidade esperada e disposições. Não promove leitura a execução. |
| §6 — Settlement | §5.3 “Fence, checkpoint e recibo autenticado têm funções distintas” | Ordem fence global/checkpoint individual, lock/revalidação, settled/limpeza pending; recibo HMAC e writes/sequence; reparo sem regrading sob condições estritas; PASS antigo insuficiente e hold quando incompleto. Inferência explicitamente delimitada no L1, sem prova criptográfica ou garantia do engine. |
| §7 — Move | §6 “Control plane e RAG: persistência versus ação” | Condições da transferência, capture/apply/event/discard, erro após efeitos e ausência de transação; teste aninhado limitado e concorrência não exercitada; caller quiescente, Location.Ref e autoridade S1-01. Asserções do teste não foram executadas. |
| §7 — Persistência | §6 “Control plane e RAG: persistência versus ação” | Workspace como schema; entidades RAG, chunks sem FK, índice sem unicidade declarada, ausência de vetores nessa folha; recusa de generalizar para ausência de retrieval no produto. |
| §8 — Encaminhamento e limites | §7 “Reuso, deltas e navegação ainda não aceita”; limites das §§2–6 | Donos externos e versões não selecionadas; navegação sem dependência de build; síntese dos limites. Não incorpora suporte de artefatos externos ausentes. Estado desta autoria vem de procedimentos e escopo registrados no manifesto. |

## Inputs normativos e critério de composição

`inputs/AGENTS.md`, `inputs/COMMON.md`, `inputs/mission.json`, `inputs/SKILL.md` e as seis referências enumeradas foram lidos como autoridade pública delimitada. O contrato público `derived-contract.json` fixa L2 como explicação do fluxo local e fronteiras de decisão. `artifact-plan.json` fixa um único predecessor obrigatório; o caso público B-ABSTAIN é necessidade planejada, sem resposta reservada ou resultado consumido. `derived-public-criteria.json` foi lido integralmente como texto normativo, sem presumir satisfação dos critérios operacionais globais.

A organização em oito títulos depth2 atende consumo delimitado (GO-A1–A3, QS-2); a separação entre mecanismo, inferência, intenção e teste atende GO-A5, GO-I2 e QS-1. Dependência única/navegação distinta preservam GO-A4 e GO-I4; recusas de autoridade e de conclusões externas preservam GO-I7. Hashes/contagens são verificações de forma e identidade, sem declaração de suficiência semântica (GO-I8/AC-01). GO-A6/QS-6 motivam hashing determinístico e leitura restrita. Não foi criado mecanismo novo, store ou adaptação de produto (GO-A7/QS-3). Essas são disposições de autoria para revisão; nenhum PASS foi emitido pelo autor.

## Verificações e limitações efetivas

Foram consumidas 14 unidades integrais enumeradas pela receita, mais a própria receita, request e dispatch: 17 unidades de input. O primeiro lote de saída da ferramenta truncou um trecho de COMMON; COMMON foi relido integralmente em lote menor antes da composição. As identidades integrais de todos os inputs constam no manifesto. Os outputs foram relidos para verificação de bytes, UTF-8, hashes e headings; essas releituras são verificação dos próprios outputs, não fontes adicionais.

Não foram abertos oracle, pareceres integrais, evidências brutas do predecessor, arquivos irmãos ou referências adicionais. Não houve rede, GitHub, delegação, testes de produto, runtime Atlas, consumidor, manutenção, alteração de produto/política/guard ou escrita fora do diretório exclusivo. A afirmação sobre essas operações descreve esta autoria; não apaga obrigações da principal. Campos de tentativas físicas, tokens e cobrança permanecem `UNKNOWN`. O novo L2 está pronto para submissão ao mesmo par, sem aceite próprio ou liberação de dependente.

## END_EVIDENCIA_EXATA

## BEGIN_RECEITA_DE_TAREFA_EXATA

{
  "schema": "s1-03-derived-task-recipe/v1",
  "execution_id": "34269cf4-d631-41c5-a30b-85b0ec217390",
  "frozen_at_utc": "2026-11-15T03:25:49.273278+00:00",
  "state": "FROZEN_BEFORE_AUTHOR_DISPATCH",
  "artifact": {
    "key": "s1.subslice03.boundary-flow",
    "layer": 2,
    "need": "flow",
    "required_build_predecessors": [
      "s1.core.boundaries"
    ],
    "purpose": "Encadeamento e limites do lado Core das portas externas"
  },
  "predecessors": [
    {
      "key": "s1.core.boundaries",
      "local_body_path": "producers/boundaries/bodies/boundaries.md",
      "payload_body_path": "modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/subslices/03-automation/producers/boundaries/bodies/boundaries.md",
      "body_bytes": 23665,
      "body_sha256": "ca7e76aa47100f32e2076b0a5055b2cebfe3d36cfb5c0d29601125db34d7b3c6",
      "body_git_blob_sha": "6821d54aec4f8015dd00d634f632dc9960d1bd74",
      "acceptance_gate": [
        {
          "judge_id": "parallel-v3-fresh/S1-03/J1",
          "status": "PASS",
          "body_sha256": "ca7e76aa47100f32e2076b0a5055b2cebfe3d36cfb5c0d29601125db34d7b3c6",
          "original_response_sha256": "9c7496988762a6455d1682eea750037377778c316d37071203f1c8b719951adc"
        },
        {
          "judge_id": "parallel-v3-fresh/S1-03/J2",
          "status": "PASS",
          "body_sha256": "ca7e76aa47100f32e2076b0a5055b2cebfe3d36cfb5c0d29601125db34d7b3c6",
          "original_response_sha256": "5ae3e9104142c41c0d261bb979dc29607a69065d019d3899d28c9fea52334801"
        }
      ],
      "gate_scope": "Semantic acceptance only; runtime and consumers are separate. Full judge prose is not an author input."
    }
  ],
  "author_context": "Fresh native fork none for this family; no oracle, no judge prose and no raw source. Later family layers reuse this author only after their gates. Do not delegate.",
  "retained_family_context": null,
  "exclusive_output_directory": "producers/derived-boundary-flow",
  "payload_output_directory": "modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/subslices/03-automation/producers/derived-boundary-flow",
  "read_exactly": [
    {
      "local_path": "inputs/AGENTS.md",
      "bytes": 16501,
      "sha256": "07acaefb95db4b07b4e76c4255f7d6e0ecc4c7466b46fbf6ec5e5cdf6cc01b4f",
      "git_blob_sha": "ef3b523b0c00aed722582b870c1919188edc4c4f",
      "whole_file_identity": true
    },
    {
      "local_path": "inputs/COMMON.md",
      "bytes": 12959,
      "sha256": "ec78eb0fa7dd391c623bac4d953115df6fbd6ba77176dc1bf1cf43650e9a90e7",
      "git_blob_sha": "893cbb5f5eda2d0c19753606a50d1c482523f0c8",
      "whole_file_identity": true
    },
    {
      "local_path": "inputs/mission.json",
      "bytes": 6006,
      "sha256": "32fc0a8d442eff56716ba86400b13109c4bbb97d047e12a2d597a930153e7f75",
      "git_blob_sha": "48fa8da131e97c50110ee76e41e79283cd9a0ac4",
      "whole_file_identity": true
    },
    {
      "local_path": "inputs/SKILL.md",
      "bytes": 8143,
      "sha256": "f86523d16180ce06376c1635e1ee2f51f61bf80f620466fdd2cf9821ff720029",
      "git_blob_sha": "852e1d66539be5df895ba4cdbd2f9ab6e2331877",
      "whole_file_identity": true
    },
    {
      "local_path": "inputs/references/principles.md",
      "bytes": 6010,
      "sha256": "f724520d864fff48e11951fa97d54a362517a863ef518bb7b3cb3606b01f3230",
      "git_blob_sha": "3b4122705ef4ae4bda66fe7b5be4c93d55d32765",
      "whole_file_identity": true
    },
    {
      "local_path": "inputs/references/fatia-1.md",
      "bytes": 3987,
      "sha256": "152429602222695674fe42b029e8d8d83c974c0369d6c441eccfa0cacfeba7ae",
      "git_blob_sha": "78482ad7c72ec275fadb26ebece1c30bc1e5ccb9",
      "whole_file_identity": true
    },
    {
      "local_path": "inputs/references/fresh-start.md",
      "bytes": 4983,
      "sha256": "c5168fade744fd3809aeec6c48b22b85914c5257a0b7dd5b9dfcbb6c4c3b2166",
      "git_blob_sha": "ca485b25e43293a309c5489279dce80ce1441ed0",
      "whole_file_identity": true
    },
    {
      "local_path": "inputs/references/orchestration.md",
      "bytes": 4408,
      "sha256": "b9c6b6cb8b67b4ff546c99aa62041657482a74f11822514e37e2dbbc755cbbcb",
      "git_blob_sha": "4ffd37ea0015eb1d7529e23a2762aa2cec3dc8ac",
      "whole_file_identity": true
    },
    {
      "local_path": "inputs/references/judging.md",
      "bytes": 5787,
      "sha256": "c820270ed2d777777be8794980658f3fcfe6e59cfa05ccac197280c56035f0bb",
      "git_blob_sha": "452dc16776f84a6b0010dafa217564fc6411f183",
      "whole_file_identity": true
    },
    {
      "local_path": "inputs/references/transport.md",
      "bytes": 8478,
      "sha256": "02dbf78b9eb76c894d07c9e498704d2260157b7b10d5e1d159a0fd1037e73e3c",
      "git_blob_sha": "e9a98619f3b0759ead0287fa54fe3ef2f22137d5",
      "whole_file_identity": true
    },
    {
      "local_path": "payload/artifact-plan.json",
      "bytes": 5017,
      "sha256": "6bf70a5c448d65ec3a046aefc0b0b9db2f783dcd8573a2d2ea69487bec7ce9ad",
      "git_blob_sha": "8dba81b59cd093d28ea07cf4369d5842b6bdee68",
      "whole_file_identity": true
    },
    {
      "local_path": "payload/recipes/derived-contract.json",
      "bytes": 4017,
      "sha256": "bcde63f79d8cacd030293da38c580c55c5aa58e0a5ff3751f1d1e27971f17588",
      "git_blob_sha": "b0687d5855dd78d7ce1959d217b4ad15143565cd",
      "whole_file_identity": true
    },
    {
      "local_path": "payload/recipes/derived-public-criteria.json",
      "bytes": 16244,
      "sha256": "1e7686491c5b68cb4f3d287377723edcd8932ae803c267ddbabf44a360dfc36e",
      "git_blob_sha": "d4f6b765e6d78341ba2b77186c77b9177cf3156c",
      "whole_file_identity": true
    },
    {
      "local_path": "producers/boundaries/bodies/boundaries.md",
      "bytes": 23665,
      "sha256": "ca7e76aa47100f32e2076b0a5055b2cebfe3d36cfb5c0d29601125db34d7b3c6",
      "git_blob_sha": "6821d54aec4f8015dd00d634f632dc9960d1bd74",
      "whole_file_identity": true,
      "accepted_predecessor_key": "s1.core.boundaries"
    }
  ],
  "other_actual_inputs": "This frozen recipe, the request file and the visible dispatch. Record their full identities. If an extra source is needed, ask principal before reading.",
  "instructions": [
    "Read the listed public authority, plan, common recipe and criteria in full unless already completely read in this same family context, then the exact accepted predecessor body. Avoid output truncation. Retain all earlier actual context inputs in the new manifest. Do not open any oracle, judgment response, unlisted sibling file or recursive directory inventory.",
    "Produce only this artifact and its evidence/manifest. Do not preproduce a later layer. Use the accepted body as semantic authority, preserving its qualifications. The normative recipe states the role of this layer.",
    "Write a coherent useful Portuguese reference, normally 6000–14000 UTF-8 bytes, with independent depth2 headings for bounded Atlas read. This is a sizing preference, not permission to omit necessary meaning.",
    "Explain the defined need, mechanisms, decision boundaries and relevant limitations without copying the full predecessor. Distinguish static findings, contract-test expectations, inference and actual execution.",
    "Map claims to exact predecessor keys/hashes/sections in evidence.md. Navigation is not a build edge. Do not claim provider qualification, runtime binding, live consumers, maintenance success or global S1 acceptance.",
    "Store body.md, evidence.md, production-manifest.json, response.md and the exact visible dispatch record in the exclusive directory. Preserve existing request.txt. Include every actual consumed whole-file unit and provenance in production-manifest.json; do not call a postproduction manifest an earlier recipe.",
    "No network, GitHub writes, product tests or product changes, policy/guard changes, sibling mutations or other agents. Python/file tools may read the enumerated inputs and write your outputs; deterministic hashing is permitted.",
    "Stop after this one authoring delivery and report hashes, input/output counts and limitations. The principal obtains the same two native judges before releasing a dependent."
  ],
  "outputs": [
    "body.md",
    "evidence.md",
    "production-manifest.json",
    "response.md",
    "dispatch-message.txt"
  ],
  "reserved_answers_included": false,
  "usage_fields": "Physical attempts, tokens and billing UNKNOWN when not exposed."
}

## END_RECEITA_DE_TAREFA_EXATA

## BEGIN_RECEITA_COMUM_EXATA

{
  "schema": "s1-03-derived-public-authoring-contract/v1",
  "execution_id": "34269cf4-d631-41c5-a30b-85b0ec217390",
  "purpose": "Actual common recipe for future L2-L4 derivation; frozen before those author dispatches. Not semantic output or acceptance.",
  "scope": "S1-03 only",
  "source_revision": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
  "protocol_revision": "ee2521a5b966bd505cc95bd1c733e09e12f33531",
  "kit_revision": "70234d541a9a3539935ef16f19e33c8f2d5f30ec",
  "artifact_plan": {
    "payload_path": "modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/subslices/03-automation/artifact-plan.json",
    "sha256": "6bf70a5c448d65ec3a046aefc0b0b9db2f783dcd8573a2d2ea69487bec7ce9ad"
  },
  "author_context": "fresh fork none; no reserved answers; read exactly listed accepted predecessor bodies plus public task/recipe/authority inputs; new raw-source needs return to principal before use",
  "gate": "Only dispatch a derived artifact after the same two current native judges accept every declared required predecessor at exact bytes. Recipe preparation does not release the gate.",
  "layer_roles": {
    "2": "Explain local working flow and decision boundaries from accepted L1, giving useful direct entry points into the detailed contracts.",
    "3": "Explain relationships, change impact and which knowledge/consumers need re-evaluation; distinguish build dependencies from navigation and independent families.",
    "4": "Ownership, maintenance/diagnosis, verification and escalation; entry gives shallow orientation and concrete deeper navigation while preserving the historical Core entry."
  },
  "quality_rules": [
    "Write a usable Portuguese reference with clear depth2 section headings so a consumer can request a bounded section through ownership.read.",
    "Make distinct the source-supported mechanism, authorized intent, inference and remaining gap. Do not upgrade tests listed to executions.",
    "Cite exact accepted predecessor keys, bytes/hashes and relevant sections. Do not invent line evidence, raw source details or external engine guarantees.",
    "Avoid reprinting the full predecessor or adding a file per source; satisfy the defined need with a compact coherent explanation.",
    "Describe known failures and authority boundaries explicitly. A proposed operational action does not prove it was executed.",
    "Do not include reserved oracle answers or infer a consumer PASS; public questions are needs, not outcomes.",
    "No product edits, local tests, network/provider calls, GitHub writes, policy/guard changes or external messages.",
    "Preserve exact visible request/response and body bytes; retain every revision and actual input identity, including genuine procedures used. No private reasoning.",
    "Use only authorized exclusive producer directory. No sibling payload/producer mutation or recursive filesystem discovery. If an extra input is necessary, identify it before reading.",
    "The actual authoring recipe is this contract plus the per-task frozen recipe and visible dispatch. A descriptive output manifest created afterwards is not a preexisting executable recipe."
  ],
  "public_criteria": [
    "GO-A1",
    "GO-A2",
    "GO-A3",
    "GO-A4",
    "GO-A5",
    "GO-A6",
    "GO-A7",
    "GO-I1",
    "GO-I2",
    "GO-I7",
    "GO-I8",
    "QS-1",
    "QS-2",
    "QS-3",
    "QS-4",
    "QS-5",
    "QS-6",
    "CC-1",
    "CC-3",
    "CC-4",
    "CC-7",
    "AC-01"
  ],
  "outputs": [
    "body.md",
    "evidence.md mapping claims/sections to exact accepted predecessor sections",
    "production-manifest.json listing actual consumed whole-file units and the scope of each, output hashes, gaps and procedure provenance",
    "request.txt exact visible dispatch",
    "response.md original visible result and limitations"
  ],
  "not_outputs": [
    "No oracle copy",
    "No new AGENTS or authority file",
    "No claimed runtime receipts or semantic verdicts",
    "No replacement of historical s1.core.entry"
  ]
}

## END_RECEITA_COMUM_EXATA

## Inputs reais — projeção mecânica do manifesto

| Path local | Bytes | SHA256 | Papel declarado |
| --- | ---: | --- | --- |
| inputs/AGENTS.md | 16501 | 07acaefb95db4b07b4e76c4255f7d6e0ecc4c7466b46fbf6ec5e5cdf6cc01b4f | Public repository authority snapshot; no product changes or tests authorized for this task. |
| inputs/COMMON.md | 12959 | ec78eb0fa7dd391c623bac4d953115df6fbd6ba77176dc1bf1cf43650e9a90e7 | Public S1 subdivision protocol; consumed fully, task-specific producer restrictions take precedence. |
| inputs/mission.json | 6006 | 32fc0a8d442eff56716ba86400b13109c4bbb97d047e12a2d597a930153e7f75 | Public S1-03 mission identity and authority boundaries; not a release of broader authoring. |
| inputs/SKILL.md | 8143 | f86523d16180ce06376c1635e1ee2f51f61bf80f620466fdd2cf9821ff720029 | Public execute-genesis procedural snapshot, scoped by frozen producer request. |
| inputs/references/principles.md | 6010 | f724520d864fff48e11951fa97d54a362517a863ef518bb7b3cb3606b01f3230 | Public quality, invariants and completion distinctions. |
| inputs/references/fatia-1.md | 3987 | 152429602222695674fe42b029e8d8d83c974c0369d6c441eccfa0cacfeba7ae | Public S1 context, superseded by mission/task for local assignment. |
| inputs/references/fresh-start.md | 4983 | c5168fade744fd3809aeec6c48b22b85914c5257a0b7dd5b9dfcbb6c4c3b2166 | Public isolation, provenance and accounting procedure. |
| inputs/references/orchestration.md | 4408 | b9c6b6cb8b67b4ff546c99aa62041657482a74f11822514e37e2dbbc755cbbcb | Public producer-role, preservation and predecessor-gate procedure. |
| inputs/references/judging.md | 5787 | c820270ed2d777777be8794980658f3fcfe6e59cfa05ccac197280c56035f0bb | Public semantic-review and consumer separation; not judge prose. |
| inputs/references/transport.md | 8478 | 02dbf78b9eb76c894d07c9e498704d2260157b7b10d5e1d159a0fd1037e73e3c | Public transport identity, input/version and build/navigation rules. |
| payload/artifact-plan.json | 5017 | 6bf70a5c448d65ec3a046aefc0b0b9db2f783dcd8573a2d2ea69487bec7ce9ad | Frozen artifact graph; only boundary-flow L2 released in this task. |
| payload/recipes/derived-contract.json | 4017 | bcde63f79d8cacd030293da38c580c55c5aa58e0a5ff3751f1d1e27971f17588 | Actual pre-dispatch common authoring recipe and L2 role. |
| payload/recipes/derived-public-criteria.json | 16244 | 1e7686491c5b68cb4f3d287377723edcd8932ae803c267ddbabf44a360dfc36e | Frozen full public criteria excerpt; not reserved expected answers. |
| producers/boundaries/bodies/boundaries.md | 23665 | ca7e76aa47100f32e2076b0a5055b2cebfe3d36cfb5c0d29601125db34d7b3c6 | Only accepted semantic build predecessor; full body read, no raw evidence links followed. |
| payload/recipes/derived/boundary-flow.json | 8459 | 3e4c7ebbb94d3fb6d7c4de5238aaea74e817cbfb1e80ea2c15bb259bc20eb544 | Effective per-task recipe, frozen before author dispatch. |
| producers/derived-boundary-flow/request.txt | 850 | 46437f5558525bd36b082915531c5ee70f8ab53a0b40c11270b7f313581c2d89 | Frozen request preserved byte-identically; actual input, not output. |
| producers/derived-boundary-flow/dispatch-message.txt | 1421 | 0790d3883cf33e37a3f4fd338c3d9cfc36f3b2625c0b0072fd9155e2f526b2d2 | Exact visible parent dispatch encoded UTF-8 without an appended newline; preserved separately from frozen request. |

Manifesto original posterior: producers/derived-boundary-flow/production-manifest.json; 20090 bytes; SHA256 93baa2def94d8fe3d05984211d05f68c0c18c8b021953bf67153f7b9eb56c2f0. Ele permanece integral no payload, mas sua totalidade não é retransmitida aqui. Conteúdo declarativo de uso não substitui seu juízo.

Decida somente após FIM_DO_LOTE externo.
