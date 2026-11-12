## Parecer J1 — `s2.l1.desktop-web`, revisão 1

**Decisão do artefato: FIX-FIRST.** Há uma omissão pontual frente ao oráculo congelado: o diretório de trabalho do servidor é descrito apenas como estando sob os dados do aplicativo, sem identificar `userData/global`. Também solicito trechos delimitados para concluir a verificação das afirmações sobre prontidão e tradução nativa. **Não identifiquei outro defeito obrigatório no conteúdo recebido.**

**Binding deste parecer**

- Execução: `46d09d97-39a9-482a-a290-646ba1d94c99`
- Fonte: `1cde2ff7a71bcf7aecb5d030917b577165135d38`
- Protocolo: `ee2521a5b966bd505cc95bd1c733e09e12f33531`
- Artefato: `s2.l1.desktop-web`
- Corpo: **28.755 bytes**
- SHA-256: **`f680f5e2900f4e5039e0d9be32b4756db66de7d776d59ee0232c26555fd362f9`**

Usei a retransmissão integral de `header-01`; a primeira transmissão fica desconsiderada. As identidades e a reconciliação mecânica são recibos fornecidos pela principal. Não computei hashes nem atesto igualdade dos bytes internos do transporte, que não estão expostos.

### Achados obrigatórios

| ID | Decisão | Localização | Esperado | Observado | Correção ou evidência necessária |
|---|---|---|---|---|---|
| J1-DW-01 | **FIX-FIRST** | `l1.md`, §1, primeiro parágrafo; família `startup-owned-server` | O caso congelado **L1-DESKTOP** exige registrar o cwd `userData/global`, separando implementação e orientação de manutenção. | O texto informa somente “a cwd under desktop user data”. Essa formulação não identifica o diretório concreto exigido pelo caso. | Explicitar o cwd efetivo `userData/global`, com referência à implementação. Atribuir separadamente a orientação da skill de manutenção, sem transformar sua motivação ou seus números históricos em comportamento medido. Não é necessário alterar o produto. |
| J1-DW-02 | **REQUEST_EVIDENCE** | `l1.md`, §1, segundo parágrafo; `decisive-evidence.md`, E01–E02 | Verificar no código o limite de 120 segundos e a corrida entre `/api/health`, saída do filho e limite temporal, além do cwd acima. | E01 demonstra que a publicação de credenciais espera `owned.health.wait`; E02 demonstra o problema estático de reinício. Nenhum desses trechos mostra a definição do limite, a composição da corrida, o predicado de saúde ou o argumento cwd. | Fornecer `apps/desktop/src/main/owned-serve.ts:15–25,94–102,130–141`, `apps/desktop/src/main/index.ts:431–466` e o trecho da `.orchestra/skills/desktop-startup-maintenance/SKILL.md` que estabelece o cwd. Se algum bloco atravessar o intervalo, incluir apenas sua continuação necessária. |
| J1-DW-03 | **REQUEST_EVIDENCE** | `l1.md`, §9, parágrafo sobre idiomas; `decisive-evidence.md`, E25 | Distinguir a exigência documental de usar `nativeT(...)` da implementação efetiva da ponte tipada. | E25 comprova a instrução e a exceção do diálogo de falha. A implementação de `native-translations.ts`, citada pelo corpo, não aparece nos trechos recebidos. | Fornecer `apps/desktop/src/main/native-translations.ts:1–24`. Basta o trecho da ponte tipada; não solicito auditoria de todas as traduções nem execução da interface. |

J1-DW-02 e J1-DW-03 são pedidos de evidência, **não afirmações de que o comportamento descrito esteja errado**. Não é necessário reenviar os 193 captures ou todo o inventário para resolvê-los.

### Decisão por caso congelado

| Caso | Decisão | Localização e justificativa |
|---|---|---|
| **L1-COVERAGE** | **PASS no recorte desktop-web** | “Scope and evidentiary status”, mapa completo das 30 famílias e recibo mecânico: 532 entradas, com 146 `inspected`, 381 `family-supported` e cinco `metadata-only`. O texto não confunde enumeração com leitura integral. A procedência dos ícones gerados é delimitada, e não estendida automaticamente às demais mídias. A cobertura global das 4.506 entradas permanece dependente dos outros dois lotes. |
| **L1-AUTHORITY** | **PASS no recorte** | §1 distingue ordem real de inicialização do comentário do renderer; §9 e E23–E24 distinguem corpus gerado, planos históricos, receitas e provas efetivas. E25 preserva o conflito entre instrução e código. Nenhum teste inspecionado é apresentado como executado. Este PASS não aceita manifestos futuros de dependência/reutilização. |
| **L1-DESKTOP** | **FIX-FIRST**, com evidência pendente | J1-DW-01 e J1-DW-02. E01 sustenta a espera antes de divulgar credenciais; §§2–3 descrevem adequadamente a divisão main/preload/renderer e a exposição delimitada de `window.api`. Falta precisão no cwd e o trecho decisivo da corrida de prontidão. |
| **L1-UI** | **REQUEST_EVIDENCE no aspecto desktop** | J1-DW-03. A exigência de preservar o inglês e manter a gramática na API tipada está preservada em E25; a exceção observada não é ocultada. Estabilidade do app-shell, benchmark de sessão/timeline e disciplina dos clientes gerados serão julgados nos lotes responsáveis; não são aprovados por este parecer. |
| **L1-SCOPE** | **PASS no recorte desktop-web** | §§1–9 e as 30 famílias distinguem mecanismos de produção, provas, fixtures, documentação gerada, propostas históricas, idiomas, assets e configuração. As famílias informam consumidores, manutenção e limites. Não há promessa de recuperação de backend, consenso ou execução fora do recorte. TUI, Storybook e os pacotes compartilhados dependem dos outros lotes. |

