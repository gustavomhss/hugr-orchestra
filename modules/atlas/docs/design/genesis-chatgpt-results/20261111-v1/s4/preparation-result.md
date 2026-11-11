# Resultado original do subagente de preservação

Tentativa `S4-PREP-PRESERVE-001`; agente real `/root/protected_migration`; autoria/inspeção, não juiz de aceite. A preparação independente solicitada foi concluída. A migração e as recusas dependentes não foram executadas.

## Resultado verificável

- 111 arquivos-fonte acessados tiveram bytes SHA-256 e identidade Git blob conferidos. As cópias locais mantiveram seus hashes no segundo inventário.
- 439 objetos Git protegidos foram enumerados: 425 arquivos históricos Genesis, três arquivos Memory `.atlas` fora do ownership da fatia e 11 controles/políticas de preservação. Essa população ainda deve ser reconciliada com o inventário completo de S1.
- Todos os 88 objetos do inventário histórico AC-10 conferem por bytes com seus Git blobs. Todos os 62 pins SHA-256 conferem; o conjunto de pins também é exatamente o declarado por `script/rename-ledger.ts`.
- O artifact `13444687733`/run `42087075694` foi lido, baixado e conferido novamente: 1.662.130 bytes; ZIP SHA-256 `9df9f969d7f798e3fd9a4665d062da5293ac2aa77bbc1249bffdca41734860da`; todos os 886 membros têm caminho, tamanho e SHA-256 registrados. Não executei programas do ZIP.
- As 103 respostas originais conferem com o replay index, a identidade original e os stdout/stderr/exit codes do controle. Os 365 CAS originais conferem byte a byte com suas cópias reconstruídas e com o digest de inventário do source receipt. Os 272 claims de 91 lugares mantêm os vínculos originais.
- O pedido `be07949d-5cdc-48f1-9309-bddd4b32cd2b` continua sem resposta original. O retry sintético possui outra identidade e não o liquida. A cadeia completa de 295 envelopes continua não observada neste ZIP.
- PRs #1291, #1300 e #1302 foram somente lidos e continuam abertos nos heads registrados. Não houve escrita, PR, merge, alteração de policy, produção ou limpeza de recurso herdado.

## Integração preparada

`migration.md` documenta as portas observadas, a compatibilidade por fontes/contratos e os limites de ativação. `migration-cases.json` prepara 12 casos distintos com oracles, controles positivos e blockers: staging privado, ativação explícita, produtor antigo, atualização legítima de receita, rollback compatível/incompatível, leitura histórica, identidade estrangeira, trust, preservação antes/depois, scope independente e gerados.

Todos esses casos dependentes estão `NOT_RUN`/`INDETERMINATE`. Não proponho o patch histórico `87abf90956`: versões são strings sem ordem, e a comparação contra o receipt impediria atualizações válidas. Falta o contrato novo que distingue produtores admissíveis e o candidato S2/S3 integrado por S5. Ausência de evidência de recusa não foi transformada em PASS nem em defeito executado.

## Uso e entrega

Os scripts locais executaram somente leitura, hashing e comparação de dados já existentes. Não rodaram testes do produto, chamadas de modelo externo ou comandos de replay. O run observado é histórico e não valida o novo candidato S4. Tokens, tentativas físicas e cobrança desta inferência nativa continuam `UNKNOWN`.

Os arquivos em `output/` são o pacote para o integrador; o ZIP e os captures completos ficam fora dele. URLs assinadas temporárias foram removidas do capture depois do download e não constam da entrega. Os detalhes por membro/resposta/CAS/claim estão explicitamente enumerados nos recibos. O integrador ainda deve conferir os objetos contra sua branch documental e, depois, contra cada estado da migração real.
