# Integração final de ROOT

ROOT atua na conversa original por atribuição expressa do proprietário. As cinco
sessões produzem seus domínios completos; S5 não é integradora nem aprovadora inicial.

- Campanha: `20261111-v1`; protocolo: `parallel-v3-fresh`; execução: `20261111-v3-fresh`.
- Branch de integração: `genesis-fresh-final`.
- Namespace: `modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/integration/`.
- Par independente próprio: `integration/J1` e `integration/J2`, com IDs novos reais.

## Receber e fixar

Ler as branches `genesis-fresh-s1` até `genesis-fresh-s5`, selecionar handoffs selados
por SHA e verificar payload/hashes, origem, execução, domínio, critérios e decisões.
Registrar commits selecionados; um avanço de HEAD não troca automaticamente inputs.
Um checkpoint pode ajudar preparação, mas não vira entrega completa do domínio.

Conferir a união de 14.442 entradas e as necessidades/fluxos, classificações e
exclusões. Reconciliar alterações reais do candidato e provas afetadas. Verificar
dependências de build e navegação separadamente. Cobertura estrutural não prova
suficiência semântica. Não herdar PASS do piloto como aceite da união.

## Integrar e executar

Montar candidato isolado com os patches e artefatos exatos. Resolver conflitos por
proprietário, sem sobrescrever snapshots inteiros ou fazer merge cego de latest.
Usar o release real de S4; verificar que input/binding/reader atendem aos cinco
domínios. Aplicar regras de store isolado, governança e testes em [runtime.md](runtime.md).

Reutilizar provas locais compatíveis, executar controles faltantes ou invalidados
pelo delta e os casos transversais. Cobrir consumo Atlas-only, navegação progressiva,
impacto entre domínios, cache/rebuild, coerência, falhas, retomada, rollback, histórico,
preservação e recusas necessárias. Não repetir verificações independentes por rotina.

Reconciliar ledgers novos e segmentos históricos v1/v2, sem exigir que as cinco
conversas novas recuperem handles antigos. Manter tentativas/uso desconhecidos como
tais. Limite lógico não prova admissão financeira; AC-08 permanece aberto onde sua
garantia não foi demonstrada. Não chamar esse limite de conformidade implementada.

## Julgar e entregar

Criar dois juízes independentes com `fork_turns: none`, sem autoria da união. Aplicar
[judging.md](judging.md): mesmo pacote, corpos/evidência, critério fixo, correções e
reavaliação dos mesmos IDs. Não reutilizar pares locais como se fossem o par final,
nem inferir PASS global da soma de cinco aprovações.

Aplicar [principles.md](principles.md) e [completion.md](completion.md) à integração.
Entregar evidência e decisões dos 50 IDs, candidato, commits selecionados, execução,
gates, economia e limitações. Distinguir GLOBAL_REVIEW_READY, aceite humano, landing
e ativação. Não atribuir aceite do dono nem fazer publicação/merge como efeito colateral.

Continuar até cumprir as obrigações de integração. Impedimento material comprovado
permanece INCOMPLETE_BLOCKED, com próximo passo concreto e todo trabalho independente
executado. Uma revisão desta skill não é execução ou aceite do Genesis.
