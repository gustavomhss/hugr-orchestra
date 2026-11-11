# Correção autoral C-001 — precedência de scope() no Dock

## Pedido original da raiz

Finding factual root antes de submeter C: §8 diz scope() 'reserva ... ao agente linux com pisos próprios', mas application-tools.ts151–179 faz unshift dosdenialsnosoutrosagentes e comentário148–149 diz explicitamente 'its own rules still win'; PermissionV2.evaluate findLast. Não é reserva incontornável. Faça pequena correção autoral agora: preservebodyv1 imutável em body-v1.md e registre rootfinding+delta; no corpo vigente explicite que escopodefaultpriorizalinux mas as regraspróprias posteriores dosoutrosagentes podemsobrepor aquelesdenials, enquanto profilelinux preserva configuredlinux/dock. Não altereout. Recalculebody/hash/responseinventário. Packaging deve usar onovoC finaldepois (rootcopiará). C ainda NÃO foi enviadoajuízes, então semaceiteinvalidado. Não amplieoutraspartes.

## Delta realizado

O resumo C08 de `findings.md` foi alinhado à correção. A única alteração de conhecimento em `body.md` está no parágrafo “Hooks diretos” de §8. A expressão de reserva exclusiva foi substituída pela precedência efetiva: `scope()` prioriza o agente `linux` por default; nos outros agentes, regras próprias posteriores podem sobrepor os denials inseridos. O perfil `linux` preserva regras configuradas de `linux`/`dock`. A fronteira de MCP normal e os demais parágrafos permanecem intactos.

Fonte já capturada: `modules/app-dock/src/application-tools.ts`, blob `c9ba94b8da4cb68d4c95b2c9f3fc80176a068f59`, linhas 146–179. O trecho E08 já preserva o comentário decisivo das linhas 148–149. Esta correção não acrescenta alegação runtime nem inicia L2. A observação sobre PermissionV2.evaluate foi fornecida pela raiz; nenhum novo receipt de execução foi produzido.

Versão anterior preservada sem alteração em `body-v1.md`: SHA-256 `2d2f5a1f64167d791f793e92b855c5c71facdd09e227b30a122eb22185c81ba4`, 23.971 bytes. `response-v1.md` e `deliverables-v1.json` conservam o registro anterior. A correção antecede submissão de C aos juízes, conforme informado pela raiz; este produtor não emite decisão de aceite.
