---
name: lucy-audit-compliance-privacy
description: "Find risks in a personal-data processing change; legal applicability and certification remain human decisions."
when: "The privacy lens is routed for a change affecting personal-data processing."
not-when: "The change does not affect personal-data processing or the task seeks a legal certification."
---

# Privacy processing changes

Trace changed categories of personal data from collection through purpose, defaults, access, logs, storage, retention, deletion, transfers and third-party sinks. Compare actual flows with base-revision requirements and documented purpose. Cite the changed line, affected data, concrete trigger and written expectation for `class:privacy.processing`; author transcripts, PR descriptions and policy assertions are not evidence of implementation. Unknown facts become questions, not findings or passes.

## Screening prompts

- **Terminal storage:** trace added cookies, SDK storage and reads on a user's device to their purpose and any notice or choice path. Directive 2002/58/EC Art 5(3), as amended, addresses storage or access on terminal equipment, with exceptions for transmission and strictly necessary requested services. Whether national law applies and an exception fits is a human decision. Source: https://eur-lex.europa.eu/eli/dir/2002/58/2009-12-19/eng
- **Risk assessment:** look for evaluation or scoring, consequential automated decisions, systematic monitoring, sensitive or highly personal data, large-scale processing, combined datasets, vulnerable people, innovative technology or organisation, and processing that prevents exercise of a right or use of a service or contract. These are screening indicators, not a mechanical verdict. Ask whether changed risk calls for assessment or review. WP248 rev.01 is endorsed by EDPB: https://www.edpb.europa.eu/endorsed-wp29-guidelines_en?doc_id=47742 ; its criteria are also described at https://www.edpb.europa.eu/sme/be-compliant/be-compliant_en
- **UK:** ask whether the change alters processing likely to create high risk, or the risk in an existing assessment. UK GDPR Art 35 concerns assessment before high-risk processing and review when appropriate; applicability and assessment adequacy are human decisions. Source: https://www.legislation.gov.uk/eur/2016/679/article/35
- **Brazil:** trace children's and adolescents' data and the effect on their interests; inspect access, correction, deletion and automated-decision review paths. LGPD Arts 14, 18 and 20 address these concerns with conditions; Art 20 does not itself say every review must be human. Ask whether processing records and a requested impact report reflect the change (Arts 37–38). Source: https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709compilado.htm
- **California:** trace collection notices, categories, purposes and rights-request paths, including deletion and exceptions; ask whether CCPA as amended by CPRA applies. Sources: California Civil Code §§ 1798.100, 1798.105, https://leginfo.legislature.ca.gov/faces/codes_displayText.xhtml?lawCode=CIV&division=3.&title=1.81.5.&part=4.&chapter=&article and California AG https://oag.ca.gov/privacy/ccpa

Also inspect credentials, security, incident detection, risk changes and new international destinations. Ask for the relevant legal basis, transfer mechanism, records and assessment; do not decide their adequacy or infer consent, retention or notification duties from a diff. This is processing-change review, not legal advice, an exhaustive compliance audit or certification.
