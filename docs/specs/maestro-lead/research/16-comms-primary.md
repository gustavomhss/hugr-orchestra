# 16. How Maestro talks to its owner: primary sources

Every source below was fetched on 2026-10-28 and read in full or in the cited sections. The URL is the page actually read. Anything that could not be fetched is listed under "Not fetched" and is not used as evidence. Quotes are under 15 words, at most one per source.

Maestro message types used in the mapping:

- **Decision**: a request for the owner to choose, always with a recommendation.
- **Blocker**: work cannot continue without the owner.
- **Progress**: status of work in flight.
- **Landed**: work merged or finished.
- **Alert**: something urgent the owner must act on now.
- **Digest**: a batched summary of things that did not need an interrupt.
- **Answer**: a reply to the owner's question.
- **Out-of-scope**: a request Maestro will not or cannot take.

Evidence strength scale used in the rules table:

- **Strong**: controlled experiment, field experiment or meta-analysis with reported numbers.
- **Medium**: a large-sample usability study, an official standard, or long institutional practice with stated reasons.
- **Weak**: a single practitioner's opinion, a secondary blog, or a number with no traceable study.

---

## 1. Completed Staff Work (1942)

- **URL**: https://govleaders.org/completed-staff-work.htm (mirror; the Air University .mil copy did not resolve). Fetched 2026-10-28.
- **Attribution on the page**: Col. Archer J. Lerch, for the Provost Marshal General, Army and Navy Journal, 29 January 1942. Other attributions exist; this pass did not fetch them.
- **Rules**:
  - Present the problem worked out to the point where the chief only approves or disapproves.
  - Work out the details yourself, not with the chief. Propose one action: the best one you considered.
  - Don't worry the chief with long explanations. If the chief wants comment, the chief will ask.
  - A rough draft is fine, but it must not shift the burden of the action back to the chief.
  - Final test: would you sign it yourself and stake your professional reputation on it being right?
- **Quote**: "He needs answers, not questions."
- **Evidence**: doctrine from long institutional practice. No measurement.
- **Maps to**: **Decision** (one recommended action, approve or reject), **Blocker** (bring the proposed way out, not only the problem).

## 2. AR 25-50, Preparing and Managing Correspondence (US Army)

- **URL**: https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN42124-AR_25-50-007-WEB-13.pdf (edition dated 10 Oct 2020, change 007 dated 10/04/2024). Fetched 2026-10-28.
- **Rules**:
  - Para 1–38a: writing must be understood in a single rapid reading.
  - Para 1–38b names two essential requirements:
    - Put the main point at the beginning (bottom line up front, BLUF).
    - Use active voice. The regulation's passive example takes 7 words and the active version 5.
  - Para 1–39b, specific techniques:
    - Use short words.
    - Keep the average sentence to about 15 words.
    - Keep paragraphs to 10 lines or fewer.
    - Avoid jargon.
    - Use "I", "you" and "we".
    - Avoid openers like "It is", "There is" and "There are".
    - Keep letters and memos to one page; put detail in enclosures.
  - Para 2–8: a decision memorandum is at most 2 pages. Its body holds purpose, recommendation, discussion and coordination, with the recommendation placed early.
- **Quote**: "understood in a single rapid reading".
- **Evidence**: official standard. No experiment is cited.
- **Maps to**: every type, especially **Decision**, **Blocker** and **Landed** (main point first, one screen, details linked).

## 3. Amazon shareholder letters (SEC EDGAR, Exhibit 99.1)

- **URLs**, all fetched 2026-10-28:
  - 2015 letter: https://www.sec.gov/Archives/edgar/data/1018724/000119312516530910/d168744dex991.htm
  - 2016 letter: https://www.sec.gov/Archives/edgar/data/1018724/000119312517120198/d373368dex991.htm (also read on aboutamazon.com)
  - 2017 letter: https://www.sec.gov/Archives/edgar/data/1018724/000119312518121161/d456916dex991.htm
- **Rules**:
  - 2015 letter:
    - Type 1 decisions are one-way doors and must be made methodically, carefully and slowly.
    - Type 2 decisions are two-way doors and should be made quickly by individuals or small groups with high judgment.
    - Using the heavy Type 1 process for Type 2 decisions causes slowness and risk aversion.
  - 2016 letter:
    - Never use a one-size-fits-all decision process.
    - Most decisions should be made with about 70% of the information you wish you had; waiting for 90% usually means being slow.
    - Be good at course-correcting.
    - Use "disagree and commit" to save time.
    - Recognize true misalignment early and escalate it immediately.
  - 2017 letter:
    - No PowerPoint. Use narratively structured six-page memos, read silently at the start of the meeting.
    - A great memo can take a week or more to write, and the hard part is knowing the right scope.
