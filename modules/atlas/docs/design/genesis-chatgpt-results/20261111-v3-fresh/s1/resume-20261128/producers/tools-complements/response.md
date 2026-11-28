# Entrega L1 — S1-02 Ferramentas

Três complementos independentes estão prontos para revisão e integração pela coordenação. As quatro bases históricas permanecem inalteradas e sem aceite presumido. Não produzi L2, L3 ou L4, não executei produto/provedor/testes e não fiz escrita remota, commit, merge ou declaração de aceite.

## Corpos exatos

| Chave | Arquivo em `bodies/` | Bytes UTF-8 | SHA-256 |
| --- | --- | ---: | --- |
| `s1.subslice02.tools-security-completion` | `tools-security-completion.md` | 14338 | `12c5f838030d624ba23071adefabbee9a317c6f6191a693a825a8d2c38f2ceb8` |
| `s1.subslice02.extensions-completion` | `extensions-completion.md` | 12114 | `ba632793c4d1843e5c71baa6e342cd18641fb5a1e600d64085fa1f41f6030f43` |
| `s1.subslice02.capability-completion` | `capability-completion.md` | 16742 | `cf6c36fde73bb6c191cb4d8e7b3bf82b121009b3390c16b1941667c1d40dac89` |

Todos têm layer `1`, need `component` e scope `orchestra.s1`. O fragmento vincula os corpos ao destino autorizado `modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/resume-20261128/producers/tools-complements`; a coordenação copia os arquivos de `bodies/` para os filenames desse destino. Os demais arquivos mantêm seus caminhos relativos. As refs usam `payload_path` e SHA-256; não foi inventado commit nem identidade de runtime.

## Delta útil

Ferramentas/segurança distingue declaração tipada, catálogo sob demanda e autorização de efeito; compara write/edit e as limitações de mutação física; separa perda do produtor, limite genérico e Lean. Registra que o gate de completude da projeção sem perda não é repetido pelo estágio de resumo e que recall não recompõe bytes descartados pelo produtor.

Extensões acrescenta leitura de admissão SDK, lifetime de hooks, falha de ativação e OAuth. Separa credenciais salvas de transporte/fluxo pendente em memória e evita prometer restauração da ativação anterior ou rollback de efeitos externos. Agentes e skills permanecem conteúdo/política sob o host correspondente.

Capabilities acrescenta fonte dos frames emitidos, provas persistidas, gates repetidos junto ao efeito, schema/descritor e MCP nativo. Distingue intenção, ACK, materialização e resultado remoto desconhecido; lê fronteiras de artefatos, processos, schedule, runtime e mídia sem atribuir algoritmo a vendors/engines não lidos.

## Cobertura honesta e evidência

`coverage-424.json` conserva os 424 registros originais: 81 Tools, 51 Security, 122 Extensions e 170 Capability. A leitura histórica permanece {"semantically_read_decisive_ranges": 27, "captured_targeted_orientation_only": 3, "not_read": 394}. O delta registra 58 caminhos antes `not_read` com leitura nova. A classificação atual é {"not_read": 354, "decisive_source_ranges_read": 68, "historical_contract_read_as_intent": 2}.

`source-manifest.json` contém 115 capturas exatas, incluindo dependências; 106 pertencem aos 424 caminhos. Todas foram comparadas por Git blob e SHA-256 com a captura verificada, o mapa público ou a resposta GitHub fixada. `reading-confirmation.json` conserva 77 caminhos confirmados, incluindo documentos de controle/intenção e dependências, separando intervalos lidos de captura. Logs de output solicitado não foram automaticamente promovidos a leitura: as ocorrências truncadas estão identificadas e as releituras pertinentes preservadas.

`need-disposition.json` explica por que cada um dos três corpos era necessário e mantém os ensaios M1/M2 e consumidores como `NOT_RUN`. Folhas, testes, fixtures, documentos e conteúdos não lidos conservam obrigações explícitas; não há claim de que o censo de 424 fontes é compreensão integral.

## Arquivos de fechamento

- `native-package.fragment.json` e `artifact-metadata.json`: três metadados L1 com body/source/recipe/request/response bindings.
- `request.txt`, `response.md`, `recipe.json`: pedido real, esta resposta original e método efetivo, com uso/cobrança `UNKNOWN`.
- `source-manifest.json`, `reading-confirmation.json`, `coverage-424.json`, `need-disposition.json`, `historical-candidates.json`: identidade, delta e limites.
- `inputs/` e `input-manifest.json`: cópias exatas do contrato/projeções públicas e protocolo.
- `sources/` e `evidence/`: fontes e recibos originais; apenas processamento nativo de arquivos/dados/hashes.
- `verification.json` e `handoff-manifest.json`: conferência estrutural/bytes e mapa de entrega, sem significado de aceite semântico ou gate de produto.

Incidente de isolamento registrado: um status de `list_agents` expôs incidentalmente revisão de S1-01 runtime; não era oracle de Ferramentas, foi reportado e não usado. O filho de extensão iniciado antes da instrução de seguir solo foi interrompido e não forneceu conteúdo consumido. Não li oracle S1-02, respostas esperadas ou arquivos de pareceres.

Restam à coordenação integração/selagem, dois juízos independentes e somente depois os níveis seguintes e consumidores reais. Não há lacuna de acesso às fontes citadas. Limites operacionais/vendor/OS e fontes não lidas permanecem explícitos nos corpos e na cobertura.
