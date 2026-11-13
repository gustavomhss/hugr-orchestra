# Genesis S1 — economy impact 1/2

## Escopo e método

Propagação documental somente dos dois deltas de B15, contra o baseline imutável `1cde2ff7a71bcf7aecb5d030917b577165135d38`. Branch criada a partir de `158e612d4d7bd0f486a4bac91e812d7b615375da`. Fonte primária consultada pelo GitHub MCP: `packages/core/src/economy/admission.ts`, blob `914a0b925dd282e264292b2247189c549c993a3f`. Nenhum código, CI, runtime, infraestrutura, oracle privado ou registro histórico foi alterado/consultado.

## B15 — dois deltas confirmados

### Delta 1 — validação de bound versus limite de tentativas

**Antes (B15 original):**
> Required bound dimensions must be present and positive safe integers within an envelope's limit.

**Depois (B15 V2):**
> `validateBound` requires token dimensions bounded by the envelope to be present; supplied token bounds must be positive safe integers and not exceed any corresponding envelope limit. It does not validate `bound.attempts`; reservation applies the attempt limit by counting stored attempts.

**Racional/fonte:** `validateBound` percorre somente `outputTokens` e `inputTokens` (fonte, linhas 218–235). A reserva aplica `rows.length + 1 > request.envelope.limits.attempts` após carregar as tentativas armazenadas (linhas 525–537). Portanto, o texto anterior era amplo demais ao sugerir validação de todas as dimensões do bound. A distinção V2 é necessária e suficiente; não inferir validação de `bound.attempts`.

### Delta 2 — completionRef antes de body/forwarding

**Antes (B15 original):**
> reuses retained completion when available and holds a previously forwarded response whose body is unavailable.

**Depois (B15 V2):**
> An existing attempt with a `completionRef` receives a non-consumable grant before the body or forwarding checks, without requiring a `completionBody`; searches for another retained completion require both reference and body. If neither completion path applies, a previously forwarded existing attempt is held as response-unavailable.

**Racional/fonte:** para a tentativa existente e fingerprint/identidade idênticos, `record.completionRef !== undefined` retorna grant não consumível imediatamente (linhas 446–460), antes do caminho de busca por outra completion que exige `completion_ref` e `completion_body` (linhas 461–469) e antes do HOLD por `forwardObserved` (linhas 470–473). A busca geral por completion também exige ambos (linhas 475–480). O texto V2 preserva a exceção e a ordem temporal. Não confundir esse grant de replay com permissão de novo forward.

## Dependentes atribuídos — decisão por chave

### `s1.l2.runtime-ownership` — NO_CHANGE

Trecho atual:
> Body encaminhado mas indisponível pode impedir reutilização.

**Decisão:** permanece semanticamente válido. “Pode impedir” descreve o ramo em que não se aplica uma das rotas de completion retida; não afirma que toda tentativa encaminhada com body indisponível é necessariamente HOLD. O corpo não diz que `validateBound` valida `bound.attempts`, nem equipara o campo attempts do bound à contagem de tentativas. A distinção mais detalhada pertence ao B15 V2, já atualizado; não há erro factual que exija reescrita deste L2. Sem mudança de corpo.

### `s1.l3.session-provider-flow` — NO_CHANGE

Trecho atual:
> A ledger econômica preserva forward intent, terminal remoto e usage separados. Erro HTTP não é terminus e rejeição semântica não restitui uso confirmado/obrigações. [...] A integração de sender com ledger precisa de sua própria evidência.

**Decisão:** o trecho não descreve a validação de bound nem a ordem de replay de completion. A afirmação sobre body encaminhado indisponível aparece como possibilidade no L2 dependente e continua verdadeira; a exceção de `completionRef` não invalida a modalidade. Não acrescentar detalhe local de Core a uma síntese L3 cujo objetivo é relacionar fronteiras. Sem mudança de corpo.

### `s1.l3.persistence-evidence-failures` — NO_CHANGE

Trecho atual:
> [...] body encaminhado indisponível pode impedir reutilização. Portanto corrigir diagnóstico não é limpar saldo desconhecido ou repetir side effect até aparecer resultado.

**Decisão:** “pode impedir” continua correto; o texto não diz “sempre impede”, nem omite uma garantia universal. O segundo enunciado é compatível com a exceção: o grant não consumível com completionRef não autoriza repetir o efeito físico. O corpo não afirma que bound.attempts é validado por `validateBound`. Sem mudança de corpo.

### `s1.l3.ownership-impact-map` — NO_CHANGE

Trecho atual:
> Economia exige forward/terminal/usage completos e conserva bounds não liquidados.

**Decisão:** síntese de ownership e evidência, não descrição do validador de bound ou da ordem de replay de completion. Ambos os deltas preservam a distinção entre forward, terminal, usage e obrigações retidas. Nenhuma afirmação se torna falsa ou incompleta para a finalidade deste mapa. Sem mudança de corpo.

## Resultado

- Corpos dependentes alterados: **nenhum**.
- Corpos dependentes com decisão explícita: **4 NO_CHANGE**.
- B15 V2 é o texto corrigido de referência; não foi reescrito nem substituído nesta tarefa.
- Nenhum voto histórico foi substituído. Nenhuma conclusão ADMIT/PASS global, consumo, manutenção executada ou aceite Genesis é emitida.
- Revisores independentes: não foram disponibilizados meios de spawn de subagentes nesta sessão; nenhuma revisão delegada é alegada.
- Nenhum teste, CI, provider, DB, reservation, settlement, fault injection ou chamada de produto foi executado.