- **Quote** (2015): "methodically, carefully, slowly".
- **Evidence**: practice of one company, with reasons stated. The 70% figure is a heuristic, not a measurement.
- **Maps to**:
  - **Decision**: say whether it is a one-way or two-way door. Ask the owner only about one-way doors, and decide two-way doors yourself.
  - **Blocker**: escalate real misalignment immediately.
  - Six-page narratives are for design reviews, not for owner messages; see the conflicts section.

## 4. Minto Pyramid Principle and SCQ

- **URLs**: https://www.barbaraminto.com/ and https://www.barbaraminto.com/concept (the official site). Fetched 2026-10-28.
- **Rules**:
  - Organize ideas as a pyramid under a single governing point. Lead the reader down from that point.
  - The method applies to emails and one-page memos as well as reports.
  - Use Situation, Complication, Question (SCQ) to find the question already in the reader's mind. The top of the pyramid answers it.
- **Quote**: none taken.
- **Evidence**: practitioner method (McKinsey origin). No experiment.
- **Maps to**:
  - **Decision** and **Blocker**: one line of situation and complication, then the question, then the answer as the recommendation.
  - **Answer**: give the answer first, then the support.

## 5. Plain language: digital.gov / plainlanguage.gov, GOV.UK, GDS

### 5a. US Federal Plain Language Guidelines

- **URLs**, all fetched 2026-10-28:
  - https://digital.gov/guides/plain-language/ (plainlanguage.gov redirects here)
  - its pages /writing/clear-short and /writing/style
  - the raw guideline sources at https://github.com/GSA/plainlanguage.gov (`_pages/guidelines`)
- **Rules**:
  - Put one idea in each sentence.
  - Keep paragraphs to 3–8 sentences and about 150 words. Never go over 250 words.
  - Give each paragraph one topic and open it with a topic sentence.
  - Keep sections short.
  - Avoid noun strings and abbreviations.
  - Put the main idea before exceptions and conditions.
  - Use active voice: "You must do it", not "It must be done".
  - Use "must" for requirements; "shall" is obsolete.
  - Write for readers who want answers quickly.
- **Quote**: "Place the main idea before exceptions and conditions."
- **Evidence**: official standard (Plain Writing Act guidance). No experiment cited on these pages.
- **Maps to**:
  - all types
  - **Blocker** and **Alert**: the main idea comes before the caveats

### 5b. GOV.UK writing standards and service manual

- **URLs**, all fetched 2026-10-28, under https://guidance.publishing.service.gov.uk/writing-to-gov-uk-standards/:
  - writing-guidelines/clear-language
  - clear-structure
  - summaries
  - the A to Z style guide
  - and the service manual page https://www.gov.uk/service-manual/design/writing-for-user-interfaces
- **Rules**:
  - Plain English is mandatory.
  - Use active voice.
  - Keep paragraphs to 5 sentences or fewer.
  - Check any sentence over 25 words and split it.
  - Use "must" for legal requirements, "need to" for steps in a process, and "can" for options.
  - Avoid negative contractions.
  - Front-load: put the most important information first, as an inverted pyramid.
  - Don't write headings as questions.
  - Don't repeat the summary in the body.
  - Keep a summary to 160 characters.
  - In interfaces, put one idea in each sentence and the important words first. "Wrong password" beats a long sentence.
- **Evidence on the pages**:
  - 1 in 6 adults in England have very poor literacy.
  - People read only 20–28% of a page, in an F pattern.
  - In one study cited by GOV.UK, 80% preferred clear English, and the preference rose with the reader's expertise.
- **Quote**: none taken.
- **Strength**: medium. These are official standards citing outside data, and the sources behind the numbers were not fetched in this pass.
- **Maps to**:
  - all types
  - the 160-character summary fits the first line of a **Digest** item or a **Landed** report
  - "important words first" fits the **Alert** title

### 5c. GDS reading age

