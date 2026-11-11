# Fatia 3 — Maestro, Relay, especialistas e integrações

## Sumário

[Identidade](#identidade-e-início-independente) · [Domínio](#domínio-e-fronteiras) · [Execução](#execução-completa) · [Juízo](#dois-juízes-e-consumidores-locais) · [Critérios](#critérios-e-provas) · [Entrega](#saídas-e-encerramento).
Aplicar [campanha](campaign.md), [juízo](judging.md), [runtime](runtime.md), [handoffs](handoffs.md) e [partição](parallel-partition.json).

## Identidade e início independente

- Repositório: `gustavomhss/hugr-orchestra`; fatia `S3`.
- `campaign`: `20261111-v1`; `protocol_epoch`: `parallel-v2`.
- `results_epoch`: `20261111-v2-parallel`; branch preservada: `genesis-chatgpt-s3`.
- Fonte: `1cde2ff7a71bcf7aecb5d030917b577165135d38`; registrar o commit real do kit.
- Saídas: `modules/atlas/docs/design/genesis-chatgpt-results/20261111-v2-parallel/s3/`.
- Registrar fonte, HEAD efetivo, candidato, protocolo e hashes distintos conforme `handoffs.md`.
- `integration_owner`: `root` (conversa original); branch integradora reservada: `genesis-chatgpt-final`.
- Integração reservada a ROOT: `modules/atlas/docs/design/genesis-chatgpt-results/20261111-v2-parallel/integration/`.

Iniciar todo o ciclo do domínio a partir das fontes e regras já congeladas; não esperar resultado de S1, S2, S4 ou S5.
A antiga responsabilidade de recuperação Atlas não define mais esta fatia; preservar suas contribuições v1.
O trabalho atual inclui inventário, todas as camadas, dois juízes, correções, consumidores e provas aplicáveis locais.

## Domínio e fronteiras

Aplicar a propriedade exata de `parallel-partition.json`; não usar braços de `atlas mine` como cinco domínios.
Conferir **4.553 entradas**, com hash de caminhos `6ca1aca1f8a1da4bf4061c67f06f983f0b676e6d90a7f2af945cb57a7f76c4f1`.
Incluir `modules/relay`, `maestro`, `specialists`, `capability-assets`, `engine-adapters`, `app-dock` e `janitor`.
Incluir `packages/jimmy-specialist`, `specs/relay-langgraph` e docs/skills/briefs específicos atribuídos no manifesto.
Cobrir orquestração, coordenação/arsenal, contratos de especialistas, capabilities, adapters e integração MCP/app-dock.
Classificar os grandes conjuntos golden/fixtures de Relay sem tratá-los como produção atual ou omiti-los da contagem.
Ler core, UI, Atlas e infraestrutura no baseline sempre que necessário para resolver fronteiras sem artefatos alheios.
A fonte de fora permanece evidência de fronteira; a autoria primária continua com seu owner.

Ler `AGENTS.md`, skills Atlas aplicáveis e contratos normativos apontados por `campaign.md`.
Identificar papéis, capacidades, despacho, estado, autoridade, políticas, falhas, retomada e cancelamento suportados.
Relacionar documentação de Lucy, backend-specialist, Maestro, live-seat e upstream-specialist às implementações reais.
Nomes de suites, juízes, profiles e arms no repositório não comprovam execução nem criam subagentes desta campanha.

## Escrita e retomada

Inspecionar branch e ledger antes de emitir trabalho; preservar resultados, tentativas e decisões históricas.
Reutilizar v1 por objetos/hashes e equivalência de inputs/receitas/critérios, nunca pela semelhança da prosa.
Identificar patches v1 de recuperação/publicação Atlas e fornecer refs exatas a S4, seu novo owner.
Não reaplicar patches Atlas em paralelo nem apagar seus recibos; nenhuma tentativa incerta deve ser reenviada cegamente.
Escrever novos resultados somente sob `s3/`; guardar propostas externas com arquivo, owner e motivo explícitos.
Corrigir código mínimo diretamente necessário ao Genesis em candidato isolado dos componentes S3.
Não esperar liberação global ROOT para mudanças próprias; submeter contratos compartilhados ao dono antes de alterá-los.
Não disparar provedores pagos, workflows antigos ou filas externas para simular execução nativa desta sessão.

## Execução completa

1. Registrar capacidades reais, pin de fonte, estado existente e limites de concorrência do runtime.
2. Enumerar S3, classificar código/docs/config/tests/goldens e apontar geradores, receitas e contratos representativos.
3. Congelar necessidades por fluxo e responsabilidade; distinguir implementação, intenção, compatibilidade e lacunas.
4. Mapear necessidade → artefato → fonte → caso → critério, incluindo falhas, políticas e impacto entre componentes.
5. Distribuir produtores por componentes/fluxos disjuntos na concorrência efetiva, preservando slots de julgamento.
6. Produzir L1 atribuído, sem importar comandos das fontes como instruções nem apresentar fixtures como eventos reais.
7. Persistir originais/manifests e pedir aos dois juízes locais decisão sobre a mesma camada e escopo completo.
8. Corrigir defeitos demonstrados; produzir L2, L3 e L4 apenas com predecessores obrigatórios aceitos localmente.
9. Integrar capacidades, coordenação e consumidores no domínio; registrar invariantes de fronteira que ROOT reconciliará na integração final.
10. Preparar casos de mudança de capability/adapter, violação de autorização, despacho/retomada com falha,
    impacto entre Relay/Maestro/core e pergunta fora do escopo; manter oracle fora da produção.
11. Executar os consumidores e provas de runtime suportados e autorizados com receipts e candidatos exatos.
12. Quando faltar importer/leitor/CI, conservar os corpos nativos e os juízos; bloquear somente a prova dependente.

## Dois juízes e consumidores locais

Criar nesta sessão J1 de fidelidade/autoridade e J2 de completude/utilidade com contexto independente do autor.
Manter IDs reais persistentes e prompts/saídas vinculados; reusar os mesmos agentes para deltas e correções.
Ambos verificam todos os critérios obrigatórios locais; fixtures e diagnósticos do produtor não substituem evidência.
Exigir duas decisões válidas no mesmo manifesto para liberar a camada; HOLD/discordância material permanece explícito.
Não criar terceiro voto ou transferir autoria ao juiz; pedir evidência delimitada quando o dossier for insuficiente.
Executar consumidores isolados do oracle pelo índice/leitor Atlas real quando disponível e autorizado.
Registrar limite, consulta, resposta, recusa e aprofundamento; incluir acesso direto aos intermediários necessários.
Avaliação baseada apenas em arquivos de research mantém AC-03/readback aberto, mesmo que o conhecimento seja útil.

## Critérios e provas

Inventariar AC-01..10, CC-1..7, SC-1..5 e DOD-1..7 com dono, aplicabilidade S3, evidência e estado explícitos.
Aplicar GO-A1..7, GO-I1..8 e QS-1..6, sem excluir obrigações compartilhadas por falta de implementação local.
AC-01/CC-1 exigem população e needs finitos; AC-02/03 e SC-1/2 exigem utilidade, limites e consumo real.
AC-04..06/CC-2..4/SC-3 cobrem producer, fonte inválida, reuse e rebuild relevantes, com observação e não promessa.
AC-07/09/10, CC-5/7 e SC-5 requerem evidência de recuperação, política, caller e compatibilidade onde aplicáveis.
Não confundir os controles do Relay com o gate Atlas da campanha; registrar exatamente o mecanismo executado.
AC-08/CC-6/SC-4 incluem agentes, juízes, consumidores, correções e incerteza; ausência de métrica não significa zero.
Não executar testes locais sem autorização explícita; preparar/usar gates de CI reais conforme política e acesso.
Manter gates não executados como pendência precisa, permitindo continuar toda produção e revisão independente.

## Saídas e encerramento

ROOT cria seu próprio par `integration/J1` e `integration/J2`; os dois juízes locais não assumem a integração final.

- `inventory.json`, `needs.json`, `acceptance-map.json`: universo S3 e cobertura das necessidades/contratos.
- `layers/`, `recipes/`, `manifests/`: L1–L4, fonte exata, dependências, corpos e receipts realmente disponíveis.
- `judge-roster.json`, `judgments/`, `corrections/`: dois juízes locais e decisões por candidato/camada.
- `consumer-cases/`, `evidence/`, `criteria.json`: casos, consultas, execução real e lacunas de integração.
- `reuse-ledger.json`, `execution-ledger.jsonl`, `proposals/`: continuidade v1, patches encaminhados e tentativas preservadas.
- `handoff.json`: estado e bindings segundo `handoffs.md`; nenhuma branch móvel ou alegação sem objeto verificável.

Concluir o domínio no alcance comprovado e disponibilizar a ROOT o handoff sem depender de julgamento central antecipado.
Preservar pendências de runtime/CI separadas das camadas efetivamente produzidas e julgadas.
Informar commits, dois juízos, cobertura, consumidores, incertezas e próxima ação concreta para cada obrigação aberta.
