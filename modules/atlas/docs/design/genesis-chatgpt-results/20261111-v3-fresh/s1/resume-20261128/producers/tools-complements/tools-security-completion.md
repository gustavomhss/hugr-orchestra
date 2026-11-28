# Ferramentas e segurança: folhas de escrita, autoridade e saída

L1 · `s1.subslice02.tools-security-completion` · need `component` · scope `orchestra.s1`.
Fonte: `gustavomhss/hugr-orchestra@1cde2ff7a71bcf7aecb5d030917b577165135d38`.

Este complemento registra implementação observada por leitura de fonte. Os candidatos históricos `s1.core.tools` e `s1.core.security` continuam propostas sem aceite; são navegação, não predecessores aceitos. O delta necessário é a leitura das folhas de escrita e dos estágios de captura/Lean, com limites de autoridade e plataforma. Não houve execução do produto, teste, chamada de provedor ou consumidor. A validade das afirmações é limitada aos caminhos e intervalos abaixo; a disposição dos 424 caminhos não significa compreensão de todos eles.

## Declaração, registro e autorização são fronteiras distintas

`Tool.make` cria o executável tipado em uma associação privada: decodifica o input antes de executar, codifica o output e o structured output antes de publicar e transforma falhas de schema em `Tool.Failure`. O callback opcional de captura recebe snapshots separados do input/output já validados; erro na captura não derruba a execução. `Tool.dynamic` é outra representação e não oferece essa mesma decodificação local. `withPermission` e `withOnDemand` acrescentam metadados ao catálogo; nenhum dos dois concede autorização para o efeito. [T01]

O registro de builtins ocorre no escopo de Location, compondo os serviços de cada folha e `CapabilityTools`. A materialização filtra ferramentas completamente desabilitadas, conserva a identidade do registro e mantém ferramentas sob demanda disponíveis para seleção explícita; por padrão, elas não entram na publicidade inicial. Ao liquidar uma chamada materializada, o registry verifica se a identidade ainda é a registrada. Se foi substituída ou removida antes desse ponto, recusa o executável antigo. Depois de iniciada a execução, o executável capturado é local à chamada; a fonte não demonstra cancelamento retroativo de um efeito já iniciado. Assim, acrescentar uma ferramenta tipada com escrita exige tanto registro canônico como autorização dentro da folha, além dos schemas. [T02, T03]

Essa separação também limita o reaproveitamento: uma mudança no schema, na representação ou na política materializada invalida a evidência correspondente ao registro/catálogo e às folhas atingidas. Uma mudança apenas na projeção Lean não autoriza reutilizar uma captura incompatível, mas tampouco prova mudança no algoritmo de escrita. Para uma revisão futura, rastrear os arquivos realmente alterados e seus consumidores; as relações aqui são de fonte, não um novo grafo L2 de aceites. [T01, T02, T14–T18]

`PermissionV2.configured` combina configuração e regras do agente selecionado, e avalia o deny configurado antes das permissões salvas. A inspeção desse caminho não estabelece que toda chamada comum consuma as mesmas regras de Session usadas na materialização/capability. O host nativo cria seu contexto de capacidade no runner, a partir da Location, Session, agente e regras efetivas reais; IDs recebidos em JSON não substituem esse ponto de emissão. O complemento de capabilities detalha a validação do frame. [T04, T05]

## Escrever, editar e resolver caminhos

| Fronteira observada | Consequência para manutenção |
| --- | --- |
| `write`: resolve o caminho, solicita `external_directory` quando necessário, autoriza `edit`, então chama a mutação que preserva BOM. | A folha pode substituir conteúdo existente sem uma leitura prévia do modelo; não promete compare-and-swap. [T06] |
| `edit`: rejeita trocas vazias/iguais, pede autorização e **depois** lê o conteúdo usado na troca; exige ocorrência única, salvo `replaceAll`. | A verificação de alteração concorrente usa o conteúdo lido depois da aprovação. Não equivale a uma aprovação do snapshot anterior à janela humana. [T07] |
| `FileMutation.writeIfUnchanged`: mutex local por caminho físico, compara bytes, escreve e formata dentro da operação protegida. | Protege a cooperação deste processo; não prova transação de múltiplos arquivos, exclusão global de outros processos ou recuperação de crash. [T08] |
| `LocationMutation`: resolve caminhos existentes e ancestrais, recusa escape relativo e redirecionamento interno para fora da Location. | Resolução é uma entrada à decisão de permissão; caminho absoluto externo continua precisando da autorização externa aplicável. [T09] |
| `writePhysical`: abre sem truncar, verifica a identidade do arquivo e só então trunca/escreve. | A defesa é dependente do OS. Usa `/proc/self/fd` quando disponível no Linux e comparação de caminho/dev/inode no fallback; `O_NOFOLLOW` não existe no Windows. [T10] |

