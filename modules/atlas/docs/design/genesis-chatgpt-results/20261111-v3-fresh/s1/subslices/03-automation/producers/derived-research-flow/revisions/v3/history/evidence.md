# Evidências — s1.subslice03.research-flow

## E0. Identidade e autoridade do predecessor

A única autoridade semântica de construção é `s1.core.research`, L1/`component`, em `producers/research/body.md`, **63.841 bytes**, SHA-256 **`f6e3fe95e3db7adab59087b780fb232ae62cc7a2ba83623d355bcbad250b431f`**, blob Git recalculado **`72bdc55fdf2dbda97e84c87111be73fa49aceeb4`**. A fonte investigada por esse L1 é `1cde2ff7a71bcf7aecb5d030917b577165135d38`; este produtor L2 não abriu essa fonte bruta, os captures, coverage ou evidence do L1.

A receita congelada `payload/recipes/derived/research-flow.json`, 8.423 bytes, SHA-256 `543c6045bfb145c0db4b2779b12c96c140ff20198c408357c7d84bcf0a7f71e1`, declara que `parallel-v3-fresh/S1-03/J1` e `parallel-v3-fresh/S1-03/J2` aceitaram esse mesmo corpo. As respostas originais são identificadas na receita por `e52fc2d9eb369da417d7ea035ec641839ca4714be9f75b4b0f2ac4bab35e3cc7` e `8dd9f7ae58de3cda63482558e2940931b185a644bcbd8cafd0b7d5463ea835c6`. São referências de proveniência fornecidas pelo gate; os pareceres integrais não foram lidos. Nenhuma decisão L2 é atribuída aos juízes por este autor.

O body do predecessor foi consumido integralmente em duas exibições contíguas, linhas 1–230 e 231–378. As referências abaixo apontam às seções desse arquivo exato, sem fabricar linhas de código ou substituir sua autoridade por referências externas.

## E1. Mapa das afirmações e qualificações

Todas as linhas desta tabela usam a chave e o SHA-256 de E0. “Observação” significa observação estática relatada no predecessor, não execução desta produção. “Inferência” é consequência delimitada desses mecanismos.

