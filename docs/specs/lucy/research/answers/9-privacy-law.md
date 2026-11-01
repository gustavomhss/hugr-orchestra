# 9-privacy-law

session ses_74b7a53b6d68265df5e4582c94c70407e975694ea411513750b530aa3d82238d

## Answer

**Conclusion.** A privacy-aware code review should check every diff for five things. (1) New personal data, a new purpose or a new destination: fields, tables, logs, SDKs, telemetry, third-party APIs and cross-border hosts. (2) Defaults that collect, keep or expose more than the purpose needs (GDPR Art 25(2); LGPD Art 46 §2 "from the product's conception"). (3) Security of what is stored and sent, with credentials and tokens first. Both the largest EU fines and the ANPD's highest-risk incident category involve them. (4) Whether the change triggers a DPIA (Data Protection Impact Assessment) or its LGPD counterpart, the RIPD (Relatório de Impacto à Proteção de Dados), or a review of an existing one. (5) Whether the system can still meet breach deadlines and data-subject rights. LGPD is stricter than GDPR in ways a GDPR-trained reviewer misses: breach notice in 3 business days instead of 72 hours, elderly people's data as a risk criterion, and ANPD standard clauses for transfers.

**Supporting claims**
- read: GDPR Art 25(2) requires that by default only data necessary for each specific purpose are processed (gdpr-info.eu mirror of Art 25). LGPD Art 46 §2 requires security measures from the product's conception to its execution (ECOMPLY mirror). Reviewer check: new optional fields, broad scopes, profiles public by default, or no retention period on a new store → finding.
- read: GDPR Art 22 gives a right not to be subject to solely automated decisions with legal or similarly significant effect. Where Art 22 allows such a decision, the safeguards include at least human intervention. LGPD-side, the ANPD standard clauses give a right to *review* of solely automated decisions (Res. 19/2024 Annex II, cl. 15.1 j). Check: a new scoring, ranking or eligibility model with no review or contest path → finding plus a DPIA/RIPD.
- read: GDPR Art 35(3)(a) requires a DPIA for systematic, extensive automated evaluation, including profiling. Art 35(11) requires a review when the processing's risk changes. A diff that changes risk is a trigger.
- read: CNIL's GDPR Developer Guide warns that personal data turn up in "server logs, cache files". Its table of contents also has a sheet on controlling libraries and SDKs. Check: logging of request bodies or identifiers, and new SDK or analytics dependencies → finding.
- read: GDPR Art 33 requires notifying the supervisory authority within 72 hours of becoming aware of a breach and documenting every breach (33(5)). ANPD Res. 15/2024 Art 6 requires notice to ANPD in **3 business days**; Art 9 sets the same deadline for notifying data subjects. Res. 15 Art 10 requires keeping an incident register for at least **5 years**, including incidents that were not notified. Check: audit logs and detection must let the team establish when it became aware of an incident and its scope.
- read: Res. 15 Art 5 treats an incident as high-risk when it involves, among others, "dados de autenticação em sistemas" (system authentication data) or "dados de crianças, de adolescentes ou de idosos" (children's, adolescents' or elderly people's data). The elderly criterion is LGPD-specific.
- read: ANPD Res. 19/2024: every international transfer needs a legal basis under LGPD Art 7 or 11 **and** a transfer mechanism. The transfer must be limited to the minimum necessary (Art 9). "Coleta internacional" (direct collection by an agent abroad) is not a transfer (Art 6). Existing contracts had 12 months from publication to incorporate the ANPD standard clauses (Art 2, sole paragraph). Check: a new foreign endpoint, region or vendor → confirm the mechanism exists and only minimal fields are sent.
- read + inferred: authorities ask for records. ANPD may request the record of processing operations, the RIPD and the incident handling report (Res. 15 Art 8). Under GDPR, breach documentation must let the authority verify compliance (Art 33(5)). A reviewer's record of each privacy finding (diff, data category, decision, link to the DPIA/RIPD) fits this evidence chain (inferred).
- read: Bearer CLI is under the Elastic License 2.0, which forbids offering it as a hosted service. It supports Go, Java, JS/TS, PHP, Python and Ruby and produces privacy reports that feed a DPIA or RoPA (record of processing activities). It says false positives "are always a possibility". Privado's open-source edition supports Java and Python in GA and maps data flows to sinks such as third parties, databases and logs. Semgrep's registry rules are under the "Semgrep Rules License v1.0", not an OSI license.
- read: enforcement for software defects. The Irish DPC fined Meta €91M (Sept 2024) for storing passwords in plaintext (GDPR Arts 32(1), 5(1)(f), 33(1), 33(5)). It fined Meta €251M (Dec 2024), €240M of it under Art 25(1)/(2), for a 2017 video-upload feature that leaked access tokens. The ANPD's first fine (Telekall, July 2023, R$14,400) was for processing without a legal basis (LGPD Art 7) and no designated DPO (Art 41).

**Not examined**
- I could not capture the official texts. Planalto (LGPD) failed on character encoding and EUR-Lex (GDPR) returned empty pages, so the GDPR and LGPD Art 46 quotes come from verbatim mirrors (gdpr-info.eu, lgpd-brasil.info).
- No sources were captured for LGPD Arts 14, 18, 20, 37 and 38, ePrivacy Art 5(3) and EDPB Guidelines 2/2023, the EU Data Act, UK GDPR or the ICO, CCPA/CPRA, the EDPB DPIA criteria, Privado's license, or any independent accuracy benchmark for the tools. Claims about those are not evidenced here.

**Reproduce:** fetch https://www.in.gov.br/en/web/dou/-/resolucao-cd/anpd-n-15-de-24-de-abril-de-2024-556243024 (Art 6) and https://www.dataprotection.ie/en/news-media/press-releases/irish-data-protection-commission-fines-meta-eu251-million.

## Claims

[
 {
  "subquestion": {
   "id": "rque_9009d90f3ff0dc64d258ead97c",
   "revision": 1
  },
  "nature": "extraction",
  "proposition": "GDPR Art 25(2) requires by-default processing of only data necessary for each specific purpose.",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_166f970739a2cf38e2fb12239d",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "ebc3447dee56360fcac64a6cdde5d63ea35f8521cbecad73fe00fe9c2c4ba405"
    },
    "quote": "by default, only personal data which are necessary for each specific purpose of the processing are processed"
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_9009d90f3ff0dc64d258ead97c",
   "revision": 1
  },
  "nature": "extraction",
  "proposition": "LGPD Art 46 §2 requires security measures from product conception to execution.",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_86d3d7a1f36fb95cb4644b6e3d",
      "revision": 1
     },
     "representation": "text",
     "digest": "02e6aee8bf5de0733153c96ed405a11ddaba4933dd1b5b34a6fff2ed23035f96"
    },
    "quote": "deverão ser observadas desde a fase de concepção do produto ou do serviço até a sua execução"
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_9009d90f3ff0dc64d258ead97c",
   "revision": 1
  },
  "nature": "extraction",
  "proposition": "GDPR Art 22 safeguards include at least human intervention; ANPD standard clauses give a right to review solely automated decisions.",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_e37b0604ec5729715b839144bd",
      "revision": 1
     },
     "representation": "text",
     "digest": "330a299d9955a0a5e7e143de385d4aa281729a217f2a4c9868aee3396e61cfc2"
    },
    "quote": "at least the right to obtain human intervention on the part of the controller"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_71976d76ba81cb4c9ffaf9fa0e",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "fcce9282d8e68bb08b13e07eda104b856e9893698a39df0fd8fdf174d96aaa89"
    },
    "quote": "revisão de decisões tomadas unicamente com base em tratamento automatizado de dados pessoais que afetem seus interesses"
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_5fe8e6ac72858287d2dd8ff547",
   "revision": 1
  },
  "nature": "extraction",
  "proposition": "GDPR Art 35 requires a DPIA for systematic automated evaluation incl. profiling and a review when processing risk changes.",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_6cd531eb4ffa5f9622a2f4ff92",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "3454013a3465e1fb0e3ea744e6f7caa3544af04b6ae86a601e48ee1ea15fbc65"
    },
    "quote": "a systematic and extensive evaluation of personal aspects relating to natural persons which is based on automated processing, including profiling"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_6cd531eb4ffa5f9622a2f4ff92",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "3454013a3465e1fb0e3ea744e6f7caa3544af04b6ae86a601e48ee1ea15fbc65"
    },
    "quote": "at least when there is a change of the risk represented by processing operations"
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_5fe8e6ac72858287d2dd8ff547",
   "revision": 1
  },
  "nature": "extraction",
  "proposition": "CNIL developer guidance flags personal data appearing in server logs and caches.",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_e12739d4899590b3aec158678e",
      "revision": 1
     },
     "representation": "text",
     "digest": "df1747f11ae2feb3cd0ade40f7dd4edc6179174b7db86dc7c8f8ad788ad7c4d4"
    },
    "quote": "personal data may be present in unexpected places such as in server logs, cache files, Excel files"
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_f767d3a33990bd862ab308ea2e",
   "revision": 1
  },
  "nature": "extraction",
  "proposition": "GDPR breach notice is due within 72 hours; ANPD Res. 15/2024 requires notice to ANPD within three business days.",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_40628700e0ff9999df26f7df3e",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "db26e24d447ff1fae8682b552624fa13521ade9a822aa49da1d9de5eb94fe9a2"
    },
    "quote": "not later than 72 hours after having become aware of it"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_1570d42a7cb1d2c9fc1b117611",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "f2d08aae503ce4790f9b551d292785603500e93142a70e29f0622dccb6efd2b1"
    },
    "quote": "A comunicação de incidente de segurança à ANPD deverá ser realizada pelo controlador no prazo de três dias úteis"
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_f767d3a33990bd862ab308ea2e",
   "revision": 1
  },
  "nature": "extraction",
  "proposition": "ANPD Res. 15 risk criteria include system authentication data and data of children, adolescents or the elderly.",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_1570d42a7cb1d2c9fc1b117611",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "f2d08aae503ce4790f9b551d292785603500e93142a70e29f0622dccb6efd2b1"
    },
    "quote": "IV - dados de autenticação em sistemas;"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_1570d42a7cb1d2c9fc1b117611",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "f2d08aae503ce4790f9b551d292785603500e93142a70e29f0622dccb6efd2b1"
    },
    "quote": "II - dados de crianças, de adolescentes ou de idosos;"
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_96b10bddb6068b30ffaa4dc7fc",
   "revision": 1
  },
  "nature": "extraction",
  "proposition": "ANPD Res. 15 requires a 5-year incident register including uncommunicated incidents and lets ANPD request the processing record and RIPD; GDPR Art 33(5) requires breach documentation.",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_1570d42a7cb1d2c9fc1b117611",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "f2d08aae503ce4790f9b551d292785603500e93142a70e29f0622dccb6efd2b1"
    },
    "quote": "O controlador deverá manter o registro do incidente de segurança, inclusive daquele não comunicado à ANPD e aos titulares, pelo prazo mínimo de cinco anos"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_1570d42a7cb1d2c9fc1b117611",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "f2d08aae503ce4790f9b551d292785603500e93142a70e29f0622dccb6efd2b1"
    },
    "quote": "o relatório de impacto à proteção de dados pessoais (RIPD)"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_40628700e0ff9999df26f7df3e",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "db26e24d447ff1fae8682b552624fa13521ade9a822aa49da1d9de5eb94fe9a2"
    },
    "quote": "The controller shall document any personal data breaches"
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_f767d3a33990bd862ab308ea2e",
   "revision": 1
  },
  "nature": "extraction",
  "proposition": "ANPD Res. 19/2024 requires a legal basis plus a transfer mechanism, minimum-necessary transfers, excludes international collection from transfers, and gave 12 months to adopt standard clauses.",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_71976d76ba81cb4c9ffaf9fa0e",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "fcce9282d8e68bb08b13e07eda104b856e9893698a39df0fd8fdf174d96aaa89"
    },
    "quote": "I - uma das hipóteses legais previstas no art. 7º ou no art. 11 da Lei nº 13.709"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_71976d76ba81cb4c9ffaf9fa0e",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "fcce9282d8e68bb08b13e07eda104b856e9893698a39df0fd8fdf174d96aaa89"
    },
    "quote": "A transferência internacional de dados deverá se limitar ao mínimo necessário para o alcance de suas finalidades"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_71976d76ba81cb4c9ffaf9fa0e",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "fcce9282d8e68bb08b13e07eda104b856e9893698a39df0fd8fdf174d96aaa89"
    },
    "quote": "A coleta internacional de dados não caracteriza transferência internacional de dados."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_71976d76ba81cb4c9ffaf9fa0e",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "fcce9282d8e68bb08b13e07eda104b856e9893698a39df0fd8fdf174d96aaa89"
    },
    "quote": "no prazo de até 12 (doze) meses, contados da data de publicação desta Resolução"
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_b61bcc12392669b55551d19226",
   "revision": 1
  },
  "nature": "extraction",
  "proposition": "Bearer CLI is ELv2 (no hosted-service use), supports seven languages, feeds DPIA/RoPA reports and admits false positives; Privado OSS supports Java and Python and maps flows to sinks including logs; Semgrep registry rules use the Semgrep Rules License v1.0.",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_a3ca808390d06ab64d400ea779",
      "revision": 1
     },
     "representation": "text",
     "digest": "1b2b49d29eb7ce3e34dfe6562269878ffce3ed8aef947edacbe90764274f0fc7"
    },
    "quote": "You are not allowed to provide Bearer CLI to third parties as a hosted or managed service without the explicit approval of Bearer Inc."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_a3ca808390d06ab64d400ea779",
      "revision": 1
     },
     "representation": "text",
     "digest": "1b2b49d29eb7ce3e34dfe6562269878ffce3ed8aef947edacbe90764274f0fc7"
    },
    "quote": "Records of Processing Activities (RoPA) input for GDPR compliance reporting."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_a3ca808390d06ab64d400ea779",
      "revision": 1
     },
     "representation": "text",
     "digest": "1b2b49d29eb7ce3e34dfe6562269878ffce3ed8aef947edacbe90764274f0fc7"
    },
    "quote": "false positives are always a possibility."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_26db2f1aa7ba3b3a99a23f878c",
      "revision": 1
     },
     "representation": "text",
     "digest": "56606435bf221719ede320e2682dc9aeeba0ef7a9ed478561a6362e12ccdb7d9"
    },
    "quote": "We support Java and Python in GA."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_26db2f1aa7ba3b3a99a23f878c",
      "revision": 1
     },
     "representation": "text",
     "digest": "56606435bf221719ede320e2682dc9aeeba0ef7a9ed478561a6362e12ccdb7d9"
    },
    "quote": "such as external third parties, databases, logs, and internal APIs"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_f5c3b59a42051338d2993da1d4",
      "revision": 1
     },
     "representation": "text",
     "digest": "1a6466ae5f1c68631bbd13e3f1aa8f380d84219853c08f0456b853fccfacee1d"
    },
    "quote": "Semgrep Rules License v1.0."
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_f767d3a33990bd862ab308ea2e",
   "revision": 1
  },
  "nature": "extraction",
  "proposition": "Software defects drew fines: DPC €91M for plaintext passwords (Art 32(1)), DPC €251M incl. Art 25(1) for a video-upload feature, and ANPD's first fine R$14,400 to Telekall under LGPD Arts 7 and 41.",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_69a235a2c9f2686f0154b5b12d",
      "revision": 1
     },
     "representation": "text",
     "digest": "b0e2ef391a5ece3adb2fc54d479c1a4ee242da95a077f0a15736b6657bda03c6"
    },
    "quote": "Article 32(1) GDPR, because MPIL did not implement appropriate technical and organisational measures"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_81156c869a9d6757f5e8135481",
      "revision": 1
     },
     "representation": "text",
     "digest": "edfab0c2702439fe26bb8094a2ae66357396845c74772b4eb8ba52d2f891e856"
    },
    "quote": "Article 25(1) GDPR - By failing to ensure that data protection principles were protected in the design of processing systems."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_81156c869a9d6757f5e8135481",
      "revision": 1
     },
     "representation": "text",
     "digest": "edfab0c2702439fe26bb8094a2ae66357396845c74772b4eb8ba52d2f891e856"
    },
    "quote": "arose from the deployment of a video upload function on the Facebook platform in July 2017"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_e5436f807b2ed64a4a4f2b2cd2",
      "revision": 1
     },
     "representation": "text",
     "digest": "3716bc7edcc1e5f922e3103f385d11be7f833a4b357af6a3fc647c676719c8b2"
    },
    "quote": "totalizando uma multa de R$14.400,00"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_e5436f807b2ed64a4a4f2b2cd2",
      "revision": 1
     },
     "representation": "text",
     "digest": "3716bc7edcc1e5f922e3103f385d11be7f833a4b357af6a3fc647c676719c8b2"
    },
    "quote": "infringiu os arts. 7º e o 41 da LGPD"
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_96b10bddb6068b30ffaa4dc7fc",
   "revision": 1
  },
  "nature": "inference",
  "proposition": "A reviewer's per-change privacy finding record (diff, data category, decision, DPIA/RIPD link) can support the processing records, RIPD and breach documentation ANPD and EU authorities may request.",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_1570d42a7cb1d2c9fc1b117611",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "f2d08aae503ce4790f9b551d292785603500e93142a70e29f0622dccb6efd2b1"
    },
    "quote": "o relatório de impacto à proteção de dados pessoais (RIPD)"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_40628700e0ff9999df26f7df3e",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "db26e24d447ff1fae8682b552624fa13521ade9a822aa49da1d9de5eb94fe9a2"
    },
    "quote": "The controller shall document any personal data breaches"
   }
  ]
 }
]
