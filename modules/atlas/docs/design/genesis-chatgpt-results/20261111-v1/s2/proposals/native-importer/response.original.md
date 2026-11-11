PREP-S2-01 concluído como preparação, sem produção ou aceite.

Entreguei o patch aditivo em `preparation/importer/native-importer.patch`, SHA-256 `abc46a1ed91a602f205d12320f975b8c05e8896c8dd265a517bfa8820d135c11`. Ele propõe o adapter `ownership-native-import.ts`, um caller Bun com modos `prepare`/`bind` e a exportação dos validadores de ownership já existentes.

O adapter exige os controles byte a byte de S1/S5, preserva pedidos, respostas e recibos originais em CAS, vincula inputs/dependências/resultados e exige os dois PASS originais da dupla nomeada pela S5. L2–L4 exigem manifesto e aceite da camada anterior. A vinculação refaz apenas a validação determinística dos bytes preservados, sem invocar um produtor. Cada entrada requerida e cada root passa pelo leitor existente antes de retornar o manifesto privado. Ele não emite, não cria policy/actor/ratifier e não altera o piloto histórico.

O corpo usa verificação de UTF-8 sem a normalização NFC aplicada aos identificadores; corpos válidos não-NFC continuam distintos. O JSON original da resposta permanece separado do corpo extraído.

**Lacuna explícita:** esta é a rota de respostas nativas novas. Ela não importa os 20 corpos históricos aceitos e o suplemento como respostas nativas. Esse reuso precisa de uma rota identificada como histórica, preservando bytes/recibos/aceites originais, demonstrando compatibilidade de escopo/fonte/autoridade/receita/contrato e recebendo o novo binding da S5. Nenhum wrapper foi fabricado para simular um produtor original.

Verificação realizada: 25 arquivos obtidos pelo conector, todos conferidos pelo Git blob SHA e registrados com SHA-256; `git apply --check` sobre a materialização verificada terminou com exit 0. Testes, typecheck e execução do importer: NOT_RUN. Não há camada produzida/julgada, publicação, PASS de critério nem alegação de cache/rebuild.

Detalhes e interfaces pendentes estão em `preparation/importer/proposal.md`; fontes em `source-index.portable.json`; escopo do patch em `proposal-manifest.json`; pedido/saída preservados em `request.original.md` e `response.original.md`; recibo da preparação em `preparation-receipt.json`. Todos os arquivos desta tarefa ficam sob `preparation/importer/`, sem alteração dos arquivos compartilhados do repositório.
