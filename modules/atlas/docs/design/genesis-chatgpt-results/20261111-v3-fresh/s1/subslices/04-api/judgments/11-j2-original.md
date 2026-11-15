## J2 — rodada 11: **FIX-FIRST localizado no vínculo do delta**

**Identidade candidata:** `s1.subslice04.maintenance` · L4 · `need: maintenance` · `scope: orchestra.s1`  
**Corpo informado:** 10.033 bytes · SHA256 `ce0f86d365df573cf89218da7fee86009d1a37c65c775735c02a68079d38160e`.

### Finding obrigatório único — diferença não contabilizada no diff

O texto efetivamente apresentado e aceito por mim na rodada 8 contém:

> Use o índice para localizar o L1 do assunto e conserve seus gaps. A consulta pode ir diretamente à profundidade necessária.

O diff desta rodada apresenta como **contexto inalterado**:

> Recorra ao índice quando faltar a entrada do assunto e conserve seus gaps. Com a chave vinculada, consulte diretamente a profundidade necessária.

Existe, portanto, uma diferença entre o predecessor apresentado ao juiz e o contexto do delta declarado completo. É necessário corrigir esse vínculo para **QS-1 e GO-I1/I2**.

**Correção mínima:** contabilizar essa substituição no delta ou registrar explicitamente uma errata de transcrição do pedido anterior, identificando os textos e as identidades afetadas. Preserve o histórico e reapresente somente esse esclarecimento; não é necessária nova avaliação integral.

### Conteúdo já examinado

Não identifiquei outro finding obrigatório nas alterações exibidas. A integração dos três L1 Core é fiel ao L3 revisão 3 e aos contratos reconhecidos:

- encaminha consultas ao conhecimento já aceito;
- distingue identidade de retry de consistência da projeção;
- limita `resume:false` ao wake daquela chamada;
- conserva a diferença entre admissão, promoção e tentativa do provider;
- mantém os limites de persistência, stream vivo e coordenação local.

A nova redação sobre consulta ao índice também é compatível com a proporcionalidade exigida; falta contabilizar corretamente sua proveniência.

Os aceites anteriores permanecem preservados. **O reconhecimento desta nova identidade como atualização delimitada aguarda a correção indicada.** Nenhum aceite de execução Atlas, consumidores, manutenção, freshness, binding ou publicação é concedido.
