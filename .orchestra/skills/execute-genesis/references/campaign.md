# Campanha paralela: alcance, critérios e coordenação

## Identidade e decisão vigente

| Campo | Valor |
| --- | --- |
| Repositório | `gustavomhss/hugr-orchestra` |
| Campanha lógica | `20261111-v1` — o ledger não reinicia |
| Protocolo ativo | `parallel-v2` |
| Epoch de resultados | `20261111-v2-parallel` |
| Baseline de investigação | `1cde2ff7a71bcf7aecb5d030917b577165135d38` |
| Árvore baseline | `a522a53e5f046f1758151b0f558531bbded04592` |
| Escopo autorizado | Orchestra inteiro |
| Execução | Cinco conversas ChatGPT, por domínio, com subagentes nativos |
| Julgamento local | Dois juízes independentes persistentes em cada conversa |
| Integração final | ROOT, na conversa original, com par independente próprio |
| Branch de integração | `genesis-chatgpt-final`, criada ao iniciar a integração |

O proprietário ampliou o piloto para o Orchestra inteiro e pediu cinco fatias para
execução aqui. Após a divisão inicial por fases causar espera, pediu paralelismo;
em seguida atribuiu expressamente a integração final ao assistente da conversa original.

Este protocolo substitui a atribuição por fases dos commits
`2689c516d63488be37de678cc853dd4556fd5c13` e
`cb26a0a16f5f4212553aaecb03a0dfcc1a5f098e`: cada sessão passa a produzir e julgar um
domínio completo. Substitui a liberação global de S1, quotas exclusivamente de
preparação, o par central de S5 e a atribuição de integração a S5. O trabalho já
realizado, as incertezas e as obrigações de evidência permanecem preservados.

Os prompts antigos fixavam commits antigos: uma atualização de branch não altera
automaticamente uma conversa. Aplicar a continuação explícita do kit novo em cada
uma, mantendo seu número, branch e histórico. Não abrir cinco campanhas duplicadas.

## Fontes normativas

Consultar no baseline os documentos de `modules/atlas/docs/design/` abaixo.
Não copiar todo o histórico para cada agente; abrir a fonte de cada afirmação exigida.

| Fonte | Obrigação preservada |
| --- | --- |
| `genesis-ownership-plan.md` | GO-A1..7, GO-I1..8, AC-01..10, CC-1..7, SC-1..5, QS-1..6, DOD-1..7 |
| `genesis-global-completion-plan.md` | G0..G6 e distinção entre plano, execução e aceitação |
| `genesis-campaign-reconciliation.md` | Preservação, obrigações e limites dos aceites históricos |
| `genesis-recovery-worklist.md` | Requisições, respostas e obrigações originais imutáveis |
| `genesis-ownership-judges.md` | Independência, identidade exata, decisões e revisão de deltas |
| `genesis-ownership-seats.md` | Necessidades dos níveis e contratos de produção anteriores |
| `genesis-economy-control-contract.md` | Reserva, tentativas, liquidação e garantias efetivas |
| `genesis-update-plan-contract.md` | Dependências, afetados, comparação e rebuild |
| `genesis-landing-plan.md` | Revisão, objetos protegidos, entrega e ativação |
| `AGENTS.md` e skills Atlas aplicáveis | Arquitetura, governança, geração e verificações reais |

As decisões atuais substituem o piloto restrito, o provedor/roster histórico e a
coordenação serial somente no trabalho novo autorizado. Não substituem limites
reais de capacidades, evidência, testes, autoridade ou gastos externos.

Preservar a fila M1 aposentada, as obrigações J1/R3, respostas ausentes, uso físico
histórico desconhecido, disposições de PRs #1291/#1300/#1302 e recursos retidos.
Não reexecutar mineração antiga para inventar comparação econômica. Uma aceitação
L1–L4 histórica é um candidato a reúso compatível, não aceite do repo inteiro.

## Cinco domínios já atribuídos

A autoridade mecânica é [parallel-partition.json](parallel-partition.json), com
87 regras de arquivo, 99 prefixos e fallback S5. Resolver por arquivo exato,
prefixo de diretório mais longo e fallback, nessa ordem. Não usar similaridade.

