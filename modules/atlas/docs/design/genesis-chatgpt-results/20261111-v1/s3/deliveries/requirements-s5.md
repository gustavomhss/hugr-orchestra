# Entrega S3 → S5: integração serial e juízo

## Natureza do pacote

Há preparação técnica, fontes exatas, treze formas de cenário e uma proposta mínima. `candidate_revision` permanece null e `observations/processes.json` contém listas vazias porque nenhum caso foi executado. O pacote não é elegível a aceite de recuperação. A revisão técnica de preparação, se admitida por S5, continua distinta dos dois pareceres vinculantes sobre a execução futura.

## Proposta compartilhada

Base: `1cde2ff7a71bcf7aecb5d030917b577165135d38`, código igual ao protocolo.

Arquivos propostos: `modules/atlas/packages/adapter-io/src/governed-emit.ts` e `modules/atlas/packages/adapter-io/test/ownership-publication.test.ts`. A proposta está em `proposals/rollback-activation-refusal.patch`; seu metadata conserva hashes, risco e check de aplicação. Não foi aplicada em nenhuma fonte do produto por S3.

Antes de integrar, reconciliar com propostas de S2/S4 sobre os mesmos arquivos. Conferir a revisão atual, gates, contrato de preflight e outputs gerados exigidos. Não alterar DEDUP/global routing para fazer o caso passar sem contrato explícito. A recusa proposta não fecha o requisito de rollback compatível.

## Dependências que precisam de decisão concreta

1. S1: scope/closure/controle independente e catálogo definitivos; validar o digest de protocolo do handoff e reconciliar a alocação de preparação.
2. S2/S5: entrada executável que restaure a seleção de completions duráveis, distinguindo resposta sem avaliação, artefato com dependente pendente e candidato aceito sem ativação. O baseline não contém essa API.
3. Publicação: autoridade válida do alvo isolado e manifesto completo com reviews reais. O piloto não é adapter geral nem autoriza trocar reviewers históricos.
4. Verificação: exports reais construídas e runner de testes permitido. Preparação de fontes/imports não é runtime nem CI green.

## Pacote para os mesmos dois juízes

Ambos devem receber os mesmos commits/bytes, a rubrica fixa e todos os critérios aplicáveis. Preservar estes outputs originais, não substituí-los por uma síntese que omita NOT_RUN. Os juízes devem distinguir adequação da preparação, defeito derivado de fonte, reprodução real e recuperação demonstrada. Não se solicita PASS para um candidato ausente.

Na versão executável futura, julgar AC-07 e as contribuições a AC-03/09/10, CC-5, SC-3/5, GO/QS e DoD correspondentes usando respostas reais de leitores separados, completions/reservas antes/depois, ativação/readback, recusas e histórico rotulado. Mudança de candidato invalida apenas os bindings/provas afetados, que precisam ser refeitos e reapresentados aos mesmos dois juízes. O consumo deste pacote e os pareceres ainda precisam de recibos próprios de S5.
