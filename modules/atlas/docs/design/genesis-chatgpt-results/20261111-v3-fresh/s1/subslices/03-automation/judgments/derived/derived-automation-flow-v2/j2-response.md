## FIX-FIRST — `s1.subslice03.automation-flow`, v2

**J2 — execução `34269cf4-d631-41c5-a30b-85b0ec217390`.**

Parecer sobre o **corpo inteiro**, identificado com **16.541 bytes**, SHA256 `5b24037431881e96ddb5a872fd6541c94880d189d8b0c873bac9d8bd874d85c1` e Git blob `378dbb4cd9f978ed9ab848136a2f4b9fdd72ca6b`.

### Achado obrigatório: AF-L2-J2-01

**Local:** §4, tabela, linha **Dispatch**, coluna **GitHub**.

O L2 afirma:

> Workflow ativo e `workflow_dispatch` na branch padrão e ref selecionada; 204 fica sem atribuição

Essa formulação aplica a exigência de `workflow_dispatch` às duas refs. O predecessor aceito distingue **a prova de elegibilidade na branch padrão** da **fonte da ref selecionada**. Sua §4.1 diz:

> Workflow ativo; prova de `workflow_dispatch` na branch padrão **e** fonte da ref selecionada

A condensação suprimiu “fonte” e tornou as duas verificações equivalentes. Isso altera a condição apresentada ao leitor para decidir sobre dispatch; a derivação deve conservar a distinção do predecessor. **Apoio público: `s1.core.automation` v4, §4.1; referência E05 do próprio candidato.**

**Correção suficiente:** substituir a cláusula por uma formulação que preserve os dois objetos de prova, por exemplo:

> Workflow ativo; prova de `workflow_dispatch` na branch padrão e leitura da fonte da ref selecionada; 204 fica sem atribuição.

Preservar o antes/depois e atualizar as identidades dos outputs afetados conforme o procedimento vigente. Não é necessário ampliar a leitura para fontes brutas para resolver este achado.

### Disposição das demais questões

- **AF-L2-PREVIEW-01: encerrado.** A §8 conserva a distinção entre presença/identidade do owner e os dois `holds` restritos à claim ainda não admitida.
- **AF-L2-PREVIEW-02: encerrado.** O replay de `manualKey` conserva o ramo restante completo, incluindo `running` com `SessionInput`, sem reduzi-lo a rows assentadas.
- O predecessor de build permanece exclusivamente **`s1.core.automation` v4**. As referências E01–E10 são aprofundamento nesse predecessor; a derivação não acrescenta dependências de build por navegação.
- Receita, correção anterior à primeira revisão, histórico e projeção dos 24 inputs estão distinguidos. **Não há pedido obrigatório adicional de evidência.**

**GO-A1, QS-1, QS-5 e AC-01 local ficam pendentes do achado AF-L2-J2-01.** Nos demais aspectos pertinentes de organização da camada, economia, autoridade, proveniência, preservação e impacto declarado, não identifiquei outro achado obrigatório.

O PASS integral do predecessor L1 v4 permanece válido. **Este L2 v2 requer a correção indicada antes de seu aceite integral.**