### Decisão por obrigação L1 pertinente

Os PASS abaixo se restringem à parcela L1 examinada. Não representam conclusão integral das linhas de aceitação do programa.

| Critério | Decisão | Evidência e limite |
|---|---|---|
| **GO-A1 — propriedade transferível** | **FIX-FIRST** | §§1–9 e o mapa de famílias explicam propósito, comportamento, fronteiras e consequências de manutenção. J1-DW-01 impede fechar a precisão exigida para manutenção do startup. |
| **GO-A2 — construção cumulativa** | **PASS local** | O pacote identifica corpo, cobertura, fontes, captures e evidência decisiva persistidos. A base já oferece uso direto para localizar contratos e incertezas; alcance por índice/skill real permanece para a etapa correspondente. |
| **GO-A6 — mecanização e limites** | **PASS local** | Contagem/hash são apresentados como verificação mecânica; discrepâncias e limites são interpretação identificada. Nenhuma execução de produto, custo ou resultado ausente é inventado. |
| **GO-I1 — preservação de identidades** | **PASS local** | Fonte, protocolo, artefato e capturas têm identidades explícitas. O conteúdo não reivindica substituir campanhas anteriores. A preservação global dos objetos protegidos ainda exige os controles próprios. |
| **GO-I2 — distinções epistêmicas** | **PASS** | §1/E02, §2/E07, §§5–7 e §9/E23–E24 distinguem código, inferência estática, expectativa de teste, relato histórico e ausência de prova. |
| **GO-I7 — autoridade e fronteiras** | **PASS local** | §§2, 4–7 e 9 mantêm separados os canais privilegiados, as incertezas de alcance e a autoridade documental. O material importado não é promovido a instrução de execução. |
| **GO-I8 — completude semântica** | **PASS** | A abertura e “Open evidence and maintenance consequences” recusam equiparar hashes, contagens, fixtures ou testes existentes a correção do produto. |
| **AC-01 — cobertura e suporte necessário** | **FIX-FIRST** | O inventário local e as famílias estão delimitados, mas J1-DW-01–03 deixam pendente parte do suporte obrigatório do caso de startup/tradução nativa. |
| **AC-04 — construção real, parcela L1** | **PASS no material demonstrado** | E01–E25 sustentam construção a partir de implementação e instruções reais, inclusive conflitos concretos. Isso não aprova os fixtures futuros de fonte maliciosa, publicação ou execução do produtor. |
| **CC-1 — escopo, fontes e lacunas congelados** | **PASS local** | Abertura, recibo de cobertura, famílias e seção final delimitam o universo, os graus de leitura e as lacunas. Os pedidos deste parecer cabem nesse universo existente. |
| **CC-7 — disposições de compatibilidade e superfícies** | **PASS local** | §§8–9 e famílias de corpus, assets, localização, propostas e harnesses identificam geração, manutenção e limites de reaproveitamento. Não há expansão silenciosamente concluída. |
| **QS-1 — fidelidade** | **FIX-FIRST** | As distinções e conflitos estão bem preservados; resta a precisão obrigatória J1-DW-01. Os pedidos de fonte não constituem contradições comprovadas. |
| **QS-2 — utilidade operacional** | **PASS para L1** | Seções e famílias permitem identificar o mecanismo relevante e suas consequências de manutenção. Procedimentos finais, índices e limites de consumo não são certificados aqui. |
| **QS-3 — simplicidade** | **PASS** | O artefato descreve o sistema e seus limites; não introduz framework, armazenamento paralelo ou mecanismo especulativo. |
| **QS-4 — engenharia** | **PASS no recorte documental** | §§2, 5, 6 e 8 explicitam persistência, identidade, validação, segredos e fronteiras geradas sem alegar correção executada. Nenhuma mudança de produto é solicitada por este parecer. |
| **QS-5 — evidência e escopo de prova** | **REQUEST_EVIDENCE** | E01–E25 delimitam bem a prova disponível, mas os trechos de J1-DW-02–03 são necessários para encerrar os pontos centrais do oráculo. |
| **QS-6 — economia** | **PASS local** | Pacote delimitado, reconciliação determinística e resultados reaproveitáveis; não há estimativas fictícias nem exigência de nova campanha. Os pedidos são trechos de fontes já capturadas. |

### Fidelidade dos achados de domínio

As três lacunas de produto destacadas pelo autor estão adequadamente qualificadas:

- **Reinício após operação estável:** E02 permite inferir `BACKOFF[-1]` e o ramo de não reinício; o texto não afirma reprodução.
- **Admissão IPC não uniforme e CSP parcial:** E03–E05 sustentam a diferença entre mecanismos, sem estabelecer explorabilidade.
- **Diálogo nativo em inglês literal:** E25 demonstra o conflito com a instrução de localização, sem alegar observação da interface em execução.

Esses achados **não exigem consertar o produto para aceitar a base L1**. Exigem manter sua descrição fiel e seus limites explícitos, como o corpo já faz.

### Opcionais e liberação

**Nenhuma sugestão opcional é necessária neste lote.**

Este parecer não aprova L2–L4, consumidores, testes executados, runtime, CI, publicação ou controles comuns S4. **A unidade desktop-web permanece sem aceite final**, e a camada L1 inteira continua bloqueada até a resolução dos achados aplicáveis e o aceite de todas as unidades por ambos os juízes.
