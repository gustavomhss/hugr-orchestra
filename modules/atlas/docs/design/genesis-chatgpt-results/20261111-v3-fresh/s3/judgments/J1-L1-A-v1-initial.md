## J1 — L1-A v1: REQUEST_EVIDENCE

A base atende à estrutura e ao escopo de L1. **Resta uma lacuna de evidência sobre a composição efetiva de permissões**, central para o oracle R2. Os trechos fornecidos sustentam regras restritivas declaradas e gates de identidade, mas ainda não demonstram a precedência entre configuração, profiles nativos e grants. Não identifiquei erro factual demonstrado que, por si só, exija reescrever o candidato.

### Decisão por critério

| Critério | Decisão | Evidência e motivo |
|---|---|---|
| **C1 / QS1 — fidelidade, autoridade e fonte exata** | **REQUEST_EVIDENCE** | Commit, hashes e verificação externa das 80 capturas identificam a fonte e sua integridade. As divergências documentais são explicitadas nas §§2 e 6. Entretanto, a afirmação da §4 — “Os profiles nativos são o último piso de permissões, depois da config” — e sua relação com grants requerem o trecho de composição efetiva. A evidência 3 é expressamente uma projeção compacta; a evidência 4 prova identidade, não precedência de permissões. |
| **C2 / CC1 — cobertura, classificação e necessidades seguintes** | **PASS** | A §7 discrimina os 424 paths, com categorias que reconciliam 325 + 99. Distingue 73 paths inspecionados dessa população e sete fontes de fronteira. O pacote informa a população S3 de 4.553 paths e que este lote não fecha a união; o corpo não alega cobertura integral do repositório. As necessidades de L2–L4 estão preservadas. |
| **C3 / CC2–3 / GO-A1–3 — utilidade como base L1** | **PASS** | As §§1–5 oferecem mapa de componentes, identidades, portas, autoridade e distribuição. A §6 conserva limitações que mudam decisões do consumidor; a §7 indica onde aprofundar cada família. Isso permite consulta progressiva sem fingir que os contratos locais, fluxos completos ou diagnósticos de níveis seguintes já foram entregues. |
| **C4 / GO-I1,2,7 / QS4 — preservação, identidade, fronteiras e gerados** | **REQUEST_EVIDENCE** | Identidade e preservação estão atendidas: evidências 1–2 sustentam Maestro fixo, ID `backend`, label configurável e alias legado somente de leitura; o literal proibido não aparece. As §§5–6 preservam gerados, shipping, documentos históricos e incompatibilidades. A pendência é exclusivamente a fronteira entre profiles e grants descrita em F1. |
| **C5 / GO-I8 / QS5–6 — honestidade de prova e economia** | **PASS** | O início e a §7 delimitam inspeção estática, bytes e população. Não alegam testes, build, Session, publicação Atlas ou aceite L2–L4 executados. O corpo respeita o teto de 20.000 bytes. As provas de fonte não são apresentadas como provas de runtime. |

### F1 — Evidência insuficiente para a precedência de permissões

**Localização:** §4, primeiro parágrafo; fontes citadas `C:roster`, `C:v2/seats` e `C:v2/governance/caller`; evidências fornecidas 3–4.

**Esperado:** demonstrar estaticamente que configuração, carregamento de skill e grants declarados não permitem superar as restrições relevantes de `direct` e `review`, incluindo a restrição de delegação. A identidade nativa e o profile devem continuar sendo condições efetivas de autorização.

**Observado:** foram fornecidos uma projeção compacta dos profiles e o gate que verifica owner/identidade nativa. Não foi fornecida a expressão que compõe a permissão final nem o bloco de `CallerGate` que aplica a permissão `task` do profile. Por isso, ainda não é possível distinguir uma restrição final de uma regra posteriormente sobreposta.

**Correção necessária:** fornecer os recortes abaixo. Se sustentarem a precedência descrita, este finding pode ser encerrado sem alteração do corpo. Se não sustentarem, delimitar as afirmações da §4 ao mecanismo efetivamente demonstrado.

**Pergunta de evidência — trechos exatos necessários:**

1. Em `roster.ts`, os blocos completos dos profiles `direct` e `review`, sem campos omitidos.
2. Em `v2/seats.ts`, o bloco completo que combina permissões da configuração, regras do profile nativo e grants de skill/MCP/Atlas, incluindo a ordem de composição e eventuais helpers que determinem a precedência.
3. Em `v2/governance/caller.ts`, o bloco que identifica o profile do caller, avalia sua permissão `task` e produz a recusa quando ela é negada.

**Não solicito execução de testes ou de runtime para resolver este finding.** A pendência é documental e estática, compatível com L1.

### Conferência do oracle reservado

- **R1:** **PASS** no escopo de contrato e observação estática fornecidos. Identidade estável, label de apresentação, alias legado e escritas canônicas estão representados; não há roteamento por label.
- **R2:** **REQUEST_EVIDENCE**, exclusivamente por F1. A proibição de autoaprovação/autorrevisão do conductor está preservada; não há alegação de execução realizada.
- **R3:** **PASS**. A §5 e as evidências 1, 11–12 distinguem prompt/skill distribuídos de manutenção e documentação do repositório. Texto de manutenção não é convertido em autoridade runtime.

**Sugestões opcionais:** nenhuma.