- **URL**: https://gds.blog.gov.uk/2016/04/06/guest-post-looking-at-the-different-ways-to-test-content/. Fetched 2026-10-28.
- **Rule**: aim for a reading age of 9, with 15 as the maximum. The post says this target has "been reported", without a study, and the current official GOV.UK pages fetched above do not state it.
- **Evidence**: weak (a guest blog post).
- **Maps to**: tone guidance only. Do not enforce it as a metric.

## 6. Nielsen Norman Group

All fetched 2026-10-28 from https://www.nngroup.com/articles/.

- **How Users Read on the Web** (Nielsen 1997), /how-users-read-on-the-web/:
  - 79% of test users scanned and 16% read word by word.
  - Concise text gave 58% better usability, scannable text 47%, and both combined 124%.
  - Strength: medium (small-sample usability tests, large effects).
- **How Little Do Users Read?** (2008), /how-little-do-users-read/:
  - Users read at most 28% of the words on an average visit, and 20% is more likely.
  - Strength: medium (log analysis).
- **F-shaped pattern** (Pernice 2017), /f-shaped-pattern-reading-web-content/:
  - Put the most important points in the first two paragraphs.
  - Start headings and bullets with words that carry information, because readers often see only the first two words.
- **Inverted pyramid** (2018), /inverted-pyramid/:
  - Start with the conclusion, so a reader who stops at any point still has the main point.
- **Error-message guidelines** (2023), /error-message-guidelines/:
  - Use human-readable language.
  - Describe the problem concisely and precisely.
  - Offer a constructive remedy.
  - Don't blame the user.
  - Match the visual weight to the severity.
  - Hide error codes unless they help diagnosis.
- **Confirmation dialogs**, /confirmation-dialog/:
  - Ask for confirmation only for serious or irreversible actions; routine confirmations become noise that users click through.
  - State the specific consequence. Never ask a bare "Are you sure?".
  - Label the buttons with outcomes, such as "Delete file" and "Keep file".
  - Prefer undo over confirmation.
- **Progress indicators** (2014), /progress-indicators/:
  - Use a looped indicator for waits of 2–10 seconds, and a percent-done bar or time estimate beyond 10 seconds.
  - A cited University of Nebraska study found users waited about 3 times longer when they could see a progress bar.
- **Push notifications** (2018), /push-notification/:
  - Notifications either require action or are passive.
  - Avoid bursts and irrelevant content.
  - Users received about 56 notifications a day in 2016 (Pielot et al., cited on the page).
- **Quote** (inverted pyramid): none taken.
- **Maps to**:
  - all types: conclusion first, first two words carry the information
  - **Blocker** and **Alert**: shaped like an error message (what happened, what it means, what to do)
  - **Decision**: confirmation only for one-way doors; option labels name the outcome
  - **Progress**: indicator rules
  - **Digest**: passive items are batched, not pushed

## 7. GitLab handbook

All fetched 2026-10-28.

- **Values**, https://handbook.gitlab.com/handbook/values/:
  - Bias for action: avoid analysis paralysis.
  - Disagree, commit, and advocate.
  - Two-way-door decisions need less input.
  - Escalate to unblock early, and give context when you do.
  - Bias toward asynchronous communication.
  - Bring a proposal instead of calling a meeting.
  - Quote: "Every meeting should be a review of a proposal".
- **Communication**, https://handbook.gitlab.com/handbook/communication/:
  - Be explicit and give as much context as possible (low-context communication).
  - When you link something, include a preview of what the link contains.
  - When you need something, say so explicitly and @mention the person.
  - Async is the default. Use sync only when there is real disagreement.
  - For a decision already made, explain why it was made and link to where feedback goes.
  - Use formal acknowledgment requests sparingly, because too many make them lose their power.
- **DRI**, https://handbook.gitlab.com/handbook/people-group/directly-responsible-individuals/:
  - The DRI is ultimately accountable and has the final decision. The term comes from Apple.
  - DRIs must consult relevant stakeholders but don't owe a justification for every decision, to avoid analysis paralysis.
- **Evidence**: company practice (all-remote, large scale). No measurement.
- **Maps to**:
  - **Decision**: a proposal with a recommendation, not an open question
  - **Blocker**: escalate early, with context
  - **Landed**: what changed, why, and a link with a preview
  - **Out-of-scope**: state who the DRI is
  - **Answer**: low-context, self-contained

## 8. Basecamp / 37signals