| Trecho L2 | Afirmações abrangidas | Seção exata do L1 | Natureza e limite conservado |
| --- | --- | --- | --- |
| F0 | Ciclo de aquisição/índice/evidência; fonte fixada; ausência de execução no predecessor | R0. Resultado, autoridade e navegação | Observação e limite; aceitação anterior vem da receita, não da autoavaliação do L1 |
| F1, abertura | Ownership Core/pack; research reutiliza interface; fit não autoriza execução | R1. Quem possui o ciclo e o que um manifesto promete | Observação/intenção distintas; fronteiras externas não são apropriadas |
| F1, estados e prepare | ensure, dependências/ciclos, cinco estados, prefetch, espera 60 s versus aquisição 30 min | R2.1 Estados e ordem de aquisição | Observação; retorno não é sucesso coletivo |
| F1, concorrência/cache | Coalescência local, cooldown cinco minutos, staging, marcador e ausência de reparação automática | R2.2 Concorrência, staging e diagnóstico | Observação; marker não rehasha cache |
| F1, readiness e targets | Dependências/runtime/executável/shim; ready e cross-target não qualificam uso real | R2.3 Readiness é uma conjunção; R2.5 Targets e floors | Observação e limites |
| F1, receitas/guards | Locks, versão, runtime, hospedagem; npm scriptless não offline; OpenAPI e Cassandra têm condições próprias | R2.4 Hosted e seus pré-requisitos; R3. Receitas concretas e inputs de aquisição; R4. Guards de versão e compatibilidade Cassandra | Inferência de seleção fundamentada; detalhes são navegação ao L1, sem execução alegada |
| F2, adapter/warm | Default indisponível, pack ausente, empty plan ambíguo, detached/deduplicação, rank por contagem e filtro estrutural | R5. Orçamentos, planning e prewarm de pesquisa | Observação; estado auxiliar best effort não certifica cobertura |
| F2, identidade | Chave indexer/shard/path/blob/config/lock, projetos/órfãos e source_unavailable | R6.1 Partição e chave | Observação; HEAD não é toda a identidade |
| F2, construção/store | Shards ausentes, singleFlight, progresso vazio, arquivo versus saúde, retenção com newest acima do budget | R6.2 Planejamento, build e retenção; R5. Orçamentos, planning e prewarm de pesquisa | Observação; lock de indexer é o caminho do toolkit descrito em R5 |
| F2, plataforma/conteúdo | Linux/Darwin, fallback Go/Rust condicionado, nenhuma disponibilidade universal, worktree não congelado | R6.3 Extração real e sua base | Observação; digest do texto lido não prova igualdade a todos os blobs do HEAD |
| F3, query/stale/dirty | Build condicionado a extrator presente, construção necessária e nenhum build em curso; building/unavailable não comprova novo disparo; retido stale, basis do plano atual, overlay limitado, candidates e limites de cobertura | R8.1 Query: vazio, stale e dirty; qualificação pública RF-J2-F01 | Observação; ausência de hit não prova ausência de uso |
| F3, relações/opacidade | Callers/callees não demonstram runtime; ranges/encoding; opaque false persistido | R7.2 SCIP, encoding e associação de ocorrências; R8.1 Query: vazio, stale e dirty | Observação e inferência limitada; zero opaqueSites não certifica cobertura |
| F3, search/locate | Worktree atual, falhas e bounds, fallback lexical, semantic absent, range verificado e exceção de 33 consultas | R8.2 Busca e localização | Observação; ranking não é prova de completude |
| F3, liveness | LIVE/UNKNOWN/LIKELY_HALLUCINATED, helper allowed e fronteira DNS/rede | R8.3 Liveness de URLs | Observação; classificação não julga verdade/fabricação; nenhuma URL consultada |
| F4 | Runner fechado, snapshots/dependências, timeouts/caps/host, verdict e guard; retorno não debita/admite | R9.1 Runner, snapshot e processos; R9.2 Resultado e limites de enforcement | Observação; intenção de teste não é execução e serviços externos exigem evidência própria |
| F5, identidade | Session/task/agent/authorSession, CapabilityInvocation, parte persistida, revalidação e leitura entre tasks | R10.1 Quem pode produzir e reler | Observação; declaração textual não é binding |
| F5, orçamento | Bind idêntico, charge/replay/conflito, dimensões, reserva irreversível, reconciliação e incerteza | R10.2 Allowance e reconciliação | Observação; efeito transacional externo não apropriado; consequência de causalidade é inferência |
| F6, aquisição | Pedido antes de live, replay finalizado, tentativa incerta, SourceAttempted e nova tentativa nativa | R12.2 Aquisição e tentativa: retry visível | Observação; tentativa não equivale a fonte admitida |
| F6, custódia | Manifest/receipt/evento/binding/digest; arquivo antes do evento, falta/corrupção sem fetch substituto | R11.1 Source artifact e evento de admissão | Observação; custódia e admissão permanecem distintas |
| F6, captura/páginas | Metadata complete, derivedFrom/transformation, atlas-own, replay sem check de arquivo, UTF-8, cursor, parcial/binária | R11.2 Representação, paginação e fonte parcial | Observação; fim dos bytes não completa fonte parcial |
| F6, locator | Leitura integral retida, lines/blocos Locate, quote, JSON pointer, razões de recusa | R11.3 O que um locator valida | Observação; endereço e identidade não provam proposição nem concedem autoridade ao texto |
| F7, records/publicação | Evidence/contrary, findingRefs, CAS de revisão, intent, evento exato, erro/efeito e citações | R12.1 Revisões e documentos | Observação; parser de citações não emite aceite semântico |
| F7, corpus/views/inquiry | Três eventos do corpus, limites e cursors, inquiry/dispatch, disciplina de abertura e fechamento atual | R11.1 Source artifact e evento de admissão; R12.3 Views e inquiry; R10.1 Quem pode produzir e reler | Observação; lista de ferramentas não prova capabilities registradas; conclusão final é inferência de leitura |
| F8 | Provas não executadas, dependências externas, 130 fontes/41 testes, L2 limitado e uso desconhecido | R0. Resultado, autoridade e navegação; R13. Disposição das 130 fontes e contratos de validação; R14. Uso, impacto e obrigações ainda separadas | Limites do predecessor e desta autoria; sem autoaceite L2 ou fechamento S1 |
| F8, transporte | Modelina 266.885 bytes versus limite 256.000 do S4 r3 informado | R3.3 Locks, wheels e integridade | Relato delimitado da principal preservado no L1; nenhuma inspeção independente da porta |

