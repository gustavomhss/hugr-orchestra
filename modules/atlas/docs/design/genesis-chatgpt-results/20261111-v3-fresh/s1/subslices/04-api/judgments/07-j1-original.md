## J1 — rodada 7: FIX-FIRST

**O corpo ainda não permite produzir L4 local.** A síntese de impacto está consistente com os predecessores aceitos e preserva o limite de Core. Faltam três elementos da explicação normativa solicitada; são correções de conteúdo, sem necessidade de execução ou releitura de fontes.

### Findings obrigatórios

| Finding | Lacuna no corpo | Correção mínima |
|---|---|---|
| **L3-01 — comparação com exemplos da fatia** | O texto distingue corretamente resultado visível, recibos e prosa, mas não apresenta os **exemplos locais congelados** exigidos pela norma para aplicar essa comparação. A tabela de mudanças identifica áreas afetadas, sem decidir casos concretos de parada/propagação. | Acrescentar exemplos de API que fixem a aplicação da regra: um caso em que corpo igual com autoridade/gap/evidência relevante diferente exige propagação; e outro em que somente recibo/versão de input muda, o resultado canônico permanece validado e igual, e a interpretação downstream pode parar. Não é necessário criar mecanismo de equivalência. |
| **L3-02 — ciclos e leitura limitada** | A separação entre construção e navegação está correta, mas faltam as regras explícitas de **rejeitar ciclos nas dependências de construção** e de **limitar consultas de navegação, evitando revisitas**, mesmo quando a navegação contém ciclos. | Registrar essas duas regras no trecho de relações/consulta proporcional. “Abrir só o L1 do assunto” não cobre, sozinho, uma navegação recursiva cíclica. |
| **L3-03 — vínculo de leitura atual, GO-I3** | A ressalva sobre versões antigas cobre o risco de conhecimento obsoleto, mas não explicita o vínculo da leitura atual com um **manifesto aceito de escopo/dependências, válido para os inputs e contratos atuais**. Compatibilidade genérica não substitui esse vínculo. | Acrescentar a exigência de vincular cada leitura atual às versões exatas e ao manifesto aceito e válido; leituras históricas permanecem identificadas como tais. Não solicito prova de implementação global desse controle. |

### Alcance preservado

Não identifico outro finding obrigatório no uso dos predecessores, na atribuição do handoff Core ou nas distinções entre declaração, delegação e execução. **GO-I4 e GO-I5 estão adequadamente expressos:** reúso de inputs/receita válidos e inalterados, ausência de invalidação por mera navegação e HOLD para impacto indisponível ou incompleto.

Os aceites L1/L2 permanecem intactos. **Após essas correções, o mesmo corpo pode voltar ao julgamento para a liberação restrita de produção de L4 local.** Nenhum aceite operacional, Core amplo, Atlas, consumidor ou CI foi concedido.
