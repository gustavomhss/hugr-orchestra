# Entrega L2 v3 — research-flow

Atualizei `s1.subslice03.research-flow` para derivar exclusivamente do L1 research v4 aceito, SHA-256 `c3925ca6e27465598796ef21815e79980277d4c3194a8b2fda7cf433700675d1`, 64106 bytes. Preservei integralmente a correção RF-J2-F01 e todos os bytes de F1–F8. Foram quatro edições de metadata: identidade em F0, identidade/gate e leitura em E0, fonte direta do mapa E1 e registros de verificação em E3. Nenhuma alteração substantiva adicional.

## Outputs atuais

| Arquivo | Bytes | SHA-256 |
| --- | ---: | --- |
| body.md | 17124 | `f2c19caaa501ea0e135cbbfb4768b4bd68c4e729e5545cb5f80e45c655f52ab7` |
| evidence.md | 12878 | `6c6d9c59bf75c0636598315fad3d850426f9d473cc7cbd0ba2f385165992a614` |
| apply.py | 20110 | `fa8fb1920a259dda654fb75321d41bcd4416c8c03b69facbe7dcdd5088d48435` |
| procedure-freeze.json | 38389 | `ab1c664955412b66e61c88a6213974944ec50ff4d9cadda593c5a3004db8ad4e` |

Os quatro outputs v2 foram preservados em `revisions/v3/history/`; v1 e os controles anteriores permanecem intactos. O delta contém literais, offsets, hashes, segmentos inalterados e prova inversa. Há também `delta.patch`, suplemento de revisão, extensão de inputs e verificação do produtor. Este response é preservado em `revisions/v3/response.md`.

## Proveniência e estado

Foram registrados 45 inputs integrais únicos, 500591 bytes: 28 do manifesto anterior, cinco registros v2 efetivamente lidos nas verificações e 12 unidades da revisão atual. Todos têm local_path, tamanho, SHA-256 e blob Git; aliases conservam as versões antigas e a linhagem original fica separada. Nenhum output corrente é auto-input. O L1 v3 histórico não é predecessor semântico corrente.

A principal informou verificação mecânica da v2; nenhum novo parecer L2 foi presumido. A v3 está pronta para conferência da principal e os mesmos J1/J2. Sem self-PASS, raw source, oracle, parecer integral, rede, delegação, produto/Atlas/testes/consumidores ou L3/L4. Uso físico, tokens e custo não expostos: UNKNOWN. Hashes finais do manifesto e response são comunicados externamente para evitar autorreferência.
