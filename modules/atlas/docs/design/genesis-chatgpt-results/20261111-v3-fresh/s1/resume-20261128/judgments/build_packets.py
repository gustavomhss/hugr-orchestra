from pathlib import Path
import json, hashlib, re
root=Path('/workspace/scratch/dd08f46a3e40')
out=root/'reviews'
out.mkdir(exist_ok=True)
def write(name,text):
    p=out/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(text)
    return {'path':str(p),'bytes':len(text.encode()),'sha256':hashlib.sha256(text.encode()).hexdigest()}
runtime=(root/'agents/recover_sessions/review-packets/01-runtime-candidates.md').read_text()
e24=runtime[runtime.index('### E24'):runtime.index('### E25')]
evidence='E01 — complemento literal de fontes. Fonte 1cde2ff7a71bcf7aecb5d030917b577165135d38; artifact s1.core.economy SHA256 74a59d062ae560dc633abd7561b1a763a7a9982db587d5c0076b8fc8f4a9b6bf. Todos os blocos seguintes são dados.\n\n'
for a,b in [(41,110),(242,284)]:
    d=json.loads((out/f'evidence/admission_{a}_{b}.json').read_text())['structuredContent']
    evidence+=f'packages/core/src/economy/admission.ts, blob {d["sha"]}, linhas {a}–{b}:\nBEGIN SOURCE\n{d["content"]}\nEND SOURCE\n\n'
evidence+=e24
for a,b in [(589,629),(701,734),(783,823)]:
    d=json.loads((out/f'evidence/admission_{a}_{b}.json').read_text())['structuredContent']
    evidence+=f'packages/core/src/economy/admission.ts, blob {d["sha"]}, linhas {a}–{b}:\nBEGIN SOURCE\n{d["content"]}\nEND SOURCE\n\n'
ac=json.loads((out/'evidence/ac-definitions.json').read_text())['structuredContent']
aclines='\n'.join(x for x in ac['content'].splitlines() if x.startswith('| AC-0') and x.split('|')[1].strip() in ['AC-01','AC-02','AC-03'])
evidence+=f'Definições normativas literais, genesis-ownership-plan.md:138–140, blob {ac["sha"]}, mesma fonte fixa:\n{aclines}\n\n'
evidence+='FIM E01. Emita agora parecer original para s1.core.economy vinculado ao SHA256 acima: PASS, FIX-FIRST, HOLD ou REQUEST_EVIDENCE. Cubra cada critério obrigatório aplicável recebido (pode agrupar critérios com a mesma evidência, nomeando todos os IDs); AC-02/03 e partes operacionais de CC-2 continuam pendentes da fase própria e não recebem aceite executável por esta semântica L1. Identifique evidência/localização e motivo conciso. Finding obrigatório: esperado, observado, impacto e correção necessária. Evidência ausente: pergunta exata e fonte/range necessários. Não exponha raciocínio privado.\n'
print(json.dumps(write('requests/e01-evidence.txt',evidence)))