## E2. Receita, critérios e fronteiras de camada

O contrato comum efetivo é `payload/recipes/derived-contract.json`, SHA-256 `bcde63f79d8cacd030293da38c580c55c5aa58e0a5ff3751f1d1e27971f17588`. Seu papel L2 é explicar fluxo local e decisões a partir de L1 aceito. O plano `payload/artifact-plan.json`, SHA-256 `6bf70a5c448d65ec3a046aefc0b0b9db2f783dcd8573a2d2ea69487bec7ce9ad`, exige somente `s1.core.research` para este nó. Nenhum irmão, fonte bruta ou nível posterior foi incorporado como input semântico.

As seções F0–F8 oferecem conteúdo revisável para GO-A1/2/3, QS-1/2 e CC-1/3; a separação entre estados e tipos de autoridade preserva GO-A5, GO-I2/7/8. As fronteiras de reúso e identidade em F1–F3/F5–F7 contribuem explicações para GO-A4, sem alegar os ensaios operacionais de CC-4. GO-A6/7, QS-3/4/6 e GO-I1 são atendidos no procedimento delimitado, preservação e hashing descritos, sem nova plataforma. AC-01 e QS-5 ainda dependem do juízo do conteúdo; AC-02/03 e os resultados runtime/consumidores não são certificados por este autor. Isso é um mapa de contribuição, não uma matriz de PASS.

AGENTS, COMMON, mission, SKILL e as seis referências públicas foram consumidos somente como autoridade/procedimento. Seus links a outros arquivos não autorizaram leitura adicional. `derived-public-criteria.json` foi lido integralmente; sua referência à fonte normativa não foi expandida. O manifesto registra a identidade integral de cada input realmente consumido.

## E3. Verificação realmente realizada

Foram comparados tamanho, SHA-256 e blob Git recalculado dos 14 inputs enumerados com a receita congelada; todos coincidiram. Pedido, receita e dispatch são três unidades adicionais, totalizando **17 inputs integrais únicos**. O pedido foi preservado no hash `351e7104bfdbc75075906493ef2db4d3f689d4181f7e621f64e75e6caf31f6ee`. O dispatch exato, sem newline acrescentado, tem 1.511 bytes e SHA-256 `2252f97394d8dbc61fd0e629ce1a16700f8a81bc78673add06985842fc75efcf`.

A primeira exibição agrupada excedeu o limite de saída da ferramenta e truncou a parte intermediária de COMMON; COMMON foi reapresentado integralmente em chamada separada. Nenhuma conclusão dependeu de trecho truncado. Os demais arquivos e o predecessor completo foram expostos integralmente antes da autoria. A verificação de completude de leitura é procedural, não uma prova de isolamento técnico do host.

O body contém nove cabeçalhos depth2 independentes e 16.980 bytes UTF-8. Excede a preferência usual de 6.000–14.000 bytes para conservar as qualificações que alteram decisões entre aquisição, plano/build, stale/dirty, probe, orçamento, custódia e inquiry. Não reproduz o catálogo completo do predecessor. Hashing, UTF-8/JSON e consistência do conjunto de arquivos são verificações determinísticas, sem execução de teste de produto ou julgamento semântico.

**NOT_RUN:** instalação/download de engines, providers/rede, testes/typecheck/guards do produto, Atlas import/binding/publicação/index/read, consumidor independente e manutenção. **UNKNOWN:** tentativas físicas do host, tokens e custo. L3/L4 não foram produzidos; a principal mantém seus gates separados.