A própria implementação física explicita o limite sem `openat`: uma troca do diretório durante `open` pode deixar um arquivo novo vazio no destino do link, embora a checagem posterior impeça escrever nele. Isso impede promover a defesa contra symlink a uma garantia universal de sandbox ou ausência de qualquer efeito de filesystem. O delegador `FSUtil.writePhysical` não altera esse limite. Nenhum OS foi exercitado nesta produção. [T10, T11]

As folhas `glob`, `grep`, `webfetch`, `websearch` e `skill` têm autorização no caminho de execução, com recursos próprios: diretório/consulta/URL/nome da skill. Um helper HTTP não concede a permissão que a folha deve pedir; seu limite de bytes também não é uma garantia de validade semântica de todo conteúdo retornado. As regras herdadas pela ferramenta de tarefa são uma seleção explícita de denies e `external_directory`, não uma demonstração de herança integral de toda política por qualquer agente filho. [T22–T27]

## Três estágios de saída, três limites diferentes

| Estágio | O que a fonte efetivamente conserva | O que não pode ser recuperado por esse estágio |
| --- | --- | --- |
| Produção/captura da folha | Bash conserva até 1 MiB pela API de processo; o caminho PTY usa um limite de caracteres. `read` limita linhas, bytes e comprimento de cada linha. `webfetch` captura texto após conversão. | Bytes que o produtor já descartou; o original HTTP anterior à conversão; conteúdo fora da seleção de busca. [T12, T13, T24] |
| Limite genérico do registry | `ToolOutputStore` limita a vista textual, por padrão 2.000 linhas/50 KiB, e salva o texto disponível antes de substituí-lo por uma vista reduzida. | O texto salvo já pode vir incompleto da folha. O limite textual não é um teto global para structured output e mídia. [T02, T14] |
| Lean | Usa captura emitida/atestada e binding da saída aprovada para projetar ou resumir a vista destinada ao modelo; o caminho de resumo pode conservar essa vista anterior em raw store. | Não recria perda de captura; não prova que todo original continuará disponível, nem que toda ferramenta possui captura elegível. [T15–T20] |

Em `read`, cada linha é limitada a 2.000 caracteres; a paginação e `truncated` não significam que o restante de uma linha longa será recuperável por um offset de linha. O teto de imagem é 20 MiB, e o caminho aceita o conjunto de formatos de imagem declarado, não binário arbitrário. Esta revisão leu a folha inteira: ela não fornece callback `modelCapture`, mesmo que `LeanSummary.supports` inclua o nome `read`. A presença de um nome na lista do resumidor não emite uma captura atestada. [T13, T19]

Bash aplica limite de captura, timeout e estados de término; o callback pode registrar uma observação com `completeness` diferente de completa. O timeout padrão é dois minutos, limitado a dez no parâmetro. A execução de exploração exige sandbox e não faz fallback para o comando não confinado; a análise do comando é consultiva e não prova um parser completo de efeitos. Esses fatos são do caminho Bash lido, não uma regra para processos MCP ou código arbitrário de plugin. [T12]

O `ToolOutputStore` concatena os textos do conteúdo; quando não há texto, pode usar JSON do structured output como vista textual. Preserva os demais campos ao produzir a resposta limitada. Salvar essa vista completa significa completa **nesse ponto do pipeline**, não completa em relação a todo output do subprocesso. O armazenamento genérico tem política de retenção/limpeza própria. Quando o registry já emitiu a indicação de arquivo de saída, o caminho lido não aplica Lean novamente. [T02, T14]

## Atestado, projeção sem perda e resumo não são o mesmo gate

`model-capture.ts` emite registros reconhecidos por estruturas privadas e copia somente valores permitidos, recusando ciclos, accessors e objetos exóticos. O binding associa owner, structured output e partes de arquivo à saída efetivamente aprovada. Copiar campos de um objeto não o transforma em registro emitido. [T15]

`ModelProjection.project` exige, para o caso shell, término completo com código zero; exige owner e binding correspondentes e admite apenas notas de texto acrescentadas à vista base aprovada. A redução deve ser de fato menor em bytes UTF-8 e caber no orçamento da vista inteira. Uma recusa conserva a saída aprovada, em vez de uma projeção parcialmente confiável. [T16]

Há um segundo estágio em `lean-output.ts`: `condense` verifica confiança, binding, suporte e recusa, então chama `LeanSummary.summarize`. **Esse trecho não repete o gate de `completeness` e exit zero do estágio de projeção.** Portanto, não se pode estender automaticamente a garantia da projeção sem perda a todo resumo Lean atual. A decisão efetiva também depende do resultado do resumidor importado. Um resultado `rewritten` retorna diretamente; um resultado resumido requer raw store e salva a saída recebida antes de acrescentar a linha de recall. Uma falha conserva a saída anterior apropriada. Não houve execução desse caso nesta produção. [T17–T19]

