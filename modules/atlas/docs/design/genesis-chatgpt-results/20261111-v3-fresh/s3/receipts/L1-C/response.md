# L1-C produzido para revisão

**Estado: L1_PRODUCED_FOR_REVIEW.** Entreguei o corpo L1, evidência exata para juízes sem ferramentas, fontes, cobertura, achados e pedidos preservados. Esta entrega não é parecer de aprovação nem conclusão da S3.

- Repositório: `gustavomhss/hugr-orchestra`.
- Fonte imutável: `1cde2ff7a71bcf7aecb5d030917b577165135d38`.
- Protocolo: `ee2521a5b966bd505cc95bd1c733e09e12f33531`.
- Execução: `bdac971f-e4ee-40e5-ad9b-30d659303bab`.
- Produtor nativo: `/root/producer_integrations_l1`.

## Correções autorais e revisão pendente

A raiz identificou uma formulação excessiva sobre a precedência dos hooks Dock. O parágrafo de §8 agora explicita que o default prioriza `linux`, mas regras próprias posteriores de outros agentes podem sobrepor os denials inseridos; o perfil `linux` preserva a configuração de `linux`/`dock`. `root-finding-delta-001.md` preserva o pedido e a correção. A versão anterior permanece intacta em `body-v1.md`, com resposta e inventário v1. O trecho E08 já continha o comentário decisivo. Nenhum outro comportamento foi ampliado e nenhum aceite foi presumido.

A correção C002, solicitada pela raiz após FIX-FIRST F1 do segundo juiz sobre v2, explicita WebSocket loopback e token por lançamento, além de Bearer, na Entrada de §8. A citação foi ajustada para incluir o comentário de origem. `root-finding-delta-002.md` preserva o pedido e a alteração; `body-v2.md`, `response-v2.md` e `deliverables-v2.json` preservam a versão anterior. Ambos os juízes reavaliarão v3; esta versão não herda o PASS de v2 informado pela raiz.

## Resultado e alcance

O corpo tem **23.985 bytes**, dentro do teto de 24.000; `review-evidence.md` tem **15.879 bytes** e **39 recortes exatos**, agrupados em E01–E12, com caminho, Git blob e linhas. Os hashes dos recortes foram comparados aos bytes capturados. O texto autoral e os recortes não repetem o literal de label default do backend.

A cobertura contém **429/429 paths únicos**, sem exclusões nem entradas sem disposição: sete macrofamílias, decompostas em 17 famílias. Cada entrada registra família, necessidades compartilhadas, tipo de conteúdo, profundidade, disposição e fontes representativas. Assets, skills, companions, testes, configuração, gerados e histórico têm tratamento explícito.

Foram preservadas **111 capturas bem-sucedidas** via conector GitHub; todas passaram pela recomposição do Git blob a partir dos bytes base64 e pelo cálculo externo de SHA-256. `sources.json` contém **90 fontes efetivamente lidas**: 59 na população e 31 autoridades adicionais de fronteira/protocolo. As 370 entradas restantes da população têm classificação por família, sem alegação de leitura individual; 21 capturas adicionais não lidas semanticamente ficaram fora desse manifesto. Cobertura de membership e hashes não substituem compreensão ou julgamento semântico.

## Achados que importam para a revisão

| Domínio | Entendimento estabelecido | Limite preservado |
| --- | --- | --- |
| Especialistas | Id estável é separado de label/perfil. Assets são consumidos e embarcados pelo framework de seats; backend executa packet e checks atribuídos, archie planeja, discovery pesquisa. | Charters não são detectores automáticos de intenção. Receita e árvore embarcada não comprovam engine pronto, autorização adicional ou aceite. |
| Claude | ExecutionHost mantém a Session Orchestra, preset/contexto e autorização; delegação própria de Claude é recusada e task cria Session filha. Lifetime de processo distingue abort/return de exit. | Gate governado é por Session em memória. Nenhum binário instalado, login, chamada real, retomada ou aceite do fornecedor foi observado. |
| Capability assets | Catálogo/proveniência/presets e skills adaptadas têm autoridade distinta de tool, conexão e disponibilidade operacional. | Pending copied-file digests, dependências/licenças, conformance e live acceptance continuam pendentes no manifesto; reservas provider/native não são implementação. |
| Dock | Hooks diretos e MCP por interface têm controles e consumidores distintos. Ownership, geração de interface e incerteza de dispatch importam. | Ações de resultado unknown não são replay seguro; ACK não é conclusão. Existência do módulo não prova desktop, AT-SPI ou workspace configurado. |
| Janitor | Scanner read-only de disco/processos/portas, scheduler e lifetime compartilhado são código observado; store da UI é outra fronteira. | Não foi demonstrada composição ativa scanner→sink→UI. O módulo e a interface isolados não justificam alegar feature rodando. |
| Discovery e histórico | Host vincula invocação/Session/placement e monta fechamento; duas skills atuais diferem de documentação antiga. | Cards/URLs não comprovam suficiência semântica. Estudos e status antigos mantêm data/revisão; não viram bloqueio atual genérico nem aceite novo. |

