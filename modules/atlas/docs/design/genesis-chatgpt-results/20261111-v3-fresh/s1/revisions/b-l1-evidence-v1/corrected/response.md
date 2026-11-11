# Correção de S1-L1-B: session-contract

Criei uma nova versão somente de `s1.api.session-contract`, sem alterar nenhum original. A frase sobre comandos MCP agora registra o mapeamento para `UnknownError` e a ausência de chamada de log no ramo observado. Não afirma que nenhum outro componente do servidor possa registrar a requisição.

Original: `producers/b/bodies/session-contract.md`, 5130 bytes, SHA-256 `f0b4af4b966886be0858cc9ab27c8ec1f481ef8093018a567d8e08b071c52db5`.
Nova versão: `revisions/b-l1-evidence-v1/corrected/session-contract.md`, 5155 bytes, SHA-256 `22b526a2423572f2bbc17f3bfccd2eb0ea8f7fb16f2215bb0904f1cc5c2125bc`.

O diff delimitado está em `corrected/session-contract.diff`. `corrected/fragment-metadata.json` copia o fragmento original e altera apenas o objeto `body` desse key, com o path futuro relativo ao pacote solicitado. Os demais oito objetos de artefato permanecem idênticos. Os refs originais de pedido/resposta são preservados como proveniência do candidato-base; `corrected/correction-receipt.json` vincula este pedido e esta resposta de correção para a selagem pela principal.

Autoridade factual: `packages/server/src/handlers/session.ts`, commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`, blob `1ce1cd359f5c9bbfc12122fad3d4439655a1e5bb`, linhas 267–273. Os ramos `Mcp.NotFoundError` e `Mcp.RequestError` retornam `UnknownError`; o trecho não chama logging. A evidência exata e seu hash estão no suplemento desta revisão.

Verificação local: originais em `producers/b` preservados byte-for-byte; os nove corpos continuam correspondendo aos bytes do dossiê-base `6c0face0fd44960dbc7bae233ec90607956af5a6a8b40fc50a8fc2a82dc5ce86`; o novo corpo difere somente pela substituição autorizada. Não executei produto, não li oracle e não enviei o pacote aos juízes. Não há aceite semântico antecipado.