O store Lean é configurado por projeto/diretório, com orçamento de 64 MiB, TTL de sete dias e evicção habilitada. `lean_recall` valida o identificador e retorna indisponibilidade quando não encontra o registro; seu resultado também passa pelo registry. A implementação externa de `hugr-lean/core` e cada redutor não foram lidos aqui. Logo, o contrato configurado, a attestation e a existência de recall não provam preservação ilimitada nem qualidade de um resumo particular. [T19, T20]

O contrato histórico `MODEL-CAPTURE-CONTRACT.md` descreve uma fase de fundação sem ativação; o código atual do registry/Lean contém ativação. O documento permanece evidência de intenção daquela fase e não substitui a observação do caminho atual. A telemetria calcula bytes e estimativa de tokens por heurística de caracteres; não mede tokens cobrados nem custo real. Tokens e cobrança desta produção são `UNKNOWN`. [T02, T17, T21, T28]

## Delta, pendências e uso permitido deste L1

Foram fechadas, por leitura estática, as lacunas específicas de ferramenta tipada/sob demanda, escrita versus edição, resolução física de caminho, captura/limite genérico/Lean e ligação de autorização às folhas selecionadas. Os quatro candidatos históricos permanecem imutáveis. Os caminhos não lidos têm disposição individual no arquivo de cobertura e não sustentam claims sobre suas implementações. Testes/fixtures foram classificados pelo papel de validação; nenhum resultado de teste é inferido dessa classificação.

Continuam fora da evidência: rollback multi-file; isolamento universal de plugins/processos; exercício em qualquer OS; algoritmos completos de todas as folhas; validação local genérica de `Tool.dynamic`; disponibilidade permanente dos outputs; semântica de todos os redutores externos. Uma mudança nessas fronteiras requer a fonte específica e, quando a afirmação for operacional, evidência de execução autorizada. Este corpo não realiza M1/M2, não cria consumidor, não declara aceite e não libera L2–L4.

## Índice exato das fontes usadas

Os caminhos são relativos ao repositório fixado. SHA-256, Git blob, bytes, captura e leitura estão separados em `source-manifest.json` e `reading-confirmation.json`.

| Ref | Caminho | Linhas lidas pertinentes |
| --- | --- | --- |
| T01 | `packages/core/src/tool/tool.ts` | 1–223 |
| T02 | `packages/core/src/tool/registry.ts` | 1–337 |
| T03 | `packages/core/src/tool/builtins.ts` | 1–62 |
| T04 | `packages/core/src/permission.ts` | 110–180 |
| T05 | `packages/core/src/session/runner/llm.ts` | 289–307 |
| T06 | `packages/core/src/tool/write.ts` | 46–111 |
| T07 | `packages/core/src/tool/edit.ts` | 1–35, 116–224 |
| T08 | `packages/core/src/file-mutation.ts` | 31–213 |
| T09 | `packages/core/src/location-mutation.ts` | 31–160 |
| T10 | `packages/core/src/util/physical-path.ts` | 1–65 |
| T11 | `packages/core/src/fs-util.ts` | 1–18, 160–184 |
| T12 | `packages/core/src/tool/bash.ts` | 1–334 |
| T13 | `packages/core/src/tool/read.ts`; `packages/core/src/tool/read-filesystem.ts` | 1–123; 12–30, 175–216, 245–337 |
| T14 | `packages/core/src/tool-output-store.ts` | 16–59, 165–238 |
| T15 | `packages/core/src/tool/model-capture.ts` | 1–110 |
| T16 | `packages/core/src/tool/model-projection.ts` | 1–85 |
| T17 | `packages/core/src/tool/lean-output.ts` | 1–225 |
| T18 | `packages/core/src/tool/lean-processor.ts` | 1–50 |
| T19 | `packages/core/src/tool/lean-summary.ts` | 1–34 |
| T20 | `packages/core/src/tool/lean-recall.ts` | 1–69 |
| T21 | `packages/core/src/tool/lean-telemetry.ts` | 1–42 |
| T22 | `packages/core/src/tool/glob.ts`; `packages/core/src/tool/grep.ts` | 50–103; 68–122 |
| T23 | `packages/core/src/tool/http-body.ts` | 1–30 |
| T24 | `packages/core/src/tool/webfetch.ts` | 121–230 |
| T25 | `packages/core/src/tool/websearch.ts` | 243–317 |
| T26 | `packages/core/src/tool/skill.ts` | 45–157 |
| T27 | `packages/core/src/tool/task-permission.ts` | 1–29 |
| T28 | `packages/core/src/tool/MODEL-CAPTURE-CONTRACT.md`; `packages/core/src/tool/LEAN-DASHBOARD-CONTRACT.md`; `packages/core/src/tool/AGENTS.md` | documentos lidos; contrato histórico separado de implementação |
