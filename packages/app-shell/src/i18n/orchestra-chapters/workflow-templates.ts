// Copy for the workflow templates the Workflows screen offers, kept apart from workflows.ts to hold that file under
// the godfile limit.
export const WORKFLOW_TEMPLATES_COPY = {
  "orchestra.workflows.template.blank": "Start from scratch",
  "orchestra.workflows.template.blankBody": "An empty plan. Add your own steps and checks.",
  "orchestra.workflows.template.tddFeature": "Test-driven feature",
  "orchestra.workflows.template.tddFeature.body":
    "Builds a feature test first: a failing test, then the code that passes it, then a tidy-up. Each step must pass its checks before the next one starts.",
  "orchestra.workflows.template.wpExecute": "Build one work package",
  "orchestra.workflows.template.wpExecute.body":
    "Builds one work package test first, then tidies it, and marks it done only when its checks pass.",
  "orchestra.workflows.template.bugfix": "Fix a bug with proof",
  "orchestra.workflows.template.bugfix.body":
    "A failing test reproduces the bug, the smallest root-cause fix turns it green, and a short note explains what was wrong. Judges reject a fix that only hides the symptom.",
  "orchestra.workflows.template.safeRefactor": "Refactor safely",
  "orchestra.workflows.template.safeRefactor.body":
    "Writes down what must not change, pins it with tests against today's code, refactors, then proves every invariant still holds.",
  "orchestra.workflows.template.featureLaunch": "Launch a feature end to end",
  "orchestra.workflows.template.featureLaunch.body":
    "Six phases from idea to pull request: explore, spec with numbered acceptance criteria, plan, build test first, polish, review and hand off. Every criterion is traced from spec to test to review.",
  "orchestra.workflows.template.design": "Design a product from an idea",
  "orchestra.workflows.template.design.body":
    "Turns a raw idea into a ratified product design, one gated step at a time.",
  "orchestra.workflows.template.planning": "Plan from a frozen spec",
  "orchestra.workflows.template.planning.body":
    "Turns an approved spec into a buildable plan: frame the problem, split it into work packages, order them, then hand them out.",
  "orchestra.workflows.template.research": "Research a question",
  "orchestra.workflows.template.research.body":
    "Weighs competing explanations and sources, and records how sure each conclusion is, so someone else could repeat the search.",
  "orchestra.workflows.template.specDecompose": "Break a spec into work packages",
  "orchestra.workflows.template.specDecompose.body":
    "Turns a frozen intent into work packages through five gated phases.",
  "orchestra.workflows.template.copy": "A copy of this workflow, as a new draft.",
  "orchestra.workflows.template.empty": "No steps yet",
  "orchestra.workflows.template.toolsMissing": "Needs tools not available yet",
  "orchestra.workflows.template.toolsMissingTitle":
    "This project checks its work with Relay tools that are not available yet. It can be read and edited, but it cannot run.",
}

export const WORKFLOW_TEMPLATES_COPY_BR: Record<keyof typeof WORKFLOW_TEMPLATES_COPY, string> = {
  "orchestra.workflows.template.blank": "Começar do zero",
  "orchestra.workflows.template.blankBody": "Um plano vazio. Adicione suas próprias etapas e verificações.",
  "orchestra.workflows.template.tddFeature": "Funcionalidade guiada por testes",
  "orchestra.workflows.template.tddFeature.body":
    "Constrói uma funcionalidade começando pelo teste: um teste que falha, depois o código que o faz passar, depois uma arrumação. Cada etapa precisa passar nas suas verificações antes da próxima.",
  "orchestra.workflows.template.wpExecute": "Construir um pacote de trabalho",
  "orchestra.workflows.template.wpExecute.body":
    "Constrói um pacote de trabalho primeiro com testes, depois o simplifica, e só o marca como pronto quando as verificações passam.",
  "orchestra.workflows.template.bugfix": "Corrigir um bug com prova",
  "orchestra.workflows.template.bugfix.body":
    "Um teste que falha reproduz o bug, a menor correção na causa raiz o deixa verde, e uma nota curta explica o que estava errado. Os juízes recusam uma correção que só esconde o sintoma.",
  "orchestra.workflows.template.safeRefactor": "Refatorar com segurança",
  "orchestra.workflows.template.safeRefactor.body":
    "Escreve o que não pode mudar, fixa isso com testes sobre o código de hoje, refatora e depois prova que cada invariante continua valendo.",
  "orchestra.workflows.template.featureLaunch": "Lançar uma funcionalidade de ponta a ponta",
  "orchestra.workflows.template.featureLaunch.body":
    "Seis fases da ideia ao pull request: explorar, especificar com critérios de aceite numerados, planejar, construir começando pelo teste, polir, revisar e entregar. Cada critério é rastreado da especificação ao teste e à revisão.",
  "orchestra.workflows.template.design": "Desenhar um produto a partir de uma ideia",
  "orchestra.workflows.template.design.body":
    "Transforma uma ideia bruta em um desenho de produto validado, uma etapa com verificações por vez.",
  "orchestra.workflows.template.planning": "Planejar a partir de uma especificação congelada",
  "orchestra.workflows.template.planning.body":
    "Transforma uma especificação aprovada em um plano executável: define o problema, divide em pacotes de trabalho, ordena e distribui.",
  "orchestra.workflows.template.research": "Pesquisar uma pergunta",
  "orchestra.workflows.template.research.body":
    "Pesa explicações e fontes concorrentes e registra o grau de certeza de cada conclusão, para que outra pessoa possa repetir a busca.",
  "orchestra.workflows.template.specDecompose": "Dividir uma especificação em pacotes de trabalho",
  "orchestra.workflows.template.specDecompose.body":
    "Transforma uma intenção congelada em pacotes de trabalho, por meio de cinco fases com verificações.",
  "orchestra.workflows.template.copy": "Uma cópia deste workflow, como novo rascunho.",
  "orchestra.workflows.template.empty": "Nenhum passo ainda",
  "orchestra.workflows.template.toolsMissing": "Precisa de ferramentas que ainda não estão disponíveis",
  "orchestra.workflows.template.toolsMissingTitle":
    "Este projeto verifica o trabalho com ferramentas do Relay que ainda não estão disponíveis. Dá para ler e editar, mas não pode ser executado.",
}