`findings.md` preserva os conflitos, a disposição dos critérios públicos e uma fila concreta por componente para a profundidade seguinte, **somente após revisão de L1**. Nenhum L2–L4, skill instalada ou publicação Atlas foi produzido.

## Arquivos e SHA-256

| Arquivo | Bytes | SHA-256 |
| --- | ---: | --- |
| [body.md](sandbox:/workspace/scratch/2c7c4c0ad466/genesis-s3/agents/integrations-l1/body.md) | 23985 | `81685f16fb32aae6958671939413d121e4f5babaf01d3b9565b03a50f7842e8a` |
| [review-evidence.md](sandbox:/workspace/scratch/2c7c4c0ad466/genesis-s3/agents/integrations-l1/review-evidence.md) | 15879 | `3a9fa1ef571e1b80c247e3c42451b3d362949b21f9642a08b10c9db9c5ff944c` |
| [sources.json](sandbox:/workspace/scratch/2c7c4c0ad466/genesis-s3/agents/integrations-l1/sources.json) | 87627 | `3e659688f4bcb86bc957c76f380d6eb3b82f589b001f2ac21d4e1fbc01be762c` |
| [coverage.json](sandbox:/workspace/scratch/2c7c4c0ad466/genesis-s3/agents/integrations-l1/coverage.json) | 438017 | `b206d7a9d970c135c3aca9a0b3531fb22c7ffc14d5a7f4d9fb06e5335ac5dc39` |
| [findings.md](sandbox:/workspace/scratch/2c7c4c0ad466/genesis-s3/agents/integrations-l1/findings.md) | 11958 | `c695a7f4b569c7bf5b99d775277b8813d6be8ba3649e95153e30cff2e7cfe009` |
| [request.md](sandbox:/workspace/scratch/2c7c4c0ad466/genesis-s3/agents/integrations-l1/request.md) | 2487 | `c167f9e4c04fa559f1e6e4271c002a7e03548ad2fc0b7f03faf08ea67bdea7b7` |
| [request-followup.md](sandbox:/workspace/scratch/2c7c4c0ad466/genesis-s3/agents/integrations-l1/request-followup.md) | 700 | `1a6b8d3ed1a53db32a01a6b08598fc8ca3ddeb9b2800a71ed9fbbc2898df044c` |
| [verification.json](sandbox:/workspace/scratch/2c7c4c0ad466/genesis-s3/agents/integrations-l1/verification.json) | 1429 | `b9e5432112281877231684da77b34c7d8577556210c6b7c12266cc308bf2e83b` |
| [review-bindings.json](sandbox:/workspace/scratch/2c7c4c0ad466/genesis-s3/agents/integrations-l1/review-bindings.json) | 11197 | `cbab82feb9267e26727022591e62aed95b48311f1964534763afc39242bfe0e4` |
| [captures-index.json](sandbox:/workspace/scratch/2c7c4c0ad466/genesis-s3/agents/integrations-l1/captures-index.json) | 82458 | `2bddbb08240ae7ecef95698d91231d25d47ec50bcc1ad264c5d100cd68c54b20` |
| [capture-errors.json](sandbox:/workspace/scratch/2c7c4c0ad466/genesis-s3/agents/integrations-l1/capture-errors.json) | 814 | `f604a4b323d81819ff9ef3f428be261676f3bb4ec9694c2e5541b9c3510f6626` |
| [capture-errors-05.json](sandbox:/workspace/scratch/2c7c4c0ad466/genesis-s3/agents/integrations-l1/capture-errors-05.json) | 830 | `aff43c28bd636f76597b5a089f9a3c52e8618d5f840f595a52a2fb8373a26db9` |

Esta resposta está salva em `response.md`. `deliverables.json` registra também o SHA-256 desta resposta, calculado após a gravação, sem autorreferência circular.

## Verificação e lacunas

A verificação executada foi de evidência: bytes, Git blob, SHA-256, igualdade exata dos 429 membros, validade das faixas de linhas, referências representativas existentes, recortes exatos e tetos de tamanho. Não foram executados testes de produto, typecheck, CI, login, fornecedor, desktop ou Atlas. As definições de testes lidas continuam definições, sem PASS novo.

Dois caminhos exploratórios devolveram 404 e estão preservados nos arquivos de erros. Não foram promovidos a fontes nem usados para afirmar ausência da funcionalidade; os contratos efetivos foram localizados nas fontes reais de seat-tools/binding e v2/seats. O produtor não leu oracle, entregas de outros produtores ou resultados semânticos prévios, e não realizou escrita remota. Metadados indisponíveis de tokens, custo e tentativas físicas permanecem UNKNOWN.

Para o julgamento, o payload delimitado é `body.md` + `review-evidence.md`, junto do oracle congelado fornecido pela orquestradora. As capturas brutas são comprovantes locais; o roster completo permanece apenas como captura da fonte original e não precisa ser transportado a um novo path remoto. A decisão de suficiência cabe aos dois pareceres pertinentes da orquestradora.
