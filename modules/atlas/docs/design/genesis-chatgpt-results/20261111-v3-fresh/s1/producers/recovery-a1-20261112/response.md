# S1 A1: candidato local para correção F1 e suplemento E1–E4

Correção concluída localmente. Apenas um parágrafo de persistence mudou; os outros três corpos A1 são cópias byte-idênticas. Os originais, dossiê e pareceres foram preservados. Não há julgamento novo, aceite, execução de produto, testes ou publicação remota.

F1: a versão candidata descreve strictOwner, reconciliação de sequência já vista, retorno por owner não estrito e só então validação da próxima sequência, nessa ordem. Os dois casos que distinguem a ordem estão expressos como inferência de fonte, não cenários executados.

- Candidato: candidate/bodies/persistence.md
- SHA-256: 0b43f9bd316aca25361f934e63723f2aa6220a3deb97a4447266fbbc5d350762
- Diferença: candidate/persistence.patch
- Evidência literal: evidence/E1-admission.md, E2-execution.md, E3-persistence.md, E4-context.md
- Identidades, bytes, proveniência e novos refs propostos: metadata-delta.json
- Fontes integrais fixadas: sources/

Os suplementos transportam os ramos solicitados por J1 A1-R1–R4 e J2 E1–E4. Incluem cinco fontes adicionais de recuperação: message-updater.ts, config.ts, publish-llm-event.ts, schema/durable-event-manifest.ts e schema/event.ts. Não atribuem essas leituras ao produtor histórico. Os novos refs/input_keys ainda precisam ser integrados pela coordenação ao pacote candidato; metadados históricos não foram silenciosamente alterados.

Verificação mecânica: 34 arquivos obtidos tiveram Git blob conferido contra o conector. Isso verifica integridade de transporte, não aceitação semântica. O script build_delta.py só produz/verifica documentos e hashes; não executa código do produto.

Próximo gate: enviar os quatro corpos, dossiê original, pareceres originais e suplementos a dois julgadores independentes com oracle autorizado. Pareceres antigos permanecem REQUEST_EVIDENCE/FIX-FIRST, e esta correção não os substitui. L1 global e A2–A4 permanecem fora do escopo. Não foi produzido L2.
