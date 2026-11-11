# Complemento L1 A concluído

A revisão `a-l1-evidence-v1` está pronta em `/workspace/scratch/2b46fb541868/genesis-s1/revisions/a-l1-evidence-v1`. Os **151 arquivos originais, incluindo os 17 corpos congelados, permaneceram byte a byte inalterados**. Nenhum artefato L2–L4 foi criado e nada foi enviado aos juízes.

## Projeção de cobertura e necessidades

O complemento reconstrói exatamente os **1.441 registros** de cobertura a partir de **164 grupos**, preservando as **109 justificativas originais**, os **33 registros de família** e os campos completos dos **17 artefatos**. Os campos `need`, `gaps`, `input_keys`, `validity` e `build_dependencies` foram comparados ao congelado. As explicações novas sobre fronteiras, leituras obrigatórias e usos dependentes bloqueados estão identificadas como explicitações desta revisão, sem alteração retroativa de classificação.

As **1.340 entradas não lidas individualmente** mantêm esta disposição:

| Profundidade original | Entradas | Limite preservado |
| --- | ---: | --- |
| `representative_family_boundary` | 599 | Implementações substantivas sem aceite de leaf; leitura obrigatória quando a necessidade depende de seu comportamento. |
| `grouped_validation_inventory` | 584 | Testes, fixtures e suporte identificados; nenhum resultado executado inferido. |
| `grouped_history_contract` | 72 | Migrações históricas retidas como contrato de dados, com leitura de predecessors quando pertinente. |
| `grouped_vendor_boundary` | 27 | Autoridade upstream distinta; internals, licença e atualização não validados pela fronteira do host. |
| `grouped_documentation_disposition` | 26 | Documentos e história retidos; títulos e status não viram prova de implementação ou qualificação. |
| `grouped_support_contract` | 28 | Prompts, pins, scripts, assets e configuração preservados como inputs sensíveis a mudança. |
| `grouped_generated_contract` | 4 | Gerados vinculados a dono/geração; manutenção exige os inputs e comparação pertinentes. |

Os sete arquivos capturados apenas para orientação continuam com esse status histórico. A família `util`, sem leitura própria de suas 25 implementações, não recebe autoridade comportamental por agrupamento. Se uma questão obrigatória L1 depender desses arquivos ou de outro leaf não observado, a lacuna permanece obrigatória no ponto correspondente.

Os usos de fontes compartilhadas também estão explícitos: o destino de inventário de um caminho é distinto dos artefatos que efetivamente o citam. A revisão não inventa chaves de dependentes L2–L4 nem edges de build. Nenhum dependente é liberado por esta projeção.

## Evidência complementar

Foram acrescentados **96 spans exatos**, ligados a todos os **17 keys**, usando **58 fontes já capturadas** no pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`. Os arquivos reutilizados somam **745.095 bytes**; seus Git blobs, SHA256 e tamanhos foram novamente verificados. Os trechos acrescentam **2.355 linhas de fonte ausentes da projeção compacta original**, sem buscar fontes remotas novas.

O complemento cobre as decisões materiais que precisavam de contexto adicional: retry histórico e promoção, transação de migração/evento, ordem de contexto, decoding dinâmico versus canônico, limitação de output, regras de Session versus autorização ordinária, wrapper de Bash, trust, checkpoints, lifecycle de plugins, autoridade persistida de capability, claims de scheduler, identidade de pesquisa, limites opcionais de processo e fronteiras do adapter de modelo/economia.

Os conflitos anteriores permanecem visíveis: regras da Session por caminho, documentação antiga de Bash, fan-out de rejeição de permissões versus guia, e alcance de leitura binária. Limites do MCP nativo descritos no README continuam **intenção normativa**; esta revisão não os transforma em implementação ou qualificação executada.

## Arquivos principais e hashes

Todos os caminhos da tabela são relativos ao diretório da revisão informado acima.

| Arquivo | Bytes | SHA256 |
| --- | ---: | --- |
| `coverage-needs-projection.json` | 726892 | `05485c4bd0ac9c76814e44537788818bbcf1fbcbfb87dd8063ce30bf1a67e0cf` |
| `coverage-needs-projection.md` | 89146 | `ef88933d09278c75669906cd45cbe43df5aa205ee7dea71ca64a6fafce609658` |
| `needs-and-blockers.json` | 30815 | `6e6b424cbe58b1a324dd0b47efb9b5a4bc118f83d62693df85107f3081922e76` |
| `supplement-evidence.md` | 190745 | `967b10123d15afe63d83a9e5f1189d0b8044b79609ed7548691c6397592be7c9` |
| `supplement-excerpt-map.json` | 112526 | `e6916f979540bc619ba82ff07d7d093673aade1d81d90278006b3a48cc2ec48c` |

O diretório também contém `deterministic-source-observations.json`, `original-freeze-before.json`, `request.txt`, `request-steering.txt`, `revision-manifest.json`, `verification.json`, `checksums.json`, os três scripts reproduzíveis `build_projection.py`, `build_excerpts.py`, `seal_revision.py`, e esta resposta preservada em `response.md`. O ledger `checksums.json` registra os hashes finais dos arquivos da revisão sem autorreferência.

## O que foi verificado e o que permanece aberto

Resultado: **`PASS_EVIDENCE_BINDINGS_ONLY`**. Foram verificados round-trip integral da cobertura, exatidão de famílias/artefatos/needs, preservação dos originais, hashes Git/SHA256/tamanhos das 58 fontes, comparação byte a byte dos 96 fences com seus spans e binding dos 17 corpos. O manifesto foi parseado para confirmar 437 exports explícitos, sem export `.` nem wildcard; isso foi processamento de evidência, não execução de código do produto.

O `artifacts.json` original conserva SHA256 `528eaae032b21708a9a55ef027bd7449b6e29d0c9881f26d84b16d58805a67e7`. O dossiê-base da principal é referenciado pelo hash fornecido `cf7676f527067c7b2aa3fc4bd0d4629e8fa2afa5b843ddc70f857dacc0abffbc`; seu conteúdo não foi lido nem seu hash verificado localmente por este produtor.

Não houve leitura de oracles, avaliação semântica pelo produtor, envio a juízes, execução de produto/testes/providers/runtime, escrita remota ou nova captura remota. A suficiência semântica do L1, as lacunas de comportamento não observado e a liberação das camadas posteriores continuam sob os pareceres independentes e a coordenação da principal. Tokens, tentativas físicas e cobrança permanecem `UNKNOWN`.