- **Shape Up, chapter 13**, https://basecamp.com/shapeup/3.4-chapter-13. Fetched 2026-10-28.
  - Report status without counting tasks or giving numeric estimates; "percent complete" is meaningless while the work is still uphill.
  - Uphill means unknowns are still being figured out. Downhill means execution with certainty.
  - Self-serve status avoids interrupting the team.
  - A dot that doesn't move on the hill chart is a raised hand.
  - People rarely say "I don't know", so uncertainty gets hidden unless the format surfaces it.
- **Guide to Internal Communication**, https://37signals.com/how-we-communicate. Fetched 2026-10-28.
  - Communicate in real time sometimes, asynchronously most of the time.
  - Writing solidifies, chat dissolves.
  - If words can be read different ways, assume they will be read the most harmful way.
  - Expecting an immediate response is toxic; urgency is overrated.
  - Lead titles with the most important information.
  - "Now" is often the wrong time to say something.
  - If you want an answer, ask a question.
  - Automatic daily and weekly check-ins, plus a six-week "Heartbeat" written by the lead.
  - Quote: "ASAP is poison."
- **Evidence**: practice of one company, with reasons stated.
- **Maps to**:
  - **Progress**: report uphill or downhill and name the unknown, not a percentage; a stalled item is surfaced as a raised hand
  - **Digest**: replaces interrupts, like the Heartbeat
  - **Decision**: end with an explicit question
  - **Alert**: reserved for what truly cannot wait

## 9. Incident and alert communication: Google SRE and Atlassian

- **SRE book, Monitoring Distributed Systems**, https://sre.google/sre-book/monitoring-distributed-systems/. Fetched 2026-10-28.
  - Every page must be urgent, actionable and visible to users.
  - Before paging, ask: can I act on it? Is it urgent, or can it wait until morning? Could it be automated?
  - People can react with urgency only a few times a day before fatigue sets in.
  - A page that only needs a robotic response should not be a page.
  - Pages should be about novel problems.
  - Quote: "Every page should be actionable."
- **SRE book, Managing Incidents**, https://sre.google/sre-book/managing-incidents/. Fetched 2026-10-28.
  - The incident commander keeps a living incident document.
  - Use a template, and keep the most important information at the top.
  - Hand off explicitly.
- **SRE book, Example Incident State Document**, https://sre.google/sre-book/incident-document/. Fetched 2026-10-28.
  - The template fields are a one-line summary, a status (active), the command post, the roles, and exit criteria with TODO/DONE status.
  - The timeline is most recent first.
  - Update the summary at least every four hours and at every handoff.
- **SRE workbook, Incident Response**, https://sre.google/workbook/incident-response/. Fetched 2026-10-28.
  - Silence makes people assume the incident is still ongoing, so send regular status updates.
  - Prepare two or three ready-to-use templates in advance; nobody should draft announcements under stress.
  - Keep a contact list ready.
  - Set clear criteria for declaring an incident.
- **Atlassian incident communication templates**, https://www.atlassian.com/incident-management/incident-communication/templates. Fetched 2026-10-28 (the live page loaded, so no archive copy was needed).
  - Each template gives the incident name, what is affected, what the team is doing, the impact, and "Next update in <time>".
  - Use separate internal and public templates.
- **Atlassian incident communication**, https://www.atlassian.com/incident-management/incident-communication. Fetched 2026-10-28.
  - The first contact matters most: acknowledge the issue, summarize the known impact, promise further updates, and address data-loss or security concerns.
  - Acknowledge the issue even before the details are known.
  - Send regular updates mid-incident.
  - Close with a resolution summary.
  - The page claims that silence costs more trust than the outage itself, without a cited study (weak).
- **Evidence**:
  - SRE: medium (long operating practice at large scale; the fatigue claim is stated, not measured).
  - Atlassian: weak to medium (vendor practice).
- **Maps to**:
  - **Alert**: only what is actionable, urgent and novel; give the impact and action first, then the time of the next update
  - **Blocker**: the "can it wait until morning?" test decides between Alert and Digest
  - **Progress** on long work: a state-document shape with summary, status, exit criteria and next update
  - **Landed**: a resolution summary

## 10. Decision science and HCI, with numbers

