# Pedido público recebido — correção S2 L1 r2

Execução: `46d09d97-39a9-482a-a290-646ba1d94c99`.
Produtor: `/root/s2_l1_corrections`.
Origem: mensagens públicas da principal `/root`.
Este registro preserva os pedidos visíveis; não contém raciocínio privado, oracle ou pacote de juiz.

## Pedido inicial integral

Execute correção delimitada de L1 S2, sem julgar e sem ler oracles/judge packets. Execução46d09d97-39a9-482a-a290-646ba1d94c99; fonte gustavomhss/hugr-orchestra no baseline1cde2ff7a71bcf7aecb5d030917b577165135d38. Área exclusiva /workspace/scratch/7b5d6430f420/genesis-s2/corrections/l1-r2. Leia protocol/SKILL.md, references/fatia-2.md e transport.md e AGENTS relevantes em producers. Os L1 recuperados estão em deliverable/layers/l1/{app-session,design-tui}/l1.md, com coverage/sources/decisive-evidence originais preservados. Não editar esses originais nem outros diretórios. Necessidade pública: os L1 precisam permitir uso operacional direto das suas fronteiras de transporte/contrato, não apenas apontar representante. Reforce dois trechos insuficientes: (1) contrato de catálogo/edição e decoder em packages/app-shell/src/orchestra/chapters/skills-data.ts, sua relação com skills.tsx e regras de ownership; (2) contrato e caminhos API de packages/tui/src/context/session-actions.ts, distinguindo suas operações V2 e adaptação do legado. Leia arquivos EXATOS via GitHub conector (pode reutilizar captures conhecidos se verificar blob SHA/SHA256); não usar gh. Produza versões l1.md completas para ambos, alterando só os parágrafos necessários, mais decisive-delta.md com citações de trechos exatos, sources-delta.json (caminhos,bytes,sha256,git_blob_sha,pin,local_capture_file,connector_response_file), original responses e change-summary.md. Preserve estilos/citações existentes, adicionando seção de nível2 somente se necessária ao uso pontual. Não basta apontar path: explique formato admissível, comportamento do decoder/erro, identidade e ownership, operação realmente disponível e limitações verificadas. Não invente execução nem intenção, não modifique produto. Registre pedido recebido e resposta pública. Critérios: fidelidade, utilidade do intermediário, suporte exato, invariants GO-I1/I2/I7/I8; manter4506paths e casosfontes atávicos sem redução. Não acessar deliverable/oracles ou packets (reservados). L2–L4 seguem bloqueados até camada inteira julgada. Não escrever remotamente; só principal publica após gate.

## Ajuste público de endereçamento por seção

Medi os blocos do reader real: '## Terminal application' atual tem 17.287 bytes, excede consulta routine16.000. A seção específica de contrato/actions que você reforça precisa ser um ## próprio (heading único) ou promover os subsections terminais pertinentes a ##, preservando todo texto e sem inventar novos fatos. Atlas section() só endereça ## e termina no próximo #/##; ### não basta. Prefira um ## útil 'V2 session action boundary' para o novo contrato e reorganize minimamente para que o trecho relevante tenha <16000bytes. Registre essa mudança estrutural no delta; é correção de uso do intermediário, não ampliação do escopo.

## Contagem inicial comunicada pela principal, antes das novas fontes de fronteira

Confirmação mecânica de cobertura: skills-data.ts NÃO estava em sources.json app-session, entrada family-supported; skills.tsx já estava (9863bytes), session-actions.ts já estava (4172bytes). Portanto versão app L1 deve refletir 252 captures, 233 inspected,1624family-supported,30metadata-only (pop1887 inalterada). O acréscimo único é4150bytes de skills-data. Capture/read adicional das demais é preservado no delta sem contagem dupla no catálogo canônico. Principal atualizará coverage/sources; ajuste as frases do novo corpo com esses números ou sinalize conflito concreto. TUI 196captures/185inspected permanece.

## Reconciliação pública após as fontes adicionais

Use os totais corretos que você demonstrou: app255/234inspected/1623family-supported/30metadata, TUI198/185inspected. A ampliação de fontes de fronteira é justificada pelas afirmações novas; mantenha assigned population1887/2087 intacta e registre por unidade quais sources-delta deve incorporar para evitar contagem dupla. Principal fará reconciliação automática com os registros e árvore. Preserve original e declare zero execução de produto. Finalize corpos/evidências.

## Ampliação pública desktop-web

J1 avaliou desktop-web r1 e retornou FIX-FIRST pontual, sem outros defeitos obrigatórios de conteúdo: (J1-DW-01) §1 primeiro parágrafo diz só 'a cwd under desktop user data'; explicitar cwd real userData/global, citando código e separando skill/histórico. (J1-DW-02 REQUEST_EVIDENCE) fornecer owned-serve.ts15–25,94–102,130–141; index.ts431–466 e trecho da skill desktop-startup-maintenance que fixa cwd; E01/E02 atuais não mostram toda corrida/predicado/cap. (J1-DW-03 REQUEST_EVIDENCE) native-translations.ts1–24 para ponte nativa tipada. Amplie correção r2 dentro da sua área com desktop-web/l1.md somente esse pequeno parágrafo + decisive-delta-desktop.md e captura/hashes verificados (fontes já nos193originais). Não mudar produto nem achados estáticos existentes. J2 está julgando independentemente; aguardaremos possíveis findings adicionais antes de selar r2. Sua tarefa continua produção, não julgamento; sem acesso ao oracle.

## Complemento público desktop-web e autorização para finalizar

J2 também retornou FIX-FIRST para mesmo cwd userData/global + readiness/native-translations; nenhum outro defeito. Única evidência adicional pedida por J2: trecho de apps/desktop/src/preload/index.ts que expõe window.api (contextBridge.exposeInMainWorld) e sua entrada tipada/named methods. Reuse captura exata dentro193; junte ao decisive-delta-desktop. Ambos afirmam que não precisa consertar produto. Após esse acréscimo finalize e entregue.

## Reconciliação pública do metadado de família

Integração mecânica encontrou metadado de família que precisa acompanhar sua correção: em app-session coverage.families[id=mcp-skills], evidence_depth_counts ainda family-supported12/inspected2 (deve10/4) e limits diz 'Full MCP source/edit and Skill file writes are family-supported, not exhaustively traced.' Forneça em family-delta.json só os campos semânticos dessa família que precisam distinguir o decoder/writes agora inspecionados e limites remanescentes. Não altere população/família; principal recalcula counts. Pode escrever a frase exata como parte da correção, sem novas leituras.

