# Pedido visível preservado — L2-v2

## Delegação inicial de /root

Execute a revisão delimitada L2-v2 da retomada S3 Genesis, repo gustavomhss/hugr-orchestra, execução de registro 15cc9853-0e71-4950-8813-0bfb66f82c8a. Você é produtor/corretor novo, não juiz. Trabalhe só em /workspace/scratch/0666cc914bd1/s3-l2-revision/. Fonte pinada 1cde2ff7a71bcf7aecb5d030917b577165135d38; protocolo ee2521a5b966bd505cc95bd1c733e09e12f33531. NÃO leia oracles, judgments, respostas reservadas ou arquivos fora das fontes explicitamente autorizadas abaixo. Não escreva no GitHub, não execute runtime/testes.
Inputs: três corpos já escritos em /workspace/scratch/0666cc914bd1/s3-provenance/files/bodies/l2-{maestro,relay,integrations}.md; dossiê estático /workspace/scratch/0666cc914bd1/s3-provenance/l2-source-evidence.md e arquivos-fonte integrais em /workspace/scratch/0666cc914bd1/s3-provenance/sources/ se necessários. Reuse esses corpos; nenhuma reautoria ampla. Histórico: originais completos ausentes, estes são alternativas da recuperação e não se deve inventar prompts/pareceres históricos. Sua execução cria proveniência NOVA de adoção/correção com recibo explícito, nunca finge recuperar autoria antiga.
Findings obrigatórios recebidos de J1:
1. Maestro §2 item 2 deve dizer que a resposta selecionada é genuína, da mesma Session e posterior à apresentação, e não pode existir QUALQUER mensagem intermediária com role=user (inclusive sintética). A frase 'primeira resposta genuína' sugere erroneamente que se pode pular mensagem intermediária. approval.ts L131–146 recusa reply synthetic e reply-not-immediate separadamente.
2. Integrações §3: resultado Dock unknown/uncertain nunca admite repetição automática; remover a condição 'quando duplicação é perigosa'. app-dock.ts L357–360 é incondicional.
3. Integrações §3: explicitar no máximo UMA repetição automática somente quando NativeRPCError tem code stale-ref e outcome not-dispatched, attempt<1. Não generalizar para qualquer stale/falha.
Copie Relay byte a byte sem mudanças. Faça só esses ajustes localizados em Maestro e Integrações, com hashes/bytes reais antes/depois e diff completo. Preserve todos os demais bytes. Seus critérios públicos: fidelidade ao código pinado; corpo estático não é runtime; UTF-8; <=14000 bytes por corpo; nenhuma nova autoridade; zero alteração L1. Não avance L3/L4.
Entregue bodies/ com 3 arquivos, request.md com este pedido visível preservado, response.json original seu contendo os 3 hashes/bytes, origem de cada corpo, alterações e limites; adoption-manifest.json; changes.diff. Não inclua oracle. Identifique agent_id com seu ID real do host. Deixe estado REVIEW_REQUIRED (sem PASS). Pode terminar assim que entregar arquivos reais; root aguarda J2 e pode lhe enviar um delta adicional ao mesmo task.

## Complemento visível de /root

J2 concluiu, sem finding adicional além dos dois sobre Dock já passados. Consolidado obrigatório: os três itens da tarefa inicial; J1 exige imediaticidade explícita e ambos exigem retry max1 + unknown sem exceção. Não leia os pareceres/oracles. Pode fechar sua revisão delimitada e entrega real; a dupla vai reavaliar depois.