- **Johnson & Goldstein (2003), "Do Defaults Save Lives?", Science 302**. URL: https://www.dangoldstein.com/papers/DefaultsScience.pdf (author's copy). Fetched 2026-10-28.
  - Effective organ-donor consent was 85.9% to 99.98% in presumed-consent (opt-out) countries and 4.25% to 27.5% in explicit-consent (opt-in) countries.
  - In the online experiment (N=161), 82% agreed under opt-out, 79% under a neutral choice and 42% under opt-in.
  - Rule: the default heavily shapes the choice.
  - Strength: strong (natural experiment plus a randomized experiment).
  - Maps to **Decision**: the recommended option acts as a default and will strongly steer the owner. That is why it must be the honest best option, with the trade-off stated.
- **Iyengar & Lepper (2000), "When Choice Is Demotivating", JPSP 79(6)**. URL: https://faculty.washington.edu/jdb/345/345%20Articles/Iyengar%20%26%20Lepper%20(2000).pdf. Fetched 2026-10-28.
  - In the jam study, about 30% of shoppers (31 people) who saw 6 jams bought one, against 3% (4 people) of those who saw 24. χ²(1, N=249)=32.34, p<.0001.
  - Participants given 6 options also reported more satisfaction and wrote better essays than those given 24 or 30.
  - Strength: strong for that setting, but see Scheibehenne below.
  - Maps to **Decision**: few options.
- **Scheibehenne, Greifeneder & Todd (2010), "Can There Ever Be Too Many Options?", JCR 37**. URL: https://www.scheibehenne.com/ScheibehenneGreifenederTodd2010.pdf. Fetched 2026-10-28.
  - A meta-analysis of 63 conditions from 50 experiments (N=5,036) found a mean choice-overload effect of virtually zero, with large variance between studies.
  - No sufficient conditions for overload were identified.
  - Quote: "a mean effect size of virtually zero".
  - Strength: strong.
  - Maps to **Decision**: a hard option count is not justified by overload alone. Keep options few because of the owner's time and the clarity of the recommendation, not because more options paralyze.
- **Mark, Gudith & Klocke (2008), "The Cost of Interrupted Work: More Speed and Stress", CHI 2008**. URL: https://ics.uci.edu/~gmark/chi08-mark.pdf. Fetched 2026-10-28.
  - Interrupted people finished the task faster, with no loss of quality. Mean completion time was 22.77 minutes with no interruption, 20.31 with same-context interruptions and 20.60 with different-context ones.
  - They paid in workload, on a scale of 1 to 20:
    - Stress rose from 6.92 to 9.46 (same context) and 9.13 (different context).
    - Frustration rose from 4.73 to 6.63 and 6.48.
  - The context of the interruption made no difference.
  - The popular "23 minutes to resume" figure is not in this paper; see "Not fetched".
  - Strength: strong (a lab experiment, N about 48).
  - Maps to **Alert**: every interrupt has a real stress cost even when output holds, so non-urgent items go to the **Digest**. Batching beats "same topic, so it's fine": context did not reduce the cost.
- **Amershi et al. (2019), "Guidelines for Human-AI Interaction", CHI 2019**.
  - URLs, fetched 2026-10-28:
    - https://www.microsoft.com/en-us/research/wp-content/uploads/2019/01/Guidelines-for-Human-AI-Interaction-camera-ready.pdf
    - the project page https://www.microsoft.com/en-us/research/project/guidelines-for-human-ai-interaction/
  - There are 18 guidelines, validated in several rounds, including a study in which 49 design practitioners tested them against 20 AI products.
  - The relevant guidelines:
    - G1, make clear what the system can do.
    - G2, make clear how well the system can do it, including how often it may be wrong.
    - G3, time services based on context: when to act or interrupt, given the user's current task.
    - G10, scope services when in doubt: disambiguate or degrade gracefully when the user's goal is uncertain.
    - G11, make clear why the system did what it did.
    - G17, provide global controls over what the system monitors and how it behaves.
  - Strength: medium to strong (systematic validation, but the evaluations are heuristic rather than outcome-based).
  - Maps to:
    - **Out-of-scope**: G1, say what Maestro can and cannot do.
    - **Decision** and **Landed**: G2, state confidence and what was not verified; G11, give the one-line why.
    - **Alert** and **Digest**: G3, interrupt timing.
    - **Answer** and **Decision**: G10, ask one clarifying question when the goal is ambiguous, rather than guessing.
    - Owner settings for verbosity and alert thresholds: G17.

## 11. Engineering writing

