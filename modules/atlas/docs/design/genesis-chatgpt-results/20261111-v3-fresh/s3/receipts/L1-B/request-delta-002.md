# Request delta 002 — L1-B Relay

Despacho da orquestradora `/root`, recebido antes de qualquer L2:

Correção obrigatória L1-B antes de L2. J1 PASS v1; J2 FIX-FIRST F1 C3/R2: §4 enumera blankstdout mas falta diagnóstico conjunto exigido. Preserve body-v1.md e registre request-delta-002.md/finding original. Acrescente após tabela ou célulaArm shell: "Com stdout vazio, confira arm `state`, stderr e `relay verify`; runner parado não comprova conclusão." FonteREADMEbaseline L110–117 jácapturada. Sugestãoopcionalaceita raizdebaixorisco: "ID inteiro primeiro"→"ID completo primeiro" evita inteiro numérico. Sem outrosajustes. Conservar max24000bytes. Recalculebodyhash/verification/artifacthashes/response preservando respostasv1. Nãoeditarout/remoto, nãotestes, nãoiniciarL2. Entregueexatodelta/novoSHA. FindingJ2 original: expected 'Indicar como distinguir os significados de stdout vazio usando arm state, stderr e relay verify'; observed 'O corpo enumera os significados possíveis, mas não fornece essa orientação conjunta. README pinado L110–117 a fornece expressamente.' Doisjuízesreavaliarão versãoalterada.

## Escopo aplicado

Apenas dois ajustes no corpo: diagnóstico conjunto com referência pinada após a tabela de drivers; troca de “ID inteiro primeiro” por “ID completo primeiro”. Versão anterior e recibos preservados. A revisão dos dois juízes sobre v2 permanece pendente; a correção do produtor não concede aceite.
