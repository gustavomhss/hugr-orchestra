# Privacy primary-source capture attempt

Attempted 2026-11-04. Scope: the direct ePrivacy, UK and original WP248 source-access gaps recorded in
`e43c5668e6:docs/specs/lucy/privacy-sources.md`, as they relate to the privacy leaf at the same commit.
This is a source-access record, not legal advice, a jurisdictional applicability determination, a finding
about any product, or evidence of compliance. No runtime skill was changed.

## Official sources actually read

- The [European Commission WP29 archive entry](https://ec.europa.eu/newsroom/article29/item-detail.cfm?item_id=611236)
  was directly readable. It labels its item **“Guidelines on Data Protection Impact Assessment (DPIA)
  (wp248rev.01)”**, dates that entry **13/10/2017**, and links the original document at
  `https://ec.europa.eu/newsroom/just/document.cfm?doc_id=47711`. The entry identifies a document; it is
  not the document's operative text and does not establish the contents of the nine criteria.
- The [EDPB endorsed-guidelines page](https://www.edpb.europa.eu/endorsed-wp29-guidelines_en?doc_id=47742)
  was directly readable. It says: **“During its first plenary meeting the European Data Protection Board
  endorsed the GDPR related WP29 Guidelines”**, and item 6 names **“Guidelines on Data Protection Impact
  Assessment (DPIA) and determining whether processing is "likely to result in a high risk" for the
  purposes of Regulation 2016/679, WP248 rev.01”**. This confirms the page's endorsement statement, not
  independent direct reading of the guideline or a statute. The page does not itself state the meeting's
  date or establish jurisdictional applicability here.

WP248 is guidance, not itself a binding statute. No operative legal clause or original WP248 passage was
captured in this attempt; no legal quotation below is reconstructed from search-index excerpts.

## Exact access failures and remaining gaps

| Requested primary source | Direct attempt and observed result | Remaining capture |
|---|---|---|
| Directive 2002/58/EC, consolidated Art 5(3) and Art 6 | [EUR-Lex 2009-12-19 consolidation](https://eur-lex.europa.eu/eli/dir/2002/58/2009-12-19/eng), HTML, returned an AWS WAF JavaScript verification challenge, not legal text. [CELEX consolidation](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A02002L0058-20091219) and [original act](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32002L0058) returned the same challenge. | Read and quote both full articles directly, including their scope and exceptions, from an accessible authoritative current consolidated text. Verify current status and applicable national implementation separately. The 2009-12-19 URL is a version identifier, not a claim that the fetched challenge establishes current status. |
| Amending Directive 2009/136/EC | [EUR-Lex official original](https://eur-lex.europa.eu/eli/dir/2009/136/oj/eng), HTML, returned the WAF challenge. The [2020-12-21 consolidated HTML text request](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML?uri=CELEX%3A02009L0136-20201221) returned no text through the fetcher. | Directly capture the relevant amending provision and establish its relation to the consolidated directive; do not substitute the original directive's unamended wording or an indexed extract. |
| UK PECR 2003 regulation 6 | [Current regulation URL](https://www.legislation.gov.uk/uksi/2003/2426/regulation/6), text, returned no text. Its [XML](https://www.legislation.gov.uk/uksi/2003/2426/regulation/6/data.xml) and [XHTML](https://www.legislation.gov.uk/uksi/2003/2426/regulation/6/data.xht?view=snippet&wrap=true) variants returned an AWS WAF JavaScript verification challenge. The [as-made variant](https://www.legislation.gov.uk/uksi/2003/2426/regulation/6/made?view=plain) also returned that challenge. | Read current regulation 6, including exceptions, jurisdiction, amendments and the official point-in-time/status date. The as-made version, even if later accessible, cannot be represented as the current amended text without checking changes. |
| UK GDPR Art 35 | [Official UK legislation](https://www.legislation.gov.uk/eur/2016/679/article/35?view=plain), HTML, returned an AWS WAF JavaScript verification challenge. The [ICO DPIA guidance](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/accountability-and-governance/data-protection-impact-assessments-dpias/when-do-we-need-to-do-a-dpia) returned HTTP 403. | Directly read the current applicable provision and official guidance, including amendment/status cautions and exceptions, before claiming source closure. |
| Original WP248 rev.01 | The [Commission's linked original](https://ec.europa.eu/newsroom/just/document.cfm?doc_id=47711), plus [archive alias](https://ec.europa.eu/newsroom/document.cfm?doc_id=47711) and language-parameter variant, returned `Unsupported fetched file content type: application/` from the read-only fetcher. | Obtain and read the actual official original PDF or authoritative full text, with its revision, dates, criteria and qualifications; the readable index and EDPB endorsement do not replace it. |

The fetcher did not expose an HTTP error status for the WAF pages or empty responses, so none is asserted.
No challenge was solved, login attempted, local PDF executable run, or indexed search extract substituted.
These direct-source gaps remain open. A human must determine the applicable regime and exceptions for an
actual processing change; a screening prompt or a source access failure is not an overall verdict.

## Follow-up: original WP248 rev.01 directly read

On 2026-11-04 an ordinary GET of the Commission's original URL,
https://ec.europa.eu/newsroom/just/document.cfm?doc_id=47711, returned HTTP 200, content type
`application/`, and 1,137,918 bytes beginning `%PDF-1.5`. SHA-256 of those obtained bytes:
`4de1ee2df6bbe9517847b45ba8b0657e7de4c1bd796f107d940df255ca6ded67`. The native PDF reader
successfully read the 22-page document. This hash identifies the bytes read, not a guarantee of future
URL contents. The earlier fetcher limitation above is retained as history, not a continuing PDF blocker.

The title page identifies **17/EN, WP 248 rev.01**, adopted 4 April 2017 and last revised and adopted
4 October 2017. This is WP29 guidance on EU Regulation 2016/679, not a statute or a determination
that any particular processing or jurisdiction is covered.

Pages 9–11 identify nine screening criteria: evaluation or scoring; automated decisions with legal or
similarly significant effect; systematic monitoring; sensitive or highly personal data; large-scale
processing; matching or combining datasets; vulnerable data subjects; innovative technological or
organisational solutions; and processing that prevents a person exercising a right or using a service
or contract. Page 9 says these are “the following nine criteria” that “should be considered”. Page 10
specifies that assessing large scale considers the number of people, volume or range of data, duration
and geographic extent. These are criteria to examine in context, not a mechanical compliance verdict.

The document's qualifications matter:

- Page 11: “In most cases, a data controller can consider that a processing meeting two criteria would
  require a DPIA to be carried out.” It immediately adds: “However, in some cases, a data controller
  can consider that a processing meeting only one of these criteria requires a DPIA.”
- Page 12: “a processing operation may correspond to the above mentioned cases and still be considered
  by the controller not to be ‘likely to result in a high risk’”; the guidance says the controller should
  justify and document that decision and include or record the data protection officer's views. The same
  page notes supervisory authorities' lists and discusses similar processing and other exceptions;
  page 13 supplies further conditions. Neither a single criterion nor a count is an unconditional answer.
- Page 17 quotes the review provision: “Where necessary, the controller shall carry out a review to
  assess if processing is performed in accordance with the data protection impact assessment at least
  when there is a change of the risk represented by processing operation”. The document attributes this
  to Article 35(11); it is a quotation within the guidance, not a fresh capture of current statutory text.

The original WP248 criteria/source-access gap is now closed for the specific text above. Current
EU and UK statutory text, amendments, national implementation, PECR regulation 6 and the other WAF
or access failures recorded above remain unverified; no legal applicability or full compliance is claimed.