- **Google design docs** (Malte Ubl), https://www.industrialempathy.com/posts/design-docs-at-google/. Fetched 2026-10-28.
  - Design docs emphasize the trade-offs behind decisions.
  - Keep "Context and scope" succinct and factual, and link to details.
  - "Alternatives considered" is among the most important sections, because it shows why the chosen design is best.
  - A 1–3 page mini design doc is fine.
  - Writing one is overhead, so do it only when it pays off.
  - Strength: weak to medium (one engineer describing company practice).
  - Maps to **Decision**: the recommendation plus a short note on the rejected alternatives and why.
- **Stripe writing culture**, https://slab.com/blog/stripe-writing-culture/ (Slab blog, 2 Sep 2020). Fetched 2026-10-28. This is secondary: a vendor's interview with Stripe staff; no Stripe-owned page was fetched.
  - Writing replaces repeated verbal updates.
  - The CEO's emails put peripheral information in footnotes at the bottom, so it does not crowd the core.
  - Keep intros short, use bulleted lists and get to the point.
  - Standardize only high-leverage documents.
  - Strength: weak.
  - Maps to **Landed** and **Digest**: core first, peripheral details at the bottom or behind a link.
- **Oxide RFD 1**, https://rfd.shared.oxide.computer/rfd/0001. Fetched 2026-10-28.
  - An RFD has explicit states: prediscussion, ideation, discussion, published, committed, abandoned.
  - Document the viable options with the pros and cons of each, the reasoning with data, and the determination (the decision reached).
  - If nobody is reading, explicitly ask someone.
  - Strength: weak to medium (company practice).
  - Maps to:
    - **Progress**: a named state, not a percentage.
    - **Decision**: options, reasoning, determination.
    - **Blocker**: explicitly ask a named person.
- **Rust RFC template**, https://raw.githubusercontent.com/rust-lang/rfcs/master/0000-template.md. Fetched 2026-10-28.
  - Sections: Summary (one paragraph), Motivation, Guide-level and Reference-level explanation, Drawbacks ("Why should we not do this?"), Rationale and alternatives (including the impact of not doing this), Prior art, Unresolved questions.
  - Strength: medium (long open-community practice).
  - Maps to **Decision**:
    - the cost of doing nothing
    - the drawbacks of the recommendation
    - open questions, stated explicitly
- **IETF BCP 14**: RFC 2119, https://www.rfc-editor.org/rfc/rfc2119.txt, and RFC 8174, https://www.rfc-editor.org/rfc/rfc8174.txt. Both fetched 2026-10-28.
  - MUST, SHOULD, MAY and the other key words are used sparingly, only where truly required, never to impose a method that isn't needed.
  - RFC 8174: the key words carry this special meaning only when written in all capitals.
  - Quote: "when, and only when, they appear in all capitals".
  - Strength: medium (an official standard).
  - Maps to: Maestro's own rules and specs, not owner messages; see the conflicts section.
- **Atlassian DACI play**, https://www.atlassian.com/team-playbook/plays/daci. Fetched 2026-10-28 (the live page loaded).
  - Driver: drives the decision to a set date.
  - Approver: exactly one person who makes the decision.
  - Contributors: have a voice but not a vote.
  - Informed: told after the decision is made.
  - Present the options in a table with pros, cons and cost.
  - The page claims DACI gives a 25% higher success rate, citing a McKinsey survey without a link. The claim is unverified (weak).
  - Maps to:
    - **Decision**: Maestro is the Driver and the owner is the single Approver, with a decision date.
    - **Landed** goes to the "Informed".

---

## Rules table

