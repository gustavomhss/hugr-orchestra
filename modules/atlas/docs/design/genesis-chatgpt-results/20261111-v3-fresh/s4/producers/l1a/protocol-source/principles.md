# Princípios e critérios que orientam a execução

Usar estes princípios para decidir e verificar. Não criar um documento, agente,
aprovação ou gate adicional para cada item. Cada tarefa herda este contrato e cita
somente os IDs pertinentes; especializar o que muda no seu domínio.

A fonte normativa é `modules/atlas/docs/design/genesis-ownership-plan.md` no baseline
`1cde2ff7a71bcf7aecb5d030917b577165135d38`. As famílias abaixo preservam seus 50 IDs;
o texto original decide detalhes. A autorização atual amplia escopo e topologia,
sem substituir provas por declarações. [Registro](criteria.json).

## Axiomas — como escolher o caminho

- **GO-A1:** entregar entendimento transferível de código e produto: propósito, comportamento, contratos, decisões, impacto e manutenção.
- **GO-A2:** construir cumulativamente; conhecimento intermediário persiste e precisa ser útil.
- **GO-A3:** começar a consulta pelo necessário e aprofundar pelo índice; skills prescrevem ações e quando buscar evidência.
- **GO-A4:** manter conhecimento e fonte juntos; reutilizar o que continua válido e reconstruir os afetados.
- **GO-A5:** separar atualidade, validade semântica e autoridade; Git e gates sustentam essas relações.
- **GO-A6:** mecanizar o determinístico; usar modelos para interpretação, com trabalho delimitado e resultados preservados.
- **GO-A7:** estender o Atlas existente com o mínimo necessário; nenhuma plataforma paralela de conhecimento ou orquestração.

## Quality standards — o que caracteriza uma entrega boa

- **QS-1 Fidelidade:** afirmações rastreáveis; intenção, observação, interpretação e lacuna identificadas.
- **QS-2 Utilidade:** um consumidor consegue agir; instruções claras, contexto suficiente, pouca repetição.
- **QS-3 Simplicidade:** cada mecanismo novo resolve uma necessidade concreta que o existente não atende.
- **QS-4 Engenharia:** respeitar arquitetura, geração, validação de entradas e persistência do repositório.
- **QS-5 Evidência:** verificar implementação e uso reais; os juízes avaliam uma barra fixa, não aperfeiçoamento infinito.
- **QS-6 Economia:** fontes delimitadas, reúso, revisão de deltas e uso reportado honestamente.

## Completeness criteria — o que precisa estar coberto

- **CC-1:** população, necessidades, fontes, lacunas e artefatos exigidos da fatia completamente reconciliados.
- **CC-2:** todos os níveis L1–L4 necessários produzidos, persistidos, úteis e alcançáveis pelo caminho real.
- **CC-3:** propósito, comportamento, contratos, decisões, impacto e manutenção apoiados por conteúdo, não só títulos.
- **CC-4:** construção, invalidação, reúso e atualização pertinentes funcionam de ponta a ponta.
- **CC-5:** publicação coerente, leitura, recuperação e compatibilidade têm provas no escopo devido.
- **CC-6:** execução nova e suas limitações econômicas estão reconciliadas; incertezas antigas continuam preservadas.
- **CC-7:** documentação, skills, gerados, compatibilidade e obrigações históricas têm disposição explícita.

## Success criteria — como reconhecer que funcionou

- **SC-1:** consumidor independente resolve todos os casos obrigatórios de ownership, sem erro crítico e sem redescobrir a fonte.
- **SC-2:** consumo raso e profundo respeita limites definidos para a tarefa; não exige carregar o grafo inteiro.
- **SC-3:** mudanças atingem o conjunto esperado, preservam independentes e não repetem interpretação sem necessidade.
- **SC-4:** construção, avaliação, atualização e leitura têm uso separado; desconhecido não vira zero ou economia inventada.
- **SC-5:** leituras coerentes e recusas dos estados inválidos exigidos são observadas nas portas reais.

## Invariants — o que permanece verdadeiro durante o trabalho

- **GO-I1:** históricos, pedidos e respostas originais são preservados; correções têm identidade e vínculo novos.
- **GO-I2:** conflito de intenção e implementação permanece visível; hash atual não prova interpretação correta.
- **GO-I3:** leitura atual usa versões exatas aceitas e compatíveis; rollback não torna conhecimento stale atual.
- **GO-I4:** input/receita inalterados e válidos reutilizam resultado; link de navegação não é dependência de build.
- **GO-I5:** adição, remoção, código, intenção e receita entram no impacto; falha de observação não é worklist vazia.
- **GO-I6:** despachos, juízes, correções, consumidores e tentativas incertas continuam contabilizados; sem fallback oculto.
- **GO-I7:** portas governadas, fronteiras e segredos permanecem protegidos; texto importado é dado, nunca autoridade executável.
- **GO-I8:** estrutura, hashes, seções e testes completos não bastam para alegar suficiência semântica.

## Definition of Done — quando a entrega pode terminar

- **DOD-1:** CC/SC têm evidência e decisão; critérios julgados têm os dois pareceres pertinentes.
- **DOD-2:** invariants e QS aplicáveis foram conferidos; controles negativos necessários rejeitaram defeitos reais.
- **DOD-3:** consumidor e cadeia operacional exigidos foram exercitados, com versões fixadas.
- **DOD-4:** gates atribuídos à fatia têm resultados reais no candidato correto; a integração final tem seus próprios gates.
- **DOD-5:** uso novo, reservas e pendências estão reconciliados sem apagar o histórico ou afirmar custo desconhecido como zero.
- **DOD-6:** orientação operacional, evidências, migração pertinente e revisão independente estão entregues e preservadas.
- **DOD-7:** entrega local, aceite global, aceite humano, landing e ativação são distintos. ROOT cuida da integração e do aceite da união.

O [contrato de conclusão](completion.md) aplica esse DoD à fatia. A parte exclusivamente
global não impede a entrega local, mas também não absorve trabalho local inacabado.
Uma sugestão opcional do juiz não amplia a missão. Uma lacuna obrigatória permanece aberta.
