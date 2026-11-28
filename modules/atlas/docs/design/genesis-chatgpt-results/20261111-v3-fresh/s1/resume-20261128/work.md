# S1 Core — reconciliação e execução própria

Estado **IN_PROGRESS**. Branch exclusiva `genesis-core-resume`; HEAD inicial `4fe8525b57585f1de78c27b2598f51575b5a66c0`. Execução local `2ccbd15d-4f66-44a3-b2e1-8326abce0bef` identifica o ledger, não uma conversa ou mensagem do host. Fonte `1cde2ff7a71bcf7aecb5d030917b577165135d38`; protocolo `ee2521a5b966bd505cc95bd1c733e09e12f33531`.

## Inventário e seleção

`reconciliation.json` é o inventário por chave, versão, hash e aceite. A população congelada contém **2.236 paths únicos**: Sessões555, Ferramentas424, Automação462, APIs472 e Bibliotecas323. O hash original e a profundidade histórica permanecem em `source-map.json`; leituras novas são deltas atribuídos, sem promover inventário a compreensão.

Este checkpoint contém **72 chaves inventariadas**, **58 corpos selecionados** e **69 saídas obrigatórias**. Onze superiores continuam faltando: a fila pública e seus gates foram fixados em `selected/upper-obligations.json` antes dessa autoria. As raízes correntes ainda são provisórias; o pacote único não está pronto para publicação.

**42 aceites herdados** são reutilizados: 32 exatos e dez C delimitados. Os 12 corpos Auto/Research, 13 API próprios e sete Sessões já aceitos não foram reautorizados por associação. Três cópias Core dentro de API são deduplicadas por chave/corpo. Os corpos e referências dos pacotes de origem permanecem exatos; `selected/core-copy-metadata.json` explicita diferenças de transporte. A antiga `s1.core.entry` permanece histórica e seus104 paths estão atribuídos ao suporte aceito de Automação.

Quatro aceites semânticos novos foram incorporados: B15/economy original; Models v2; Runtime v2; L2 Bibliotecas LLM. Os dois juízes persistentes são `/root/review_coordinator/judge_j1` e `/root/review_coordinator/judge_j2`, independentes, sem ferramentas. Pedidos efetivamente transmitidos, respostas, solicitações de evidência e erratas estão em `judgments/`. O coordenador transporta e preserva; não vota nem escreve os corpos.

## Recuperação anterior à autoria

Os sete superiores foram recuperados dos dois prompts originais: 94.649 bytes, 7/7 hashes exatos. `recovered-upper/` preserva prompts, corpos, verificação e proveniência. Não foram encontrados aceites exatos/companions suficientes na busca delimitada; `NO_CHANGE` é impacto, não PASS. Cinco corpos têm rota de reúso com rebind/correções necessárias; dois permanecem em comparação explícita com saídas atuais. Nenhum foi descartado silenciosamente nem reavaliado por rotina.

B15 conservou seus3288 bytes e hash `74a59d062ae560dc633abd7561b1a763a7a9982db587d5c0076b8fc8f4a9b6bf`; após a busca sem recibos exatos, recebeu os dois julgamentos necessários. Models/Runtime receberam correções mínimas por autor sem oracle e reavaliação do mesmo par. As versões anteriores e findings continuam preservados.

Uma diferença de captura do pacote Sessions foi explicada: o arquivo local inicial tinha um LF adicional. O Git original tem270747 bytes, blob `c1558e36f8a52fe484980fa6eabc572c7969ad06`, SHA `7541d67c8a4c3183429b9600ec6ea947a8b7035bbc6d0e83f7bb2d910b7fc030`. Corrigidos somente os ponteiros de inventário/reúso; corpos e votos não mudaram. Registro em `selected/sessions-package-capture-correction.json`.

## Fila própria

| Obrigação | Estado observado | Próximo fechamento concreto |
| --- | --- | --- |
| 7 L1 Sessões herdados + B15/Models/Runtime | Aceites exatos preservados | Binding e operação sobre seleção completa |
| Runtime/Models/Economy completion | FIX-FIRST de ambos; delta em autoria | Corrigir PTY/validação/norma, fornecer fontes/235disposições e reavaliar |
| Session-state completion | Dossiê pronto; sem voto novo | Par independente sobre corpo e fontes |
| 4 L1 históricos de Tools | Dossiê pronto; sem aceite | Julgar exatos e corrigir só achados |
| 3 complementos de Tools | Produzidos e incorporados | Julgar corpos e alcance das leituras |
| 4 L2 Bibliotecas | LLM aceito pelo par; outros em avaliação | Resolver achados pontuais e colher ambos votos |
| R2 de Bibliotecas | Parcial | Fornecedores Core/Tools aceitos, sem inferir host de tipos |
| L2–L4 restantes e união | 11 obrigações fixadas | Autoria somente após predecessores obrigatórios aceitos |
| Auto/API prepare completo | PASS operacional nos dois pacotes | Novo binding próprio pelo par |
| Publicação/index/read/consumidores/manutenção | NOT_RUN neste checkpoint | Executar portas originais após binding exato |
| Critérios50/gates/payload/selo/readback | Pendente final | Auditar obrigações e executar guard no payload final |