| # | Rule | Source(s) | Strength | Maestro type |
|---|------|-----------|----------|--------------|
| 1 | Put the main point or bottom line in the first sentence, so a reader can stop anywhere. | AR 25-50 1–38b; NN/g inverted pyramid, F-pattern; GOV.UK clear-structure; Minto | Medium (NN/g measured reading: 79% scan, at most 28% of words read) | All |
| 2 | The first two words of a title or line carry the information. | NN/g F-pattern; GOV.UK UI writing; 37signals titles | Medium | Alert, Digest, Landed |
| 3 | Bring one recommended action that the owner only approves or rejects. | Completed Staff Work; GitLab proposals; DACI Approver | Medium (doctrine) | Decision |
| 4 | Make the recommendation the honest best option, because the owner will mostly take it. | Johnson & Goldstein 2003 (opt-in 4.25–27.5% against opt-out 85.9–99.98%) | Strong | Decision |
| 5 | Offer few options, labeled by outcome; don't justify the limit by "choice overload". | Iyengar & Lepper 2000 (30% vs 3%); Scheibehenne 2010 (mean effect about 0, N=5,036); NN/g confirmation dialogs | Strong (mixed) | Decision |
| 6 | Say whether the choice is a one-way or a two-way door; decide two-way doors and report them in the Digest. | Amazon 2015/2016; GitLab values | Medium | Decision, Digest |
| 7 | State the rejected alternatives in a line, plus the drawbacks and the cost of doing nothing. | Google design docs; Rust RFC; Oxide RFD 1 | Medium | Decision |
| 8 | State confidence and what was not verified. | Amershi G2 | Medium-strong | Decision, Landed, Answer |
| 9 | Give the one-line why for what was done. | Amershi G11; GitLab matrix ("explain why") | Medium-strong | Landed, Decision |
| 10 | Escalate a blocker early, with context and a proposed way out, to a named person. | GitLab values; Amazon 2016; Completed Staff Work; Oxide | Medium | Blocker |
| 11 | Interrupt only for what is actionable, urgent and novel; send the rest to the Digest. | Google SRE monitoring; NN/g push; 37signals | Medium | Alert, Digest |
| 12 | Every interrupt costs stress (6.92 to about 9.3 on a 1–20 scale) even when output holds, and topic context doesn't help. | Mark 2008 | Strong | Alert, Digest |
| 13 | Structure an alert like an error message: what happened, the impact, what to do, without blame, weighted by severity. | NN/g error messages; Atlassian first contact | Medium | Alert, Blocker |
| 14 | Acknowledge an incident before you know the details, and say when the next update comes. | Atlassian templates; SRE workbook | Weak-medium | Alert, Progress |
| 15 | Report progress as a state (uphill or downhill, a named stage, exit criteria), not a percentage, while unknowns remain. | Shape Up ch. 13; Oxide states; SRE incident document | Medium | Progress |
| 16 | A stalled item surfaces by itself as a raised hand. | Shape Up ch. 13 | Weak-medium | Progress, Blocker |
| 17 | Use active voice, "you" and "we", and no "There is" or "It is" openers. | AR 25-50; plain language; GOV.UK | Medium | All |
| 18 | Average about 15 words per sentence and split anything over 25; one idea per sentence. | AR 25-50 1–39b; GOV.UK; plain language | Medium | All |
| 19 | Keep paragraphs to 5 sentences or fewer, and the whole message on one screen, with detail behind links. | GOV.UK; AR 25-50; plain language | Medium | All |
| 20 | Concise plus scannable text tested 124% more usable than the control. | NN/g 1997 | Medium | All |
| 21 | Put the main idea before exceptions and conditions. | Plain language guidelines | Medium | Blocker, Answer |
| 22 | Make messages low-context: self-contained, and every link has a preview. | GitLab communication | Weak-medium | Landed, Answer, Digest |
| 23 | End with an explicit question when you need something. | 37signals; GitLab (@mention the need) | Weak-medium | Decision, Blocker |
| 24 | Ask one clarifying question when the goal is ambiguous, instead of guessing. | Amershi G10; Minto SCQ (find the reader's question) | Medium | Answer, Out-of-scope |
| 25 | Say plainly what Maestro can and cannot do. | Amershi G1 | Medium-strong | Out-of-scope |
| 26 | Use fixed templates, prepared in advance, for recurring message types. | SRE workbook; Atlassian; AR 25-50 formats | Medium | All |
| 27 | Keep acknowledgment requests rare, or they lose their power. | GitLab ACK; NN/g "cry wolf"; SRE fatigue | Medium | Decision, Alert |
| 28 | Let the owner set global controls such as verbosity and alert thresholds. | Amershi G17 | Medium | Settings |
| 29 | Put peripheral details at the bottom or behind a link, never in the lead. | Stripe (via Slab); Completed Staff Work | Weak | Landed, Digest |

---

## Conflicts between sources and how to resolve them

1. **BLUF and inverted pyramid vs Amazon's six-page narrative memo.**
   - AR 25-50, NN/g and GOV.UK say main point first, keep it short.
   - Amazon says long narrative prose, read silently.
   - Resolution: they serve different readers. Amazon memos feed a meeting where everyone reads the full document together. The owner reads Maestro's messages alone, between other work, and scans (79% scan; at most 28% of words read).
   - Owner messages follow BLUF on one screen. A long narrative belongs only in a linked spec or design doc, never in the message body.
2. **One recommendation (Completed Staff Work) vs showing the options (DACI tables, Oxide, Rust "alternatives").**
   - Resolution: lead with the single recommendation, then give at most a line each for the alternatives and why they were rejected.
   - Defaults research (Johnson & Goldstein) shows the recommendation will dominate the owner's choice. The alternatives line is the honesty check, not a menu.
3. **Choice overload (Iyengar & Lepper) vs the meta-analysis showing about zero mean effect (Scheibehenne).**
   - Resolution: don't cite "choice paralysis" as the reason. Keep options few because of the owner's time and recommendation clarity (rules 3 and 5).
   - When the owner asks for "all options", give them all, but keep the recommendation on top.
4. **"must" in plain language and GOV.UK vs MUST and SHALL in BCP 14.**
   - Resolution: by audience. Owner messages use plain "must", "need to" and "can" (GOV.UK).
   - Maestro's internal specs and prompts may use BCP 14 capitals, sparingly and with RFC 8174 meaning. Never put capitalized key words in owner messages.
5. **Sentence length: about 15 words on average (AR 25-50) vs splitting at 25 (GOV.UK).**
   - No real conflict: one is a target mean, the other a hard cap.
   - Use both: aim for about 15, never exceed 25.
6. **"No percentages" (Shape Up) vs percent-done bars for waits over 10 seconds (NN/g).**
   - Resolution: by the kind of work. NN/g covers deterministic machine waits; Shape Up covers creative work with unknowns.
   - Use a percentage or time estimate only for mechanical, measurable work (CI runs, migrations). For agent work, report uphill or downhill and the named unknown.
7. **"DRIs don't owe explanations" (GitLab) vs "Make clear why the system did what it did" (Amershi G11).**
   - Resolution: Maestro is an AI system, and the owner is its Approver, not a peer. G11 wins.
   - Every Landed and Decision message carries a one-line why. Full justification sits behind a link, which keeps GitLab's point against analysis paralysis.
8. **SCQ (Minto's own site) vs SCQA (the common extension).**
   - Resolution: cite SCQ as Minto's. In practice the "A" is the pyramid's top point, so for the owner the answer (the recommendation) comes first.
   - Situation and complication shrink to one context line, or disappear when the owner already has the context.
9. **Async-first, "ASAP is poison" (37signals, GitLab) vs the need for urgent alerts (SRE paging).**
   - Resolution: the SRE gate, applied strictly. Interrupt only when the matter is actionable, urgent ("can it wait until morning?" is no) and novel. Everything else goes to the Digest.
   - Mark 2008 supplies the cost: interrupts raise stress even when output holds.
10. **"Acknowledge even before you know details" (Atlassian) vs "no robotic pages" (SRE).**
    - Resolution: acknowledging is for stakeholders who are waiting on an outcome. For the owner, one Alert includes the next-update time, and later updates join that thread rather than starting new interrupts.
11. **Single Approver (DACI) vs "two-way doors decided by individuals" (Amazon, GitLab).**
    - Resolution: Maestro is the Approver for two-way doors inside its delegated scope and reports them in the Digest. The owner is the Approver for one-way doors and for anything outside that scope.

---

## Not fetched

None of these are used as evidence above.

- Completed Staff Work on au.af.mil (did not resolve), and the competing Rehm/MacArthur attribution page.
- The aboutamazon.com 2015 letter page (404). The SEC copy was used instead.
- The GitLab all-remote asynchronous page (404). The communication and values pages were used.
- The 37signals or Basecamp piece titled "Is this worth interrupting?" (not found). The "How we communicate" guide was used.
- The GDS reading-research blog post (404).
- Gloria Mark's "23 minutes to resume" figure (attributed to Mark, Gonzalez & Harris 2005, "No Task Left Behind?"). That paper was not fetched, so the figure is not used.
- The Pielot 2018 notification study and the University of Nebraska progress-bar study (cited by NN/g, not fetched directly).
- The McKinsey survey behind Atlassian's DACI "25%" claim (no link given).
- The sources behind GOV.UK's literacy (1 in 6) and preference (80%) figures.
- The Minto book itself (1996 edition referenced). Only the official site was read.
- Any Stripe-owned page on writing culture. Only the Slab interview was read.
- web.archive.org copies: archive access was rate-limited, so no archive copy is cited.