| Sessão | Domínio | Entradas Git no baseline |
| --- | --- | ---: |
| S1 | Core, sessões, modelos, API e SDKs | 2.236 |
| S2 | Desktop, web, shell de aplicação, UI, session-ui e TUI | 4.506 |
| S3 | Maestro, Relay, especialistas, adapters e integrações | 4.553 |
| S4 | Atlas, continuidade, RAG e Genesis | 2.220 |
| S5 | CLI, Omni, distribuição, infraestrutura e contratos transversais | 927 |
| Total | União sem sobreposição ou caminhos não atribuídos | 14.442 |

Essas contagens são responsabilidade de inventário, não esforço nem profundidade
semântica. Fixtures, testes, assets, traduções e terceiros devem receber classificação
explícita; um gerador pode representar sua saída com justificativa verificável.
Novos commits de fonte exigem recenso e novos hashes para fechar o escopo afetado.
Arquivos da campanha são metadados de execução; não ampliar recursivamente o universo
de mineração a cada recibo novo. Mudanças reais de produto continuam sendo inputs.

Cada conversa congela seu inventário semântico finito, relacionando necessidade,
artefato exigido, evidência, autoridade, lacuna, casos, critérios e fronteiras.
Nenhuma precisa esperar um inventário semântico global de S1. Todas podem ler
qualquer fonte do mesmo baseline para entender interfaces com domínios vizinhos.

Os domínios definem responsabilidade de produção e de mudanças necessárias, não
um veto de leitura. Mudança fora do próprio domínio é uma proposta ao proprietário;
não impede trabalho independente. Estados Atlas experimentais e namespaces são
separados. Escritas no store servido continuam governadas.

## Sequência dentro de cada domínio

Cada sessão realiza, com seus próprios limites e juízes:

1. Inventário e necessidades finitos; oracle independente e limites de consumo.
2. Base verificável L1; consolidação do conjunto obrigatório local e dois juízos.
3. L2 de entendimento local, L3 integrado e L4 operacional, cumulativos; a camada
   anterior local deve estar aceita para sustentar seus dependentes.
4. Correções, consumidores e provas de construção, reúso, manutenção, recuperação,
   leitura, host, preservação e economia aplicáveis, com evidência do runtime exato.
5. Handoff imutável para ROOT, distinguindo produção, semântica e provas operacionais.

Essas sequências correm em paralelo. Não existe ordem de início 1→2→3→4→5,
aprovação inicial de ROOT, nem barreira de camada global antes de outra fatia avançar.
Uma necessidade transversal pode ler código no pin, declarar a evidência de fronteira
e produzir sua parte agora. Não pode inventar conhecimento ou aceite ausente do vizinho.
Falta crítica de uma dependência retém seus artefatos e claims específicos.

O importer genérico e alguns caminhos operacionais ainda precisam de implementação
real. S4 assume a adaptação mínima Atlas e o reaproveitamento das propostas v1;
S1/S2/S3/S5 continuam produzindo e revisando conhecimento. Quando o candidato existir,
cada sessão o fixa para seus controles. Documento revisado não prova importação,
consumer Atlas, cache, rebuild, recuperação ou CI. Ver [runtime](runtime.md).

## Todos os critérios continuam atribuídos

[criteria.json](criteria.json) registra os **50 IDs** normativos, sua fonte, a
disposição local exigida nas cinco sessões e o proprietário global ROOT. Cada
sessão registra separadamente `local_obligation` e `local_status` (`PASS`, `FIX-FIRST`,
`HOLD` ou `NOT_APPLICABLE` justificado), com evidências. O campo `global_complement`
nomeia a obrigação exclusivamente global e pode usar `DEFERRED_TO_INTEGRATION`, com
dependência e ROOT como dono exatos. Isso nunca adia importer, consumidor, CI ou
outra prova local. Uma disposição local não altera o requisito global; ausência
de prova nunca vira `NOT_APPLICABLE`.