Tools preservou os424 paths e acrescentou70 leituras atribuídas:68 intervalos de fonte e2 contratos históricos, com58 paths antes not_read. O restante conserva disposição e profundidade declaradas. Não há alegação de leitura semântica integral das424 fontes. Fragmento bruto, pedidos, resposta,115 capturas, manifests e mapa estão em `producers/tools-complements/`; normalizações estritas do pacote estão registradas em `selected/tools-complements-transport.json`.

## Release S4 e execução operacional real

Release `20261128-s4-runtime-db9b423-prepare-v1`, commit `e171783482d0a44974d6056cd9e144a7e33406a7`, candidato `db9b4235022c4df32fe3bfd4faeea8adcd69abb7`, árvore `3c93c4636c1e4c4b704f8be9314e22b2149e5609`. A cópia exata do release tem SHA `2922f769ea2b533d06748a4c10471b19deba3fd0c41b8f1bf7930512eaa75af1`. Input limit atual2097152, distintos dos limites históricos256000. Binding/publicação/consumo do domínio continuam obrigações próprias.

Os runs originais de Actions `46117651547` e `46119396443` prepararam Auto12/694inputs e API16/354inputs. A reexecução preservou `prepared.json` byte a byte e exportou todo CAS. Auto89objetos/796verificações e API68objetos/439verificações, incluindo22members; kernel e observer originais confirmaram todas identidades, sem modificação do runtime.

- Auto candidate `0ff5e4144f7ec153a51ca9615b233219a3ec0bf83b4ee62593921646e64bcb56`.
- API candidate `efb8558f751e8e4c4926eec2b736eadc3948230ad368023f5e5d19130b6faac8`.
- Contrato `3503d5acc84be88be7ec60ed768745bb7d75c9121c62597d9c51788df0af6bc3`.

`operations/native-46119396443/` preserva ZIPs originais completos, hashes, inventário CAS, recibos e checks; os arquivos extraídos são cópias de conveniência. Materialização usa worktree Git completo no baseline, fontes/refs capturadas por commit/blob/hash e raízes estáveis. `.atlas` rastreado no baseline foi preservado em quarentena fora da raiz operacional; nenhuma autoridade/projeção anterior foi adotada.

Tentativas falhadas continuam em `operations/native-46116866804`, `native-46117489765` e `native-46117597283`. A primeira foi uma pré-condição excessiva da ponte sobre `.atlas`; as seguintes omitiram o build workspace e falharam ao resolver `@atlas/knowledge`. Corrigidas pela ponte e por `bun typecheck` no setup. Não são defeitos de tamanho do runtime nem PASS retrospectivo.

O guard original passou no run `46114864667` para API `d81a973d98ebe9b1f6db779bfc78af5152f14041` e S1 `234552a3c9deb058dcba3714a8013abf52045d4c`, base `origin/dev` observada `3aaa5e0645f99940b66ee90d28aef93166f09ab1`. ZIP histórico1339105bytes recuperado e verificado. Esses recibos não aceitam alterações posteriores; haverá guard no payload final.

## Autoridade e limites

Somente a principal escreve na própria branch, com lease e `force:false`. Todos os comandos de produto foram executados em Actions; processamento local limita-se a captura, comparação, hashes, transporte e montagem. Sem merge, landing, ativação produtiva ou aprovação global. Policy/actor do baseline não servem de autorização nova. Provas comuns S4 serão reutilizadas somente no alcance do release, sem reexecutar a suíte comum por domínio.

Aceite semântico, binding, publicação, consumo, manutenção, CI e aceitação global são estados separados. Tokens, tentativas físicas e cobrança não expostos permanecem UNKNOWN; história financeira GLOBAL_UNRECONCILED. Um selo final só será criado após esgotar obrigações próprias executáveis e registrar qualquer bloqueio material com operação, prova e condição exata de desbloqueio.
