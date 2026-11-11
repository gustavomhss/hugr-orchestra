# Conclusão: entregar tudo da fatia

Os [axiomas e critérios](principles.md) orientam a execução. Esta lista estabelece
a auditoria final, sem exigir uma pilha de documentos antes da primeira produção.

## Critério de entrega local

Declarar `DELIVERY_COMPLETE` somente quando todos estes pontos tiverem evidência:

1. Toda a população atribuída está classificada e suas necessidades obrigatórias atendidas; nenhuma exclusão silenciosa.
2. Todos os artefatos L1–L4 necessários foram realmente produzidos, são úteis e têm fonte, autoria e dependências exatas.
3. Os dois juízes persistentes cobriram o pacote final e seus critérios; correções obrigatórias foram resolvidas e reavaliadas.
4. Código estritamente necessário de responsabilidade da fatia foi aplicado e verificado no candidato correto; proposta sozinha não basta.
5. Importação, leitura e consumidores próprios exigidos foram executados; provas comuns reutilizadas têm vínculo válido com S4.
6. Casos de manutenção e gates atribuídos foram cumpridos; nenhum teste/CI não executado aparece aprovado.
7. Uso novo, reservas e limitações observáveis estão registrados; histórico desconhecido não foi zerado.
8. Matriz final de critérios, artefatos, decisões e recibos estão completos, commitados, selados e relidos no GitHub.

Não repetir a suíte comum de S4 cinco vezes. Aplicar a matriz de [campaign.md](campaign.md):
cada domínio prova seus casos e consome as provas comuns compatíveis; ROOT prova a união.
Falta de reader, consumidor, revisão ou gate próprio não pode ser transferida para ROOT.

## Axiomas orientam; evidência decide a conclusão

Uma matriz de aceitação basta: critério/obrigação, estado local, evidência/juízos e
complemento exclusivamente global. Preservar os 50 IDs do [registro](criteria.json),
agrupando referências quando útil. Não criar 50 documentos ou repetir leis em cada WP.
PASS local não fecha a união. N/A exige razão real de escopo e revisão; não significa
que a ferramenta faltou ou que houve pouco tempo. Obrigações globais nomeiam ROOT.

Aceite humano, landing, ativação em produção e gates da união são etapas globais,
não pré-requisitos artificiais para a entrega local completa. A fonte normativa
continua exigindo-os para conclusão global; não autoatribuir aceite do dono.

## Não encerrar prematuramente

Delegar, abrir fila, preparar ambiente, produzir propostas, completar um lote,
receber dois pareceres parciais ou salvar checkpoint não encerra a missão.
Continuar enquanto houver obrigação própria executável; não perguntar se pode
prosseguir no trabalho autorizado. Esperar subagentes ativos por ferramentas reais.

Refinar inventário semântico em paralelo com produção é permitido. Antes de cada
unidade, fixar sua necessidade/critério/oracle; antes de fechar a camada/domínio,
reconciliar a união. Não transformar uma amostra útil em cobertura total.

Após os dois pareceres finais, reler a fila e procurar pendências atuais: TODO,
NOT_RUN, HOLD, FIX-FIRST, REQUEST_EVIDENCE e promessas. Distinguir histórico preservado
de obrigação atual. Executar o que falta; não apagar o rótulo para aparentar sucesso.
Parar aperfeiçoamento opcional quando a barra fixa estiver satisfeita.

## Impedimento material

Verificar capacidades realmente expostas, releases/recibos disponíveis e rotas já
autorizadas. Implementar correções necessárias dentro do escopo. Uma ausência de
`gh`, quota antiga de bootstrap ou regra de coordenação anterior não é impedimento.

Se depender de S4, consultar `runtime-release.json` e fixar capacidades prontas;
continuar todo trabalho independente. Antes de devolver controle, conferir de novo
a dependência. Não fazer polling infinito nem declarar impossibilidade por uma única
ausência momentânea ou número arbitrário de consultas.

Se a obrigação continuar impossível, registrar `INCOMPLETE_BLOCKED`: item, operação,
erro/estado observado, rotas autorizadas tentadas, evidência e condição exata de
desbloqueio. Esgotar o trabalho independente e preservar o handoff. Isso é incompleto,
nunca PASS ou DELIVERY_COMPLETE. Não inventar capacidade nem contornar uma guarda.

Persistir para retomar após compactação ou nova interação; não prometer execução
em background depois de terminar o turno. A resposta final aponta commit/handoff,
cobertura, juízes, correções, execução, gates e eventuais obrigações abertas.