| Critério | Evidência local em cada domínio | Complemento da integração ROOT |
| --- | --- | --- |
| AC-01 | Caminhos, necessidades e artefatos cobertos; suficiência julgada | União completa, fronteiras e necessidades transversais |
| AC-02 | Consumidor Atlas-only: mudança, violação, impacto, falha e abstenção | Casos que cruzam domínios sobre a união exata |
| AC-03 | Índice/leitor reais; uso raso, profundo e intermediários diretos | Navegação integrada e limites sem mistura de versões |
| AC-04 | Produção nativa registrada e ingestão/construção reais; fixtures rotuladas | Adapter S4 realmente exercitado com os cinco domínios |
| AC-05 | Cache hit sem interpretação nova e reúso com identidade correta | Identidade/autoridade/gaps e independência entre domínios |
| AC-06 | Edit/add/remove/intent-doc/recipe; afetados esperados e rebuild | Propagação transversal e controles de aresta/input ausentes |
| AC-07 | Interrupção/retomada, coerência, HOLD, histórico e rollback aplicáveis | Geração integrada, concorrência e compatibilidade real |
| AC-08 | Plano lógico, reservas, tentativas, uso e garantias observadas | Ledger único reconciliado; garantia AC-08 demonstrada ou aberta |
| AC-09 | Gates e leitores reais; escopo de CI e proteção distintos | Isolamento entre domínios e corrupção compartilhada |
| AC-10 | Objetos preservados, migração, geração e recusa de produtor antigo | União preservada, migração e rollback do candidato integrado |
| CC-1..7 | Inventário, níveis, utilidade, ciclo, coerência, economia e compatibilidade | Evidência completa e vínculos coerentes das cinco fatias |
| SC-1..5 | Casos fixos, limites de leitura, incremento, economia e consistência | Mesmos requisitos nos fluxos transversais |
| DOD-1..7 | Decisões, invariantes, execução, gates, uso e handoff explícitos | Revisão global, aceite do dono e entrega governada |

Todas as sessões aplicam GO-A1..7, GO-I1..8 e QS-1..6. A implementação compartilhada
do Atlas pertence a S4; provas de uso continuam pertencendo aos domínios que as
alegam. ROOT integra, mas não substitui as evidências locais por autoavaliação.

## Execução econômica sem barreira inventada

Cada sessão dimensiona antes do lote um plano finito que inclua ambos os juízes,
produção, consumidor, correção e retomada. O ledger é um log particionado da mesma
campanha; ROOT reconcilia IDs, uso, reservas e mudanças de plano. Não há escritor
concorrente editando um contador global nem dependência de S1 para autorizar lotes.

Preservar o bootstrap-v2 de 48 unidades e suas revisões como história; registrar
explicitamente o sucessor local e carregar tentativas incertas/em curso. Não
reabrir reservas incertas como saldo, nem afirmar que a simples criação deste kit
mudou cobrança ou garantia do host. Não há autorização de chamadas pagas externas.

Um controle lógico de tarefas e o registro de uso nativo não provam, por si,
o contrato financeiro do adapter. AC-08 e CC-6 continuam abertos onde a garantia
exigida não é observável/enforceable. Isso não retém trabalho nativo independente
já autorizado, desde que suas limitações estejam descritas sem falsa conformidade.

## Integração e conclusão

ROOT trabalha na conversa original e na branch `genesis-chatgpt-final`, após
receber os handoffs. Usa `20261111-v2-parallel/integration/`, seu par de juízes
independentes e [integration.md](integration.md). S5 não concentra os juízes nem
aprova outras sessões. Cada uma pode concluir seu domínio no próprio ritmo.

ROOT pode inspecionar entregas à medida que chegam, mas só declara a união pronta
depois de cobertura, compatibilidade, consumidores, gates e decisões sobre os
commits selecionados. Não presumir que soma de cinco PASS produz PASS global.

Trabalho nativo, ambiente isolado, adaptações necessárias e commits nas branches
atribuídas estão no escopo. PR/merge, ativação em produção, gastos externos,
credenciais e exclusão de histórico não são efeitos colaterais autorizados.
Seguir a política de testes do repositório; falta de dispatch afeta o gate exato.

`DELIVERY_COMPLETE` descreve a fatia após todas as suas obrigações locais, sem
esperar o aceite humano da união. `GLOBAL_REVIEW_READY`, aceite do proprietário,
landing e ativação são estados distintos. A conclusão global depende dos seus
próprios critérios, inclusive os humanos. Uma capacidade faltante recebe evidência
e próximo passo, não uma conclusão fictícia.
