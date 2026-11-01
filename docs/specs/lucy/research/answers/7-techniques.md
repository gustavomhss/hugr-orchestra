# 7-techniques

session ses_71227bf7ca7622b61adc6ec6e32955fd94b5e642ba30337a59f829a9ffd0ffb4

## Answer

Conclusion: the techniques with the strongest evidence for an autonomous reviewer are (a) reading that splits the work by defect class or perspective rather than one generic checklist, (b) proof by execution: a failing test, a mutant, a differential run or a minimized input for each finding, and (c) a separate verifier that checks each candidate finding against external evidence. Intrinsic self-correction (the model re-reading its own output with no new signal) is the weakest link. Its published gains depend on external feedback, and LLM critics produce plausible but hallucinated bugs. Sources were captured for groups 1, 3, 4 and 5. Group 2 (reasoning techniques) and parts of group 3 rest on reasoning, not captured measurements. Hence "partial".

CATALOG (what it is / defect classes / cost / measured effect / when / LLM-executable?)

1. Human inspection and reading
- Fagan inspection: a formal process with set roles (moderator, reader, author, inspectors), entry and exit criteria, and defect data collected to improve the process. Finds logic, interface and design defects. Cost is high because of meetings. Effect: the 1976 abstract reports "substantial net improvements" in quality and productivity (read). Use it for high-risk modules. LLM: yes as a staged pipeline; the meeting step becomes merging and deduplicating the findings.
- Checklist-based reading (CBR): Porter/Votta/Basili found checklist reviewers no more effective than ad hoc reviewers (read). Cheap. LLM: easy, but low value used alone.
- Scenario / defect-based reading (DBR): each reviewer runs a procedure aimed at one defect class. It had a higher detection rate than ad hoc or checklist reading, with no loss on other defect classes, and has been widely replicated (read; measured on requirements documents, not code). LLM: yes, and the strongest fit, as one subagent per defect class.
- Perspective-based reading (PBR, Basili): each reader takes one stakeholder view (tester, developer, user). The goal is better document coverage than the same number of readers using their usual technique (read). LLM: yes, as perspective prompts. For example, the tester view asks the reader to derive tests.
- Usage-based reading, Parnas active design reviews, walkthroughs, pair, tour and risk-based review, change impact analysis: no primary source captured. Active design reviews make the reviewer answer specific questions instead of approving; LLM-friendly, since it forces evidence. Impact analysis is mechanizable through callers and references (inferred).
- Modern code review (MCR): at Microsoft it was "less about defects than expected" (read). Defect hunting therefore has to be designed into the review on purpose.

2. Reasoning techniques for correctness (inferred; not individually measured here)
- Invariant and contract checking; data-flow and control-flow and taint tracing; boundary and edge-case enumeration; error-path review and FMEA; concurrency and state-machine review; API and compatibility diffing against the base; pre-mortem and red-team review.
- Each maps to one defect class, so the scenario-based reading evidence suggests splitting them into separate passes (inferred).
- An LLM can enumerate them reliably. Its conclusions about interprocedural flow are unreliable without tools. IRIS (LLM plus CodeQL taint analysis) found 55 of 120 real vulnerabilities, against 27 for CodeQL alone (read).

3. Execution-backed techniques
- Mutation testing: mutant detection correlates significantly with real-fault detection, independent of coverage, across 357 real faults (read). Use it to judge whether the tests in a PR would catch a regression. Cost: CPU-heavy. LLM: can drive the tools.
- Delta debugging (ddmin/dd, Zeller and Hildebrandt, TSE 2002), differential testing (McKeeman 1998), property-based testing, fuzzing, fault injection, and a reproduction test per finding: primary sources not captured. Running the base and head revisions on the same inputs is the cheapest oracle for regressions (inferred).
- LLM: reliable when a harness exists. These are the main way to turn a hypothesis into a confirmed finding.

4. AI critic and verification
- Trained critics (CriticGPT): critiques preferred over human ones in 63% of cases. They hallucinate bugs, but human+critic teams hallucinate less (read).
- Chain-of-verification (CoVe): verification questions answered independently of the draft; this reduces hallucination (read).
- Self-consistency voting: GSM8K +17.9% (read).
- Debate: improves reasoning (read). With debate, non-expert judges reached 76% (models) and 88% (humans), against 48% and 60% baselines (read).
- Self-Refine: about 20% average gain (read). Reflexion: 91% pass@1 on HumanEval using task feedback (read). Without external feedback, self-correction struggles and can degrade (read), so refine only against a test, compiler or tool result.
- Calibration: P(True) self-evaluation improves when the model sees several of its own samples (read). Use it to rank and cut findings.
- Retrieval of similar past defects: no source captured (inferred value only).

5. Pipeline (inferred)
- Triage: risk and impact analysis over the diff and its callers.
- Hypothesis generation: parallel defect-class and perspective passes plus tool signals (static analysis, taint).
- Verification: an independent verifier per hypothesis that uses CoVe-style questions and execution (a reproduction test, base-vs-head differential run, mutant). Vote or debate only when execution is impossible.
- Dedup by root cause, then rank by severity times calibrated confidence. Report only findings verified by execution or quoted evidence.
- Precision comes from grounded verification. Recall comes from splitting work by defect class plus tools.
- Industry caution: in an industrial study (Cihan et al., ICSE-SEIP 2025), 73.8% of LLM review comments were resolved, but there were faulty, unnecessary and irrelevant comments, and PR closure time increased (read).

Not examined: full texts (only abstracts and summaries), Parnas 1985, usage-based reading (Thelin), FMEA/pre-mortem sources, PBT/fuzzing/fault-injection effectiveness, and recent LLM-review benchmarks. Cut for the deadline. Deciding the pipeline's real precision and recall would need an internal benchmark of seeded and historical bugs. No behavioral claim was made, so there is no reproduction command.

## Claims

[]
