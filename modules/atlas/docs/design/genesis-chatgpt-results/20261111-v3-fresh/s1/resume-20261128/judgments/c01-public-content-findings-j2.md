# C01 — findings públicos J2, sem oracle

Corpo SHA256 c1b2e02eca65e7de23d8302c92a5b3f1e0b3670efbbb8318e215e4f956521f20. Excerpt literal do parecer original, somente findings de conteúdo para autoria independente.

### Findings demonstrados

**F01 — §5.2: retenção e replay PTY ainda têm garantias excessivas**

- **Esperado:** distinguir expulsão assíncrona, limpeza condicional e momento de repaint.
- **Observado:** “retém até 25 encerradas” e “provoca reset/replay alinhado/repaint” permanecem sem condições. `pty.ts:330–344` acrescenta a sessão antes de uma tarefa assíncrona que publica o evento e expulsa excedentes. `pty/protocol.ts:44–48` só remove a primeira linha quando encontra newline antes de 4096; caso contrário preserva o buffer. `pty.ts:405–408` solicita repaint na ativação, com gap e sessão ainda em execução.
- **Impacto:** o leitor pode inferir teto instantâneo e recuperação visual garantida.
- **Menor correção:** explicitar essas condições e seus anchors. Qualificar também o caminho básico de `exact:true`: `pty.ts:241–245` permite preparação adicional quando `shellIntegration:true` é explícito, inclusive substituição de argumentos e acréscimo de ambiente.

**F02 — §4.2: segurança numérica atribuída ao settlement sem delimitar a fronteira**

- **Esperado:** identificar precisamente onde cada requisito numérico é imposto.
- **Observado:** a tabela exige “inteiros seguros” junto ao settlement. O `validUsage` transportado em `admission.ts:589–613` verifica números finitos, inteiros e não negativos, além das relações entre dimensões; não usa `Number.isSafeInteger`. A checagem de inteiros seguros aparece na contabilização posterior de reservas, em `409–510`. O parser do executor ainda não foi transportado.
- **Impacto:** a formulação pode atribuir ao ledger uma recusa que esse validador não implementa.
- **Menor correção:** separar validação do parser, settlement e contabilização posterior. Se o parser exige inteiros seguros, atribuir o requisito a esse componente após conferir o trecho correspondente. Não afirmar que o ledger o exige uniformemente.

**F03 — §§5.2/8: obrigações concretas de manutenção sem disposição**

- **Esperado:** preservar obrigações pertinentes de compatibilidade e geração.
- **Observado:** o suplemento discute PTY, wire e documentação, mas não dispõe sobre a implementação comum às duas superfícies HTTP nem sobre geração do cliente quando muda o protocolo. Ambas constam de `.orchestra/skills/terminal-maintenance/SKILL.md:10–29`.
- **Impacto:** falta uma consequência necessária para orientar uma mudança segura nesse escopo.
- **Menor correção:** registrar essas obrigações como normativas, com a fonte; manter geração e verificação das superfícies como **NOT_RUN**. O aceite de outro corpo não supre essa disposição neste candidato.

