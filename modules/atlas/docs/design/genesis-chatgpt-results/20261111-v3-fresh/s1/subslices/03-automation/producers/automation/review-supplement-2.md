# Suplemento literal de revisão 2 — AUTOMATION-L1

```json
{
  "type": "documentary_transport_header",
  "review_batch": "automation-2",
  "body_sha256": "e9c89bea68d594bc61356ff461642ea23cd905d4584f2b52d32e10a5af984e55",
  "recipe_sha256": "2bed1778e629415d5bc7c818773ef18b012a8a0bd4239d5bc85db6642b41a80e",
  "body_sections": [
    4,
    5
  ],
  "body_utf8_byte_interval": [
    17674,
    30198
  ],
  "body_section_bytes_unchanged_from_v1": true,
  "source_commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
  "public_requests": [
    {
      "path": "../../relay/automation-2/j1-response.md",
      "bytes": 12356,
      "sha256": "f04ab6c3980172b0adbb8f2abbbcc0211591d7fa3f2c65db22971d5448f9ed86",
      "git_blob_sha": "7820369b7bb6835cd20b379f28c80467cea7de55",
      "judge_id": "J1",
      "origin": "public_request_relay",
      "repository_commit": null
    },
    {
      "path": "../../relay/automation-2/j2-response.md",
      "bytes": 9430,
      "sha256": "17fb39dc71ebea1a9a0b84c4cde1e7d6c265fadc6e2e4da00503000732e86b32",
      "git_blob_sha": "48f5961826a2a5d9501843f9332f6b0dd9762260",
      "judge_id": "J2",
      "origin": "public_request_relay",
      "repository_commit": null
    }
  ],
  "request_namespace": "J1 canonical groups",
  "requests": [
    "RE-AUT2-01",
    "RE-AUT2-02",
    "RE-AUT2-03",
    "RE-AUT2-04",
    "RE-AUT2-05",
    "RE-AUT2-06"
  ],
  "j2_group_mapping": {
    "RE-AUT2-01": [
      "RE-AUT2-01",
      "RE-AUT2-02"
    ],
    "RE-AUT2-02": [
      "RE-AUT2-03",
      "RE-AUT2-04"
    ],
    "RE-AUT2-03": [
      "RE-AUT2-05"
    ],
    "RE-AUT2-04": [
      "RE-AUT2-06"
    ]
  },
  "prior_literal_source": "review-supplement-1.md",
  "reuse_rule": "Referenced blocks retain exact frozen bytes and hashes; do not re-send duplicates",
  "shared_population_reconciliation": "review-supplement-1-index.json#/shared_population_reconciliation",
  "population_recount_performed": false,
  "historical_body_repeated": false,
  "tests": "NOT_RUN",
  "provider_execution": "NOT_RUN",
  "evidence_authority": "raw_source_and_typed_mechanical_index; no judgment or acceptance"
}
```

## RE-AUT2-01 — blocos reutilizados

```json
{
  "type": "mechanical_literal_block_references",
  "request_id": "RE-AUT2-01",
  "requested_chain": [
    "Actions.execute → GitHubCommands.execute",
    "capture/authority/source/actor → command plan",
    "workflow/run/job → send → native acknowledgement"
  ],
  "blocks": [
    {
      "request_id": "RE-AUT2-01",
      "block_id": "AUT1-C01",
      "supplement": "review-supplement-1.md",
      "supplement_sha256": "274f7e4508180a78bf82e9064f459e335addd84b6165207819a6be7a156f46ed",
      "byte_start": 17665,
      "byte_end_exclusive": 27835,
      "transport_sha256": "9eae4bdf920a837ce1a269732c5e7058a0be978b02ceb63b4a198abb06e7ade0",
      "source_path": "packages/core/src/actions.ts",
      "source_commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
      "source_git_blob_sha": "4f81df84763bd63e7680de8fd40c60b583ef68ca",
      "source_sha256": "08c5f306bc1c53b978a4254eba0fc708d9a4bfbb30fb63ead23c237f359fceef",
      "source_line_intervals": [
        [
          49,
          216
        ]
      ]
    },
    {
      "request_id": "RE-AUT2-01",
      "block_id": "AUT1-C30",
      "supplement": "review-supplement-1.md",
      "supplement_sha256": "274f7e4508180a78bf82e9064f459e335addd84b6165207819a6be7a156f46ed",
      "byte_start": 225010,
      "byte_end_exclusive": 238859,
      "transport_sha256": "2edda00cfc0d0ae5678932a7d27125f8f49da5e09897811948ea098e55d9aa0b",
      "source_path": "packages/core/src/actions/github/commands/common.ts",
      "source_commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
      "source_git_blob_sha": "e9ee98a334dd701d076a29900dc47ccdba7a3f01",
      "source_sha256": "b1a6b5b2081d754e5b57f93fadaf56153ca38d133450a05e3c7145bcbf21cfa7",
      "source_line_intervals": [
        [
          1,
          166
        ]
      ]
    },
    {
      "request_id": "RE-AUT2-01",
      "block_id": "AUT1-C38",
      "supplement": "review-supplement-1.md",
      "supplement_sha256": "274f7e4508180a78bf82e9064f459e335addd84b6165207819a6be7a156f46ed",
      "byte_start": 270335,
      "byte_end_exclusive": 274599,
      "transport_sha256": "4ed6d1a261f31136b8714b010b002aa0026fb1ac68ef601bedf52b525c136d75",
      "source_path": "packages/core/src/actions/github/commands/workflow.ts",
      "source_commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
      "source_git_blob_sha": "bc9677ced86d82f08db5a38ae948bcca3b1406eb",
      "source_sha256": "7330ca26082e22e8a81c89285afc18002903188555c96d1d60565fae993f7b2f",
      "source_line_intervals": [
        [
          12,
          47
        ]
      ]
    },
    {
      "request_id": "RE-AUT2-01",
      "block_id": "AUT1-C39",
      "supplement": "review-supplement-1.md",
      "supplement_sha256": "274f7e4508180a78bf82e9064f459e335addd84b6165207819a6be7a156f46ed",
      "byte_start": 274599,
      "byte_end_exclusive": 279839,
      "transport_sha256": "18cb83cd09646f169eddb7219f5db5089677ccadf4a06b75a31fef737dea044c",
      "source_path": "packages/core/src/actions/github/commands/run.ts",
      "source_commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
      "source_git_blob_sha": "20a65fe64b3559988856c829670ebb82296f9113",
      "source_sha256": "a54d15a5e3870a09fc98708de4ee41aa09acaf2175b6d9c9e0e4249e6646fe78",
      "source_line_intervals": [
        [
          10,
          59
        ]
      ]
    },
    {
      "request_id": "RE-AUT2-01",
      "block_id": "AUT1-C40",
      "supplement": "review-supplement-1.md",
      "supplement_sha256": "274f7e4508180a78bf82e9064f459e335addd84b6165207819a6be7a156f46ed",
      "byte_start": 279839,
      "byte_end_exclusive": 282763,
      "transport_sha256": "78266cd1587c027a8e1a4ea876182e6bec15fc3c064c9d8c3bd8b49f41f31045",
      "source_path": "packages/core/src/actions/github/commands/job.ts",
      "source_commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
      "source_git_blob_sha": "01828a587ca7443e08fc0ecdcff55bf1ebeca863",
      "source_sha256": "b753ad05386cd13df639a4000b7fd35db4db8431e66f1ab27633acdbeb314591",
      "source_line_intervals": [
        [
          9,
          33
        ]
      ]
    },
    {
      "request_id": "RE-AUT2-01",
      "block_id": "AUT1-X01",
      "supplement": "review-supplement-1.md",
      "supplement_sha256": "274f7e4508180a78bf82e9064f459e335addd84b6165207819a6be7a156f46ed",
      "byte_start": 310894,
      "byte_end_exclusive": 312707,
      "transport_sha256": "b99dce07a09585d14a07e10c48e471b8eb5ce708d31cbee16cdbe1fd91d6d49b",
      "source_path": "packages/schema/src/actions.ts",
      "source_commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
      "source_git_blob_sha": "3b9c5cc47c6e043e9e5d6f013a8201c4258abe0b",
      "source_sha256": "ff0507ebbb63a8a1ab74bc11187cb70bd19d51ed2ec8cb741eaf0155d03f6b07",
      "source_line_intervals": [
        [
          1,
          18
        ]
      ]
    },
    {
      "request_id": "RE-AUT2-01",
      "block_id": "AUT1-X03",
      "supplement": "review-supplement-1.md",
      "supplement_sha256": "274f7e4508180a78bf82e9064f459e335addd84b6165207819a6be7a156f46ed",
      "byte_start": 317643,
      "byte_end_exclusive": 322290,
      "transport_sha256": "ada2f1cf8f9532d4a08564e6278850aafc2b687a3ce354519039097499006a39",
      "source_path": "packages/schema/src/actions/operation.ts",
      "source_commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
      "source_git_blob_sha": "da7b1bdfb6bd5f7dd8fd368adb5eb5402c37c6fe",
      "source_sha256": "6ad34b7a3cbc4eb4c1ce500f6f665894c0a7792d4d12177cdd1e055592812f0f",
      "source_line_intervals": [
        [
          1,
          79
        ]
      ]
    },
    {
      "request_id": "RE-AUT2-01",
      "block_id": "AUT1-X04",
      "supplement": "review-supplement-1.md",
      "supplement_sha256": "274f7e4508180a78bf82e9064f459e335addd84b6165207819a6be7a156f46ed",
      "byte_start": 322290,
      "byte_end_exclusive": 328111,
      "transport_sha256": "b823bab78f9d376ed8cbcce50984352472f679be69730008e7fec3517c1f5aa6",
      "source_path": "packages/schema/src/actions/command.ts",
      "source_commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
      "source_git_blob_sha": "763fc67220a5a5962794593062f4705840e7598b",
      "source_sha256": "46722d7902f6005986f3e2c372675e3f9e047e2dbe639e404146f151e1de3d85",
      "source_line_intervals": [
        [
          1,
          68
        ]
      ]
    },
    {
      "request_id": "RE-AUT2-01",
      "block_id": "AUT1-X05",
      "supplement": "review-supplement-1.md",
      "supplement_sha256": "274f7e4508180a78bf82e9064f459e335addd84b6165207819a6be7a156f46ed",
      "byte_start": 328111,
      "byte_end_exclusive": 329839,
      "transport_sha256": "deee6a656753c0df83acfb451333cee7bb7b07b0c5093fc0e1d1c16e82173e3e",
      "source_path": "packages/schema/src/schema.ts",
      "source_commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
      "source_git_blob_sha": "d19a39b9708cfcaeedc1d7c62503afbadfee5dd7",
      "source_sha256": "a7cdac1ae9d21d9d71a3783a730ca29bc8fbe769d01479a19101a81eec2bb447",
      "source_line_intervals": [
        [
          1,
          23
        ]
      ]
    }
  ]
}
```

## RE-AUT2-02 — blocos reutilizados

```json
{
  "type": "mechanical_literal_block_references",
  "request_id": "RE-AUT2-02",
  "requested_chain": [
    "Actions.execute → ActionsGitLabCommands.execute",
    "admit + native role/policies + inputs → plan",
    "single request → status check → plan.acknowledge → native pipeline/job ownership"
  ],
  "blocks": [
    {
      "request_id": "RE-AUT2-02",
      "block_id": "AUT1-C01",
      "supplement": "review-supplement-1.md",
      "supplement_sha256": "274f7e4508180a78bf82e9064f459e335addd84b6165207819a6be7a156f46ed",
      "byte_start": 17665,
      "byte_end_exclusive": 27835,
      "transport_sha256": "9eae4bdf920a837ce1a269732c5e7058a0be978b02ceb63b4a198abb06e7ade0",
      "source_path": "packages/core/src/actions.ts",
      "source_commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
      "source_git_blob_sha": "4f81df84763bd63e7680de8fd40c60b583ef68ca",
      "source_sha256": "08c5f306bc1c53b978a4254eba0fc708d9a4bfbb30fb63ead23c237f359fceef",
      "source_line_intervals": [
        [
          49,
          216
        ]
      ]
    },
    {
      "request_id": "RE-AUT2-02",
      "block_id": "AUT1-C12",
      "supplement": "review-supplement-1.md",
      "supplement_sha256": "274f7e4508180a78bf82e9064f459e335addd84b6165207819a6be7a156f46ed",
      "byte_start": 97848,
      "byte_end_exclusive": 108773,
      "transport_sha256": "67c219730f2ee4ad5d12b00614edba10525a277ad9e8f915ff6d6fa360708f38",
      "source_path": "packages/core/src/actions/gitlab/native.ts",
      "source_commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
      "source_git_blob_sha": "d6cf026dcbfb9023285415a9dd16842951e39ac0",
      "source_sha256": "4f61c33643ab30ba295e4e84619c1a3ec4d1dd029d6ce32407029553691eadcc",
      "source_line_intervals": [
        [
          12,
          170
        ]
      ]
    },
    {
      "request_id": "RE-AUT2-02",
      "block_id": "AUT1-C13",
      "supplement": "review-supplement-1.md",
      "supplement_sha256": "274f7e4508180a78bf82e9064f459e335addd84b6165207819a6be7a156f46ed",
      "byte_start": 108773,
      "byte_end_exclusive": 116850,
      "transport_sha256": "b8fda1d6559e8e4fa8f891e161bb0e8e9d37daf9a7e25c946232248898a10ba9",
      "source_path": "packages/core/src/actions/gitlab/catalog.ts",
      "source_commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
      "source_git_blob_sha": "a7a087856e35e01764382211abebfddfa00c133d",
      "source_sha256": "546e21ae307d414ec385b7de7963b1756535a22beb66ff277c007111fe0b6478",
      "source_line_intervals": [
        [
          1,
          87
        ]
      ]
    },
    {
      "request_id": "RE-AUT2-02",
      "block_id": "AUT1-C41",
      "supplement": "review-supplement-1.md",
      "supplement_sha256": "274f7e4508180a78bf82e9064f459e335addd84b6165207819a6be7a156f46ed",
      "byte_start": 282763,
      "byte_end_exclusive": 285793,
      "transport_sha256": "ff2ddae174f12e7472a808e3c9a1be43e626a4cb56bf701a4c1dec8c9434dad4",
      "source_path": "packages/core/src/actions/gitlab/commands.ts",
      "source_commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
      "source_git_blob_sha": "d3f432fc7b0c434bfcb9a88adeabfcfae5829033",
      "source_sha256": "2be56b6ff21b0f9a63d929b0b38f75fad2d29705476dbd5d13f63634f803c00e",
      "source_line_intervals": [
        [
          1,
          33
        ]
      ]
    },
    {
      "request_id": "RE-AUT2-02",
      "block_id": "AUT1-C42",
      "supplement": "review-supplement-1.md",
      "supplement_sha256": "274f7e4508180a78bf82e9064f459e335addd84b6165207819a6be7a156f46ed",
      "byte_start": 285793,
      "byte_end_exclusive": 292126,
      "transport_sha256": "01f95096d8534319516989d2547feb3eb6798dd53835a8b5785427e02fcf2f9b",
      "source_path": "packages/core/src/actions/gitlab/commands/shared.ts",
      "source_commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
      "source_git_blob_sha": "b15f4a3edb40e83274490b3c789cf2581aac9a5a",
      "source_sha256": "0af91cc662eb4578cf1f16e967743fe9d69fb356d6c58555f50826b399e23a97",
      "source_line_intervals": [
        [
          9,
          83
        ]
      ]
    },
    {
      "request_id": "RE-AUT2-02",
      "block_id": "AUT1-C43",
      "supplement": "review-supplement-1.md",
      "supplement_sha256": "274f7e4508180a78bf82e9064f459e335addd84b6165207819a6be7a156f46ed",
      "byte_start": 292126,
      "byte_end_exclusive": 296265,
      "transport_sha256": "0b327061883f51c3ebc5513072c0c39f962c44004c059c4736c8ab2b2ba7210e",
      "source_path": "packages/core/src/actions/gitlab/commands/runs.ts",
      "source_commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
      "source_git_blob_sha": "999c7e5cd6c6d8d33cbe63ad601923b308eff3e4",
      "source_sha256": "0c210556925c4d2f025c6942b2512e8ab782ae748aa51b0336dde859c441ec30",
      "source_line_intervals": [
        [
          9,
          47
        ]
      ]
    },
    {
      "request_id": "RE-AUT2-02",
      "block_id": "AUT1-C44",
      "supplement": "review-supplement-1.md",
      "supplement_sha256": "274f7e4508180a78bf82e9064f459e335addd84b6165207819a6be7a156f46ed",
      "byte_start": 296265,
      "byte_end_exclusive": 308347,
      "transport_sha256": "2724e840885641b4f21b0576241f1bc05869407cce8751dee6e8efbf306f5fe6",
      "source_path": "packages/core/src/actions/gitlab/commands/jobs.ts",
      "source_commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
      "source_git_blob_sha": "176a10632f895603fc8cc2b7baef1327db90377e",
      "source_sha256": "0e59d1b73ef755e2e29d0e0dcb829c127f9cc6b642773c973510afe5d3e0f310",
      "source_line_intervals": [
        [
          1,
          133
        ]
      ]
    },
    {
      "request_id": "RE-AUT2-02",
      "block_id": "AUT1-X01",
      "supplement": "review-supplement-1.md",
      "supplement_sha256": "274f7e4508180a78bf82e9064f459e335addd84b6165207819a6be7a156f46ed",
      "byte_start": 310894,
      "byte_end_exclusive": 312707,
      "transport_sha256": "b99dce07a09585d14a07e10c48e471b8eb5ce708d31cbee16cdbe1fd91d6d49b",
      "source_path": "packages/schema/src/actions.ts",
      "source_commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
      "source_git_blob_sha": "3b9c5cc47c6e043e9e5d6f013a8201c4258abe0b",
      "source_sha256": "ff0507ebbb63a8a1ab74bc11187cb70bd19d51ed2ec8cb741eaf0155d03f6b07",
      "source_line_intervals": [
        [
          1,
          18
        ]
      ]
    },
    {
      "request_id": "RE-AUT2-02",
      "block_id": "AUT1-X03",
      "supplement": "review-supplement-1.md",
      "supplement_sha256": "274f7e4508180a78bf82e9064f459e335addd84b6165207819a6be7a156f46ed",
      "byte_start": 317643,
      "byte_end_exclusive": 322290,
      "transport_sha256": "ada2f1cf8f9532d4a08564e6278850aafc2b687a3ce354519039097499006a39",
      "source_path": "packages/schema/src/actions/operation.ts",
      "source_commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
      "source_git_blob_sha": "da7b1bdfb6bd5f7dd8fd368adb5eb5402c37c6fe",
      "source_sha256": "6ad34b7a3cbc4eb4c1ce500f6f665894c0a7792d4d12177cdd1e055592812f0f",
      "source_line_intervals": [
        [
          1,
          79
        ]
      ]
    },
    {
      "request_id": "RE-AUT2-02",
      "block_id": "AUT1-X04",
      "supplement": "review-supplement-1.md",
      "supplement_sha256": "274f7e4508180a78bf82e9064f459e335addd84b6165207819a6be7a156f46ed",
      "byte_start": 322290,
      "byte_end_exclusive": 328111,
      "transport_sha256": "b823bab78f9d376ed8cbcce50984352472f679be69730008e7fec3517c1f5aa6",
      "source_path": "packages/schema/src/actions/command.ts",
      "source_commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
      "source_git_blob_sha": "763fc67220a5a5962794593062f4705840e7598b",
      "source_sha256": "46722d7902f6005986f3e2c372675e3f9e047e2dbe639e404146f151e1de3d85",
      "source_line_intervals": [
        [
          1,
          68
        ]
      ]
    }
  ]
}
```

## RE-AUT2-03 — blocos reutilizados

```json
{
  "type": "mechanical_literal_block_references",
  "request_id": "RE-AUT2-03",
  "requested_chain": [
    "ActionsResources route → concrete config domain",
    "selection/project/actor/source/version → planned phases",
    "stage result → acknowledgement; CommandOutput stays outside operations/sql"
  ],
  "blocks": [
    {
      "request_id": "RE-AUT2-03",
      "block_id": "AUT1-C01",
      "supplement": "review-supplement-1.md",
      "supplement_sha256": "274f7e4508180a78bf82e9064f459e335addd84b6165207819a6be7a156f46ed",
      "byte_start": 17665,
      "byte_end_exclusive": 27835,
      "transport_sha256": "9eae4bdf920a837ce1a269732c5e7058a0be978b02ceb63b4a198abb06e7ade0",
      "source_path": "packages/core/src/actions.ts",
      "source_commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
      "source_git_blob_sha": "4f81df84763bd63e7680de8fd40c60b583ef68ca",
      "source_sha256": "08c5f306bc1c53b978a4254eba0fc708d9a4bfbb30fb63ead23c237f359fceef",
      "source_line_intervals": [
        [
          49,
          216
        ]
      ]
    },
    {
      "request_id": "RE-AUT2-03",
      "block_id": "AUT1-C03",
      "supplement": "review-supplement-1.md",
      "supplement_sha256": "274f7e4508180a78bf82e9064f459e335addd84b6165207819a6be7a156f46ed",
      "byte_start": 33248,
      "byte_end_exclusive": 44916,
      "transport_sha256": "67d13936ebd7ba6d1b68ad42a7f70a7e3eb598ce36631b5a1a1902b1d1379cfb",
      "source_path": "packages/core/src/actions/binding.ts",
      "source_commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
      "source_git_blob_sha": "0012bd2c459c7c9899ce63aa6d4bb69760e9647a",
      "source_sha256": "fa7b2380b5ea1c3b10195b17e2015fed34f0501df2e16cfa7fe497969dba83bc",
      "source_line_intervals": [
        [
          12,
          161
        ]
      ]
    },
    {
      "request_id": "RE-AUT2-03",
      "block_id": "AUT1-C04",
      "supplement": "review-supplement-1.md",
      "supplement_sha256": "274f7e4508180a78bf82e9064f459e335addd84b6165207819a6be7a156f46ed",
      "byte_start": 44916,
      "byte_end_exclusive": 54270,
      "transport_sha256": "089025b40223c27069456b8c2674c904328137db1396ff410279a0adb1a5dd98",
      "source_path": "packages/core/src/actions/state.ts",
      "source_commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
      "source_git_blob_sha": "c24ab01417fdea32688d26007e04d8fdac1d43ca",
      "source_sha256": "a47ce41b196dd2c95e9724824d554472f93466be0220a02f1b019e855c3b9faf",
      "source_line_intervals": [
        [
          8,
          166
        ]
      ]
    },
    {
      "request_id": "RE-AUT2-03",
      "block_id": "AUT1-C05",
      "supplement": "review-supplement-1.md",
      "supplement_sha256": "274f7e4508180a78bf82e9064f459e335addd84b6165207819a6be7a156f46ed",
      "byte_start": 54270,
      "byte_end_exclusive": 60260,
      "transport_sha256": "8361ac52d901e3ff71ac1ace3ec0df258c9a06fbfb7b3808d09a81c04d2161a0",
      "source_path": "packages/core/src/actions/contract.ts",
      "source_commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
      "source_git_blob_sha": "62521cbd3f4860049c3480a2bf9f2ed650c6c9f8",
      "source_sha256": "c69997923b14da057a5cab4b3e9077884263d43c02f98dee1da44fedf65ae9bc",
      "source_line_intervals": [
        [
          8,
          88
        ]
      ]
    },
    {
      "request_id": "RE-AUT2-03",
      "block_id": "AUT1-C31",
      "supplement": "review-supplement-1.md",
      "supplement_sha256": "274f7e4508180a78bf82e9064f459e335addd84b6165207819a6be7a156f46ed",
      "byte_start": 238859,
      "byte_end_exclusive": 250919,
      "transport_sha256": "c2ad42bfb0555bc939e4f5df47178f7dbc643674d65eb1115d456573429780a7",
      "source_path": "packages/core/src/actions/operations.ts",
      "source_commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
      "source_git_blob_sha": "83c0b9e03b063bd59bc2d30317f7de85cbb99ee4",
      "source_sha256": "f4180bfeabef99c0eaddace3f1da7242fb8dacd7d63fb948b84cc014f59a89d4",
      "source_line_intervals": [
        [
          16,
          204
        ]
      ]
    },
    {
      "request_id": "RE-AUT2-03",
      "block_id": "AUT1-C32",
      "supplement": "review-supplement-1.md",
      "supplement_sha256": "274f7e4508180a78bf82e9064f459e335addd84b6165207819a6be7a156f46ed",
      "byte_start": 250919,
      "byte_end_exclusive": 253239,
      "transport_sha256": "4684c8e83731ee175f5f29e2867deb772a23779e18f910bf687e972de75e5960",
      "source_path": "packages/core/src/actions/operations/sql.ts",
      "source_commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
      "source_git_blob_sha": "63cad8cb4926acd4adc6c285bd6b1f1f64a238cc",
      "source_sha256": "07f2de775a5e5352859f1bf041e32865b3681ec2db85fd4e367823fe2a00da75",
      "source_line_intervals": [
        [
          1,
          35
        ]
      ]
    },
    {
      "request_id": "RE-AUT2-03",
      "block_id": "AUT1-C33",
      "supplement": "review-supplement-1.md",
      "supplement_sha256": "274f7e4508180a78bf82e9064f459e335addd84b6165207819a6be7a156f46ed",
      "byte_start": 253239,
      "byte_end_exclusive": 261258,
      "transport_sha256": "ab4daaf7e51a0100d2f67befc7679ba0939c122d2ac3bb22c92ba2e81c8b88be",
      "source_path": "packages/core/src/actions/operations/storage.ts",
      "source_commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
      "source_git_blob_sha": "d7633da87c8fe5b41319e23c6ca9e9092d152e4e",
      "source_sha256": "433462cdc96bbeda49a85f46e9c96954cee753822165329caac5c26c748ff2b4",
      "source_line_intervals": [
        [
          9,
          142
        ]
      ]
    },
    {
      "request_id": "RE-AUT2-03",
      "block_id": "AUT1-C34",
      "supplement": "review-supplement-1.md",
      "supplement_sha256": "274f7e4508180a78bf82e9064f459e335addd84b6165207819a6be7a156f46ed",
      "byte_start": 261258,
      "byte_end_exclusive": 264083,
      "transport_sha256": "96d449ca45380b215d6670ce093642b74c409ce4a418eb761bc654b1b41ce9bf",
      "source_path": "packages/core/src/actions/operations/outcome.ts",
      "source_commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
      "source_git_blob_sha": "6ad54f11c415134b4eb590194e2079f09ef01aed",
      "source_sha256": "3d89a3a86b0d51b2c153088397c952599dc8b75b5469a5a27a8efc7395ece20c",
      "source_line_intervals": [
        [
          1,
          40
        ]
      ]
    },
    {
      "request_id": "RE-AUT2-03",
      "block_id": "AUT1-X02",
      "supplement": "review-supplement-1.md",
      "supplement_sha256": "274f7e4508180a78bf82e9064f459e335addd84b6165207819a6be7a156f46ed",
      "byte_start": 312707,
      "byte_end_exclusive": 317643,
      "transport_sha256": "64ca2184d79d48846c2761afe27a0f392c273309fd5b54433c0290441f250ff9",
      "source_path": "packages/schema/src/actions/identity.ts",
      "source_commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
      "source_git_blob_sha": "273b77520f81c755f62979b9609f45917e72e062",
      "source_sha256": "1d3361dd26b49e366b7c59d14a589f6684a16b36bfec0b761e62481fc15f6f14",
      "source_line_intervals": [
        [
          1,
          93
        ]
      ]
    },
    {
      "request_id": "RE-AUT2-03",
      "block_id": "AUT1-X03",
      "supplement": "review-supplement-1.md",
      "supplement_sha256": "274f7e4508180a78bf82e9064f459e335addd84b6165207819a6be7a156f46ed",
      "byte_start": 317643,
      "byte_end_exclusive": 322290,
      "transport_sha256": "ada2f1cf8f9532d4a08564e6278850aafc2b687a3ce354519039097499006a39",
      "source_path": "packages/schema/src/actions/operation.ts",
      "source_commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
      "source_git_blob_sha": "da7b1bdfb6bd5f7dd8fd368adb5eb5402c37c6fe",
      "source_sha256": "6ad34b7a3cbc4eb4c1ce500f6f665894c0a7792d4d12177cdd1e055592812f0f",
      "source_line_intervals": [
        [
          1,
          79
        ]
      ]
    },
    {
      "request_id": "RE-AUT2-03",
      "block_id": "AUT1-X04",
      "supplement": "review-supplement-1.md",
      "supplement_sha256": "274f7e4508180a78bf82e9064f459e335addd84b6165207819a6be7a156f46ed",
      "byte_start": 322290,
      "byte_end_exclusive": 328111,
      "transport_sha256": "b823bab78f9d376ed8cbcce50984352472f679be69730008e7fec3517c1f5aa6",
      "source_path": "packages/schema/src/actions/command.ts",
      "source_commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
      "source_git_blob_sha": "763fc67220a5a5962794593062f4705840e7598b",
      "source_sha256": "46722d7902f6005986f3e2c372675e3f9e047e2dbe639e404146f151e1de3d85",
      "source_line_intervals": [
        [
          1,
          68
        ]
      ]
    },
    {
      "request_id": "RE-AUT2-03",
      "block_id": "AUT1-X05",
      "supplement": "review-supplement-1.md",
      "supplement_sha256": "274f7e4508180a78bf82e9064f459e335addd84b6165207819a6be7a156f46ed",
      "byte_start": 328111,
      "byte_end_exclusive": 329839,
      "transport_sha256": "deee6a656753c0df83acfb451333cee7bb7b07b0c5093fc0e1d1c16e82173e3e",
      "source_path": "packages/schema/src/schema.ts",
      "source_commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
      "source_git_blob_sha": "d19a39b9708cfcaeedc1d7c62503afbadfee5dd7",
      "source_sha256": "a7cdac1ae9d21d9d71a3783a730ca29bc8fbe769d01479a19101a81eec2bb447",
      "source_line_intervals": [
        [
          1,
          23
        ]
      ]
    }
  ]
}
```

## RE-AUT2-04 — blocos reutilizados

```json
{
  "type": "mechanical_literal_block_references",
  "request_id": "RE-AUT2-04",
  "requested_chain": [
    "Resource capture/authority/version → cache/runner/schedule domain",
    "native ownership/inventory/precondition → mutation(s) → acknowledgement/output",
    "artifact mutation → OutputTarget/OutputNative ownership/state/version → delete/keep"
  ],
  "blocks": [
    {
      "request_id": "RE-AUT2-04",
      "block_id": "AUT1-C01",
      "supplement": "review-supplement-1.md",
      "supplement_sha256": "274f7e4508180a78bf82e9064f459e335addd84b6165207819a6be7a156f46ed",
      "byte_start": 17665,
      "byte_end_exclusive": 27835,
      "transport_sha256": "9eae4bdf920a837ce1a269732c5e7058a0be978b02ceb63b4a198abb06e7ade0",
      "source_path": "packages/core/src/actions.ts",
      "source_commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
      "source_git_blob_sha": "4f81df84763bd63e7680de8fd40c60b583ef68ca",
      "source_sha256": "08c5f306bc1c53b978a4254eba0fc708d9a4bfbb30fb63ead23c237f359fceef",
      "source_line_intervals": [
        [
          49,
          216
        ]
      ]
    },
    {
      "request_id": "RE-AUT2-04",
      "block_id": "AUT1-C28",
      "supplement": "review-supplement-1.md",
      "supplement_sha256": "274f7e4508180a78bf82e9064f459e335addd84b6165207819a6be7a156f46ed",
      "byte_start": 213124,
      "byte_end_exclusive": 218868,
      "transport_sha256": "4d7daadc9554d596abb08e2d4b70afd2d4d32b012542e47d36ef2cf8711760ad",
      "source_path": "packages/core/src/actions/authoring/schedule.ts",
      "source_commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
      "source_git_blob_sha": "189f4f3903314afb6b6d8c86b50dbbccb0309869",
      "source_sha256": "2151bb5ece4c4d2a635ede984a8668620e8f619000e720af35370b0f87bc561b",
      "source_line_intervals": [
        [
          1,
          77
        ]
      ]
    },
    {
      "request_id": "RE-AUT2-04",
      "block_id": "AUT1-C29",
      "supplement": "review-supplement-1.md",
      "supplement_sha256": "274f7e4508180a78bf82e9064f459e335addd84b6165207819a6be7a156f46ed",
      "byte_start": 218868,
      "byte_end_exclusive": 225010,
      "transport_sha256": "dc4afa0cf92efcc4ec58cace9aeec91ce56493fc6409184ecc05f28c81a3d3d9",
      "source_path": "packages/core/src/actions/resources/schedule-yaml.ts",
      "source_commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
      "source_git_blob_sha": "cd3a52f384a522b74910f01ea0278efc1fa5a12f",
      "source_sha256": "57ef9c02ab37eb8cebeb87cd3a307673211f989e1bb8036cf3d4799a2b783abd",
      "source_line_intervals": [
        [
          1,
          81
        ]
      ]
    },
    {
      "request_id": "RE-AUT2-04",
      "block_id": "AUT1-C32",
      "supplement": "review-supplement-1.md",
      "supplement_sha256": "274f7e4508180a78bf82e9064f459e335addd84b6165207819a6be7a156f46ed",
      "byte_start": 250919,
      "byte_end_exclusive": 253239,
      "transport_sha256": "4684c8e83731ee175f5f29e2867deb772a23779e18f910bf687e972de75e5960",
      "source_path": "packages/core/src/actions/operations/sql.ts",
      "source_commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
      "source_git_blob_sha": "63cad8cb4926acd4adc6c285bd6b1f1f64a238cc",
      "source_sha256": "07f2de775a5e5352859f1bf041e32865b3681ec2db85fd4e367823fe2a00da75",
      "source_line_intervals": [
        [
          1,
          35
        ]
      ]
    },
    {
      "request_id": "RE-AUT2-04",
      "block_id": "AUT1-C33",
      "supplement": "review-supplement-1.md",
      "supplement_sha256": "274f7e4508180a78bf82e9064f459e335addd84b6165207819a6be7a156f46ed",
      "byte_start": 253239,
      "byte_end_exclusive": 261258,
      "transport_sha256": "ab4daaf7e51a0100d2f67befc7679ba0939c122d2ac3bb22c92ba2e81c8b88be",
      "source_path": "packages/core/src/actions/operations/storage.ts",
      "source_commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
      "source_git_blob_sha": "d7633da87c8fe5b41319e23c6ca9e9092d152e4e",
      "source_sha256": "433462cdc96bbeda49a85f46e9c96954cee753822165329caac5c26c748ff2b4",
      "source_line_intervals": [
        [
          9,
          142
        ]
      ]
    },
    {
      "request_id": "RE-AUT2-04",
      "block_id": "AUT1-C34",
      "supplement": "review-supplement-1.md",
      "supplement_sha256": "274f7e4508180a78bf82e9064f459e335addd84b6165207819a6be7a156f46ed",
      "byte_start": 261258,
      "byte_end_exclusive": 264083,
      "transport_sha256": "96d449ca45380b215d6670ce093642b74c409ce4a418eb761bc654b1b41ce9bf",
      "source_path": "packages/core/src/actions/operations/outcome.ts",
      "source_commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
      "source_git_blob_sha": "6ad54f11c415134b4eb590194e2079f09ef01aed",
      "source_sha256": "3d89a3a86b0d51b2c153088397c952599dc8b75b5469a5a27a8efc7395ece20c",
      "source_line_intervals": [
        [
          1,
          40
        ]
      ]
    },
    {
      "request_id": "RE-AUT2-04",
      "block_id": "AUT1-X03",
      "supplement": "review-supplement-1.md",
      "supplement_sha256": "274f7e4508180a78bf82e9064f459e335addd84b6165207819a6be7a156f46ed",
      "byte_start": 317643,
      "byte_end_exclusive": 322290,
      "transport_sha256": "ada2f1cf8f9532d4a08564e6278850aafc2b687a3ce354519039097499006a39",
      "source_path": "packages/schema/src/actions/operation.ts",
      "source_commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
      "source_git_blob_sha": "da7b1bdfb6bd5f7dd8fd368adb5eb5402c37c6fe",
      "source_sha256": "6ad34b7a3cbc4eb4c1ce500f6f665894c0a7792d4d12177cdd1e055592812f0f",
      "source_line_intervals": [
        [
          1,
          79
        ]
      ]
    },
    {
      "request_id": "RE-AUT2-04",
      "block_id": "AUT1-X04",
      "supplement": "review-supplement-1.md",
      "supplement_sha256": "274f7e4508180a78bf82e9064f459e335addd84b6165207819a6be7a156f46ed",
      "byte_start": 322290,
      "byte_end_exclusive": 328111,
      "transport_sha256": "b823bab78f9d376ed8cbcce50984352472f679be69730008e7fec3517c1f5aa6",
      "source_path": "packages/schema/src/actions/command.ts",
      "source_commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
      "source_git_blob_sha": "763fc67220a5a5962794593062f4705840e7598b",
      "source_sha256": "46722d7902f6005986f3e2c372675e3f9e047e2dbe639e404146f151e1de3d85",
      "source_line_intervals": [
        [
          1,
          68
        ]
      ]
    },
    {
      "request_id": "RE-AUT2-04",
      "block_id": "AUT1-X05",
      "supplement": "review-supplement-1.md",
      "supplement_sha256": "274f7e4508180a78bf82e9064f459e335addd84b6165207819a6be7a156f46ed",
      "byte_start": 328111,
      "byte_end_exclusive": 329839,
      "transport_sha256": "deee6a656753c0df83acfb451333cee7bb7b07b0c5093fc0e1d1c16e82173e3e",
      "source_path": "packages/schema/src/schema.ts",
      "source_commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
      "source_git_blob_sha": "d19a39b9708cfcaeedc1d7c62503afbadfee5dd7",
      "source_sha256": "a7cdac1ae9d21d9d71a3783a730ca29bc8fbe769d01479a19101a81eec2bb447",
      "source_line_intervals": [
        [
          1,
          23
        ]
      ]
    }
  ]
}
```

## RE-AUT2-05 — blocos reutilizados

```json
{
  "type": "mechanical_literal_block_references",
  "request_id": "RE-AUT2-05",
  "requested_chain": [
    "ActionsTransport request/resolve → CLI or GitLab transport",
    "glab qualified snapshot → same snapshot actor + authenticated request",
    "HTTP phase/write/read/response → safe classifier; multipart body under backpressure"
  ],
  "blocks": [
    {
      "request_id": "RE-AUT2-05",
      "block_id": "AUT1-C02",
      "supplement": "review-supplement-1.md",
      "supplement_sha256": "274f7e4508180a78bf82e9064f459e335addd84b6165207819a6be7a156f46ed",
      "byte_start": 27835,
      "byte_end_exclusive": 33248,
      "transport_sha256": "586895696085e383f599f5cb2f1a11edcbfed57a314900111b09596383d6505e",
      "source_path": "packages/core/src/actions/transport.ts",
      "source_commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
      "source_git_blob_sha": "a028169bb585fb81c24889148ea61aa631c521af",
      "source_sha256": "0bee331d9b87db900ad4310366fb4b3a7abdc7f2c6e915e926754c6eced6d2ae",
      "source_line_intervals": [
        [
          14,
          67
        ]
      ]
    },
    {
      "request_id": "RE-AUT2-05",
      "block_id": "AUT1-C05",
      "supplement": "review-supplement-1.md",
      "supplement_sha256": "274f7e4508180a78bf82e9064f459e335addd84b6165207819a6be7a156f46ed",
      "byte_start": 54270,
      "byte_end_exclusive": 60260,
      "transport_sha256": "8361ac52d901e3ff71ac1ace3ec0df258c9a06fbfb7b3808d09a81c04d2161a0",
      "source_path": "packages/core/src/actions/contract.ts",
      "source_commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
      "source_git_blob_sha": "62521cbd3f4860049c3480a2bf9f2ed650c6c9f8",
      "source_sha256": "c69997923b14da057a5cab4b3e9077884263d43c02f98dee1da44fedf65ae9bc",
      "source_line_intervals": [
        [
          8,
          88
        ]
      ]
    },
    {
      "request_id": "RE-AUT2-05",
      "block_id": "AUT1-C37",
      "supplement": "review-supplement-1.md",
      "supplement_sha256": "274f7e4508180a78bf82e9064f459e335addd84b6165207819a6be7a156f46ed",
      "byte_start": 269368,
      "byte_end_exclusive": 270335,
      "transport_sha256": "88989e6f58128d49892f257f53220da30a97a785b01c636c89952cce168e6610",
      "source_path": "packages/core/src/actions/error.ts",
      "source_commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
      "source_git_blob_sha": "5557a68cf67417c2c3149f6f130952297114ecbd",
      "source_sha256": "9ce2b3a2943588b3bf4676773f9966a75f347aa84522b9ae96131ba9839017e7",
      "source_line_intervals": [
        [
          1,
          6
        ]
      ]
    },
    {
      "request_id": "RE-AUT2-05",
      "block_id": "AUT1-C45",
      "supplement": "review-supplement-1.md",
      "supplement_sha256": "274f7e4508180a78bf82e9064f459e335addd84b6165207819a6be7a156f46ed",
      "byte_start": 308347,
      "byte_end_exclusive": 310894,
      "transport_sha256": "c5ff4a07e1871ef94b93d08c9a5dfc08b7a18c4b6ecb00898252db4291302f0c",
      "source_path": "packages/core/src/actions/transport/response.ts",
      "source_commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
      "source_git_blob_sha": "09aed710878c0e33f33b7e1a8d566074a44ad30a",
      "source_sha256": "dbe2d9284661b36cee41b379cba34f29cd6910df7757b10b94136eb12e6d8192",
      "source_line_intervals": [
        [
          56,
          76
        ]
      ]
    },
    {
      "request_id": "RE-AUT2-05",
      "block_id": "AUT1-X02",
      "supplement": "review-supplement-1.md",
      "supplement_sha256": "274f7e4508180a78bf82e9064f459e335addd84b6165207819a6be7a156f46ed",
      "byte_start": 312707,
      "byte_end_exclusive": 317643,
      "transport_sha256": "64ca2184d79d48846c2761afe27a0f392c273309fd5b54433c0290441f250ff9",
      "source_path": "packages/schema/src/actions/identity.ts",
      "source_commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
      "source_git_blob_sha": "273b77520f81c755f62979b9609f45917e72e062",
      "source_sha256": "1d3361dd26b49e366b7c59d14a589f6684a16b36bfec0b761e62481fc15f6f14",
      "source_line_intervals": [
        [
          1,
          93
        ]
      ]
    }
  ]
}
```

## RE-AUT2-06 — blocos reutilizados

```json
{
  "type": "mechanical_literal_block_references",
  "request_id": "RE-AUT2-06",
  "requested_chain": [
    "ActionsOutput.read → OutputTarget.resolve → OutputDownload.open(renew=true)",
    "native redirect → OutputSigned.follow/open → pre-byte renewal if eligible",
    "ActionsOutput.read rejects206/content-range → response.body → valid EOF and finalizers"
  ],
  "blocks": [
    {
      "request_id": "RE-AUT2-06",
      "block_id": "AUT1-C01",
      "supplement": "review-supplement-1.md",
      "supplement_sha256": "274f7e4508180a78bf82e9064f459e335addd84b6165207819a6be7a156f46ed",
      "byte_start": 17665,
      "byte_end_exclusive": 27835,
      "transport_sha256": "9eae4bdf920a837ce1a269732c5e7058a0be978b02ceb63b4a198abb06e7ade0",
      "source_path": "packages/core/src/actions.ts",
      "source_commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
      "source_git_blob_sha": "4f81df84763bd63e7680de8fd40c60b583ef68ca",
      "source_sha256": "08c5f306bc1c53b978a4254eba0fc708d9a4bfbb30fb63ead23c237f359fceef",
      "source_line_intervals": [
        [
          49,
          216
        ]
      ]
    },
    {
      "request_id": "RE-AUT2-06",
      "block_id": "AUT1-C02",
      "supplement": "review-supplement-1.md",
      "supplement_sha256": "274f7e4508180a78bf82e9064f459e335addd84b6165207819a6be7a156f46ed",
      "byte_start": 27835,
      "byte_end_exclusive": 33248,
      "transport_sha256": "586895696085e383f599f5cb2f1a11edcbfed57a314900111b09596383d6505e",
      "source_path": "packages/core/src/actions/transport.ts",
      "source_commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
      "source_git_blob_sha": "a028169bb585fb81c24889148ea61aa631c521af",
      "source_sha256": "0bee331d9b87db900ad4310366fb4b3a7abdc7f2c6e915e926754c6eced6d2ae",
      "source_line_intervals": [
        [
          14,
          67
        ]
      ]
    },
    {
      "request_id": "RE-AUT2-06",
      "block_id": "AUT1-C05",
      "supplement": "review-supplement-1.md",
      "supplement_sha256": "274f7e4508180a78bf82e9064f459e335addd84b6165207819a6be7a156f46ed",
      "byte_start": 54270,
      "byte_end_exclusive": 60260,
      "transport_sha256": "8361ac52d901e3ff71ac1ace3ec0df258c9a06fbfb7b3808d09a81c04d2161a0",
      "source_path": "packages/core/src/actions/contract.ts",
      "source_commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
      "source_git_blob_sha": "62521cbd3f4860049c3480a2bf9f2ed650c6c9f8",
      "source_sha256": "c69997923b14da057a5cab4b3e9077884263d43c02f98dee1da44fedf65ae9bc",
      "source_line_intervals": [
        [
          8,
          88
        ]
      ]
    },
    {
      "request_id": "RE-AUT2-06",
      "block_id": "AUT1-X05",
      "supplement": "review-supplement-1.md",
      "supplement_sha256": "274f7e4508180a78bf82e9064f459e335addd84b6165207819a6be7a156f46ed",
      "byte_start": 328111,
      "byte_end_exclusive": 329839,
      "transport_sha256": "deee6a656753c0df83acfb451333cee7bb7b07b0c5093fc0e1d1c16e82173e3e",
      "source_path": "packages/schema/src/schema.ts",
      "source_commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
      "source_git_blob_sha": "d19a39b9708cfcaeedc1d7c62503afbadfee5dd7",
      "source_sha256": "a7cdac1ae9d21d9d71a3783a730ca29bc8fbe769d01479a19101a81eec2bb447",
      "source_line_intervals": [
        [
          1,
          23
        ]
      ]
    }
  ]
}
```

## AUT2-C01

```json
{"block_id":"AUT2-C01","type":"literal_source_excerpt","request_namespace":"J1 canonical groups; J2 mapping in index","requests":["RE-AUT2-01"],"body_anchors":["A18"],"requested_subject":"Chamador: captura e seleção do comando por kind","source_category":"owned_population_source","path":"packages/core/src/actions/github/commands.ts","archive":"sources/packages/core/src/actions/github/commands.ts","commit":"1cde2ff7a71bcf7aecb5d030917b577165135d38","source_git_blob_sha":"c4fcb4746c7bbefa8603afe01913816606181922","source_sha256":"02e462e14767c1d1b3a6e2294fb1d14c668d50e9f515eaec76b20cad1401e67b","source_bytes":3076}
```

```json
{"first_line":1,"last_line":38,"bytes":3076,"sha256":"02e462e14767c1d1b3a6e2294fb1d14c668d50e9f515eaec76b20cad1401e67b"}
```

~~~~typescript
export * as ActionsGitHubCommands from "./commands"

import { Actions } from "@orchestra/schema/actions"
import { Effect } from "effect"
import { ActionsContract } from "../contract"
import { GitHubCommandCommon } from "./commands/common"
import { GitHubWorkflowCommands } from "./commands/workflow"
import { GitHubRunCommands } from "./commands/run"
import { GitHubJobCommands } from "./commands/job"

export function make(services: { transport: ActionsContract.Transport; reader: ActionsContract.ReadAdapter }): ActionsContract.Commands {
  return { perform: Effect.fn("ActionsGitHubCommands.perform")(function* (binding: Actions.Binding, intent: Actions.OperationIntent, payload: ActionsContract.Json) {
    const frozen = yield* GitHubCommandCommon.capture(binding, intent, payload)
    if (frozen.intent.kind === "workflow.dispatch") {
      const input = yield* GitHubCommandCommon.guard(frozen.binding, () => GitHubCommandCommon.input(frozen.binding, Actions.GitHubDispatch, frozen.payload))
      return yield* GitHubWorkflowCommands.dispatch(services, frozen.binding, frozen.intent, input)
    }
    if (frozen.intent.kind === "workflow.enable" || frozen.intent.kind === "workflow.disable") {
      const input = yield* GitHubCommandCommon.guard(frozen.binding, () => GitHubCommandCommon.input(frozen.binding, Actions.WorkflowStateCommand.fields.input, frozen.payload))
      if (input.enabled !== (frozen.intent.kind === "workflow.enable"))
        return yield* GitHubCommandCommon.fail(frozen.binding, "invalid_input", "Workflow state payload conflicts with the admitted operation")
      return yield* GitHubWorkflowCommands.state(services, frozen.binding, frozen.intent, input.enabled)
    }
    if (frozen.intent.kind === "run.retry" || frozen.intent.kind === "run.retryFailed") {
      const input = yield* GitHubCommandCommon.guard(frozen.binding, () => GitHubCommandCommon.input(frozen.binding, Actions.RetryCommand.fields.input, frozen.payload))
      if (input.provider !== "github" || input.mode !== (frozen.intent.kind === "run.retry" ? "all" : "failed"))
        return yield* GitHubCommandCommon.fail(frozen.binding, "invalid_input", "Retry mode or provider conflicts with the admitted operation")
      return yield* GitHubRunCommands.perform(services, frozen.binding, frozen.intent, input.enableDebugLogging)
    }
    if (frozen.intent.kind === "job.retry") {
      const input = yield* GitHubCommandCommon.guard(frozen.binding, () => GitHubCommandCommon.input(frozen.binding, Actions.JobRetryCommand.fields.input, frozen.payload))
      if (input.provider !== "github") return yield* GitHubCommandCommon.fail(frozen.binding, "invalid_input", "Job retry belongs to another provider")
      return yield* GitHubJobCommands.retry(services, frozen.binding, frozen.intent, input.enableDebugLogging)
    }
    yield* GitHubCommandCommon.guard(frozen.binding, () => GitHubCommandCommon.input(frozen.binding, Actions.GitHubCommand.fields.input, frozen.payload))
    return yield* GitHubRunCommands.perform(services, frozen.binding, frozen.intent)
  }) }
}
~~~~

## AUT2-C02

```json
{"block_id":"AUT2-C02","type":"literal_source_excerpt","request_namespace":"J1 canonical groups; J2 mapping in index","requests":["RE-AUT2-01"],"body_anchors":["A18"],"requested_subject":"Parser completo de definições/inputs dispatch, budgets/defaults/required/choices","source_category":"owned_population_source","path":"packages/core/src/actions/github/commands/inputs.ts","archive":"sources/packages/core/src/actions/github/commands/inputs.ts","commit":"1cde2ff7a71bcf7aecb5d030917b577165135d38","source_git_blob_sha":"177837b7dfbc0272414263be7e2a24606839534c","source_sha256":"38c08aef5b55f2bdbef46c771e7974ff77a0408304a9bb9fcc4f572800baecaa","source_bytes":5159}
```

```json
{"first_line":1,"last_line":69,"bytes":5159,"sha256":"38c08aef5b55f2bdbef46c771e7974ff77a0408304a9bb9fcc4f572800baecaa"}
```

~~~~typescript
export * as GitHubDispatchInputs from "./inputs"

import { Actions } from "@orchestra/schema/actions"
import { Option, Schema } from "effect"
import { diagnostics, object, read, strings } from "../../source/document"
import { GitHubCommandCommon } from "./common"

const Value = Schema.Union([Schema.String, Schema.Finite, Schema.Boolean])
const Types = Schema.Literals(["string", "choice", "boolean", "number", "environment"])
const Definition = Schema.Struct({ type: Schema.optionalKey(Types),
  required: Schema.optionalKey(Schema.Boolean), description: Schema.optionalKey(Schema.String),
  default: Schema.optionalKey(Value), options: Schema.optionalKey(Schema.Array(Schema.String)) })

// Inspect native on.workflow_dispatch structurally; never evaluate YAML expressions.
export function definitions(binding: Actions.Binding, source: Actions.Source, report = diagnostics()): Record<string, typeof Definition.Type & { type: typeof Types.Type }> {
  if (Buffer.byteLength(source.text) > 128 * 1024)
    throw GitHubCommandCommon.fail(binding, "metadata_truncated", "Workflow exceeds bounded dispatch-definition parsing")
  const document = read(source.text, "github", report)
  if (document === undefined || report.state() !== "complete")
    throw GitHubCommandCommon.fail(binding, "source_unresolved", "Workflow dispatch source is not a proved native YAML mapping")
  if (!object(document.value.jobs) || Object.keys(document.value.jobs).length === 0)
    throw GitHubCommandCommon.fail(binding, "source_unresolved", "Workflow dispatch source has no native job definitions")
  // Document diagnostics cover bounded structural parsing, not graph completeness.
  // Dynamic matrices and reusable jobs do not invalidate a proved dispatch trigger.
  const on = document.value.on
  if (on === "workflow_dispatch" || (strings(on) && on.includes("workflow_dispatch"))) return {}
  if (!object(on) || !Object.hasOwn(on, "workflow_dispatch"))
    throw GitHubCommandCommon.fail(binding, "capability_unavailable", "Workflow source does not declare native workflow_dispatch")
  const configuration = Schema.decodeUnknownOption(Schema.Struct({ inputs: Schema.optionalKey(Schema.Record(Schema.String, Schema.NullOr(Definition))) }))
    (on.workflow_dispatch ?? {}, { onExcessProperty: "error" })
  if (Option.isNone(configuration)) throw GitHubCommandCommon.fail(binding, "source_unresolved", "Native workflow_dispatch input definitions are unresolved")
  if (Object.keys(configuration.value.inputs ?? {}).length > 25)
    throw GitHubCommandCommon.fail(binding, "source_unresolved", "Native workflow_dispatch defines more than 25 inputs")
  return Object.fromEntries(Object.entries(configuration.value.inputs ?? {}).map(([name, definition]) => {
    const value = definition ?? {}
    const type = value.type ?? "string"
    if (type === "choice" && (!value.options?.length || value.options.some((option) => !option)))
      throw GitHubCommandCommon.fail(binding, "source_unresolved", "Native choice input has no proved choices")
    if (value.options !== undefined && type !== "choice")
      throw GitHubCommandCommon.fail(binding, "source_unresolved", "Native input options do not match their declared type")
    if (typeof value.default === "string" && value.default.includes("${{"))
      throw GitHubCommandCommon.fail(binding, "source_unresolved", "Dynamic dispatch input defaults cannot be evaluated during admission")
    const result = { ...value, type }
    if (value.default !== undefined) validate(binding, result, value.default, "source_unresolved")
    return [name, result]
  }))
}

export function values(binding: Actions.Binding, registry: ReturnType<typeof definitions>, provided: Readonly<Record<string, string | number | boolean>> = {}) {
  if (Object.keys(provided).length > 25 || Object.keys(provided).some((key) => !Object.hasOwn(registry, key)))
    throw GitHubCommandCommon.fail(binding, "invalid_input", "Dispatch input keys do not match the selected native workflow")
  return Object.fromEntries(Object.entries(registry).flatMap(([name, definition]) => {
    const value = Object.hasOwn(provided, name) ? provided[name] : definition.default
    if (value === undefined) {
      if (definition.required) throw GitHubCommandCommon.fail(binding, "invalid_input", "A required native dispatch input is missing")
      return []
    }
    validate(binding, definition, value, "invalid_input")
    return [[name, value]]
  }))
}

function validate(binding: Actions.Binding, definition: { type: string; required?: boolean; options?: readonly string[] }, value: string | number | boolean, kind: Actions.ErrorKind) {
  if ((definition.type === "boolean" && typeof value !== "boolean") ||
      (definition.type === "number" && (typeof value !== "number" || !Number.isFinite(value))) ||
      (["string", "choice", "environment"].includes(definition.type) && typeof value !== "string") ||
      (definition.required && value === "") || (definition.type === "choice" && !definition.options?.some((option) => option === value)))
    throw GitHubCommandCommon.fail(binding, kind, "Dispatch input value does not match its proved native definition")
}
~~~~

## AUT2-C03

```json
{"block_id":"AUT2-C03","type":"literal_source_excerpt","request_namespace":"J1 canonical groups; J2 mapping in index","requests":["RE-AUT2-01"],"body_anchors":["A18"],"requested_subject":"Schemas anteriores a dispatch e ramos enable/disable; dispatch12–47 reutilizado de AUT1-C38","source_category":"owned_population_source","path":"packages/core/src/actions/github/commands/workflow.ts","archive":"sources/packages/core/src/actions/github/commands/workflow.ts","commit":"1cde2ff7a71bcf7aecb5d030917b577165135d38","source_git_blob_sha":"bc9677ced86d82f08db5a38ae948bcca3b1406eb","source_sha256":"7330ca26082e22e8a81c89285afc18002903188555c96d1d60565fae993f7b2f","source_bytes":6811}
```

```json
{"first_line":1,"last_line":11,"bytes":579,"sha256":"0415f3a904df243bdb4194b9fb43bc5df98c9c68bdda34a67ebb828d0798cb9d"}
```

~~~~typescript
export * as GitHubWorkflowCommands from "./workflow"

import { Actions } from "@orchestra/schema/actions"
import { Effect, Option, Schema } from "effect"
import { GitHubNative } from "../native"
import { GitHubCommandCommon } from "./common"

const Workflow = Schema.Struct({ id: GitHubNative.ID, path: Schema.NonEmptyString, state: Schema.NonEmptyString })
const Dispatch = Schema.Struct({ workflow_run_id: GitHubNative.ID, run_url: Schema.NonEmptyString, html_url: Schema.NonEmptyString })

// https://docs.github.com/en/rest/actions/workflows#create-a-workflow-dispatch-event
~~~~

```json
{"first_line":48,"last_line":79,"bytes":2744,"sha256":"6d2a8fd1cc9d2546e29f1b2e87ebc8c346b486bd986ef3c1dc1906f9ec0bfd31"}
```

~~~~typescript
  const result = Schema.decodeUnknownOption(Dispatch)(response.data)
  if (Option.isNone(result)) return yield* GitHubCommandCommon.fail(binding, "outcome_unknown", "GitHub dispatch did not return a complete native run acknowledgement", "unknown")
  return { acknowledgement: { runID: String(result.value.workflow_run_id) } }
})

// https://docs.github.com/en/rest/actions/workflows#enable-a-workflow
export const state = Effect.fn("ActionsGitHubCommands.workflowState")(function* (services: GitHubCommandCommon.Services, binding: Actions.Binding, intent: Actions.OperationIntent, enabled: boolean) {
  const repository = yield* GitHubCommandCommon.authority(services, binding)
  const workflow = yield* read(services, binding, intent, repository.root)
  if (!["active", "disabled_manually", "disabled_inactivity", "disabled_fork"].includes(workflow.state))
    return yield* GitHubCommandCommon.fail(binding, "capability_unavailable", "Native workflow state does not support this transition")
  if (intent.expected?.commit !== undefined || intent.expected?.sourceVersion !== undefined) {
    if (intent.target.ref === undefined) return yield* GitHubCommandCommon.fail(binding, "invalid_input", "Source preconditions require the admitted source ref")
    const selected = yield* GitHubCommandCommon.before(binding, services.reader.source(binding, { path: workflow.path, ref: intent.target.ref }))
    yield* GitHubCommandCommon.guard(binding, () => GitHubCommandCommon.source(binding, intent, selected, workflow.path, intent.target.ref ?? ""))
  }
  yield* GitHubCommandCommon.send(services, binding, { method: "PUT", path: `${repository.root}/actions/workflows/${workflow.id}/${enabled ? "enable" : "disable"}` }, [204])
  return { acknowledgement: {} }
})

const read = Effect.fn("ActionsGitHubCommands.workflowPreflight")(function* (services: GitHubCommandCommon.Services, binding: Actions.Binding, intent: Actions.OperationIntent, root: string) {
  const id = yield* GitHubCommandCommon.guard(binding, () => GitHubNative.id(binding, intent.target.workflowID ?? ""))
  const response = yield* GitHubCommandCommon.get(services, binding, `${root}/actions/workflows/${id}`)
  return yield* GitHubCommandCommon.guard(binding, () => {
    const workflow = GitHubNative.decode(binding, Workflow, response.data, "workflow")
    if (String(workflow.id) !== id || (intent.target.path !== undefined && intent.target.path !== workflow.path))
      throw GitHubCommandCommon.fail(binding, "source_conflict", "Native workflow identity or path does not match admission")
    GitHubNative.path(binding, workflow.path)
    GitHubCommandCommon.version(binding, intent.expected, response)
    return { id, path: workflow.path, state: workflow.state }
  })
})
~~~~

## AUT2-C04

```json
{"block_id":"AUT2-C04","type":"literal_source_excerpt","request_namespace":"J1 canonical groups; J2 mapping in index","requests":["RE-AUT2-01"],"body_anchors":["A19"],"requested_subject":"Imports/declarações anteriores ao ramo completo já transportado em AUT1-C39","source_category":"owned_population_source","path":"packages/core/src/actions/github/commands/run.ts","archive":"sources/packages/core/src/actions/github/commands/run.ts","commit":"1cde2ff7a71bcf7aecb5d030917b577165135d38","source_git_blob_sha":"20a65fe64b3559988856c829670ebb82296f9113","source_sha256":"a54d15a5e3870a09fc98708de4ee41aa09acaf2175b6d9c9e0e4249e6646fe78","source_bytes":4900}
```

```json
{"first_line":1,"last_line":9,"bytes":424,"sha256":"9f40f95c371ca0d8b7b728265c3d09db7893d1c0370afc554a8b1fa0279ec67f"}
```

~~~~typescript
export * as GitHubRunCommands from "./run"

import { Actions } from "@orchestra/schema/actions"
import { Effect, Schema } from "effect"
import { GitHubNative } from "../native"
import { GitHubCommandCommon } from "./common"

const active = new Set(["queued", "in_progress", "waiting", "pending", "requested"])
const Fork = Schema.Struct({ id: GitHubNative.ID, head_sha: GitHubNative.SHA, run_attempt: GitHubNative.Positive,
~~~~

## AUT2-C05

```json
{"block_id":"AUT2-C05","type":"literal_source_excerpt","request_namespace":"J1 canonical groups; J2 mapping in index","requests":["RE-AUT2-01"],"body_anchors":["A19"],"requested_subject":"Imports/declarações anteriores ao ramo completo já transportado em AUT1-C40","source_category":"owned_population_source","path":"packages/core/src/actions/github/commands/job.ts","archive":"sources/packages/core/src/actions/github/commands/job.ts","commit":"1cde2ff7a71bcf7aecb5d030917b577165135d38","source_git_blob_sha":"01828a587ca7443e08fc0ecdcff55bf1ebeca863","source_sha256":"b753ad05386cd13df639a4000b7fd35db4db8431e66f1ab27633acdbeb314591","source_bytes":2482}
```

```json
{"first_line":1,"last_line":8,"bytes":327,"sha256":"634771599ec0976a8486e4bbdb318153face1a06750f2e7e077c7f85dbe1f6fc"}
```

~~~~typescript
export * as GitHubJobCommands from "./job"

import { Actions } from "@orchestra/schema/actions"
import { Effect, Schema } from "effect"
import { GitHubNative } from "../native"
import { GitHubCommandCommon } from "./common"

const Job = Schema.Struct({ id: GitHubNative.ID, run_id: GitHubNative.ID, head_sha: GitHubNative.SHA,
~~~~

## AUT2-C06

```json
{"block_id":"AUT2-C06","type":"literal_source_excerpt","request_namespace":"J1 canonical groups; J2 mapping in index","requests":["RE-AUT2-02"],"body_anchors":["A20"],"requested_subject":"Roles observados, project policies, ref e variables/cancellation","source_category":"owned_population_source","path":"packages/core/src/actions/gitlab/commands/native.ts","archive":"sources/packages/core/src/actions/gitlab/commands/native.ts","commit":"1cde2ff7a71bcf7aecb5d030917b577165135d38","source_git_blob_sha":"96c48f417a9df123e151215ff757186932fe1895","source_sha256":"ceac62595d8c7647e4a4277dbc893f9f7c4a71faada7fc50b1614a4474cdfc63","source_bytes":5006}
```

```json
{"first_line":1,"last_line":72,"bytes":5006,"sha256":"ceac62595d8c7647e4a4277dbc893f9f7c4a71faada7fc50b1614a4474cdfc63"}
```

~~~~typescript
export * as GitLabCommandNative from "./native"

import { Actions } from "@orchestra/schema/actions"
import { Effect, Schema } from "effect"
import { ActionsContract } from "../../contract"
import { ActionsGitLabNative } from "../native"
import { GitLabCommandShared } from "./shared"

export const Project = Schema.Struct({ ...ActionsGitLabNative.Project.fields,
  ci_pipeline_variables_minimum_override_role: Schema.optional(Schema.String),
  ci_restrict_pipeline_cancellation_role: Schema.optional(Schema.String), merge_pipelines_enabled: Schema.optional(Schema.Boolean),
})
export const Job = Schema.Struct({ ...ActionsGitLabNative.Job.fields,
  ref: Schema.String, commit: Schema.Struct({ id: ActionsGitLabNative.SHA }),
  pipeline: Schema.Struct({ id: ActionsGitLabNative.ID, project_id: ActionsGitLabNative.ID, sha: ActionsGitLabNative.SHA, ref: Schema.String }),
  archived: Schema.optional(Schema.Boolean), erased_at: Schema.optional(Schema.NullOr(Schema.String)),
  user: Schema.optional(Schema.NullOr(Schema.Struct({ username: Schema.String }))),
})
export const Ref = Schema.Struct({ name: Schema.NonEmptyString, commit: Schema.Struct({ id: ActionsGitLabNative.SHA }) })
export const MergeRequest = Schema.Struct({ id: ActionsGitLabNative.ID, iid: ActionsGitLabNative.ID, project_id: ActionsGitLabNative.ID,
  source_project_id: ActionsGitLabNative.ID, target_project_id: ActionsGitLabNative.ID, sha: ActionsGitLabNative.SHA,
  source_branch: Schema.NonEmptyString, state: Schema.String,
})

export function make(transport: ActionsContract.Transport) {
  const read = ActionsGitLabNative.make(transport)
  return { ...read,
    project: Effect.fn("ActionsGitLabCommands.project")(function* (binding: Actions.Binding) {
      const response = yield* read.get(binding, ActionsGitLabNative.projectPath(binding))
      return yield* ActionsGitLabNative.checked(binding, () => {
        const project = GitLabCommandShared.native(binding, Project, response.data)
        if (String(project.id) !== binding.projectID) throw GitLabCommandShared.error(binding, "binding_stale", "GitLab native project differs from the admitted project")
        return project
      })
    }),
    ref: Effect.fn("ActionsGitLabCommands.ref")(function* (binding: Actions.Binding, ref: string) {
      const response = yield* read.get(binding, `${ActionsGitLabNative.projectPath(binding)}/repository/branches/${encodeURIComponent(ref)}`)
        .pipe(Effect.catch((error) => error.kind === "not_found"
          ? read.get(binding, `${ActionsGitLabNative.projectPath(binding)}/repository/tags/${encodeURIComponent(ref)}`) : Effect.fail(error)))
      return yield* ActionsGitLabNative.checked(binding, () => {
        const result = GitLabCommandShared.native(binding, Ref, response.data)
        if (result.name !== ref) throw GitLabCommandShared.error(binding, "source_conflict", "GitLab native branch/tag ref differs from the admitted ref")
        return result.commit.id
      })
    }),
  }
}

export function role(binding: Actions.Binding, project: typeof Project.Type, minimum: number) {
  if (project.archived === true || project.jobs_enabled === false || project.builds_access_level === "disabled" || project.repository_access_level === "disabled")
    throw GitLabCommandShared.error(binding, "permission_denied", "GitLab native project is archived or execution is disabled")
  const levels = [project.permissions?.project_access, project.permissions?.group_access]
    .filter((value) => value !== undefined).map((value) => value?.access_level ?? 0)
  if (levels.some((value) => ![0, 5, 10, 15, 20, 30, 40, 50].includes(value)))
    throw GitLabCommandShared.error(binding, "capability_unavailable", "GitLab observed role is not a qualified native access level")
  const level = Math.max(0, ...levels)
  if (level >= minimum) return level
  if (levels.length !== 2) throw GitLabCommandShared.error(binding, "capability_unavailable", "GitLab effective project/group write role is not observed")
  throw GitLabCommandShared.error(binding, "permission_denied", "GitLab native project/group role denies this execution command")
}

export function variables(binding: Actions.Binding, project: typeof Project.Type, level: number, present: boolean) {
  if (!present) return
  const minimum = project.ci_pipeline_variables_minimum_override_role
  if (minimum === "no_one_allowed" || minimum === "owner" && level < 50 || minimum === "maintainer" && level < 40 || minimum === "developer" && level < 30)
    throw GitLabCommandShared.error(binding, "permission_denied", "GitLab native pipeline-variable override policy denies this command")
}

export function cancellation(binding: Actions.Binding, project: typeof Project.Type, level: number) {
  if (project.ci_restrict_pipeline_cancellation_role === "no_one" || project.ci_restrict_pipeline_cancellation_role === "maintainer" && level < 40)
    throw GitLabCommandShared.error(binding, "permission_denied", "GitLab native cancellation policy denies this command")
}
~~~~

## AUT2-C07

```json
{"block_id":"AUT2-C07","type":"literal_source_excerpt","request_namespace":"J1 canonical groups; J2 mapping in index","requests":["RE-AUT2-02"],"body_anchors":["A21"],"requested_subject":"Inputs locais autoritativos, includes/constraints/defaults e gate de versão","source_category":"owned_population_source","path":"packages/core/src/actions/gitlab/commands/inputs.ts","archive":"sources/packages/core/src/actions/gitlab/commands/inputs.ts","commit":"1cde2ff7a71bcf7aecb5d030917b577165135d38","source_git_blob_sha":"12ba907ddadcd0103fa07da0eeabe7bede5fc9f5","source_sha256":"c1f72bbe27861b2f51e5f0fa2fe67bcbca6f48d2a7c0b08acd451395c9ab476f","source_bytes":4814}
```

```json
{"first_line":1,"last_line":80,"bytes":4814,"sha256":"c1f72bbe27861b2f51e5f0fa2fe67bcbca6f48d2a7c0b08acd451395c9ab476f"}
```

~~~~typescript
export * as GitLabCommandInputs from "./inputs"

import { Actions } from "@orchestra/schema/actions"
import { Effect, Option, Schema } from "effect"
import { diagnostics, inputExpression, read } from "../../source/document"
import { ActionsContract } from "../../contract"
import { ActionsGitLabNative } from "../native"
import { GitLabCommandShared } from "./shared"

const Input = Schema.Struct({
  type: Schema.optional(Schema.Literals(["string", "number", "boolean", "array"])), default: Schema.optional(Schema.Json),
  options: Schema.optional(Schema.Array(Schema.Union([Schema.String, Schema.Number, Schema.Boolean]))),
  description: Schema.optional(Schema.String), regex: Schema.optional(Schema.String), rules: Schema.optional(Schema.Json),
})
const Header = Schema.Struct({ spec: Schema.Struct({ inputs: Schema.optional(Schema.Record(Schema.String, Schema.NullOr(Input))) }) })

export const check = Effect.fn("ActionsGitLabCommands.inputs")(function* (
  binding: Actions.Binding, transport: ActionsContract.Transport, source: Actions.Source, supplied?: Readonly<Record<string, ActionsContract.Json>>,
) {
  const values = yield* ActionsGitLabNative.checked(binding, () => validate(binding, source, supplied))
  if (supplied !== undefined) {
    const native = ActionsGitLabNative.make(transport)
    const observation = yield* native.metadata(binding)
    // API inputs: 17.10 feature-flagged; 18.1 GA. No client-version or flag guesses.
    // https://docs.gitlab.com/api/pipelines/#create-a-new-pipeline
    // https://gitlab.com/gitlab-org/gitlab/-/blob/v18.1.0-ee/lib/api/ci/helpers/pipelines_helpers.rb
    yield* ActionsGitLabNative.checked(binding, () => ActionsGitLabNative.requireVersion(binding, observation, [18, 1], "pipeline inputs"))
  }
  return values
})

function validate(binding: Actions.Binding, source: Actions.Source, supplied?: Readonly<Record<string, ActionsContract.Json>>) {
  const definitions = projection(source.text)
  if (definitions === undefined) {
    if (supplied !== undefined) throw GitLabCommandShared.error(binding, "source_unresolved", "GitLab input declarations are not proven by bounded local source")
    return
  }
  // RE2 and conditional native input rules are not JavaScript regex predicates.
  // Keep raw constraints authoritative; explicit values need native validation
  // outside this slice before they can be admitted under these declarations.
  if (supplied !== undefined && Object.values(definitions).some((config) => config?.regex !== undefined || config?.rules !== undefined))
    throw GitLabCommandShared.error(binding, "source_unresolved", "GitLab input regex/rules constraints are not locally verified")
  const values = supplied ?? {}
  if (Object.keys(values).some((key) => !Object.hasOwn(definitions, key)))
    throw GitLabCommandShared.error(binding, "invalid_input", "GitLab inputs contain a key not declared in the ref-bound CI header")
  Object.entries(definitions).forEach(([key, definition]) => {
    const config = definition ?? {}
    const type = config.type ?? "string"
    if (config.default !== undefined && !valid(type, config.default))
      throw GitLabCommandShared.error(binding, "source_unresolved", "GitLab CI input default does not match its declared native type")
    const value = Object.hasOwn(values, key) ? values[key] : config.default
    if (value === undefined || !valid(type, value))
      throw GitLabCommandShared.error(binding, "invalid_input", "GitLab required input is missing or has a different native type")
    if (config.options !== undefined && (type === "array" || !config.options.some((option) => option === value)))
      throw GitLabCommandShared.error(binding, "invalid_input", "GitLab input does not match a declared native option")
  })
  // Native provider applies omitted defaults. Preserve supplied values without coercion.
  return supplied
}

function valid(type: string, value: ActionsContract.Json) {
  return type === "array" ? Array.isArray(value) : type === "number" ? typeof value === "number" && Number.isFinite(value) : typeof value === type
}

function projection(text: string) {
  const report = diagnostics()
  const document = read(text, "gitlab", report)
  if (!document) return
  if (document.header === undefined) {
    // Parsed headerless local source proves no declarations. An unfetched
    // include may supply declarations: undefined is unknown, never empty.
    if (document.value.include !== undefined) return
    return {}
  }
  const spec = document.header.spec
  if (!spec || typeof spec !== "object" || Array.isArray(spec) || "include" in spec || inputExpression(spec)) return
  const decoded = Schema.decodeUnknownOption(Header, { onExcessProperty: "error" })(document.header)
  if (Option.isNone(decoded)) return
  return decoded.value.spec.inputs ?? {}
}
~~~~

## AUT2-C08

```json
{"block_id":"AUT2-C08","type":"literal_source_excerpt","request_namespace":"J1 canonical groups; J2 mapping in index","requests":["RE-AUT2-02"],"body_anchors":["A20"],"requested_subject":"Planejamento de dispatch versus trigger e acknowledgment pipeline","source_category":"owned_population_source","path":"packages/core/src/actions/gitlab/commands/launch.ts","archive":"sources/packages/core/src/actions/gitlab/commands/launch.ts","commit":"1cde2ff7a71bcf7aecb5d030917b577165135d38","source_git_blob_sha":"69db848d7513a074b960851e27c12a39438ebd47","source_sha256":"444fe50cc00d0aaed2895b18ca25e11baca9fe281a917c0260674b5449540579","source_bytes":4234}
```

```json
{"first_line":1,"last_line":52,"bytes":4234,"sha256":"444fe50cc00d0aaed2895b18ca25e11baca9fe281a917c0260674b5449540579"}
```

~~~~typescript
export * as GitLabCommandLaunch from "./launch"

import { Actions } from "@orchestra/schema/actions"
import { Effect } from "effect"
import { ActionsContract } from "../../contract"
import { ActionsGitLabNative } from "../native"
import { GitLabCommandNative } from "./native"
import { GitLabCommandInputs } from "./inputs"
import { GitLabCommandShared } from "./shared"

export function make(input: { transport: ActionsContract.Transport; reader: ActionsContract.ReadAdapter }) {
  const native = GitLabCommandNative.make(input.transport)
  return Effect.fn("ActionsGitLabCommands.launch")(function* (binding: Actions.Binding, intent: Actions.OperationIntent, payload: ActionsContract.Json): Effect.fn.Return<GitLabCommandShared.Plan, import("../../error").ActionsError> {
    const command = yield* ActionsGitLabNative.checked(binding, () => {
      GitLabCommandShared.target(binding, intent, ["workflowID", "ref", "path"], ["ref"])
      const value = intent.kind === "pipeline.trigger"
        ? GitLabCommandShared.decode(binding, Actions.TriggerPipelineCommand.fields.input, payload)
        : GitLabCommandShared.decode(binding, Actions.GitLabDispatch, payload)
      if (value.ref !== intent.target.ref) throw GitLabCommandShared.error(binding, "invalid_input", "GitLab execute ref differs from its admitted ref")
      return value
    })
    const project = yield* native.project(binding)
    const level = yield* ActionsGitLabNative.checked(binding, () => GitLabCommandNative.role(binding, project, 30))
    const sha = yield* native.ref(binding, command.ref)
    yield* ActionsGitLabNative.checked(binding, () => {
      GitLabCommandShared.commit(binding, intent, sha, command.ref)
      GitLabCommandNative.variables(binding, project, level, command.variables !== undefined && Object.keys(command.variables).length > 0)
      if (intent.target.path !== undefined && intent.target.path !== ActionsGitLabNative.configPath(project))
        throw GitLabCommandShared.error(binding, "source_conflict", "GitLab admitted CI path differs from native project configuration")
    })
    const path = ActionsGitLabNative.configPath(project)
    if (command.inputs !== undefined || intent.expected?.sourceVersion !== undefined || intent.target.path !== undefined) {
      if (!path || !ActionsGitLabNative.localPath(path)) return yield* GitLabCommandShared.error(binding, "source_unresolved", "GitLab explicit input/source preconditions require resolved local CI configuration")
      const source = yield* GitLabCommandShared.source(binding, intent, input.reader, sha, path)
      if (!source) return yield* GitLabCommandShared.error(binding, "source_unresolved", "GitLab launch did not establish ref-bound source")
      yield* GitLabCommandInputs.check(binding, input.transport, source, command.inputs)
    }
    const body = yield* ActionsGitLabNative.checked(binding, () => {
      if ("token" in command) return GitLabCommandShared.json(binding, { ref: command.ref, token: command.token,
        ...(command.variables === undefined ? {} : { variables: command.variables }), ...(command.inputs === undefined ? {} : { inputs: command.inputs }) })
      if (command.variables && new Set(command.variables.map((variable) => variable.key)).size !== command.variables.length)
        throw GitLabCommandShared.error(binding, "invalid_input", "GitLab pipeline variables must have distinct native keys")
      return GitLabCommandShared.json(binding, { ref: command.ref,
        ...(command.variables === undefined ? {} : { variables: command.variables.map((variable) => ({ key: variable.key, value: variable.value,
          ...(variable.variable_type === undefined ? {} : { variable_type: variable.variable_type }) })) }),
        ...(command.inputs === undefined ? {} : { inputs: command.inputs }) })
    })
    return { request: { method: "POST", path: `${ActionsGitLabNative.projectPath(binding)}/${"token" in command ? "trigger/pipeline" : "pipeline"}`, body },
      statuses: [201], acknowledge: (response) => ActionsGitLabNative.checked(binding, () => GitLabCommandShared.pipeline(binding, response.data,
        { commit: sha, ref: command.ref, sources: "token" in command ? ["trigger", "pipeline"] : ["api"] })) }
  })
}
~~~~

## AUT2-C09

```json
{"block_id":"AUT2-C09","type":"literal_source_excerpt","request_namespace":"J1 canonical groups; J2 mapping in index","requests":["RE-AUT2-02"],"body_anchors":["A21"],"requested_subject":"MR no mesmo projeto, ref head/merge e pós-condição nativa","source_category":"owned_population_source","path":"packages/core/src/actions/gitlab/commands/merge-request.ts","archive":"sources/packages/core/src/actions/gitlab/commands/merge-request.ts","commit":"1cde2ff7a71bcf7aecb5d030917b577165135d38","source_git_blob_sha":"38a983b2834d42964934b1699b17d92637e8fab8","source_sha256":"4db4f1c18a91be6292d2b8a10c493ffe81a5893036f45b8fdee62a3e40b000b1","source_bytes":4177}
```

```json
{"first_line":1,"last_line":53,"bytes":4177,"sha256":"4db4f1c18a91be6292d2b8a10c493ffe81a5893036f45b8fdee62a3e40b000b1"}
```

~~~~typescript
export * as GitLabCommandMergeRequest from "./merge-request"

import { Actions } from "@orchestra/schema/actions"
import { Effect } from "effect"
import { ActionsContract } from "../../contract"
import { ActionsGitLabNative } from "../native"
import { GitLabCommandNative } from "./native"
import { GitLabCommandInputs } from "./inputs"
import { GitLabCommandShared } from "./shared"

export function make(input: { transport: ActionsContract.Transport; reader: ActionsContract.ReadAdapter }) {
  const native = GitLabCommandNative.make(input.transport)
  return Effect.fn("ActionsGitLabCommands.mergeRequest")(function* (binding: Actions.Binding, intent: Actions.OperationIntent, payload: ActionsContract.Json): Effect.fn.Return<GitLabCommandShared.Plan, import("../../error").ActionsError> {
    const iid = yield* ActionsGitLabNative.checked(binding, () => {
      GitLabCommandShared.target(binding, intent, ["resourceID", "workflowID", "ref", "path"], ["resourceID"])
      GitLabCommandShared.decode(binding, Actions.MergeRequestCommand.fields.input, payload)
      return ActionsGitLabNative.nativeID(binding, intent.target.resourceID ?? "", "merge request IID")
    })
    const project = yield* native.project(binding)
    yield* ActionsGitLabNative.checked(binding, () => GitLabCommandNative.role(binding, project, 30))
    const path = `${ActionsGitLabNative.projectPath(binding)}/merge_requests/${iid}`
    const response = yield* native.get(binding, path)
    const mr = yield* ActionsGitLabNative.checked(binding, () => {
      const value = GitLabCommandShared.native(binding, GitLabCommandNative.MergeRequest, response.data)
      if (String(value.iid) !== iid || String(value.project_id) !== binding.projectID || String(value.target_project_id) !== binding.projectID)
        throw GitLabCommandShared.error(binding, "binding_stale", "GitLab merge request IID does not belong to the admitted native project")
      if (value.state !== "opened") throw GitLabCommandShared.error(binding, "capability_unavailable", "GitLab merge request pipeline requires an open native merge request")
      if (String(value.source_project_id) !== binding.projectID)
        throw GitLabCommandShared.error(binding, "source_unresolved", "Fork merge request execution requires separate native source-project placement proof")
      GitLabCommandShared.commit(binding, intent, value.sha, value.source_branch)
      return value
    })
    const configured = ActionsGitLabNative.configPath(project)
    if (intent.target.path !== undefined && intent.target.path !== configured)
      return yield* GitLabCommandShared.error(binding, "source_conflict", "GitLab admitted CI source path differs from native configuration")
    if (intent.expected?.sourceVersion !== undefined || intent.target.path !== undefined) {
      if (!configured || !ActionsGitLabNative.localPath(configured))
        return yield* GitLabCommandShared.error(binding, "source_unresolved", "GitLab explicit MR source preconditions require resolved local CI configuration")
      const source = yield* GitLabCommandShared.source(binding, intent, input.reader, mr.sha, configured)
      if (!source) return yield* GitLabCommandShared.error(binding, "source_unresolved", "GitLab MR pipeline did not prove head source")
      yield* GitLabCommandInputs.check(binding, input.transport, source)
    }
    // https://docs.gitlab.com/api/merge_requests/#create-merge-request-pipeline
    return { request: { method: "POST", path: `${path}/pipelines` }, statuses: [201],
      acknowledge: (response) => ActionsGitLabNative.checked(binding, () => {
        const value = GitLabCommandShared.native(binding, ActionsGitLabNative.Pipeline, response.data, true)
        if (value.ref !== `refs/merge-requests/${iid}/head` && value.ref !== `refs/merge-requests/${iid}/merge`)
          throw GitLabCommandShared.error(binding, "outcome_unknown", "GitLab MR launch did not return the exact native merge request ref", true)
        return GitLabCommandShared.pipeline(binding, response.data, { sources: ["merge_request_event"],
          commit: value.ref.endsWith("/head") ? mr.sha : intent.expected?.commit })
      }) }
  })
}
~~~~

## AUT2-C10

```json
{"block_id":"AUT2-C10","type":"literal_source_excerpt","request_namespace":"J1 canonical groups; J2 mapping in index","requests":["RE-AUT2-02"],"body_anchors":["A22"],"requested_subject":"Imports anteriores a admit/target/source/pipeline completos em AUT1-C42","source_category":"owned_population_source","path":"packages/core/src/actions/gitlab/commands/shared.ts","archive":"sources/packages/core/src/actions/gitlab/commands/shared.ts","commit":"1cde2ff7a71bcf7aecb5d030917b577165135d38","source_git_blob_sha":"b15f4a3edb40e83274490b3c789cf2581aac9a5a","source_sha256":"0af91cc662eb4578cf1f16e967743fe9d69fb356d6c58555f50826b399e23a97","source_bytes":5846}
```

```json
{"first_line":1,"last_line":8,"bytes":290,"sha256":"e7428bb188cb40d08072aee620aee87302a1d0064fb2703a5d3436af74d1e708"}
```

~~~~typescript
export * as GitLabCommandShared from "./shared"

import { Actions } from "@orchestra/schema/actions"
import { Effect, Option, Schema } from "effect"
import { ActionsContract } from "../../contract"
import { ActionsError } from "../../error"
import { ActionsGitLabNative } from "../native"

~~~~

## AUT2-C11

```json
{"block_id":"AUT2-C11","type":"literal_source_excerpt","request_namespace":"J1 canonical groups; J2 mapping in index","requests":["RE-AUT2-02"],"body_anchors":["A22"],"requested_subject":"Imports anteriores a ramos completos em AUT1-C43","source_category":"owned_population_source","path":"packages/core/src/actions/gitlab/commands/runs.ts","archive":"sources/packages/core/src/actions/gitlab/commands/runs.ts","commit":"1cde2ff7a71bcf7aecb5d030917b577165135d38","source_git_blob_sha":"999c7e5cd6c6d8d33cbe63ad601923b308eff3e4","source_sha256":"0c210556925c4d2f025c6942b2512e8ab782ae748aa51b0336dde859c441ec30","source_bytes":3685}
```

```json
{"first_line":1,"last_line":8,"bytes":320,"sha256":"06624e45353dda2eb328e352a37d890f7034729a46562be5d0a076c5cbadc2b0"}
```

~~~~typescript
export * as GitLabCommandRuns from "./runs"

import { Actions } from "@orchestra/schema/actions"
import { Effect } from "effect"
import { ActionsContract } from "../../contract"
import { ActionsGitLabNative } from "../native"
import { GitLabCommandNative } from "./native"
import { GitLabCommandShared } from "./shared"
~~~~

## AUT2-C12

```json
{"block_id":"AUT2-C12","type":"literal_source_excerpt","request_namespace":"J1 canonical groups; J2 mapping in index","requests":["RE-AUT2-03","RE-AUT2-04"],"body_anchors":["A23"],"requested_subject":"Roteamento de domínios, environments/deployments, artifact e schedule source.write","source_category":"owned_population_source","path":"packages/core/src/actions/resources.ts","archive":"sources/packages/core/src/actions/resources.ts","commit":"1cde2ff7a71bcf7aecb5d030917b577165135d38","source_git_blob_sha":"7d4d4c2248900819af4ace7731982ede0f67179f","source_sha256":"cb6e5bc0a32a104f697459fb39550b0ae12dc6f68c94d38364fff903d6726b94","source_bytes":3620}
```

```json
{"first_line":1,"last_line":66,"bytes":3620,"sha256":"cb6e5bc0a32a104f697459fb39550b0ae12dc6f68c94d38364fff903d6726b94"}
```

~~~~typescript
export * as ActionsResources from "./resources"

import { Actions } from "@orchestra/schema/actions"
import { Effect } from "effect"
import type { AppProcess } from "../process"
import { ActionsContract } from "./contract"
import { ActionsError } from "./error"

export function make(input: {
  transport: ActionsContract.Transport
  reader: (binding: Actions.Binding) => ActionsContract.ReadAdapter
  directory: string
  proc: AppProcess.Interface
}) {
  const domain = Effect.fn("ActionsResources.domain")(function* (binding: Actions.Binding, kind: Actions.ResourceKind) {
    const services = { transport: input.transport, reader: input.reader(binding) }
    if (kind === "variables") {
      const { ActionsVariables } = yield* Effect.promise(() => import("./resources/variables"))
      return ActionsVariables.make(services)
    }
    if (kind === "environments" || kind === "deployments") {
      const { ActionsEnvironments } = yield* Effect.promise(() => import("./resources/environments"))
      return ActionsEnvironments.make(services)
    }
    if (kind === "policy") {
      const { ActionsPolicy } = yield* Effect.promise(() => import("./resources/policy"))
      return ActionsPolicy.make(services)
    }
    const { ActionsResourceGraphQL } = yield* Effect.promise(() => import("./resources/gitlab-graphql"))
    const graphql = ActionsResourceGraphQL.make(input.directory, input.proc)
    if (kind === "runners") {
      const { ActionsRunners } = yield* Effect.promise(() => import("./resources/runners"))
      return ActionsRunners.make({ ...services, graphql })
    }
    if (kind === "caches") {
      const { ActionsCaches } = yield* Effect.promise(() => import("./resources/caches"))
      return ActionsCaches.make({ ...services, graphql })
    }
    if (kind === "schedules") {
      const { ActionsSchedules } = yield* Effect.promise(() => import("./resources/schedules"))
      const { ActionsAuthoring } = yield* Effect.promise(() => import("./authoring/index"))
      const authoring = ActionsAuthoring.make(services)
      return ActionsSchedules.make({ ...services, publish: (binding, intent, source, text) => authoring.perform(binding, {
        ...intent, kind: "source.write", target: { path: source.path, ref: source.ref },
        expected: { commit: source.commit, sourceVersion: source.version },
      }, { provider: binding.provider.kind, mode: "update", text, message: "Update workflow schedule" }) })
    }
    return yield* new ActionsError({ kind: "invalid_input", message: "Resource kind is outside the selected Actions surface", disposition: "definitely_unsent" })
  })
  return {
    list: Effect.fn("ActionsResources.list")(function* (binding: Actions.Binding, query: Actions.ResourceListInput) {
      const selected = yield* domain(binding, query.kind)
      return yield* selected.list(binding, query)
    }),
    perform: Effect.fn("ActionsResources.perform")(function* (binding: Actions.Binding, intent: Actions.OperationIntent, payload: ActionsContract.Json) {
      if (!intent.target.resourceKind)
        return yield* new ActionsError({ kind: "invalid_input", message: "Resource mutation requires an admitted native kind", disposition: "definitely_unsent" })
      if (intent.target.resourceKind === "artifacts") {
        const { ActionsArtifactCommands } = yield* Effect.promise(() => import("./output/mutations"))
        return yield* ActionsArtifactCommands.make(input)(binding, intent, payload)
      }
      const selected = yield* domain(binding, intent.target.resourceKind)
      return yield* selected.perform(binding, intent, payload)
    }),
  }
}
~~~~

## AUT2-C13

```json
{"block_id":"AUT2-C13","type":"literal_source_excerpt","request_namespace":"J1 canonical groups; J2 mapping in index","requests":["RE-AUT2-03","RE-AUT2-04"],"body_anchors":["A23"],"requested_subject":"Captura/selection/authority/versão/source e envio de recursos","source_category":"owned_population_source","path":"packages/core/src/actions/resources/native.ts","archive":"sources/packages/core/src/actions/resources/native.ts","commit":"1cde2ff7a71bcf7aecb5d030917b577165135d38","source_git_blob_sha":"948787643b01ec9d52340a7b5e913b6ca071749d","source_sha256":"a53465358378f169c381ca67f90597976732655e9da173bb8125df7601f101e1","source_bytes":13033}
```

```json
{"first_line":1,"last_line":188,"bytes":13033,"sha256":"a53465358378f169c381ca67f90597976732655e9da173bb8125df7601f101e1"}
```

~~~~typescript
export * as ActionsResourceNative from "./native"

import { createHash } from "node:crypto"
import { Actions } from "@orchestra/schema/actions"
import { Effect, Option, Schema } from "effect"
import { ActionsContract } from "../contract"
import { ActionsError } from "../error"
import { ActionsCursor } from "../cursor"
import { GitHubNative } from "../github/native"
import { GitHubCommandCommon } from "../github/commands/common"
import { ActionsGitLabNative } from "../gitlab/native"
import { GitLabCommandNative } from "../gitlab/commands/native"
import { ActionsResponse } from "../transport/response"

export type Services = { readonly transport: ActionsContract.Transport; readonly reader: ActionsContract.ReadAdapter }
export const ProviderOnly = Schema.Struct({ provider: Actions.ProviderKind })
const Capture = Schema.Struct({ binding: Actions.Binding, intent: Actions.OperationIntent, payload: Schema.Json })
const Selection = Schema.Struct({ binding: Actions.Binding, input: Actions.ResourceListInput })

export function error(binding: Actions.Binding, kind: Actions.ErrorKind, message: string, disposition: Actions.SendDisposition = "definitely_unsent") {
  return new ActionsError({ kind, message, bindingID: binding.id, provider: binding.provider.kind, disposition })
}

export function checked<A>(binding: Actions.Binding, body: () => A) {
  return Effect.try({ try: body, catch: (cause) => cause instanceof ActionsError ? cause
    : error(binding, "invalid_input", "Actions resource metadata could not be validated safely") })
}

export function input<A>(binding: Actions.Binding, schema: Schema.Decoder<A>, value: unknown): A {
  const result = Schema.decodeUnknownOption(schema)(value, { onExcessProperty: "error" })
  if (Option.isNone(result)) throw error(binding, "invalid_input", "Resource input does not match its strict provider-native schema")
  return result.value
}

export function decode<A>(binding: Actions.Binding, schema: Schema.Decoder<A>, value: unknown, sent = false): A {
  const result = Schema.decodeUnknownOption(schema)(value)
  if (Option.isNone(result)) throw error(binding, sent ? "outcome_unknown" : "transport_failed",
    "Provider did not return qualified native resource metadata", sent ? "unknown" : "definitely_unsent")
  return result.value
}

export function scope(binding: Actions.Binding) {
  return `${binding.provider.kind === "github" ? "repository" : "project"}:${id(binding, binding.projectID)}`
}

export function sameScope(binding: Actions.Binding, value?: string) {
  if (value !== undefined && value !== scope(binding)) throw error(binding, "invalid_input", "Resource scope differs from the immutable bound project")
}

export function id(binding: Actions.Binding, value: string) {
  if (!/^[1-9]\d{0,127}$/.test(value)) throw error(binding, "invalid_input", "Resource target requires a canonical positive native ID")
  return value
}

export function capture(binding: Actions.Binding, intent: Actions.OperationIntent, payload: ActionsContract.Json,
  kind: Actions.ResourceKind, operations: readonly Actions.OperationKind[], fields: readonly string[] = []) {
  input(binding, Capture, { binding, intent, payload })
  const frozen = input(binding, Schema.fromJsonString(Capture), JSON.stringify({ binding, intent, payload }))
  if (frozen.intent.binding.id !== frozen.binding.id || frozen.intent.binding.revision !== frozen.binding.revision)
    throw error(binding, "binding_stale", "Resource command admission differs from the current binding revision")
  if (frozen.intent.target.resourceKind !== kind || !operations.includes(frozen.intent.kind) ||
      Object.keys(frozen.intent.target).some((key) => !["resourceKind", "resourceID", "scope", "ref", "path", ...fields].includes(key)))
    throw error(binding, "invalid_input", "Resource command target belongs to another native operation")
  sameScope(frozen.binding, frozen.intent.target.scope)
  if (frozen.intent.expected?.attempt !== undefined) throw error(binding, "invalid_input", "Resource commands have no run-attempt precondition")
  if (frozen.intent.expected?.commit !== undefined) input(binding, GitHubNative.SHA, frozen.intent.expected.commit)
  if (frozen.intent.expected?.sourceVersion !== undefined) input(binding, GitHubNative.SHA, frozen.intent.expected.sourceVersion)
  return frozen
}

export function selection(binding: Actions.Binding, value: Actions.ResourceListInput, kind: Actions.ResourceKind, fields: readonly string[]) {
  input(binding, Selection, { binding, input: value })
  const frozen = input(binding, Schema.fromJsonString(Selection), JSON.stringify({ binding, input: value }))
  if (frozen.input.kind !== kind || Object.keys(frozen.input).some((key) => !["kind", "scope", ...fields].includes(key)))
    throw error(binding, "invalid_input", "Resource selection contains unsupported filters")
  sameScope(frozen.binding, frozen.input.scope)
  return frozen
}

export const before = <A>(binding: Actions.Binding, effect: Effect.Effect<A, ActionsError>) => effect.pipe(
  Effect.mapError((cause) => error(binding, cause.kind, `Resource preflight failed (${cause.kind})`)),
)

export const get = Effect.fn("ActionsResources.get")(function* (services: Services, binding: Actions.Binding, path: string, query?: ActionsContract.Request["query"]) {
  const response = yield* before(binding, services.transport.request(binding, { method: "GET", path, ...(query === undefined ? {} : { query }) }))
  if (response.status !== 200) {
    const cause = ActionsResponse.failure(binding.provider, 1, Buffer.alloc(0), response.status, { ...response.headers }, true)
    return yield* error(binding, cause.kind, "Native resource read was rejected")
  }
  return response
})

export const authority = Effect.fn("ActionsResources.authority")(function* (services: Services, binding: Actions.Binding, minimum = 40) {
  if (binding.provider.kind === "github") {
    const repo = yield* GitHubCommandCommon.authority(services, binding)
    return { root: repo.root, headers: repo.headers, runnerAdmin: repo.native.permissions?.admin, level: undefined, project: undefined }
  }
  const response = yield* get(services, binding, ActionsGitLabNative.projectPath(binding))
  const authority = yield* checked(binding, () => {
    const project = decode(binding, GitLabCommandNative.Project, response.data)
    if (String(project.id) !== binding.projectID) throw error(binding, "binding_stale", "Native project differs from the bound project")
    return { project, level: GitLabCommandNative.role(binding, project, minimum) }
  })
  yield* actor(services, binding)
  return { root: ActionsGitLabNative.projectPath(binding), headers: response.headers, runnerAdmin: undefined, ...authority }
})

export const actor = Effect.fn("ActionsResources.actor")(function* (services: Services, binding: Actions.Binding) {
  if (!binding.account) return yield* error(binding, "binding_stale", "Resource mutation requires a verified bound actor")
  const response = yield* get(services, binding, "user")
  const name = yield* checked(binding, () => binding.provider.kind === "github"
    ? decode(binding, Schema.Struct({ login: Schema.NonEmptyString }), response.data).login
    : decode(binding, Schema.Struct({ username: Schema.NonEmptyString }), response.data).username)
  if (binding.provider.kind === "github" ? name.toLowerCase() !== binding.account.toLowerCase() : name !== binding.account)
    return yield* error(binding, "binding_stale", "Native resource actor changed after admission")
})

export const send = Effect.fn("ActionsResources.send")(function* (services: Services, binding: Actions.Binding,
  request: ActionsContract.Request, statuses: readonly number[]) {
  if (binding.provider.kind === "github") return yield* GitHubCommandCommon.send(services, binding, request, statuses)
  // W1 checks the actor and write with one credential snapshot. No mutation retry.
  const response = yield* services.transport.request(binding, request).pipe(Effect.mapError((cause) => {
    const disposition = cause.disposition === "definitely_unsent" || cause.disposition === "definitely_rejected" ? cause.disposition : "unknown"
    return error(binding, disposition === "unknown" ? "outcome_unknown" : cause.kind, "Native resource mutation failed", disposition)
  }))
  if (statuses.includes(response.status)) return response
  if ([400, 401, 403, 404, 409, 422, 429].includes(response.status)) {
    const cause = ActionsResponse.failure(binding.provider, 1, Buffer.alloc(0), response.status, { ...response.headers }, true)
    return yield* error(binding, cause.kind, "Native resource mutation was rejected", "definitely_rejected")
  }
  return yield* error(binding, "outcome_unknown", "Native resource mutation returned an unqualified status", "unknown")
})

export function after<A>(binding: Actions.Binding, effect: Effect.Effect<A, ActionsError>) {
  return effect.pipe(Effect.mapError(() => error(binding, "outcome_unknown", "Write occurred; native acknowledgement could not be proved", "unknown")))
}

// Snapshot versions cover decoded, explicitly selected metadata, never enrollment secrets.
export function version(value: ActionsContract.Json) {
  const canonical = (item: ActionsContract.Json): string => item !== null && typeof item === "object"
    ? Array.isArray(item) ? `[${item.map(canonical).join(",")}]`
      : `{${Object.entries<ActionsContract.Json>(item).sort(([left], [right]) => left.localeCompare(right))
        .map(([key, value]) => `${JSON.stringify(key)}:${canonical(value)}`).join(",")}}`
    : JSON.stringify(item)
  return `native:${createHash("sha256").update(canonical(value)).digest("hex")}`
}

export function requireVersion(binding: Actions.Binding, intent: Actions.OperationIntent, current: string) {
  if (intent.expected?.resourceVersion !== undefined && intent.expected.resourceVersion !== current)
    throw error(binding, "source_conflict", "Native resource metadata changed after admission")
}

export function pagination(binding: Actions.Binding, response: ActionsContract.Response,
  selected: ReturnType<typeof GitHubNative.selection>, count: number) {
  const next = ActionsCursor.next(response.headers)
  const total = ActionsCursor.total(response.headers)
  if (count > selected.per_page || next !== undefined && (next !== selected.page + 1 || count === 0) ||
    total !== undefined && (total < (selected.page - 1) * selected.per_page + count || next === undefined && total > selected.page * selected.per_page) ||
    count === selected.per_page && next === undefined && total === undefined && response.headers["x-next-page"] === undefined && response.headers.link === undefined)
    throw error(binding, "metadata_truncated", "Native resource page lacks complete advancing pagination evidence")
  return ActionsGitLabNative.pagination(binding, selected.scope, selected.filters, response.headers, selected.page)
}

export const source = Effect.fn("ActionsResources.sourcePrecondition")(function* (services: Services, binding: Actions.Binding, intent: Actions.OperationIntent) {
  if (intent.target.ref === undefined && intent.target.path === undefined && intent.expected?.commit === undefined && intent.expected?.sourceVersion === undefined) return
  if (!intent.target.ref) return yield* error(binding, "invalid_input", "Resource source preconditions require an admitted exact ref")
  const ref = yield* checked(binding, () => GitHubNative.ref(binding, intent.target.ref ?? ""))
  const response = yield* get(services, binding, binding.provider.kind === "github"
    ? `repositories/${binding.projectID}/commits/${encodeURIComponent(ref)}`
    : `projects/${binding.projectID}/repository/commits/${encodeURIComponent(ref)}`)
  const sha = yield* checked(binding, () => {
    const sha = binding.provider.kind === "github" ? decode(binding, Schema.Struct({ sha: GitHubNative.SHA }), response.data).sha
      : decode(binding, Schema.Struct({ id: ActionsGitLabNative.SHA }), response.data).id
    if (intent.expected?.commit !== undefined && sha.toLowerCase() !== intent.expected.commit.toLowerCase())
      throw error(binding, "source_conflict", "Native resource ref moved after admission")
    return sha
  })
  if (!intent.target.path) {
    if (intent.expected?.sourceVersion !== undefined) return yield* error(binding, "invalid_input", "Resource sourceVersion requires an admitted exact path")
    return { commit: sha }
  }
  yield* checked(binding, () => GitHubNative.path(binding, intent.target.path ?? ""))
  const value = yield* before(binding, services.reader.source(binding, { path: intent.target.path, ref: sha }))
  if (value.bindingID !== binding.id || value.path !== intent.target.path || value.ref !== sha || value.commit?.toLowerCase() !== sha.toLowerCase() ||
    intent.expected?.sourceVersion !== undefined && value.version.toLowerCase() !== intent.expected.sourceVersion.toLowerCase())
    return yield* error(binding, "source_conflict", "Native resource source identity changed after admission")
  return { commit: sha, source: value }
})
~~~~

## AUT2-C14

```json
{"block_id":"AUT2-C14","type":"literal_source_excerpt","request_namespace":"J1 canonical groups; J2 mapping in index","requests":["RE-AUT2-03","RE-AUT2-04"],"body_anchors":["A23"],"requested_subject":"Schemas e guarda de contexto, projeto/ator/source/versão e execução em fases","source_category":"owned_population_source","path":"packages/core/src/actions/resources/config-common.ts","archive":"sources/packages/core/src/actions/resources/config-common.ts","commit":"1cde2ff7a71bcf7aecb5d030917b577165135d38","source_git_blob_sha":"091480332aea03f03b8ab3cfcd21dfbe8b27fa84","source_sha256":"aee5e20b10091ab8c4c20daf21c72e45a583e7cfc162b0a5e5e162a61e5b7afd","source_bytes":12418}
```

```json
{"first_line":1,"last_line":169,"bytes":12418,"sha256":"aee5e20b10091ab8c4c20daf21c72e45a583e7cfc162b0a5e5e162a61e5b7afd"}
```

~~~~typescript
export * as ActionsConfigCommon from "./config-common"

import { Actions } from "@orchestra/schema/actions"
import { Effect, Option, Schema } from "effect"
import { ActionsContract } from "../contract"
import { ActionsCursor } from "../cursor"
import { ActionsError } from "../error"

export type Services = { transport: ActionsContract.Transport; reader: ActionsContract.ReadAdapter }
export const ID = Schema.Union([Schema.String.check(Schema.isPattern(/^[1-9]\d{0,127}$/)), Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER }))])
export const Text = Schema.String.check(Schema.isPattern(/\S/), Schema.isMaxLength(1024), Schema.isPattern(/^[^\x00-\x1f\x7f]+$/))
export const Value = Schema.String.check(Schema.isPattern(/\S/))
export const Provider = Actions.ProviderKind
const Capture = Schema.Struct({ binding: Actions.Binding, intent: Actions.OperationIntent })
const Access = Schema.NullOr(Schema.Struct({ access_level: Schema.Int }))
export const Project = Schema.Struct({
  id: ID, archived: Schema.optionalKey(Schema.Boolean), private: Schema.optionalKey(Schema.Boolean),
  permissions: Schema.optionalKey(Schema.Struct({
    push: Schema.optionalKey(Schema.Boolean), admin: Schema.optionalKey(Schema.Boolean),
    project_access: Schema.optionalKey(Access), group_access: Schema.optionalKey(Access),
  })),
  allow_pipeline_trigger_approve_deployment: Schema.optionalKey(Schema.Boolean),
})

export function fail(binding: Actions.Binding, kind: Actions.ErrorKind, message: string, disposition: Actions.SendDisposition = "definitely_unsent", retryAfter?: number) {
  return new ActionsError({ kind, message, bindingID: binding.id, provider: binding.provider.kind, disposition,
    ...(retryAfter === undefined ? {} : { retryAfter }) })
}

export function decode<S extends Schema.Decoder<unknown>>(binding: Actions.Binding, schema: S, value: unknown, native = false): S["Type"] {
  const parsed = Schema.decodeUnknownOption(schema)(value, native ? {} : { onExcessProperty: "error" })
  if (Option.isNone(parsed)) throw fail(binding, native ? "transport_failed" : "invalid_input", native
    ? "Provider returned invalid configuration metadata" : "Configuration payload does not match its strict native form")
  return parsed.value
}

export function guard<A>(binding: Actions.Binding, fn: () => A) {
  return Effect.try({ try: fn, catch: (cause) => cause instanceof ActionsError ? cause : fail(binding, "invalid_input", "Configuration input could not be validated") })
}

export function capture(binding: Actions.Binding, intent: Actions.OperationIntent, kind: Actions.ResourceKind, review = false) {
  const frozen = decode(binding, Capture, structuredClone({ binding, intent }))
  if (intent.binding.id !== binding.id || intent.binding.revision !== binding.revision)
    throw fail(binding, "binding_stale", "Configuration admission does not match the current binding revision")
  if ((!review && !["resource.create", "resource.update", "resource.delete"].includes(intent.kind)) ||
      (review && intent.kind !== "deployment.review") || intent.target.resourceKind !== kind)
    throw fail(binding, "invalid_input", "Configuration intent belongs to another operation or resource domain")
  const allowed = review ? ["resourceKind", "resourceID", "scope", "runID"] : ["resourceKind", "resourceID", "scope"]
  if (Object.keys(intent.target).some((key) => !allowed.includes(key)) || !intent.target.resourceID || intent.target.scope === undefined)
    throw fail(binding, "invalid_input", "Configuration target requires an exact native name and scope")
  decode(binding, Text, intent.target.resourceID)
  decode(binding, Text, intent.target.scope)
  if (Object.keys(intent.expected ?? {}).some((key) => key !== "resourceVersion" && !(review && ["commit", "attempt"].includes(key))))
    throw fail(binding, "invalid_input", "Configuration intent contains an unrelated precondition")
  root(binding)
  return frozen
}

export function selection(binding: Actions.Binding, input: Actions.ResourceListInput, kind: Actions.ResourceKind, allowed: readonly string[]) {
  const frozen = decode(binding, Actions.ResourceListInput, structuredClone(input))
  if (frozen.kind !== kind || Object.keys(frozen).some((key) => !["kind", "cursor", "limit", ...allowed].includes(key)))
    throw fail(binding, "invalid_input", "Configuration list contains an unsupported selection")
  root(binding)
  return frozen
}

export function root(binding: Actions.Binding) {
  if (!/^[1-9]\d{0,127}$/.test(binding.projectID)) throw fail(binding, "invalid_input", "Configuration requires an immutable native project ID")
  return `${binding.provider.kind === "github" ? "repositories" : "projects"}/${binding.projectID}`
}

function httpKind(status: number): Actions.ErrorKind {
  return status === 401 ? "not_authenticated" : status === 403 ? "permission_denied" : status === 404 ? "not_found"
    : status === 409 || status === 412 ? "source_conflict" : status === 422 || status === 400 ? "invalid_input"
    : status === 429 ? "rate_limited" : "transport_failed"
}

export const get = Effect.fn("ActionsConfig.get")(function* (services: Services, binding: Actions.Binding, request: ActionsContract.Request, missing = false): Effect.fn.Return<ActionsContract.Response, ActionsError> {
  const response = yield* services.transport.request(binding, request).pipe(Effect.catch((error) =>
    missing && error.kind === "not_found" && error.disposition === "definitely_rejected"
      ? Effect.succeed({ status: 404, headers: {}, data: null })
      : Effect.fail(fail(binding, error.kind, `Configuration preflight failed (${error.kind})`, "definitely_unsent", error.retryAfter))))
  if (response.status !== 200 && !(missing && response.status === 404))
    return yield* fail(binding, httpKind(response.status), `Configuration read returned HTTP ${response.status}`)
  return response
})

export const actor = Effect.fn("ActionsConfig.actor")(function* (services: Services, binding: Actions.Binding) {
  if (!binding.account) return yield* fail(binding, "binding_stale", "Configuration requires a verified bound account")
  const response = yield* get(services, binding, { method: "GET", path: "user" })
  const native = yield* guard(binding, () => binding.provider.kind === "github"
    ? decode(binding, Schema.Struct({ id: ID, login: Text }), response.data, true)
    : decode(binding, Schema.Struct({ id: ID, username: Text }), response.data, true))
  const account = "login" in native ? native.login : native.username
  if (typeof account !== "string" || (binding.provider.kind === "github" ? account.toLowerCase() !== binding.account.toLowerCase() : account !== binding.account))
    return yield* fail(binding, "binding_stale", "Signed-in configuration account changed after admission")
  return String(native.id)
})

export const project = Effect.fn("ActionsConfig.project")(function* (services: Services, binding: Actions.Binding, write = false, admin = false) {
  const path = yield* guard(binding, () => root(binding))
  const response = yield* get(services, binding, { method: "GET", path })
  const native = yield* guard(binding, () => decode(binding, Project, response.data, true))
  if (String(native.id) !== binding.projectID) return yield* fail(binding, "binding_stale", "Native configuration project differs from binding")
  if (write) {
    yield* actor(services, binding)
    const levels = [native.permissions?.project_access, native.permissions?.group_access]
      .filter((access) => access !== undefined).map((access) => access?.access_level ?? 0)
    if (native.archived || (binding.provider.kind === "github"
      ? native.permissions?.[admin ? "admin" : "push"] === false
      : levels.length === 2 && Math.max(...levels) < 40))
      return yield* fail(binding, "permission_denied", "Observed project role denies this configuration write")
    const scopes = response.headers["x-oauth-scopes"]?.split(",").map((scope) => scope.trim()).filter(Boolean)
    if (binding.provider.kind === "github" && scopes?.length && !scopes.includes("repo") && !(native.private === false && scopes.includes("public_repo")))
      return yield* fail(binding, "permission_denied", "Observed OAuth scopes deny repository configuration writes")
  }
  return { path, native, response }
})

export function version(binding: Actions.Binding, expected: Actions.OperationExpected | undefined, response: ActionsContract.Response, metadata: ActionsContract.Json) {
  const current = JSON.stringify(metadata)
  if (expected?.resourceVersion !== undefined && expected.resourceVersion !== current && expected.resourceVersion !== response.headers.etag)
    throw fail(binding, "source_conflict", "Native configuration identity, scope or version changed after admission")
  return response.headers.etag ?? current
}

export function identity(binding: Actions.Binding, name: string, scope: string, nativeID?: string) {
  return { provider: binding.provider.kind, projectID: binding.projectID, bindingID: binding.id,
    bindingRevision: binding.revision, name, scope, ...(nativeID === undefined ? {} : { id: nativeID }) }
}

export function page(binding: Actions.Binding, input: Actions.ResourceListInput, phase = "") {
  const limit = ActionsCursor.limit(input.limit)
  const scope = `config:${input.kind}:${phase}`
  const filters = { scope: input.scope, resourceID: input.resourceID, query: input.query, per_page: limit }
  return { limit, scope, filters, number: ActionsCursor.page(binding, scope, filters, input.cursor) }
}

export function pagination(binding: Actions.Binding, selected: ReturnType<typeof page>, response: ActionsContract.Response, count: number, total?: number) {
  const next = ActionsCursor.next(response.headers)
  const headerTotal = ActionsCursor.total(response.headers)
  if (count > selected.limit || (next !== undefined && (next !== selected.number + 1 || count === 0)) ||
      (total !== undefined && (!Number.isSafeInteger(total) || total < 0 || (headerTotal !== undefined && total !== headerTotal) ||
        (count > 0 && total < (selected.number - 1) * selected.limit + count) ||
        (count === 0 && total > (selected.number - 1) * selected.limit) ||
        (next === undefined && total > selected.number * selected.limit) || (next !== undefined && total <= selected.number * selected.limit))) ||
      (next === undefined && total === undefined && count === selected.limit && response.headers.link === undefined && response.headers["x-next-page"] === undefined))
    throw fail(binding, "metadata_truncated", "Provider configuration pagination is incomplete")
  return { ...(next === undefined ? {} : { next: ActionsCursor.encode(binding, selected.scope, selected.filters, next) }), capturedAt: Date.now() }
}

export const send = Effect.fn("ActionsConfig.send")(function* (services: Services, binding: Actions.Binding, request: ActionsContract.Request, statuses: readonly number[]) {
  yield* actor(services, binding)
  const response = yield* services.transport.request(binding, request).pipe(Effect.mapError((error) =>
    fail(binding, error.disposition === "definitely_unsent" || error.disposition === "definitely_rejected" ? error.kind : "outcome_unknown",
      "Provider configuration write failed", error.disposition ?? "unknown", error.retryAfter)))
  if (statuses.includes(response.status)) return response
  const rejected = [400, 401, 403, 404, 409, 412, 422, 429].includes(response.status)
  return yield* fail(binding, rejected ? httpKind(response.status) : "outcome_unknown", `Provider configuration write returned HTTP ${response.status}`,
    rejected ? "definitely_rejected" : "unknown")
})

export const stages = Effect.fn("ActionsConfig.stages")(function* (services: Services, binding: Actions.Binding,
  requests: readonly { request: ActionsContract.Request; statuses: readonly number[]; phase: string }[]) {
  yield* Effect.forEach(requests, (stage, index) => send(services, binding, stage.request, stage.statuses).pipe(
    Effect.mapError((error) => index === 0 ? fail(binding, error.kind, `Environment phase '${stage.phase}' failed (${error.kind})`, error.disposition ?? "unknown", error.retryAfter)
      : fail(binding, "outcome_unknown", `Environment configuration partially applied; phase '${stage.phase}' failed (${error.kind}); read back before another operation`, "unknown", error.retryAfter)),
  ), { concurrency: 1, discard: true })
})
~~~~

## AUT2-C15

```json
{"block_id":"AUT2-C15","type":"literal_source_excerpt","request_namespace":"J1 canonical groups; J2 mapping in index","requests":["RE-AUT2-03"],"body_anchors":["A24"],"requested_subject":"Leitura/redaction, key/scope, rename/move, sealed box e zeroização local","source_category":"owned_population_source","path":"packages/core/src/actions/resources/variables.ts","archive":"sources/packages/core/src/actions/resources/variables.ts","commit":"1cde2ff7a71bcf7aecb5d030917b577165135d38","source_git_blob_sha":"2b8bf42f1867f93bd05188893c5a1d49fa6b0c93","source_sha256":"4483cec419b1ac22628dd01c1386b9470fcd5511b2d0cd9a956b9736cfc2ca4e","source_bytes":17420}
```

```json
{"first_line":1,"last_line":207,"bytes":17420,"sha256":"4483cec419b1ac22628dd01c1386b9470fcd5511b2d0cd9a956b9736cfc2ca4e"}
```

~~~~typescript
/// <reference path="./config-sodium.d.ts" />
export * as ActionsVariables from "./variables"

import { Actions } from "@orchestra/schema/actions"
import { Effect, Schema } from "effect"
import { ActionsContract } from "../contract"
import { ActionsCursor } from "../cursor"
import { ActionsError } from "../error"
import { ActionsConfigCommon } from "./config-common"
import { ActionsVariableGitHubPage } from "./config-variable-github-page"

const C = ActionsConfigCommon
const Type = Schema.Literals(["Secret", "Variable"])
const Identity = { provider: C.Provider, name: C.Text, type: Type, scope: C.Text }
const Delete = Schema.Struct(Identity)
const Form = Schema.Struct({ ...Identity, value: C.Value,
  protected: Schema.optionalKey(Schema.Boolean), masked: Schema.optionalKey(Schema.Boolean), hidden: Schema.optionalKey(Schema.Boolean) })
// https://docs.gitlab.com/api/project_level_variables/ returns sensitive values.
// Project them away before metadata reaches Resource or any version fingerprint.
const GitLabVariable = Schema.Struct({ key: C.Text, environment_scope: C.Text, protected: Schema.Boolean, masked: Schema.Boolean,
  hidden: Schema.optionalKey(Schema.Boolean), variable_type: Schema.Literals(["env_var", "file"]), raw: Schema.optionalKey(Schema.Boolean) })
const PublicKey = Schema.Struct({ key_id: C.Text, key: Schema.String })

export function make(services: ActionsConfigCommon.Services): ActionsContract.ResourceDomain {
  return {
    list: Effect.fn("ActionsVariables.list")(function* (binding: Actions.Binding, input: Actions.ResourceListInput) {
      const frozen = yield* C.guard(binding, () => C.selection(binding, input, "variables", ["scope", "resourceID", "query"]))
      const project = yield* C.project(services, binding)
      if (binding.provider.kind === "gitlab") {
        const selected = yield* C.guard(binding, () => C.page(binding, frozen))
        const response = yield* C.get(services, binding, { method: "GET", path: `${project.path}/variables`, query: { page: selected.number, per_page: selected.limit } })
        return yield* C.guard(binding, () => {
          const native = C.decode(binding, Schema.Array(GitLabVariable), response.data, true)
          const raw = C.decode(binding, Schema.Array(Schema.Json), response.data, true)
          const items = native.map((item, index) => gitlabResource(binding, item, raw[index]))
            .filter((item) => (frozen.scope === undefined || item.scope === frozen.scope) && (frozen.resourceID === undefined || item.name === frozen.resourceID) &&
              (frozen.query === undefined || item.name.includes(frozen.query)))
          return { items, ...C.pagination(binding, selected, response, native.length, ActionsCursor.total(response.headers)) }
        })
      }
      const scope = frozen.scope ?? "Repository"
      const path = yield* githubScope(services, binding, project.path, scope)
      const page = yield* ActionsVariableGitHubPage.list(services, binding, { ...frozen, scope }, path)
      return yield* C.guard(binding, () => {
        return { items: page.rows.map((item) => githubResource(binding, item, scope)).filter((item) =>
          (frozen.resourceID === undefined || item.name === frozen.resourceID) && (frozen.query === undefined || item.name.includes(frozen.query))),
          ...(page.next === undefined ? {} : { next: page.next }), capturedAt: page.capturedAt }
      })
    }),
    perform: Effect.fn("ActionsVariables.perform")(function* (binding: Actions.Binding, intent: Actions.OperationIntent, payload: ActionsContract.Json) {
      const frozen = yield* C.guard(binding, () => {
        const capture = C.capture(binding, intent, "variables")
        const input = C.decode(binding, intent.kind === "resource.delete" ? Delete : Form, structuredClone(payload))
        if (input.provider !== binding.provider.kind) throw C.fail(binding, "intent_conflict", "Variable provider changed after operation admission")
        const renamed = input.name !== intent.target.resourceID
        const moved = input.scope !== intent.target.scope
        if ((renamed || moved) && intent.kind !== "resource.update")
          throw C.fail(binding, "intent_conflict", "Variable create/delete identity differs from admission")
        if (renamed && (input.provider !== "github" || input.type !== "Variable"))
          throw C.fail(binding, "capability_unavailable", "Field 'name' cannot rename this native variable or secret in one operation")
        if (moved && input.provider !== "gitlab")
          throw C.fail(binding, "capability_unavailable", "Field 'scope' requires separate GitHub create/delete operations")
        if ((renamed || moved) && intent.expected?.resourceVersion === undefined)
          throw C.fail(binding, "source_conflict", "Changing variable key or scope requires an admitted native resource version")
        if (!/^[A-Za-z0-9_]{1,255}$/.test(input.name) || (input.provider === "github" && (!/^[A-Za-z_]/.test(input.name) || /^GITHUB_/i.test(input.name))))
          throw C.fail(binding, "invalid_input", "Variable name is not a native configuration key")
        if (input.provider === "github" && ["protected", "masked", "hidden"].some((key) => key in input))
          throw C.fail(binding, "invalid_input", "GitHub has no GitLab variable flag fields")
        return { ...capture, input }
      })
      const project = yield* C.project(services, frozen.binding, true)
      if (frozen.binding.provider.kind === "github") return yield* githubWrite(services, frozen.binding, frozen.intent, frozen.input, project.path)
      return yield* gitlabWrite(services, frozen.binding, frozen.intent, frozen.input, project.path)
    }),
  }
}

function githubResource(binding: Actions.Binding, item: typeof ActionsVariableGitHubPage.Secret.Type | typeof ActionsVariableGitHubPage.Variable.Type, scope: string): Actions.Resource {
  const type = "value" in item ? "Variable" : "Secret"
  const metadata = { name: item.name, scope, type, created_at: item.created_at, updated_at: item.updated_at }
  return { id: JSON.stringify([item.name, scope, type]), bindingID: binding.id, kind: "variables", name: item.name, scope,
    sensitive: type === "Secret", owner: "Project", data: { ...metadata, nativeIdentity: C.identity(binding, item.name, scope),
      resourceVersion: JSON.stringify(metadata), ...(type === "Secret" ? { redacted: true } : "value" in item ? { value: item.value } : {}) } }
}

function gitlabResource(binding: Actions.Binding, item: typeof GitLabVariable.Type, raw: ActionsContract.Json): Actions.Resource {
  const sensitive = item.masked || item.hidden !== false
  const type = sensitive ? "Secret" : "Variable"
  const value = sensitive ? undefined : C.decode(binding, Schema.Struct({ value: Schema.String }), raw, true).value
  const metadata = { name: item.key, scope: item.environment_scope, type, protected: item.protected, masked: item.masked,
    ...(item.hidden === undefined ? {} : { hidden: item.hidden }), variable_type: item.variable_type, ...(item.raw === undefined ? {} : { raw: item.raw }) }
  return { id: JSON.stringify([item.key, item.environment_scope, type]), bindingID: binding.id, kind: "variables", name: item.key,
    scope: item.environment_scope, owner: "Project", sensitive, data: { ...metadata,
      nativeIdentity: C.identity(binding, item.key, item.environment_scope), resourceVersion: JSON.stringify(metadata), redacted: sensitive,
      flags: [item.protected ? "Protected" : "", item.masked ? "Masked" : "", item.hidden ? "Hidden" : ""].filter(Boolean),
      ...(item.hidden === undefined ? { sourceUnresolved: "Native hidden flag was not observed; value stays redacted" } : {}),
      ...(value === undefined ? {} : { value }) } }
}

const githubScope = Effect.fn("ActionsVariables.githubScope")(function* (services: ActionsConfigCommon.Services, binding: Actions.Binding, root: string, scope: string) {
  if (scope === "Repository") return `${root}/actions`
  yield* C.guard(binding, () => C.decode(binding, C.Text, scope))
  const response = yield* C.get(services, binding, { method: "GET", path: `${root}/environments/${encodeURIComponent(scope)}` })
  const native = yield* C.guard(binding, () => C.decode(binding, Schema.Struct({ id: C.ID, name: C.Text }), response.data, true))
  if (native.name !== scope) return yield* C.fail(binding, "source_conflict", "Native environment scope changed")
  return `${root}/environments/${encodeURIComponent(scope)}`
})

const githubWrite = Effect.fn("ActionsVariables.githubWrite")(function* (services: ActionsConfigCommon.Services, binding: Actions.Binding, intent: Actions.OperationIntent,
  input: typeof Delete.Type | typeof Form.Type, root: string) {
  const name = yield* C.guard(binding, () => C.decode(binding, C.Text, intent.target.resourceID))
  const scope = yield* C.guard(binding, () => C.decode(binding, C.Text, intent.target.scope))
  const path = yield* githubScope(services, binding, root, scope)
  const collection = `${path}/${input.type === "Secret" ? "secrets" : "variables"}`
  const response = yield* C.get(services, binding, { method: "GET", path: `${collection}/${encodeURIComponent(name)}` }, true)
  if (intent.kind === "resource.create" && response.status !== 404) return yield* C.fail(binding, "source_conflict", "Variable already exists at the admitted key and scope")
  if (intent.kind !== "resource.create" && response.status === 404) return yield* C.fail(binding, "source_conflict", "Variable disappeared from the admitted key and scope")
  if (response.status === 200) yield* C.guard(binding, () => {
    const native = input.type === "Secret" ? C.decode(binding, ActionsVariableGitHubPage.Secret, response.data, true)
      : C.decode(binding, ActionsVariableGitHubPage.Variable, response.data, true)
    if (native.name !== name) throw C.fail(binding, "source_conflict", "Native variable key changed")
    C.version(binding, intent.expected, response, { name: native.name, scope, type: input.type,
      created_at: native.created_at, updated_at: native.updated_at })
  })
  if (name !== input.name) {
    const destination = yield* C.get(services, binding, { method: "GET", path: `${collection}/${encodeURIComponent(input.name)}` }, true)
    if (destination.status !== 404) return yield* C.fail(binding, "source_conflict", "Variable rename destination already exists")
  }
  if (intent.kind === "resource.create" && intent.expected?.resourceVersion) return yield* C.fail(binding, "invalid_input", "A new variable has no existing resource version")
  if (intent.kind === "resource.delete") {
    yield* C.send(services, binding, { method: "DELETE", path: `${collection}/${encodeURIComponent(input.name)}` }, [204])
    return { acknowledgement: { resourceID: input.name } }
  }
  if (!("value" in input)) return yield* C.fail(binding, "invalid_input", "Variable mutation requires a replacement value")
  if (input.type === "Secret") {
    const response = yield* C.get(services, binding, { method: "GET", path: `${collection}/public-key` })
    const key = yield* C.guard(binding, () => C.decode(binding, PublicKey, response.data, true))
    const { default: sodium } = yield* Effect.tryPromise({ try: () => import("libsodium-wrappers"),
      catch: () => C.fail(binding, "capability_unavailable", "Secret encryption requires libsodium-wrappers@0.7.15") })
    yield* Effect.tryPromise({ try: () => sodium.ready,
      catch: () => C.fail(binding, "capability_unavailable", "Native libsodium secret encryption could not initialize") })
    const encrypted = yield* Effect.try({ try: () => {
      const publicKey = sodium.from_base64(key.key, sodium.base64_variants.ORIGINAL)
      if (publicKey.length !== sodium.crypto_box_PUBLICKEYBYTES) throw C.fail(binding, "transport_failed", "Provider public key has invalid length")
      const bytes = new TextEncoder().encode(input.value)
      // Standard libsodium sealed box, not a hand-built crypto approximation.
      try { return sodium.to_base64(sodium.crypto_box_seal(bytes, publicKey), sodium.base64_variants.ORIGINAL) }
      finally { sodium.memzero(bytes) }
    }, catch: (cause) => C.fail(binding, cause instanceof ActionsError ? cause.kind : "transport_failed", "Native secret public key could not be encrypted") })
    yield* C.send(services, binding, { method: "PUT", path: `${collection}/${encodeURIComponent(input.name)}`, body: { encrypted_value: encrypted, key_id: key.key_id } }, [201, 204])
    return { acknowledgement: { resourceID: input.name } }
  }
  yield* C.send(services, binding, { method: intent.kind === "resource.create" ? "POST" : "PATCH",
    path: intent.kind === "resource.create" ? collection : `${collection}/${encodeURIComponent(name)}`, body: { name: input.name, value: input.value } }, [201, 204])
  return { acknowledgement: { resourceID: input.name } }
})

const gitlabWrite = Effect.fn("ActionsVariables.gitlabWrite")(function* (services: ActionsConfigCommon.Services, binding: Actions.Binding, intent: Actions.OperationIntent,
  input: typeof Delete.Type | typeof Form.Type, root: string) {
  // Environment scopes are exact native strings, including a literal 'Repository'.
  const scope = yield* C.guard(binding, () => C.decode(binding, C.Text, intent.target.scope))
  const collection = `${root}/variables`
  const query = { "filter[environment_scope]": scope }
  const response = yield* C.get(services, binding, { method: "GET", path: `${collection}/${encodeURIComponent(input.name)}`, query }, true)
  if ((intent.kind === "resource.create") !== (response.status === 404)) return yield* C.fail(binding, "source_conflict", "Variable existence changed at the admitted key and scope")
  const existing = response.status === 200 ? yield* C.guard(binding, () => {
    const native = C.decode(binding, GitLabVariable, response.data, true)
    if (native.key !== input.name || native.environment_scope !== scope) throw C.fail(binding, "source_conflict", "Native variable key or scope changed")
    const resource = gitlabResource(binding, native, response.data)
    if (intent.kind === "resource.delete" && resource.sensitive !== (input.type === "Secret"))
      throw C.fail(binding, "source_conflict", "Native variable sensitivity changed after admission")
    const metadata = C.decode(binding, Schema.Struct({ resourceVersion: Schema.String }), resource.data, true)
    if (intent.expected?.resourceVersion !== undefined && intent.expected.resourceVersion !== metadata.resourceVersion)
      throw C.fail(binding, "source_conflict", "Native variable controls or scope changed after admission")
    return native
  }) : undefined
  if (scope !== input.scope) {
    const destination = yield* C.get(services, binding, { method: "GET", path: `${collection}/${encodeURIComponent(input.name)}`,
      query: { "filter[environment_scope]": input.scope } }, true)
    if (destination.status !== 404) return yield* C.fail(binding, "source_conflict", "Variable destination scope already contains this native key")
  }
  if (intent.kind === "resource.create" && intent.expected?.resourceVersion) return yield* C.fail(binding, "invalid_input", "A new variable has no existing resource version")
  if (intent.kind === "resource.delete") {
    yield* C.send(services, binding, { method: "DELETE", path: `${collection}/${encodeURIComponent(input.name)}`, query }, [204])
    return { acknowledgement: { resourceID: input.name } }
  }
  if (!("value" in input)) return yield* C.fail(binding, "invalid_input", "Variable mutation requires a replacement value")
  if (existing && input.hidden !== undefined && input.hidden !== existing.hidden)
    return yield* C.fail(binding, "capability_unavailable", "GitLab hidden is create-only; existing hiding state must be retained")
  const masked = input.masked ?? (input.type === "Secret")
  if (input.type === "Secret" && !masked && !input.hidden) return yield* C.fail(binding, "invalid_input", "GitLab has no independent Secret type; Secret requires masked or hidden controls")
  if (input.hidden && !masked) return yield* C.fail(binding, "invalid_input", "GitLab hidden creation requires masked_and_hidden")
  if (!existing && input.hidden) {
    const response = yield* C.get(services, binding, { method: "GET", path: "metadata" })
    const native = yield* C.guard(binding, () => C.decode(binding, Schema.Struct({ version: C.Text }), response.data, true))
    const version = /^(\d+)\.(\d+)\.(\d+)(?:-(?:ee|ce))?$/.exec(native.version)
    if (!version || Number(version[1]) < 17 || (Number(version[1]) === 17 && Number(version[2]) < 4))
      return yield* C.fail(binding, "capability_unavailable", "Hidden variable creation requires observed GitLab 17.4 or newer")
  }
  yield* C.send(services, binding, { method: existing ? "PUT" : "POST", path: existing ? `${collection}/${encodeURIComponent(input.name)}` : collection,
    ...(existing ? { query } : {}), body: { ...(existing ? {} : { key: input.name }), value: input.value, environment_scope: input.scope,
      protected: input.protected ?? existing?.protected ?? false, masked,
      ...(input.hidden && !existing ? { masked_and_hidden: true } : {}),
      variable_type: existing?.variable_type ?? "env_var", ...(existing?.raw === undefined ? {} : { raw: existing.raw }) } }, [200, 201])
  // GitLab echoes values after writes. Only admitted native identity may leave this callback.
  return { acknowledgement: { resourceID: input.name } }
})
~~~~

## AUT2-C16

```json
{"block_id":"AUT2-C16","type":"literal_source_excerpt","request_namespace":"J1 canonical groups; J2 mapping in index","requests":["RE-AUT2-03"],"body_anchors":["A24"],"requested_subject":"Pagination conjunta de variables e secrets, sem fundir identidades","source_category":"owned_population_source","path":"packages/core/src/actions/resources/config-variable-github-page.ts","archive":"sources/packages/core/src/actions/resources/config-variable-github-page.ts","commit":"1cde2ff7a71bcf7aecb5d030917b577165135d38","source_git_blob_sha":"0ac96117ca2d882142c04ba700efac2b42e60073","source_sha256":"840684c984c0c57f586008b8d3e357be5bb1d8f298dc1bb64e4fe1c8a452ae20","source_bytes":4453}
```

```json
{"first_line":1,"last_line":59,"bytes":4453,"sha256":"840684c984c0c57f586008b8d3e357be5bb1d8f298dc1bb64e4fe1c8a452ae20"}
```

~~~~typescript
export * as ActionsVariableGitHubPage from "./config-variable-github-page"

import { Actions } from "@orchestra/schema/actions"
import { Effect, Schema } from "effect"
import { ActionsContract } from "../contract"
import { ActionsCursor } from "../cursor"
import { ActionsConfigCommon } from "./config-common"

const C = ActionsConfigCommon
export const Variable = Schema.Struct({ name: C.Text, value: Schema.String, created_at: Schema.String, updated_at: Schema.String })
export const Secret = Schema.Struct({ name: C.Text, created_at: Schema.String, updated_at: Schema.String })
const Count = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))
const Cursor = Schema.Struct({ variable: Schema.optionalKey(Schema.String), secret: Schema.optionalKey(Schema.String) })

export const list = Effect.fn("ActionsVariables.githubPage")(function* (services: ActionsConfigCommon.Services, binding: Actions.Binding,
  input: Actions.ResourceListInput, path: string) {
  const budget = yield* C.guard(binding, () => ActionsCursor.limit(input.limit))
  if (budget === 1) return yield* one(services, binding, input, path)
  const cursor = yield* C.guard(binding, () => {
    if (input.cursor === undefined) return undefined
    if (!input.cursor.startsWith("combined:") || input.cursor.length > 8192) throw C.fail(binding, "invalid_input", "Invalid combined variable cursor")
    const value = C.decode(binding, Schema.fromJsonString(Cursor), Buffer.from(input.cursor.slice(9), "base64url").toString("utf8"))
    if (!value.variable && !value.secret) throw C.fail(binding, "invalid_input", "Combined variable cursor has no native continuation")
    return value
  })
  const pages = yield* Effect.forEach((["variable", "secret"] as const).filter((kind) => cursor === undefined || cursor[kind] !== undefined),
    (kind) => read(services, binding, { ...input, limit: Math.floor(budget / 2), cursor: cursor?.[kind] }, path, kind, budget), { concurrency: 1 })
  const next = Object.fromEntries(pages.flatMap((page) => page.next === undefined ? [] : [[page.kind, page.next]]))
  return { rows: pages.flatMap((page) => page.rows), capturedAt: Date.now(),
    ...(Object.keys(next).length ? { next: `combined:${Buffer.from(JSON.stringify(next)).toString("base64url")}` } : {}) }
})

const read = Effect.fn("ActionsVariables.githubNativePage")(function* (services: ActionsConfigCommon.Services, binding: Actions.Binding,
  input: Actions.ResourceListInput, path: string, kind: "variable" | "secret", budget: number) {
  const selected = yield* C.guard(binding, () => C.page(binding, input, `${kind}:budget${budget}`))
  const response = yield* C.get(services, binding, { method: "GET", path: `${path}/${kind === "secret" ? "secrets" : "variables"}`,
    query: { page: selected.number, per_page: selected.limit } })
  return yield* C.guard(binding, () => {
    const native = kind === "secret"
      ? C.decode(binding, Schema.Struct({ total_count: Count, secrets: Schema.Array(Secret) }), response.data, true)
      : C.decode(binding, Schema.Struct({ total_count: Count, variables: Schema.Array(Variable) }), response.data, true)
    const rows = "secrets" in native ? native.secrets : native.variables
    return { rows, kind, ...C.pagination(binding, selected, response, rows.length, native.total_count) }
  })
})

const one = Effect.fn("ActionsVariables.githubSinglePage")(function* (services: ActionsConfigCommon.Services, binding: Actions.Binding,
  input: Actions.ResourceListInput, path: string) {
  const kind = input.cursor?.startsWith("secret:") ? "secret" : "variable"
  const page = yield* read(services, binding, { ...input, cursor: input.cursor?.replace(/^(?:secret|variable):/, "") }, path, kind, 1)
  if (kind === "secret") return { rows: page.rows, capturedAt: page.capturedAt, ...(page.next ? { next: `secret:${page.next}` } : {}) }
  const secretSelection = yield* C.guard(binding, () => C.page(binding, { ...input, cursor: undefined }, "secret:budget1"))
  if (page.rows.length === 0 && page.next === undefined) {
    const secrets = yield* read(services, binding, { ...input, cursor: undefined }, path, "secret", 1)
    return { rows: secrets.rows, capturedAt: secrets.capturedAt, ...(secrets.next ? { next: `secret:${secrets.next}` } : {}) }
  }
  return { rows: page.rows, capturedAt: page.capturedAt, next: page.next ? `variable:${page.next}`
    : `secret:${ActionsCursor.encode(binding, secretSelection.scope, secretSelection.filters, 1)}` }
})
~~~~

## AUT2-C17

```json
{"block_id":"AUT2-C17","type":"literal_source_excerpt","request_namespace":"J1 canonical groups; J2 mapping in index","requests":["RE-AUT2-03"],"body_anchors":["A24"],"requested_subject":"Contrato local do módulo crypto usado pelo wrapper, não implementação criptográfica","source_category":"owned_population_source","path":"packages/core/src/actions/resources/config-sodium.d.ts","archive":"sources/packages/core/src/actions/resources/config-sodium.d.ts","commit":"1cde2ff7a71bcf7aecb5d030917b577165135d38","source_git_blob_sha":"8580645c5635998ff84dd397e88eb3bd131826ef","source_sha256":"88816907c0381d3ba2094c97a9572036f6ce757e10d2498b29d14150f4f5ebba","source_bytes":812}
```

```json
{"first_line":1,"last_line":15,"bytes":812,"sha256":"88816907c0381d3ba2094c97a9572036f6ce757e10d2498b29d14150f4f5ebba"}
```

~~~~typescript
// Narrow declaration for the pinned lazy runtime dependency; no crypto implementation lives here.
declare module "libsodium-wrappers" {
  const sodium: {
    readonly ready: Promise<void>
    readonly crypto_box_PUBLICKEYBYTES: number
    readonly base64_variants: { readonly ORIGINAL: number }
    readonly from_base64: (value: string, variant: number) => Uint8Array
    readonly to_base64: (value: Uint8Array, variant: number) => string
    readonly crypto_box_seal: (value: Uint8Array, publicKey: Uint8Array) => Uint8Array
    readonly memzero: (value: Uint8Array) => void
    readonly crypto_box_keypair: () => { publicKey: Uint8Array; privateKey: Uint8Array }
    readonly crypto_box_seal_open: (value: Uint8Array, publicKey: Uint8Array, privateKey: Uint8Array) => Uint8Array
  }
  export default sodium
}
~~~~

## AUT2-C18

```json
{"block_id":"AUT2-C18","type":"literal_source_excerpt","request_namespace":"J1 canonical groups; J2 mapping in index","requests":["RE-AUT2-03"],"body_anchors":["A25"],"requested_subject":"Schemas de environments/reviewers/refs GH e GL","source_category":"owned_population_source","path":"packages/core/src/actions/resources/config-environment-schema.ts","archive":"sources/packages/core/src/actions/resources/config-environment-schema.ts","commit":"1cde2ff7a71bcf7aecb5d030917b577165135d38","source_git_blob_sha":"68c018139273310ac5cfd10d220b965b09ea62da","source_sha256":"86af948872e70184a9ed866b6c5cda97809f680ca887cc177934fa9ace399b2a","source_bytes":2818}
```

```json
{"first_line":1,"last_line":37,"bytes":2818,"sha256":"86af948872e70184a9ed866b6c5cda97809f680ca887cc177934fa9ace399b2a"}
```

~~~~typescript
export * as ActionsEnvironmentSchema from "./config-environment-schema"

import { Schema } from "effect"
import { ActionsConfigCommon } from "./config-common"

const C = ActionsConfigCommon
// Native contracts: https://docs.github.com/en/rest/deployments/environments
// https://docs.gitlab.com/api/environments/ and /api/protected_environments/.
const Reviewer = Schema.Struct({ type: Schema.Literals(["User", "Team"]), reviewer: Schema.Struct({
  id: C.ID, login: Schema.optionalKey(C.Text), slug: Schema.optionalKey(C.Text),
}) })
export const GitHub = Schema.Struct({ id: C.ID, name: C.Text, created_at: Schema.String, updated_at: Schema.String,
  protection_rules: Schema.Array(Schema.Struct({ type: C.Text, id: Schema.optionalKey(C.ID),
    wait_timer: Schema.optionalKey(Schema.Int), prevent_self_review: Schema.optionalKey(Schema.Boolean),
    reviewers: Schema.optionalKey(Schema.Array(Reviewer)) })),
  deployment_branch_policy: Schema.NullOr(Schema.Struct({ protected_branches: Schema.Boolean, custom_branch_policies: Schema.Boolean })),
})
export const BranchPolicy = Schema.Struct({ id: C.ID, name: C.Text, type: Schema.Literals(["branch", "tag"]) })
export const BranchPolicies = Schema.Struct({ total_count: Schema.Int, branch_policies: Schema.Array(BranchPolicy) })
export const GitLab = Schema.Struct({ id: C.ID, name: C.Text, state: C.Text,
  description: Schema.optionalKey(Schema.NullOr(Schema.String)), tier: Schema.optionalKey(Schema.NullOr(Schema.String)),
  updated_at: Schema.optionalKey(Schema.String),
})
export const Access = Schema.Struct({ id: C.ID, user_id: Schema.optionalKey(Schema.NullOr(C.ID)),
  group_id: Schema.optionalKey(Schema.NullOr(C.ID)), access_level: Schema.optionalKey(Schema.NullOr(Schema.Int)),
  access_level_description: Schema.optionalKey(Schema.String), required_approvals: Schema.optionalKey(Schema.Int) })
export const Protected = Schema.Struct({ name: C.Text, deploy_access_levels: Schema.Array(Access),
  required_approval_count: Schema.optionalKey(Schema.Int), approval_rules: Schema.optionalKey(Schema.Array(Access)) })
export const Delete = Schema.Struct({ provider: C.Provider, name: C.Text })
export const Form = Schema.Struct({ provider: C.Provider, name: C.Text, reviewers: Schema.String, refs: C.Text,
  timer: Schema.optionalKey(Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 43_200 }))), preventSelfReview: Schema.Boolean,
  description: Schema.optionalKey(Schema.String), tier: Schema.optionalKey(Schema.Literals(["production", "staging", "testing", "development", "other"])) })
export const Review = Schema.Struct({ provider: C.Provider, decision: Schema.Literals(["Approve", "Reject"]), comment: C.Value })

export function patterns(refs: string) {
  return Array.from(new Set(refs.split(",").map((ref) => ref.trim()).filter(Boolean)))
}
~~~~

## AUT2-C19

```json
{"block_id":"AUT2-C19","type":"literal_source_excerpt","request_namespace":"J1 canonical groups; J2 mapping in index","requests":["RE-AUT2-03"],"body_anchors":["A25"],"requested_subject":"Reviews representáveis, read-only e lookup de identidade","source_category":"owned_population_source","path":"packages/core/src/actions/resources/config-environment-reviewers.ts","archive":"sources/packages/core/src/actions/resources/config-environment-reviewers.ts","commit":"1cde2ff7a71bcf7aecb5d030917b577165135d38","source_git_blob_sha":"9110df8c9a839c9db3476ecdfbfe6e9d9955bc6e","source_sha256":"64222df345434d4400ec50653b25f03b94252d2bf0ecee5a8090ffa24f34c65e","source_bytes":2604}
```

```json
{"first_line":1,"last_line":32,"bytes":2604,"sha256":"64222df345434d4400ec50653b25f03b94252d2bf0ecee5a8090ffa24f34c65e"}
```

~~~~typescript
export * as ActionsEnvironmentReviewers from "./config-environment-reviewers"

import { Actions } from "@orchestra/schema/actions"
import { Effect, Schema } from "effect"
import { ActionsConfigCommon } from "./config-common"
import { ActionsEnvironmentGitLab } from "./config-environment-gitlab"
import { ActionsEnvironmentSchema } from "./config-environment-schema"

export const read = Effect.fn("ActionsEnvironmentReviewers.read")(function* (services: ActionsConfigCommon.Services,
  binding: Actions.Binding, policies: readonly (typeof ActionsEnvironmentSchema.Protected.Type)[], name: string) {
  const matching = policies.filter((policy) => ActionsEnvironmentGitLab.matches(policy.name, name))
  if (matching.some((policy) => policy.name.includes("*"))) return { reviewersReadOnly: true }
  const exact = matching.filter((policy) => policy.name === name)
  if (exact.length !== 1) return { reviewersReadOnly: true }
  const policy = exact[0]
  if (policy.required_approval_count !== undefined && policy.approval_rules === undefined && policy.required_approval_count !== 0)
    return { reviewersReadOnly: true }
  const rules = policy.approval_rules ?? []
  if (rules.length > 6 || rules.some((rule) => rule.user_id == null || rule.group_id != null || rule.access_level != null || rule.required_approvals !== 1))
    return { reviewersReadOnly: true }
  const ids = yield* ActionsConfigCommon.guard(binding, () => rules.map((rule) => ActionsConfigCommon.decode(binding, ActionsConfigCommon.ID, rule.user_id, true)))
  const usernames = yield* Effect.forEach(ids, (id) => Effect.gen(function* () {
    const response = yield* ActionsConfigCommon.get(services, binding, { method: "GET", path: `users/${encodeURIComponent(String(id))}` })
    const user = yield* ActionsConfigCommon.guard(binding, () => ActionsConfigCommon.decode(binding,
      Schema.Struct({ id: ActionsConfigCommon.ID, username: ActionsConfigCommon.Text }), response.data, true))
    if (String(user.id) !== String(id)) return yield* ActionsConfigCommon.fail(binding, "source_conflict", "GitLab reviewer lookup returned a different native ID")
    if (!/^[A-Za-z0-9_.-]+$/.test(user.username)) return yield* ActionsConfigCommon.fail(binding, "source_unresolved", "GitLab reviewer username cannot be represented by the configuration form")
    return user.username
  }), { concurrency: 1 })
  if (new Set(usernames).size !== usernames.length) return yield* ActionsConfigCommon.fail(binding, "source_unresolved", "GitLab reviewer usernames are not distinct")
  return { reviewers: usernames.join(","), reviewersReadOnly: false }
})
~~~~

## AUT2-C20

```json
{"block_id":"AUT2-C20","type":"literal_source_excerpt","request_namespace":"J1 canonical groups; J2 mapping in index","requests":["RE-AUT2-03"],"body_anchors":["A26"],"requested_subject":"Entrada list/execute e caminho runID para pending review","source_category":"owned_population_source","path":"packages/core/src/actions/resources/environments.ts","archive":"sources/packages/core/src/actions/resources/environments.ts","commit":"1cde2ff7a71bcf7aecb5d030917b577165135d38","source_git_blob_sha":"bf40e7c0a1e0eb17c0ac15f64b27ccaee1203292","source_sha256":"fc92638ae218671edd85d17f5c52b3de8b899d209dda930afd3fffdab5cee9fa","source_bytes":5333}
```

```json
{"first_line":1,"last_line":72,"bytes":5333,"sha256":"fc92638ae218671edd85d17f5c52b3de8b899d209dda930afd3fffdab5cee9fa"}
```

~~~~typescript
export * as ActionsEnvironments from "./environments"

import { Actions } from "@orchestra/schema/actions"
import { Effect, Schema } from "effect"
import { ActionsContract } from "../contract"
import { ActionsCursor } from "../cursor"
import { ActionsConfigCommon } from "./config-common"
import { ActionsEnvironmentSchema } from "./config-environment-schema"
import { ActionsEnvironmentGitHub } from "./config-environment-github"
import { ActionsEnvironmentGitLab } from "./config-environment-gitlab"
import { ActionsDeploymentReview } from "./config-deployment-review"
import { ActionsEnvironmentReviewers } from "./config-environment-reviewers"

const C = ActionsConfigCommon
const S = ActionsEnvironmentSchema

export function make(services: ActionsConfigCommon.Services): ActionsContract.ResourceDomain {
  return {
    list: Effect.fn("ActionsEnvironments.list")(function* (binding: Actions.Binding, input: Actions.ResourceListInput) {
      const frozen = yield* C.guard(binding, () => {
        const selected = C.selection(binding, input, "environments", ["resourceID", "runID", "scope"])
        if (selected.scope !== undefined && selected.scope !== (binding.provider.kind === "github" ? "Repository" : "Project"))
          throw C.fail(binding, "invalid_input", "Environment list scope must match the native project scope")
        return selected
      })
      const project = yield* C.project(services, binding)
      if (frozen.runID !== undefined) {
        if (frozen.cursor !== undefined || frozen.limit !== undefined) return yield* C.fail(binding, "invalid_input", "Pending deployment review uses a bounded native snapshot, not list pagination")
        return yield* ActionsDeploymentReview.list(services, binding, frozen.runID, frozen.resourceID)
      }
      const selected = yield* C.guard(binding, () => C.page(binding, frozen))
      const response = yield* C.get(services, binding, { method: "GET", path: `${project.path}/environments`,
        query: { page: selected.number, per_page: selected.limit,
          ...(binding.provider.kind === "gitlab" && frozen.resourceID !== undefined ? { name: frozen.resourceID } : {}) } })
      if (binding.provider.kind === "github") {
        const native = yield* C.guard(binding, () => C.decode(binding, Schema.Struct({ total_count: Schema.Int,
          environments: Schema.Array(S.GitHub) }), response.data, true))
        const items = yield* Effect.forEach(native.environments.filter((item) => frozen.resourceID === undefined || item.name === frozen.resourceID),
          (environment) => Effect.gen(function* () {
            const refs = yield* ActionsEnvironmentGitHub.policies(services, binding, project.path, environment)
            return ActionsEnvironmentGitHub.resource(binding, environment, refs)
          }), { concurrency: 1 })
        return yield* C.guard(binding, () => ({ items, ...C.pagination(binding, selected, response, native.environments.length, native.total_count) }))
      }
      const native = yield* C.guard(binding, () => C.decode(binding, Schema.Array(S.GitLab), response.data, true))
      const protectedEnvironments = yield* ActionsEnvironmentGitLab.protections(services, binding, project.path)
      const items = yield* Effect.forEach(native.filter((environment) => frozen.resourceID === undefined || environment.name === frozen.resourceID), (environment) => Effect.gen(function* () {
        const item = ActionsEnvironmentGitLab.resource(binding, environment, protectedEnvironments, project.native)
        if (frozen.resourceID === undefined) return item
        const reviewers = yield* ActionsEnvironmentReviewers.read(services, binding, protectedEnvironments, environment.name)
        return { ...item, data: { ...C.decode(binding, Schema.Record(Schema.String, Schema.Json), item.data), reviewersReadOnly: reviewers.reviewersReadOnly,
          ...(typeof reviewers.reviewers === "string" ? { reviewers: reviewers.reviewers } : {}) } }
      }), { concurrency: 1 })
      return yield* C.guard(binding, () => ({ items,
        ...C.pagination(binding, selected, response, native.length, ActionsCursor.total(response.headers)) }))
    }),
    perform: Effect.fn("ActionsEnvironments.perform")(function* (binding: Actions.Binding, intent: Actions.OperationIntent, payload: ActionsContract.Json) {
      if (intent.kind === "deployment.review") return yield* ActionsDeploymentReview.perform(services, binding, intent, payload)
      const frozen = yield* C.guard(binding, () => {
        const capture = C.capture(binding, intent, "environments")
        const input = C.decode(binding, intent.kind === "resource.delete" ? S.Delete : S.Form, structuredClone(payload))
        if (input.provider !== binding.provider.kind || input.name !== intent.target.resourceID)
          throw C.fail(binding, "intent_conflict", "Environment provider or name changed after admission")
        return { ...capture, input }
      })
      const project = yield* C.project(services, frozen.binding, true, true)
      return frozen.binding.provider.kind === "github"
        ? yield* ActionsEnvironmentGitHub.write(services, frozen.binding, frozen.intent, frozen.input, project.path)
        : yield* ActionsEnvironmentGitLab.write(services, frozen.binding, frozen.intent, frozen.input, project.path, project.native)
    }),
  }
}
~~~~

## AUT2-C21

```json
{"block_id":"AUT2-C21","type":"literal_source_excerpt","request_namespace":"J1 canonical groups; J2 mapping in index","requests":["RE-AUT2-03"],"body_anchors":["A25"],"requested_subject":"Reviewers/branch-tag policies/timer e plano multifase GH","source_category":"owned_population_source","path":"packages/core/src/actions/resources/config-environment-github.ts","archive":"sources/packages/core/src/actions/resources/config-environment-github.ts","commit":"1cde2ff7a71bcf7aecb5d030917b577165135d38","source_git_blob_sha":"258f9fcb61eeb90c457b2f116ebdbd406bbb340e","source_sha256":"fc9f6dab5045d664abe9fa5b5c665c190a70039b2bc4484a6829d274de5c2dbc","source_bytes":10164}
```

```json
{"first_line":1,"last_line":114,"bytes":10164,"sha256":"fc9f6dab5045d664abe9fa5b5c665c190a70039b2bc4484a6829d274de5c2dbc"}
```

~~~~typescript
export * as ActionsEnvironmentGitHub from "./config-environment-github"

import { Actions } from "@orchestra/schema/actions"
import { Effect, Schema } from "effect"
import { ActionsContract } from "../contract"
import { ActionsConfigCommon } from "./config-common"
import { ActionsEnvironmentSchema } from "./config-environment-schema"

const C = ActionsConfigCommon
const S = ActionsEnvironmentSchema

export const policies = Effect.fn("ActionsEnvironments.githubPolicies")(function* (services: ActionsConfigCommon.Services, binding: Actions.Binding, root: string,
  environment: typeof S.GitHub.Type) {
  if (!environment.deployment_branch_policy?.custom_branch_policies) return []
  const response = yield* C.get(services, binding, { method: "GET", path: `${root}/environments/${encodeURIComponent(environment.name)}/deployment-branch-policies`,
    query: { per_page: 100, page: 1 } })
  return yield* C.guard(binding, () => {
    const value = C.decode(binding, S.BranchPolicies, response.data, true)
    if (value.branch_policies.length !== value.total_count || response.headers.link?.includes('rel="next"') || response.headers["x-next-page"])
      throw C.fail(binding, "metadata_truncated", "Environment ref policies exceed the bounded configuration read")
    return value.branch_policies
  })
})

export function resource(binding: Actions.Binding, environment: typeof S.GitHub.Type, refs: readonly (typeof S.BranchPolicy.Type)[]): Actions.Resource {
  const reviewers = environment.protection_rules.find((rule) => rule.type === "required_reviewers")
  const names = (reviewers?.reviewers ?? []).map((reviewer) => reviewer.type === "User" ? reviewer.reviewer.login
    : reviewer.reviewer.slug === undefined ? undefined : `team:${reviewer.reviewer.slug}`)
  const metadata = { ...environment, refPolicies: refs }
  return { id: environment.name, bindingID: binding.id, kind: "environments", name: environment.name, scope: "Repository", owner: "Project",
    data: { ...metadata, nativeIdentity: C.identity(binding, environment.name, "Repository", String(environment.id)),
      resourceVersion: JSON.stringify(metadata), reviewers: names.filter((name) => name !== undefined).join(", "),
      reviewerIdentities: (reviewers?.reviewers ?? []).map((reviewer) => ({ type: reviewer.type, id: String(reviewer.reviewer.id),
        ...(reviewer.reviewer.login ? { login: reviewer.reviewer.login } : {}), ...(reviewer.reviewer.slug ? { slug: reviewer.reviewer.slug } : {}) })),
      ...(names.some((name) => name === undefined) ? { sourceUnresolved: "Native reviewer name was not returned; use reviewerIdentities" } : {}),
      refs: environment.deployment_branch_policy === null ? "*" : environment.deployment_branch_policy.protected_branches ? "Protected branches"
        : Array.from(new Set(refs.map((policy) => policy.name))).join(", "),
      timer: environment.protection_rules.find((rule) => rule.type === "wait_timer")?.wait_timer ?? 0,
      ...(reviewers?.prevent_self_review === undefined ? {} : { preventSelfReview: reviewers.prevent_self_review }),
      description: "Repository deployment environment" } }
}

export const write = Effect.fn("ActionsEnvironments.githubWrite")(function* (services: ActionsConfigCommon.Services, binding: Actions.Binding, intent: Actions.OperationIntent,
  input: typeof S.Form.Type | typeof S.Delete.Type, root: string) {
  if (intent.target.scope !== "Repository") return yield* C.fail(binding, "invalid_input", "GitHub environment scope must be Repository")
  const path = `${root}/environments/${encodeURIComponent(input.name)}`
  const response = yield* C.get(services, binding, { method: "GET", path }, true)
  if ((intent.kind === "resource.create") !== (response.status === 404)) return yield* C.fail(binding, "source_conflict", "Environment existence changed after admission")
  const native = response.status === 200 ? yield* C.guard(binding, () => C.decode(binding, S.GitHub, response.data, true)) : undefined
  if (native && native.name !== input.name) return yield* C.fail(binding, "source_conflict", "Native environment name changed after admission")
  const current = native ? yield* policies(services, binding, root, native) : []
  if (native) yield* C.guard(binding, () => C.version(binding, intent.expected, response, { ...native, refPolicies: current }))
  if (!native && intent.expected?.resourceVersion) return yield* C.fail(binding, "invalid_input", "A new environment has no existing resource version")
  if (intent.kind === "resource.delete") {
    yield* C.send(services, binding, { method: "DELETE", path }, [204])
    return { acknowledgement: { resourceID: input.name } }
  }
  if (!("reviewers" in input)) return yield* C.fail(binding, "invalid_input", "Environment update requires its mock form")
  if (input.description !== undefined || input.tier !== undefined) return yield* C.fail(binding, "capability_unavailable", "GitHub environments do not expose description or tier fields")
  const protectedOnly = input.refs === "Protected branches" && native?.deployment_branch_policy?.protected_branches === true
  const wanted = protectedOnly ? ["*"] : S.patterns(input.refs)
  if (!wanted.length || wanted.length > 8 || wanted.some((ref) => /[\s\x00-\x1f\x7f]/.test(ref)) || (wanted.includes("*") && wanted.length !== 1))
    return yield* C.fail(binding, "invalid_input", "Environment requires at most eight exact branch/tag patterns, or '*' alone")
  const required = yield* resolveReviewers(services, binding, root, input.reviewers)
  const desired = wanted[0] === "*" ? [] : wanted.flatMap((name) => [{ name, type: "branch" }, { name, type: "tag" }])
  const changes = desired.filter((policy) => !current.some((item) => item.name === policy.name && item.type === policy.type))
  const deleted = current.filter((policy) => !desired.some((item) => item.name === policy.name && item.type === policy.type))
  const currentTimer = native?.protection_rules.find((rule) => rule.type === "wait_timer")?.wait_timer
  const timer = input.timer ?? currentTimer
  if (current.length > 32) return yield* C.fail(binding, "metadata_truncated", "Environment policy mutation exceeds its bounded native phases")
  // Ref patterns require separate native endpoints. Validate the entire plan before
  // the first write; a later rejection explicitly reports partial application.
  yield* C.stages(services, binding, [
    { phase: "protection", statuses: [200], request: { method: "PUT", path, body: {
      // Do not request a paid timer feature merely to send its absent zero default.
      ...(timer !== undefined && (timer > 0 || currentTimer !== undefined) ? { wait_timer: timer } : {}),
      prevent_self_review: input.preventSelfReview, reviewers: required,
      deployment_branch_policy: protectedOnly ? { protected_branches: true, custom_branch_policies: false }
        : desired.length ? { protected_branches: false, custom_branch_policies: true } : null } } },
    ...deleted.map((policy) => ({ phase: `remove ref policy ${policy.id}`, statuses: [204], request: {
      method: "DELETE" as const, path: `${path}/deployment-branch-policies/${policy.id}` } })),
    ...changes.map((policy) => ({ phase: `add ${policy.type} ref policy`, statuses: [200, 201], request: {
      method: "POST" as const, path: `${path}/deployment-branch-policies`, body: policy } })),
  ])
  return { acknowledgement: { resourceID: input.name } }
})

const resolveReviewers = Effect.fn("ActionsEnvironments.githubReviewers")(function* (services: ActionsConfigCommon.Services, binding: Actions.Binding, root: string, names: string) {
  const reviewers = names.split(",").map((name) => name.trim()).filter(Boolean)
  if (reviewers.length > 6 || new Set(reviewers).size !== reviewers.length) return yield* C.fail(binding, "invalid_input", "GitHub supports up to six distinct environment reviewers")
  return yield* Effect.forEach(reviewers, (name) => Effect.gen(function* () {
    if (name.startsWith("team:")) {
      const slug = name.slice(5)
      if (!/^[A-Za-z0-9-]+$/.test(slug)) return yield* C.fail(binding, "source_unresolved", "Team reviewers require exact 'team:slug' identity")
      const response = yield* C.get(services, binding, { method: "GET", path: `${root}/teams`, query: { per_page: 100, page: 1 } })
      const teams = yield* C.guard(binding, () => C.decode(binding, Schema.Array(Schema.Struct({ id: C.ID, slug: C.Text })), response.data, true))
      const matches = teams.filter((team) => team.slug === slug)
      if (matches.length !== 1 || response.headers.link?.includes("next") || teams.length === 100 || !Number.isSafeInteger(Number(matches[0].id)))
        return yield* C.fail(binding, "source_unresolved", "Repository team list did not prove one exact reviewer identity")
      return { type: "Team", id: Number(matches[0].id) }
    }
    if (!/^[A-Za-z0-9-]+$/.test(name)) return yield* C.fail(binding, "source_unresolved", "User reviewers require an exact login, not a display name")
    const response = yield* C.get(services, binding, { method: "GET", path: `users/${encodeURIComponent(name)}` })
    const user = yield* C.guard(binding, () => C.decode(binding, Schema.Struct({ id: C.ID, login: C.Text }), response.data, true))
    if (user.login.toLowerCase() !== name.toLowerCase() || !Number.isSafeInteger(Number(user.id)))
      return yield* C.fail(binding, "source_unresolved", "Native user lookup did not prove the exact reviewer login and ID")
    const access = yield* C.get(services, binding, { method: "GET", path: `${root}/collaborators/${encodeURIComponent(user.login)}/permission` })
    const permission = yield* C.guard(binding, () => C.decode(binding, Schema.Struct({ permission: C.Text,
      user: Schema.Struct({ id: C.ID, login: C.Text }) }), access.data, true))
    if (String(permission.user.id) !== String(user.id) || permission.user.login.toLowerCase() !== user.login.toLowerCase() || !["read", "write", "admin"].includes(permission.permission))
      return yield* C.fail(binding, "source_unresolved", "Native repository lookup did not prove eligible reviewer access")
    return { type: "User", id: Number(user.id) }
  }), { concurrency: 1 })
})
~~~~

## AUT2-C22

```json
{"block_id":"AUT2-C22","type":"literal_source_excerpt","request_namespace":"J1 canonical groups; J2 mapping in index","requests":["RE-AUT2-03"],"body_anchors":["A25"],"requested_subject":"Estado stopped/delete, proteção e approvals representáveis GL","source_category":"owned_population_source","path":"packages/core/src/actions/resources/config-environment-gitlab.ts","archive":"sources/packages/core/src/actions/resources/config-environment-gitlab.ts","commit":"1cde2ff7a71bcf7aecb5d030917b577165135d38","source_git_blob_sha":"610ab3c2831e40f288decfde7667af2387be313f","source_sha256":"873b53054d0e9bb1fad5a94400fefb7cbb11b96a23244cb9260e31f7e0e5f7ac","source_bytes":10953}
```

```json
{"first_line":1,"last_line":116,"bytes":10953,"sha256":"873b53054d0e9bb1fad5a94400fefb7cbb11b96a23244cb9260e31f7e0e5f7ac"}
```

~~~~typescript
export * as ActionsEnvironmentGitLab from "./config-environment-gitlab"

import { Actions } from "@orchestra/schema/actions"
import { Effect, Schema } from "effect"
import { ActionsContract } from "../contract"
import { ActionsConfigCommon } from "./config-common"
import { ActionsEnvironmentSchema } from "./config-environment-schema"

const C = ActionsConfigCommon
const S = ActionsEnvironmentSchema

export const protections = Effect.fn("ActionsEnvironments.gitlabProtections")(function* (services: ActionsConfigCommon.Services, binding: Actions.Binding, root: string) {
  const response = yield* C.get(services, binding, { method: "GET", path: `${root}/protected_environments`, query: { page: 1, per_page: 100 } })
  return yield* C.guard(binding, () => {
    const native = C.decode(binding, Schema.Array(S.Protected), response.data, true)
    if (response.headers["x-next-page"] || response.headers.link?.includes("next") || native.length === 100)
      throw C.fail(binding, "metadata_truncated", "Protected environments exceed the bounded policy read")
    return native
  })
})

export function matches(pattern: string, name: string) {
  return new RegExp(`^${pattern.split("*").map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*")}$`).test(name)
}

export function resource(binding: Actions.Binding, environment: typeof S.GitLab.Type, protectedEnvironments: readonly (typeof S.Protected.Type)[],
  project: typeof C.Project.Type): Actions.Resource {
  const policies = protectedEnvironments.filter((item) => matches(item.name, environment.name))
  const metadata = { ...environment, protectedPolicies: policies }
  return { id: environment.name, name: environment.name, bindingID: binding.id, kind: "environments", scope: "Project", owner: "Project",
    status: environment.state, data: { ...metadata, nativeIdentity: C.identity(binding, environment.name, "Project", String(environment.id)),
      resourceVersion: JSON.stringify(metadata), ...(environment.description === undefined ? {} : { description: environment.description }),
      reviewerIdentities: policies.flatMap((policy) => (policy.approval_rules ?? []).map((rule) => ({ ...rule, policyName: policy.name }))),
      sourceUnresolved: "GitLab reviewer rules identify users, groups and roles by native ID; display names require lookup",
      refs: { state: "source_unresolved", source: "CI configuration rules", reason: "Protected environments do not enforce branch or tag patterns" },
      ...(project.allow_pipeline_trigger_approve_deployment === undefined ? {} : {
        preventSelfReview: !project.allow_pipeline_trigger_approve_deployment, preventSelfReviewScope: "Project",
        preventSelfReviewSource: "allow_pipeline_trigger_approve_deployment" }),
      policyScope: "Project protected environments", timer: { state: "unavailable", reason: "GitLab has no native environment wait timer" } } }
}

export const find = Effect.fn("ActionsEnvironments.gitlabFind")(function* (services: ActionsConfigCommon.Services, binding: Actions.Binding, root: string, name: string) {
  const response = yield* C.get(services, binding, { method: "GET", path: `${root}/environments`, query: { name, page: 1, per_page: 100 } })
  const native = yield* C.guard(binding, () => C.decode(binding, Schema.Array(S.GitLab), response.data, true))
  if (native.length > 1 || native.some((item) => item.name !== name) || response.headers["x-next-page"] || response.headers.link?.includes("next"))
    return yield* C.fail(binding, "source_conflict", "GitLab did not prove one exact environment name")
  return native[0]
})

export const write = Effect.fn("ActionsEnvironments.gitlabWrite")(function* (services: ActionsConfigCommon.Services, binding: Actions.Binding, intent: Actions.OperationIntent,
  input: typeof S.Form.Type | typeof S.Delete.Type, root: string, project: typeof C.Project.Type) {
  if (intent.target.scope !== "Project") return yield* C.fail(binding, "invalid_input", "GitLab environment scope must be Project")
  const environment = yield* find(services, binding, root, input.name)
  if ((intent.kind === "resource.create") !== (environment === undefined)) return yield* C.fail(binding, "source_conflict", "Environment existence changed after admission")
  const protectedEnvironments = yield* protections(services, binding, root)
  const matching = protectedEnvironments.filter((policy) => matches(policy.name, input.name))
  if (environment) yield* C.guard(binding, () => C.version(binding, intent.expected, { status: 200, headers: {}, data: null },
    { ...environment, protectedPolicies: matching }))
  if (!environment && intent.expected?.resourceVersion) return yield* C.fail(binding, "invalid_input", "A new environment has no existing resource version")
  if (intent.kind === "resource.delete") {
    if (!environment || environment.state !== "stopped") return yield* C.fail(binding, "capability_unavailable", "GitLab environment must already be stopped before deletion")
    yield* C.send(services, binding, { method: "DELETE", path: `${root}/environments/${environment.id}` }, [204])
    return { acknowledgement: { resourceID: input.name } }
  }
  if (!("reviewers" in input)) return yield* C.fail(binding, "invalid_input", "Environment update requires its mock form")
  if (input.timer !== undefined) return yield* C.fail(binding, "capability_unavailable", "GitLab has no native environment timer field")
  if (input.refs !== "*") return yield* C.fail(binding, "capability_unavailable", "Field 'refs' requires a reviewed CI rules source change; protected environments cannot enforce it")
  if (project.allow_pipeline_trigger_approve_deployment === undefined || input.preventSelfReview !== !project.allow_pipeline_trigger_approve_deployment)
    return yield* C.fail(binding, "capability_unavailable", "Field 'preventSelfReview' belongs to observed project deployment approval settings, not this environment")
  if (matching.some((policy) => policy.name !== input.name)) return yield* C.fail(binding, "capability_unavailable", "Wildcard protected policy owns this environment; configure that native policy separately")
  const existing = matching[0]
  // A successful collection lookup distinguishes absence from plan/access denial;
  // a direct read then proves the exact existing policy before changing its rules.
  const policy = existing ? yield* C.get(services, binding, { method: "GET", path: `${root}/protected_environments/${encodeURIComponent(input.name)}` }) : undefined
  const current = policy ? yield* C.guard(binding, () => C.decode(binding, S.Protected, policy.data, true)) : undefined
  if (current && JSON.stringify(current) !== JSON.stringify(existing)) return yield* C.fail(binding, "source_conflict", "Protected environment policy changed during preflight")
  const reviewers = yield* resolveReviewers(services, binding, root, input.reviewers)
  if (!current && reviewers.length) return yield* C.fail(binding, "source_unresolved",
    "Field 'reviewers' requires an existing protected environment deploy_access_levels policy; this form cannot invent deploy permissions")
  if (current?.required_approval_count && current.approval_rules === undefined)
    return yield* C.fail(binding, "capability_unavailable", "Legacy required_approval_count cannot be replaced by unobserved approval_rules")
  if (current?.approval_rules?.some((rule) => rule.user_id == null || rule.group_id != null || rule.access_level != null || rule.required_approvals !== 1))
    return yield* C.fail(binding, "capability_unavailable", "Field 'reviewers' cannot replace native group/role or multi-approval policy through a username-only form")
  const rules = reviewers.map((user_id) => ({ user_id, required_approvals: 1 }))
  const removed = (current?.approval_rules ?? []).map((rule) => ({ id: rule.id, _destroy: true }))
  const requests: { request: ActionsContract.Request; statuses: readonly number[]; phase: string }[] = [
    ...(!environment ? [{ phase: "create environment", statuses: [201], request: { method: "POST" as const, path: `${root}/environments`,
      body: { name: input.name, ...(input.description === undefined ? {} : { description: input.description }), ...(input.tier === undefined ? {} : { tier: input.tier }) } } }]
      : input.description !== undefined || input.tier !== undefined ? [{ phase: "environment metadata", statuses: [200], request: {
        method: "PUT" as const, path: `${root}/environments/${environment.id}`, body: {
          ...(input.description === undefined ? {} : { description: input.description }), ...(input.tier === undefined ? {} : { tier: input.tier }) } } }] : []),
    ...(current ? [{ phase: "protected environment approvals", statuses: [200], request: {
      method: "PUT" as const, path: `${root}/protected_environments/${encodeURIComponent(input.name)}`,
      body: { approval_rules: [...removed, ...rules] } } }] : []),
  ]
  if (removed.length > 32 || requests.length === 0) return yield* C.fail(binding, "invalid_input", "Environment mutation is empty or exceeds bounded approval changes")
  yield* C.stages(services, binding, requests)
  return { acknowledgement: { resourceID: input.name } }
})

const resolveReviewers = Effect.fn("ActionsEnvironments.gitlabReviewers")(function* (services: ActionsConfigCommon.Services, binding: Actions.Binding, root: string, names: string) {
  const reviewers = names.split(",").map((name) => name.trim()).filter(Boolean)
  if (reviewers.length > 6 || new Set(reviewers).size !== reviewers.length) return yield* C.fail(binding, "invalid_input", "Environment supports at most six exact reviewer usernames")
  return yield* Effect.forEach(reviewers, (username) => Effect.gen(function* () {
    if (!/^[A-Za-z0-9_.-]+$/.test(username)) return yield* C.fail(binding, "source_unresolved", "GitLab reviewers require exact usernames, not display names or roles")
    const response = yield* C.get(services, binding, { method: "GET", path: "users", query: { username } })
    const users = yield* C.guard(binding, () => C.decode(binding, Schema.Array(Schema.Struct({ id: C.ID, username: C.Text })), response.data, true))
    if (users.length !== 1 || users[0].username !== username || !Number.isSafeInteger(Number(users[0].id)))
      return yield* C.fail(binding, "source_unresolved", "GitLab lookup did not prove one exact reviewer username and native ID")
    const access = yield* C.get(services, binding, { method: "GET", path: `${root}/members/all/${users[0].id}` })
    const member = yield* C.guard(binding, () => C.decode(binding, Schema.Struct({ id: C.ID, username: C.Text, access_level: Schema.Int }), access.data, true))
    if (String(member.id) !== String(users[0].id) || member.username !== username || ![20, 30, 40, 50].includes(member.access_level))
      return yield* C.fail(binding, "source_unresolved", "GitLab project membership did not prove eligible reviewer access")
    return Number(member.id)
  }), { concurrency: 1 })
})
~~~~

## AUT2-C23

```json
{"block_id":"AUT2-C23","type":"literal_source_excerpt","request_namespace":"J1 canonical groups; J2 mapping in index","requests":["RE-AUT2-03"],"body_anchors":["A26"],"requested_subject":"Pending deployments por run/env, precondições/ator/versão e aprovação nativa","source_category":"owned_population_source","path":"packages/core/src/actions/resources/config-deployment-review.ts","archive":"sources/packages/core/src/actions/resources/config-deployment-review.ts","commit":"1cde2ff7a71bcf7aecb5d030917b577165135d38","source_git_blob_sha":"53cd89baf0c85dfd338c6da6a119445ecb101066","source_sha256":"fcd8809b52ee73a044bc0ab61f88377cb882b72054708fa72e77771c81c5b400","source_bytes":9534}
```

```json
{"first_line":1,"last_line":110,"bytes":9534,"sha256":"fcd8809b52ee73a044bc0ab61f88377cb882b72054708fa72e77771c81c5b400"}
```

~~~~typescript
export * as ActionsDeploymentReview from "./config-deployment-review"

import { Actions } from "@orchestra/schema/actions"
import { Effect, Schema } from "effect"
import { ActionsContract } from "../contract"
import { ActionsConfigCommon } from "./config-common"
import { ActionsEnvironmentSchema } from "./config-environment-schema"

const C = ActionsConfigCommon
const S = ActionsEnvironmentSchema
const Pending = Schema.Struct({ environment: Schema.Struct({ id: C.ID, name: C.Text }), wait_timer: Schema.Int,
  wait_timer_started_at: Schema.NullOr(Schema.String), current_user_can_approve: Schema.Boolean,
  reviewers: Schema.Array(Schema.Struct({ type: Schema.Literals(["User", "Team"]), reviewer: Schema.Struct({ id: C.ID,
    login: Schema.optionalKey(C.Text), slug: Schema.optionalKey(C.Text) }) })) })
const Deployment = Schema.Struct({ id: C.ID, status: C.Text, sha: C.Text, ref: C.Text,
  environment: Schema.Struct({ id: C.ID, name: C.Text }),
  deployable: Schema.NullOr(Schema.Struct({ id: C.ID, pipeline: Schema.Struct({ id: C.ID }) })),
  pending_approval_count: Schema.optionalKey(Schema.Int),
  approval_summary: Schema.optionalKey(Schema.Struct({ rules: Schema.Array(Schema.Struct({
    user_id: Schema.optionalKey(Schema.NullOr(C.ID)), group_id: Schema.optionalKey(Schema.NullOr(C.ID)),
    access_level: Schema.optionalKey(Schema.NullOr(Schema.Int)), required_approvals: Schema.Int,
  })) })),
})

export const list = Effect.fn("ActionsEnvironments.pendingReview")(function* (services: ActionsConfigCommon.Services, binding: Actions.Binding, runID: string, name?: string) {
  const run = yield* checkedRun(services, binding, runID)
  const root = C.root(binding)
  if (binding.provider.kind === "github") {
    const response = yield* C.get(services, binding, { method: "GET", path: `${root}/actions/runs/${runID}/pending_deployments` })
    const pending = yield* C.guard(binding, () => C.decode(binding, Schema.Array(Pending), response.data, true))
    return { items: pending.filter((item) => name === undefined || item.environment.name === name).map((item): Actions.Resource => ({
      id: item.environment.name, name: item.environment.name, bindingID: binding.id, kind: "environments", scope: "Repository", status: "waiting",
      data: { ...item, runID, commit: run.commit, ...(run.attempt === undefined ? {} : { attempt: run.attempt }),
        nativeIdentity: C.identity(binding, item.environment.name, "Repository", String(item.environment.id)), resourceVersion: JSON.stringify(item) },
    })), capturedAt: Date.now() }
  }
  const response = yield* C.get(services, binding, { method: "GET", path: `${root}/deployments`, query: {
    status: "blocked", ...(name === undefined ? {} : { environment: name }), per_page: 100, page: 1 } })
  const deployments = yield* C.guard(binding, () => C.decode(binding, Schema.Array(Deployment), response.data, true))
  if (deployments.length === 100 || response.headers["x-next-page"] || response.headers.link?.includes("next"))
    return yield* C.fail(binding, "metadata_truncated", "Pending deployment read exceeds its bounded native page")
  return { items: deployments.filter((item) => String(item.deployable?.pipeline.id) === runID && (name === undefined || item.environment.name === name))
    .map((item): Actions.Resource => ({ id: item.environment.name, name: item.environment.name, bindingID: binding.id,
      kind: "environments", scope: "Project", status: item.status, data: { ...item, runID,
        nativeIdentity: C.identity(binding, item.environment.name, "Project", String(item.environment.id)),
        deploymentID: String(item.id), resourceVersion: JSON.stringify(item) } })), capturedAt: Date.now() }
})

export const perform = Effect.fn("ActionsEnvironments.review")(function* (services: ActionsConfigCommon.Services, binding: Actions.Binding, intent: Actions.OperationIntent,
  payload: ActionsContract.Json) {
  const frozen = yield* C.guard(binding, () => {
    const capture = C.capture(binding, intent, "environments", true)
    const input = C.decode(binding, S.Review, structuredClone(payload))
    if (input.provider !== binding.provider.kind || !intent.target.runID || !/^[1-9]\d*$/.test(intent.target.runID))
      throw C.fail(binding, "invalid_input", "Deployment review requires its bound provider and native run ID")
    return { ...capture, input, name: C.decode(binding, C.Text, intent.target.resourceID), runID: intent.target.runID }
  })
  const scope = frozen.binding.provider.kind === "github" ? "Repository" : "Project"
  if (frozen.intent.target.scope !== scope) return yield* C.fail(binding, "intent_conflict", "Deployment review scope differs from admission")
  yield* C.project(services, frozen.binding)
  yield* C.actor(services, frozen.binding)
  const run = yield* checkedRun(services, frozen.binding, frozen.runID)
  if ((frozen.intent.expected?.commit !== undefined && frozen.intent.expected.commit !== run.commit) ||
      (frozen.intent.expected?.attempt !== undefined && frozen.intent.expected.attempt !== run.attempt))
    return yield* C.fail(binding, "source_conflict", "Deployment run source or attempt changed after admission")
  const root = C.root(frozen.binding)
  const pending = yield* list(services, frozen.binding, frozen.runID, frozen.name)
  if (pending.items.length !== 1) return yield* C.fail(binding, "source_unresolved", "Native pending deployments did not prove one admitted run and environment")
  const currentRun = yield* checkedRun(services, frozen.binding, frozen.runID)
  if (currentRun.commit !== run.commit || currentRun.attempt !== run.attempt)
    return yield* C.fail(binding, "source_conflict", "Deployment run changed during native approval preflight")
  const resource = pending.items[0]
  const metadata = yield* C.guard(binding, () => C.decode(binding, Schema.Struct({ resourceVersion: Schema.String }), resource.data, true))
  if (frozen.intent.expected?.resourceVersion !== undefined && frozen.intent.expected.resourceVersion !== metadata.resourceVersion)
    return yield* C.fail(binding, "source_conflict", "Native deployment review state changed after admission")
  if (frozen.binding.provider.kind === "github") {
    const context = yield* C.guard(binding, () => C.decode(binding, Pending, resource.data, true))
    if (!context.current_user_can_approve) return yield* C.fail(binding, "permission_denied", "GitHub pending deployment metadata denies this reviewer")
    const id = Number(context.environment.id)
    if (!Number.isSafeInteger(id)) return yield* C.fail(binding, "source_unresolved", "GitHub pending environment ID cannot be represented safely")
    yield* C.send(services, frozen.binding, { method: "POST", path: `${root}/actions/runs/${frozen.runID}/pending_deployments`,
      body: { environment_ids: [id], state: frozen.input.decision === "Approve" ? "approved" : "rejected", comment: frozen.input.comment } }, [200])
    return { acknowledgement: { runID: frozen.runID, resourceID: frozen.name } }
  }
  const context = yield* C.guard(binding, () => C.decode(binding, Schema.Struct({ deploymentID: C.Text }), resource.data, true))
  const response = yield* C.get(services, frozen.binding, { method: "GET", path: `${root}/deployments/${context.deploymentID}` })
  const deployment = yield* C.guard(binding, () => C.decode(binding, Deployment, response.data, true))
  if (String(deployment.id) !== context.deploymentID || deployment.environment.name !== frozen.name ||
      String(deployment.deployable?.pipeline.id) !== frozen.runID || deployment.sha !== run.commit || deployment.status !== "blocked")
    return yield* C.fail(binding, "source_conflict", "Native GitLab deployment ownership or approval state changed")
  if (JSON.stringify(deployment) !== metadata.resourceVersion)
    return yield* C.fail(binding, "source_conflict", "Native GitLab deployment approval rules changed during preflight")
  if (!deployment.approval_summary && deployment.pending_approval_count === undefined)
    return yield* C.fail(binding, "capability_unavailable", "GitLab deployment response did not establish native approval capability")
  if (deployment.pending_approval_count !== undefined && deployment.pending_approval_count <= 0)
    return yield* C.fail(binding, "capability_unavailable", "GitLab deployment no longer needs approval; manual execution remains separate")
  yield* C.send(services, frozen.binding, { method: "POST", path: `${root}/deployments/${context.deploymentID}/approval`,
    body: { status: frozen.input.decision === "Approve" ? "approved" : "rejected", comment: frozen.input.comment } }, [200, 201])
  return { acknowledgement: { runID: frozen.runID, resourceID: frozen.name } }
})

const checkedRun = Effect.fn("ActionsEnvironments.reviewRun")(function* (services: ActionsConfigCommon.Services, binding: Actions.Binding, runID: string) {
  if (!/^[1-9]\d*$/.test(runID)) return yield* C.fail(binding, "invalid_input", "Deployment review requires a native decimal run ID")
  const run = yield* services.reader.run(binding, runID).pipe(Effect.mapError((error) => C.fail(binding, error.kind, `Deployment run read failed (${error.kind})`)))
  if (run.id !== runID || run.bindingID !== binding.id || run.repositoryID !== binding.projectID)
    return yield* C.fail(binding, "binding_stale", "Reader did not prove deployment run project ownership")
  if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(run.commit))
    return yield* C.fail(binding, "source_unresolved", "Reader did not prove a native deployment source commit")
  return run
})
~~~~

## AUT2-C24

```json
{"block_id":"AUT2-C24","type":"literal_source_excerpt","request_namespace":"J1 canonical groups; J2 mapping in index","requests":["RE-AUT2-03"],"body_anchors":["A27"],"requested_subject":"Policy/retention local versus configurações remotas e limites de edição","source_category":"owned_population_source","path":"packages/core/src/actions/resources/policy.ts","archive":"sources/packages/core/src/actions/resources/policy.ts","commit":"1cde2ff7a71bcf7aecb5d030917b577165135d38","source_git_blob_sha":"17cfdc17b154c76d935cd8e99d8ea2e07f71c68b","source_sha256":"c0e90e28da9148e24a6fc56df68566122215d9ba6d1b47f6222fc4b079b425e2","source_bytes":7481}
```

```json
{"first_line":1,"last_line":85,"bytes":7481,"sha256":"c0e90e28da9148e24a6fc56df68566122215d9ba6d1b47f6222fc4b079b425e2"}
```

~~~~typescript
export * as ActionsPolicy from "./policy"

import { Actions } from "@orchestra/schema/actions"
import { Effect, Schema } from "effect"
import { ActionsContract } from "../contract"
import { ActionsConfigCommon } from "./config-common"

const C = ActionsConfigCommon
const Permissions = Schema.Struct({ enabled: Schema.Boolean,
  allowed_actions: Schema.optionalKey(Schema.Literals(["all", "local_only", "selected"])) })
const Selected = Schema.Struct({ github_owned_allowed: Schema.Boolean, verified_allowed: Schema.Boolean, patterns_allowed: Schema.Array(Schema.String) })
const GitLabSettings = Schema.Struct({ id: C.ID,
  keep_latest_artifact: Schema.optionalKey(Schema.Boolean), build_timeout: Schema.optionalKey(Schema.Int),
  auto_cancel_pending_pipelines: Schema.optionalKey(Schema.String),
  builds_access_level: Schema.optionalKey(Schema.String), ci_config_path: Schema.optionalKey(Schema.NullOr(Schema.String)),
  ci_pipeline_variables_minimum_override_role: Schema.optionalKey(Schema.String),
  allow_pipeline_trigger_approve_deployment: Schema.optionalKey(Schema.Boolean),
})
const Form = Schema.Struct({ provider: C.Provider,
  retention: Schema.optionalKey(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 3650 }))),
  policy: Schema.optionalKey(Schema.Literals(["Project default", "Restricted to approved actions"])) })

export function make(services: ActionsConfigCommon.Services): ActionsContract.ResourceDomain {
  return {
    list: Effect.fn("ActionsPolicy.list")(function* (binding: Actions.Binding, input: Actions.ResourceListInput) {
      yield* C.guard(binding, () => {
        const frozen = C.selection(binding, input, "policy", ["resourceID", "scope"])
        if (frozen.cursor !== undefined || frozen.limit !== undefined || (frozen.resourceID !== undefined && frozen.resourceID !== "project-settings") ||
            (frozen.scope !== undefined && frozen.scope !== (binding.provider.kind === "github" ? "Repository" : "Project")))
          throw C.fail(binding, "invalid_input", "Project settings are one native project policy snapshot")
      })
      const project = yield* C.project(services, binding)
      const scope = binding.provider.kind === "github" ? "Repository" : "Project"
      if (binding.provider.kind === "gitlab") return yield* C.guard(binding, () => {
        const native = C.decode(binding, GitLabSettings, project.response.data, true)
        return { items: [{ id: "project-settings", name: "Project settings", bindingID: binding.id, kind: "policy" as const, scope, owner: "Project",
          data: { nativeIdentity: C.identity(binding, "project-settings", scope), nativeSettings: native, resourceVersion: JSON.stringify(native),
            retention: { state: "source_unresolved", source: "Instance default and CI artifacts:expire_in", writable: false },
            policy: { state: "unavailable", reason: "GitLab has no GitHub approved-actions execution policy" },
            localPolicySource: "Actions binding policy store", inherited: { writable: false, scope: "Instance / group / CI configuration" } } }], capturedAt: Date.now() }
      })
      const response = yield* C.get(services, binding, { method: "GET", path: `${project.path}/actions/permissions` })
      const native = yield* C.guard(binding, () => C.decode(binding, Permissions, response.data, true))
      const selection = native.allowed_actions === "selected" ? yield* C.get(services, binding,
        { method: "GET", path: `${project.path}/actions/permissions/selected-actions` }) : undefined
      const selected = selection ? yield* C.guard(binding, () => C.decode(binding, Selected, selection.data, true)) : undefined
      const metadata = { ...native, ...(selected === undefined ? {} : { selectedActions: selected }) }
      return { items: [{ id: "project-settings", name: "Project settings", bindingID: binding.id, kind: "policy" as const, scope, owner: "Project",
        data: { nativeIdentity: C.identity(binding, "project-settings", scope), nativeSettings: metadata, resourceVersion: JSON.stringify(metadata),
          ...(native.allowed_actions === "all" ? { policy: "Project default" } : native.allowed_actions === "selected" ? { policy: "Restricted to approved actions" }
            : { policy: { state: "source_unresolved", reason: "Native allowed_actions is not one of the mock policy options" } }),
          retention: { state: "source_unresolved", source: "Provider artifact/log default and workflow retention-days", writable: false },
          localPolicySource: "Actions binding policy store", inherited: { writable: false, scope: "Organization / enterprise" } } }], capturedAt: Date.now() }
    }),
    perform: Effect.fn("ActionsPolicy.perform")(function* (binding: Actions.Binding, intent: Actions.OperationIntent, payload: ActionsContract.Json) {
      const frozen = yield* C.guard(binding, () => {
        const capture = C.capture(binding, intent, "policy")
        const input = C.decode(binding, Form, structuredClone(payload))
        if (input.provider !== binding.provider.kind || intent.target.resourceID !== "project-settings" ||
            intent.target.scope !== (binding.provider.kind === "github" ? "Repository" : "Project") || intent.kind !== "resource.update")
          throw C.fail(binding, "intent_conflict", "Project policy mutation does not match the admitted settings identity")
        if (input.retention !== undefined) throw C.fail(binding, "capability_unavailable",
          "Field 'retention' must update the Actions binding policy store; repository PATCH and GitLab project settings do not represent artifact retention days")
        if (input.policy === undefined) throw C.fail(binding, "invalid_input", "Project policy mutation has no supported field")
        if (binding.provider.kind === "gitlab") throw C.fail(binding, "capability_unavailable",
          "Field 'policy' has no GitLab approved-actions equivalent; local execution policy belongs to the Actions binding policy store")
        return { ...capture, input }
      })
      const project = yield* C.project(services, frozen.binding, true, true)
      const path = `${project.path}/actions/permissions`
      const response = yield* C.get(services, frozen.binding, { method: "GET", path })
      const native = yield* C.guard(binding, () => C.decode(binding, Permissions, response.data, true))
      const selectedResponse = native.allowed_actions === "selected" || frozen.input.policy === "Restricted to approved actions"
        ? yield* C.get(services, frozen.binding, { method: "GET", path: `${path}/selected-actions` }) : undefined
      const selected = selectedResponse ? yield* C.guard(binding, () => C.decode(binding, Selected, selectedResponse.data, true)) : undefined
      if (frozen.input.policy === "Restricted to approved actions" && !selected)
        return yield* C.fail(binding, "source_unresolved", "Native selected-actions policy did not establish the existing approved action set")
      yield* C.guard(binding, () => C.version(frozen.binding, frozen.intent.expected, response,
        { ...native, ...(native.allowed_actions === "selected" && selected ? { selectedActions: selected } : {}) }))
      yield* C.send(services, frozen.binding, { method: "PUT", path, body: { enabled: native.enabled,
        allowed_actions: frozen.input.policy === "Restricted to approved actions" ? "selected" : "all" } }, [204])
      return { acknowledgement: { resourceID: "project-settings" } }
    }),
  }
}
~~~~

## AUT2-C25

```json
{"block_id":"AUT2-C25","type":"literal_source_excerpt","request_namespace":"J1 canonical groups; J2 mapping in index","requests":["RE-AUT2-04"],"body_anchors":["A28"],"requested_subject":"GH inventário/correspondência/delete; GL namespace/future jobs e versão do projeto","source_category":"owned_population_source","path":"packages/core/src/actions/resources/caches.ts","archive":"sources/packages/core/src/actions/resources/caches.ts","commit":"1cde2ff7a71bcf7aecb5d030917b577165135d38","source_git_blob_sha":"d272111f079a5a22c09fde175c43c132e8048cca","source_sha256":"1cf002b729c4043e352d60d02a81f0aacd58d58b971bba16f834a2ab6be6b95b","source_bytes":13087}
```

```json
{"first_line":1,"last_line":152,"bytes":13087,"sha256":"1cf002b729c4043e352d60d02a81f0aacd58d58b971bba16f834a2ab6be6b95b"}
```

~~~~typescript
export * as ActionsCaches from "./caches"

import { Actions } from "@orchestra/schema/actions"
import { Effect, Schema } from "effect"
import { ActionsContract } from "../contract"
import { GitHubNative } from "../github/native"
import { ActionsGitLabNative } from "../gitlab/native"
import { ActionsResourceNative } from "./native"
import { ActionsResourceGraphQL } from "./gitlab-graphql"

const Cache = Schema.Struct({ id: GitHubNative.ID, key: Schema.NonEmptyString, ref: Schema.NonEmptyString,
  version: Schema.NonEmptyString, size_in_bytes: GitHubNative.Count, created_at: GitHubNative.Time, last_accessed_at: GitHubNative.Time })
const Caches = Schema.Struct({ total_count: GitHubNative.Count, actions_caches: Schema.Array(Cache) })
const Usage = Schema.Struct({ full_name: Schema.NonEmptyString, active_caches_size_in_bytes: GitHubNative.Count, active_caches_count: GitHubNative.Count })
const Delete = Schema.Struct({ provider: Schema.Literal("github"), name: Schema.optionalKey(Schema.NonEmptyString), ref: Schema.optionalKey(Schema.NonEmptyString) })
const Clear = Schema.Struct({ data: Schema.Struct({ runnerCacheClear: Schema.NullOr(Schema.Struct({ errors: Schema.Array(Schema.String) })) }),
  errors: Schema.optionalKey(Schema.Array(Schema.Json)) })
type Services = ActionsResourceNative.Services & { readonly graphql?: ActionsResourceGraphQL.Request }

export function make(services: Services): ActionsContract.ResourceDomain {
  return {
    list: Effect.fn("ActionsCaches.list")(function* (binding: Actions.Binding, input: Actions.ResourceListInput) {
      const frozen = yield* ActionsResourceNative.checked(binding, () => ActionsResourceNative.selection(binding, input, "caches",
        binding.provider.kind === "github" ? ["resourceID", "ref", "query", "cursor", "limit"] : []))
      const current = frozen.binding
      if (current.provider.kind === "gitlab") {
        const project = yield* ActionsGitLabNative.make(services.transport).project(current)
        return { items: [{ id: current.projectID, bindingID: current.id, kind: "caches" as const, name: "Project runner caches",
          scope: ActionsResourceNative.scope(current), data: { nativeID: current.projectID, projectID: current.projectID,
            scope: "Every cache key in this project", storage: "Runner or external object storage", inventory: "native_unavailable",
            projectWide: true, existingBlobsRetained: true, futureJobsOnly: true, resourceVersion: projectVersion(project) } }], total: 1, capturedAt: Date.now() }
      }
      const repo = yield* GitHubNative.repository(services.transport, current)
      const selected = yield* ActionsResourceNative.checked(current, () => {
        if (frozen.input.resourceID !== undefined) ActionsResourceNative.id(current, frozen.input.resourceID)
        if (frozen.input.ref !== undefined) cacheRef(current, frozen.input.ref)
        return GitHubNative.selection(current, "github.caches", { ...(frozen.input.query === undefined ? {} : { key: frozen.input.query }),
          ...(frozen.input.ref === undefined ? {} : { ref: frozen.input.ref }) }, frozen.input.cursor, frozen.input.limit)
      })
      const query = { page: selected.page, per_page: selected.per_page, ...(frozen.input.query === undefined ? {} : { key: frozen.input.query }),
        ...(frozen.input.ref === undefined ? {} : { ref: frozen.input.ref }) }
      const response = yield* ActionsResourceNative.get(services, current, `${repo.path}/actions/caches`, query)
      const measured = yield* usage(services, current)
      return yield* ActionsResourceNative.checked(current, () => {
        const native = ActionsResourceNative.decode(current, Caches, response.data)
        if (frozen.input.resourceID !== undefined && !native.actions_caches.some((cache) => String(cache.id) === frozen.input.resourceID))
          throw ActionsResourceNative.error(current, "not_found", "Cache ID was not in this native key/ref page; select its exact key/ref cursor")
        return { items: native.actions_caches.filter((cache) => frozen.input.resourceID === undefined || String(cache.id) === frozen.input.resourceID)
          .map((cache): Actions.Resource => ({ id: String(cache.id), bindingID: current.id, kind: "caches", name: cache.key,
            scope: ActionsResourceNative.scope(current), data: { nativeID: String(cache.id), key: cache.key, ref: cache.ref,
              size: cache.size_in_bytes, sizeInBytes: cache.size_in_bytes, createdAt: cache.created_at, lastAccessedAt: cache.last_accessed_at,
              age: cache.last_accessed_at, version: cache.version, resourceVersion: cacheVersion(cache), usage: measured } })),
          ...GitHubNative.pagination(current, response, { method: "GET", path: `${repo.path}/actions/caches`, query }, selected, native.actions_caches.length, native.total_count) }
      })
    }),
    perform: Effect.fn("ActionsCaches.perform")(function* (binding: Actions.Binding, intent: Actions.OperationIntent, payload: ActionsContract.Json) {
      const frozen = yield* ActionsResourceNative.checked(binding, () => ActionsResourceNative.capture(binding, intent, payload, "caches", ["resource.delete", "cache.clear"]))
      const current = frozen.binding
      const admitted = frozen.intent
      const authority = yield* ActionsResourceNative.authority(services, current, current.provider.kind === "gitlab" ? 30 : 40)
      yield* ActionsResourceNative.source(services, current, admitted)
      if (current.provider.kind === "gitlab") {
        yield* ActionsResourceNative.checked(current, () => {
          const input = ActionsResourceNative.input(current, ActionsResourceNative.ProviderOnly, frozen.payload)
          if (input.provider !== "gitlab" || admitted.kind !== "cache.clear" || admitted.target.resourceID !== undefined && admitted.target.resourceID !== current.projectID)
            throw ActionsResourceNative.error(current, "invalid_input", "GitLab cache invalidation requires cache.clear at whole-project scope")
        })
        const project = yield* ActionsResourceNative.before(current, ActionsGitLabNative.make(services.transport).project(current))
        yield* ActionsResourceNative.checked(current, () => ActionsResourceNative.requireVersion(current, admitted, projectVersion(project)))
        if (!services.graphql) return yield* ActionsResourceNative.error(current, "capability_unavailable", "GitLab cache clear requires bound /api/graphql transport; /api/v4/graphql is not a native endpoint")
        const response = yield* services.graphql(current, { kind: "cacheClear" }).pipe(Effect.mapError((cause) =>
          ActionsResourceNative.error(current, cause.disposition === "definitely_unsent" || cause.disposition === "definitely_rejected" ? cause.kind : "outcome_unknown",
            "GitLab cache-clear request failed", cause.disposition ?? "unknown")))
        return yield* ActionsResourceNative.after(current, ActionsResourceNative.checked(current, () => {
          const native = ActionsResourceNative.decode(current, Clear, response.data, true)
          if (response.status !== 200 || native.errors?.length || !native.data.runnerCacheClear || native.data.runnerCacheClear.errors.length)
            throw ActionsResourceNative.error(current, "outcome_unknown", "GitLab did not acknowledge project cache namespace invalidation", "unknown")
          return { acknowledgement: { resourceID: current.projectID } }
        }))
      }
      const input = yield* ActionsResourceNative.checked(current, () => {
        const value = ActionsResourceNative.input(current, Delete, frozen.payload)
        if (!admitted.target.resourceID && !value.name) throw ActionsResourceNative.error(current, "invalid_input", "GitHub cache deletion requires a native ID or exact cache key")
        if (value.ref !== undefined) cacheRef(current, value.ref)
        if (value.ref !== admitted.target.ref)
          throw ActionsResourceNative.error(current, "invalid_input", "Cache execute ref differs from the admitted exact ref")
        if (!admitted.target.resourceID && admitted.expected?.resourceVersion !== undefined)
          throw ActionsResourceNative.error(current, "invalid_input", "Cache resourceVersion binds one native cache ID; key-wide deletion requires explicit native IDs")
        if (admitted.target.resourceID !== undefined) ActionsResourceNative.id(current, admitted.target.resourceID)
        return value
      })
      // GitHub has no cache-ID GET. Bounded exact-key/ref inventory proves ID mapping;
      // a full/partial page can never be mistaken for complete key-wide preflight.
      const response = yield* ActionsResourceNative.get(services, current, `${authority.root}/actions/caches`, {
        per_page: 100, page: 1, ...(input.name === undefined ? {} : { key: input.name }), ...(input.ref === undefined ? {} : { ref: input.ref }),
      })
      const native = yield* ActionsResourceNative.checked(current, () => ActionsResourceNative.decode(current, Caches, response.data))
      const cache = yield* ActionsResourceNative.checked(current, () => {
        const exact = native.actions_caches.filter((cache) => (input.name === undefined || cache.key === input.name) && (input.ref === undefined || cache.ref === input.ref))
        if (admitted.target.resourceID !== undefined) {
          const cache = exact.find((cache) => String(cache.id) === admitted.target.resourceID)
          if (!cache) throw ActionsResourceNative.error(current, native.total_count > native.actions_caches.length ? "metadata_truncated" : "not_found",
            "Native cache ID was not proved for this key/ref; provide its exact native key/ref selection")
          ActionsResourceNative.requireVersion(current, admitted, cacheVersion(cache))
          return cache
        }
        if (native.total_count > native.actions_caches.length) throw ActionsResourceNative.error(current, "metadata_truncated", "Key-wide cache deletion requires complete bounded native key/ref inventory; select individual IDs")
        if (!exact.length) throw ActionsResourceNative.error(current, "not_found", "No native cache matched the exact cache key/ref")
        return undefined
      })
      if (cache) {
        yield* ActionsResourceNative.send(services, current, { method: "DELETE", path: `${authority.root}/actions/caches/${cache.id}` }, [204])
        return { acknowledgement: { resourceID: String(cache.id) } }
      }
      const written = yield* ActionsResourceNative.send(services, current, { method: "DELETE", path: `${authority.root}/actions/caches`,
        query: { key: input.name ?? "", ...(input.ref === undefined ? {} : { ref: input.ref }) } }, [200])
      yield* ActionsResourceNative.after(current, ActionsResourceNative.checked(current, () => {
        const deleted = ActionsResourceNative.decode(current, Caches, written.data, true)
        if (!deleted.actions_caches.length || deleted.actions_caches.some((cache) => cache.key !== input.name || input.ref !== undefined && cache.ref !== input.ref))
          throw ActionsResourceNative.error(current, "outcome_unknown", "Cache-key deletion response did not prove the exact admitted key/ref", "unknown")
      }))
      return { acknowledgement: { unattributed: true } }
    }),
  }
}

export const usage = Effect.fn("ActionsCaches.usage")(function* (services: ActionsResourceNative.Services, binding: Actions.Binding) {
  if (binding.provider.kind !== "github") return yield* ActionsResourceNative.error(binding, "capability_unavailable", "GitLab project API does not expose per-key cache storage usage")
  const repo = yield* GitHubNative.repository(services.transport, binding)
  const response = yield* ActionsResourceNative.get(services, binding, `${repo.path}/actions/cache/usage`)
  return yield* ActionsResourceNative.checked(binding, () => {
    const native = ActionsResourceNative.decode(binding, Usage, response.data)
    if (native.full_name !== repo.native.full_name) throw ActionsResourceNative.error(binding, "binding_stale", "Cache usage identity differs from the immutable repository lookup")
    return { sizeInBytes: native.active_caches_size_in_bytes, count: native.active_caches_count, refresh: "approximately_five_minutes", capturedAt: Date.now() }
  })
})

function cacheRef(binding: Actions.Binding, ref: string) {
  GitHubNative.ref(binding, ref)
  if (!/^refs\/(?:heads\/.+|pull\/[1-9]\d*\/merge)$/.test(ref))
    throw ActionsResourceNative.error(binding, "invalid_input", "Cache ref must be an exact native refs/heads/... or refs/pull/.../merge value")
}

function cacheVersion(cache: typeof Cache.Type) {
  return ActionsResourceNative.version({ id: String(cache.id), key: cache.key, ref: cache.ref, version: cache.version,
    createdAt: cache.created_at, sizeInBytes: cache.size_in_bytes })
}

function projectVersion(project: typeof ActionsGitLabNative.Project.Type) {
  return ActionsResourceNative.version({ projectID: String(project.id), archived: project.archived ?? null,
    jobsEnabled: project.jobs_enabled ?? null, buildsAccessLevel: project.builds_access_level ?? null })
}
~~~~

## AUT2-C26

```json
{"block_id":"AUT2-C26","type":"literal_source_excerpt","request_namespace":"J1 canonical groups; J2 mapping in index","requests":["RE-AUT2-04"],"body_anchors":["A28","A29"],"requested_subject":"Seam allowlisted GraphQL, cacheClear e ownerProject nativos","source_category":"owned_population_source","path":"packages/core/src/actions/resources/gitlab-graphql.ts","archive":"sources/packages/core/src/actions/resources/gitlab-graphql.ts","commit":"1cde2ff7a71bcf7aecb5d030917b577165135d38","source_git_blob_sha":"08a1072c00be8d3ce858fbe6b57772f96afd2f78","source_sha256":"d29a849b8ae2fe1e8eb08ee947f8275bcee8b62e8c4a006d45f738e69758fb2c","source_bytes":6809}
```

```json
{"first_line":1,"last_line":96,"bytes":6809,"sha256":"d29a849b8ae2fe1e8eb08ee947f8275bcee8b62e8c4a006d45f738e69758fb2c"}
```

~~~~typescript
export * as ActionsResourceGraphQL from "./gitlab-graphql"

import { request } from "node:https"
import { checkServerIdentity } from "node:tls"
import { Actions } from "@orchestra/schema/actions"
import { Effect, Option, Schema } from "effect"
import { AppProcess } from "../../process"
import { ActionsContract } from "../contract"
import { ActionsError } from "../error"
import { ActionsCredentials } from "../transport/credentials"
import { ActionsHttp } from "../transport/http"
import { ActionsResponse } from "../transport/response"
import { ActionsResourceNative } from "./native"

export type Command = { readonly kind: "runner"; readonly id: string } | { readonly kind: "cacheClear" }
export type Request = (binding: Actions.Binding, command: Command) => Effect.Effect<ActionsContract.Response, ActionsError>

// REST W1 deliberately binds /api/v4. This separate seam binds /api/graphql,
// keeps the same qualified CLI/TLS snapshot, and exposes only mock-required calls.
export function make(directory: string, proc: AppProcess.Interface): Request {
  return Effect.fn("ActionsResources.gitlabGraphQL")(function* (admitted: Actions.Binding, input: Command) {
    const binding = yield* ActionsResourceNative.checked(admitted, () => ActionsResourceNative.input(admitted, Schema.fromJsonString(Actions.Binding), JSON.stringify(admitted)))
    const command = yield* ActionsResourceNative.checked(binding, () => ActionsResourceNative.input(binding, Schema.Union([
      Schema.Struct({ kind: Schema.Literal("runner"), id: Schema.NonEmptyString }), Schema.Struct({ kind: Schema.Literal("cacheClear") }),
    ]), input))
    const target = yield* ActionsResourceNative.checked(binding, () => {
      const provider = structuredClone(binding.provider)
      const host = URL.parse(`https://${provider.hostname}`)
      if (provider.kind !== "gitlab" || !host || host.host !== provider.hostname || host.pathname !== "/" || host.username || host.password || host.search || host.hash ||
        ![host.origin, `${host.origin}/api/v4`].includes(provider.apiOrigin))
        throw ActionsResourceNative.error(binding, "host_mismatch", "GitLab GraphQL requires the exact bound canonical HTTPS host")
      const project = ActionsResourceNative.id(binding, binding.projectID)
      return { provider, url: `${host.origin}/api/graphql`, body: command.kind === "runner" ? {
        query: "query OrchestraRunnerOwner($id: CiRunnerID!) { runner(id: $id) { id runnerType ownerProject { id } tagList } }",
        variables: { id: `gid://gitlab/Ci::Runner/${ActionsResourceNative.id(binding, command.id)}` },
      } : {
        query: "mutation OrchestraClearRunnerCache($projectId: ProjectID!) { runnerCacheClear(input: { projectId: $projectId }) { errors } }",
        variables: { projectId: `gid://gitlab/Project/${project}` },
      } }
    })
    const snapshot = yield* ActionsCredentials.read(proc, directory, target.provider)
    if (command.kind === "cacheClear") {
      if (!binding.account) return yield* ActionsResourceNative.error(binding, "binding_stale", "Cache clear requires a verified bound actor")
      const actor = yield* ActionsHttp.metadata(target.provider, snapshot, { method: "GET", path: "user" }).pipe(
        Effect.mapError((cause) => ActionsResourceNative.error(binding, cause.kind, "GitLab cache-clear actor preflight failed")),
      )
      const user = Schema.decodeUnknownOption(Schema.Struct({ username: Schema.NonEmptyString }))(actor.data)
      if (actor.status !== 200 || Option.isNone(user) || user.value.username !== binding.account)
        return yield* ActionsResourceNative.error(binding, "binding_stale", "GitLab cache-clear actor differs from the binding")
    }
    const response = yield* Effect.tryPromise({
      try: (signal) => new Promise<{ status: number; headers: Record<string, string>; bytes: Buffer }>((resolve, reject) => {
        const state = { phase: "handshake" as "handshake" | "http_possible", size: 0, chunks: [] as Buffer[] }
        const req = request(target.url, {
          method: "POST", agent: false, rejectUnauthorized: true, minVersion: "TLSv1.2", signal,
          ca: snapshot.ca, cert: snapshot.cert, key: snapshot.key,
          checkServerIdentity: (hostname, certificate) => {
            const error = checkServerIdentity(hostname, certificate)
            if (!error) state.phase = "http_possible"
            return error
          },
          headers: { ...snapshot.headers, "Content-Type": "application/json", Connection: "close" },
        })
        const fail = (cause: ActionsError) => { reject(cause); req.destroy() }
        const deadline = setTimeout(() => fail(ActionsResourceNative.error(binding, "outcome_unknown", "GitLab GraphQL deadline exceeded", "unknown")), 30_000)
        req.once("close", () => clearTimeout(deadline))
        req.once("error", (cause) => { clearTimeout(deadline); reject(ActionsHttp.requestError(target.provider, cause, state.phase)) })
        req.once("socket", (socket) => socket.once("secureConnect", () => { state.phase = "http_possible" }))
        req.once("response", (incoming) => {
          state.phase = "http_possible"
          incoming.once("aborted", () => fail(ActionsResourceNative.error(binding, "outcome_unknown", "GitLab GraphQL response ended prematurely", "unknown")))
          incoming.once("error", () => fail(ActionsResourceNative.error(binding, "outcome_unknown", "GitLab GraphQL response failed", "unknown")))
          incoming.on("data", (chunk: Buffer) => {
            state.size += chunk.length
            if (state.size > 2 * 1024 * 1024) {
              incoming.destroy()
              fail(ActionsResourceNative.error(binding, "metadata_truncated", "GitLab GraphQL metadata capture limit exceeded", "unknown"))
              return
            }
            state.chunks.push(chunk)
          })
          incoming.once("end", () => {
            clearTimeout(deadline)
            if (!incoming.complete) { fail(ActionsResourceNative.error(binding, "outcome_unknown", "GitLab GraphQL response was incomplete", "unknown")); return }
            resolve({ status: incoming.statusCode ?? 0, headers: Object.fromEntries(Object.entries(incoming.headers)
              .filter((entry): entry is [string, string | string[]] => entry[1] !== undefined)
              .map(([key, value]) => [key, Array.isArray(value) ? value.join(", ") : value])), bytes: Buffer.concat(state.chunks) })
          })
        })
        req.end(JSON.stringify(target.body))
      }),
      catch: (cause) => cause instanceof ActionsError ? cause : ActionsResourceNative.error(binding, "transport_failed", "GitLab GraphQL request failed", "unknown"),
    })
    return yield* ActionsResponse.http(target.provider, response.status, response.headers, response.bytes)
  })
}
~~~~

## AUT2-C27

```json
{"block_id":"AUT2-C27","type":"literal_source_excerpt","request_namespace":"J1 canonical groups; J2 mapping in index","requests":["RE-AUT2-04"],"body_anchors":["A29"],"requested_subject":"Ownership/labels/JIT/enrollment/assign/update/remove e saída efêmera","source_category":"owned_population_source","path":"packages/core/src/actions/resources/runners.ts","archive":"sources/packages/core/src/actions/resources/runners.ts","commit":"1cde2ff7a71bcf7aecb5d030917b577165135d38","source_git_blob_sha":"5d27a887b6a1890a92d83b0310b3bc624f83bf47","source_sha256":"87a6b7a7a23e4aaa162366761f68282f64190e7a2555cf353f67a22aa3cac0b6","source_bytes":26618}
```

```json
{"first_line":1,"last_line":286,"bytes":26618,"sha256":"87a6b7a7a23e4aaa162366761f68282f64190e7a2555cf353f67a22aa3cac0b6"}
```

~~~~typescript
export * as ActionsRunners from "./runners"

import { Actions } from "@orchestra/schema/actions"
import { Effect, Schema } from "effect"
import { ActionsContract } from "../contract"
import { GitHubNative } from "../github/native"
import { ActionsGitLabNative } from "../gitlab/native"
import { GitLabCommandNative } from "../gitlab/commands/native"
import { ActionsResourceNative } from "./native"
import { ActionsResourceGraphQL } from "./gitlab-graphql"

const Platform = Schema.Literals(["Linux x64", "Linux ARM64", "macOS ARM64", "macOS x64", "Windows x64"])
const Config = Schema.Struct({ provider: Actions.ProviderKind, name: Schema.NonEmptyString,
  labels: Schema.Union([Schema.NonEmptyString, Schema.Array(Schema.NonEmptyString)]), platform: Platform,
  runnerGroupID: Schema.optionalKey(GitHubNative.Positive) })
const Token = Schema.Struct({ provider: Schema.Literal("github"), enrollment: Schema.Literal("token") })
const GitHubLabel = Schema.Struct({ name: Schema.NonEmptyString, type: Schema.Literals(["read-only", "custom"]) })
const GitHubRunner = Schema.Struct({ id: GitHubNative.ID, name: Schema.NonEmptyString, os: Schema.String,
  status: Schema.NonEmptyString, busy: Schema.Boolean, labels: Schema.Array(GitHubLabel) })
const GitHubList = Schema.Struct({ total_count: GitHubNative.Count, runners: Schema.Array(GitHubRunner) })
const GitLabRunner = Schema.Struct({ id: ActionsGitLabNative.ID, description: Schema.NullOr(Schema.String),
  runner_type: Schema.Literals(["project_type", "group_type", "instance_type"]), status: Schema.NonEmptyString,
  paused: Schema.Boolean, job_execution_status: Schema.optionalKey(Schema.NullOr(Schema.String)),
  tag_list: Schema.optionalKey(Schema.Array(Schema.String)), locked: Schema.optionalKey(Schema.Boolean),
  projects: Schema.optionalKey(Schema.Array(Schema.Struct({ id: ActionsGitLabNative.ID }))) })
const Owner = Schema.Struct({ data: Schema.Struct({ runner: Schema.NullOr(Schema.Struct({ id: Schema.NonEmptyString,
  runnerType: Schema.Literals(["PROJECT_TYPE", "GROUP_TYPE", "INSTANCE_TYPE"]),
  ownerProject: Schema.NullOr(Schema.Struct({ id: Schema.NonEmptyString })), tagList: Schema.NullOr(Schema.Array(Schema.String)) })) }),
  errors: Schema.optionalKey(Schema.Array(Schema.Json)) })
const platforms = {
  "Linux x64": ["linux", "x64"], "Linux ARM64": ["linux", "ARM64"],
  "macOS ARM64": ["macOS", "ARM64"], "macOS x64": ["macOS", "x64"], "Windows x64": ["windows", "x64"],
} as const
type Services = ActionsResourceNative.Services & { readonly graphql?: ActionsResourceGraphQL.Request }

export function make(services: Services): ActionsContract.ResourceDomain {
  return {
    list: Effect.fn("ActionsRunners.list")(function* (binding: Actions.Binding, input: Actions.ResourceListInput) {
      const frozen = yield* ActionsResourceNative.checked(binding, () => ActionsResourceNative.selection(binding, input, "runners", ["resourceID", "query", "cursor", "limit"]))
      const current = frozen.binding
      const selected = yield* ActionsResourceNative.checked(current, () => {
        if (current.provider.kind === "gitlab" && frozen.input.query !== undefined)
          throw ActionsResourceNative.error(current, "invalid_input", "GitLab project runner API has no native name-search filter")
        if (frozen.input.resourceID !== undefined) ActionsResourceNative.id(current, frozen.input.resourceID)
        return GitHubNative.selection(current, `${current.provider.kind}.runners`,
          { ...(frozen.input.query === undefined ? {} : { name: frozen.input.query }) }, frozen.input.cursor, frozen.input.limit)
      })
      if (current.provider.kind === "github") {
        const repo = yield* GitHubNative.repository(services.transport, current)
        const root = `${repo.path}/actions/runners`
        if (frozen.input.resourceID !== undefined) {
          const response = yield* ActionsResourceNative.get(services, current, `${root}/${frozen.input.resourceID}`)
          const runner = yield* ActionsResourceNative.checked(current, () => github(current, ActionsResourceNative.decode(current, GitHubRunner, response.data), frozen.input.resourceID, repo.native.permissions?.admin !== false))
          return { items: [runner], capturedAt: Date.now(), total: 1 }
        }
        const request = { method: "GET", path: root, query: { page: selected.page, per_page: selected.per_page,
          ...(frozen.input.query === undefined ? {} : { name: frozen.input.query }) } } as const
        const response = yield* ActionsResourceNative.get(services, current, root, request.query)
        return yield* ActionsResourceNative.checked(current, () => {
          const native = ActionsResourceNative.decode(current, GitHubList, response.data)
          return { items: native.runners.map((runner) => github(current, runner, undefined, repo.native.permissions?.admin !== false)),
            ...GitHubNative.pagination(current, response, request, selected, native.runners.length, native.total_count) }
        })
      }
      yield* ActionsGitLabNative.make(services.transport).project(current)
      const response = yield* ActionsResourceNative.get(services, current, `projects/${current.projectID}/runners`, { page: selected.page, per_page: selected.per_page })
      const runners = yield* ActionsResourceNative.checked(current, () => ActionsResourceNative.decode(current, Schema.Array(GitLabRunner), response.data))
      // Only project-visible IDs may enter detail/ownership reads. Never enumerate /runners or /runners/all.
      const items = yield* Effect.forEach(runners.filter((runner) => frozen.input.resourceID === undefined || String(runner.id) === frozen.input.resourceID),
        (runner) => gitlab(services, current, runner), { concurrency: 4 })
      if (frozen.input.resourceID !== undefined && items.length === 0)
        return yield* ActionsResourceNative.error(current, "not_found", "Runner was not present in the selected native project page; select its exact project cursor")
      return { items, capturedAt: Date.now(), ...yield* ActionsResourceNative.checked(current, () =>
        ActionsResourceNative.pagination(current, response, selected, runners.length)) }
    }),
    perform: Effect.fn("ActionsRunners.perform")(function* (binding: Actions.Binding, intent: Actions.OperationIntent, payload: ActionsContract.Json) {
      const frozen = yield* ActionsResourceNative.checked(binding, () => ActionsResourceNative.capture(binding, intent, payload, "runners",
        ["resource.create", "resource.update", "resource.delete", "runner.register", "runner.assign", "runner.remove"]))
      const current = frozen.binding
      const admitted = frozen.intent
      const create = admitted.kind === "resource.create" || admitted.kind === "runner.register"
      const config = yield* ActionsResourceNative.checked(current, () => {
        const value = admitted.kind === "runner.register" && Schema.is(Token)(frozen.payload)
          ? ActionsResourceNative.input(current, Token, frozen.payload)
          : create || admitted.kind === "resource.update" ? ActionsResourceNative.input(current, Config, frozen.payload)
            : ActionsResourceNative.input(current, ActionsResourceNative.ProviderOnly, frozen.payload)
        if (value.provider !== current.provider.kind) throw ActionsResourceNative.error(current, "invalid_input", "Runner payload belongs to another provider")
        if (!create && admitted.target.resourceID === undefined) throw ActionsResourceNative.error(current, "invalid_input", "Runner mutation requires an admitted native runner ID")
        if (create && (admitted.target.resourceID !== undefined || admitted.expected?.resourceVersion !== undefined))
          throw ActionsResourceNative.error(current, "invalid_input", "New runner enrollment has no existing runner ID or resource version")
        if (Schema.is(Config)(value) && current.provider.kind === "gitlab" && value.runnerGroupID !== undefined)
          throw ActionsResourceNative.error(current, "invalid_input", "GitLab project runners do not accept a GitHub runner group")
        return value
      })
      const authority = yield* ActionsResourceNative.authority(services, current)
      if (current.provider.kind === "github") yield* ActionsResourceNative.checked(current, () => {
        if (authority.runnerAdmin === false)
          throw ActionsResourceNative.error(current, "permission_denied", "Observed repository role denies runner administration")
        const scopes = authority.headers["x-oauth-scopes"]?.split(",").map((scope) => scope.trim()).filter(Boolean)
        if (scopes?.length && !scopes.includes("repo"))
          throw ActionsResourceNative.error(current, "permission_denied", "Observed classic OAuth token lacks repo scope required for runner administration")
      })
      yield* ActionsResourceNative.source(services, current, admitted)
      if (create) {
        if (Schema.is(Token)(config)) {
          const response = yield* ActionsResourceNative.send(services, current, { method: "POST", path: `${authority.root}/actions/runners/registration-token` }, [201])
          return yield* ActionsResourceNative.after(current, ActionsResourceNative.checked(current, () => {
            const native = ActionsResourceNative.decode(current, Schema.Struct({ token: Schema.NonEmptyString, expires_at: GitHubNative.Time }), response.data, true)
            return { acknowledgement: { unattributed: true }, output: Actions.CommandOutput.make({ kind: "runnerToken", token: native.token, expiresAt: native.expires_at }) }
          }))
        }
        if (!Schema.is(Config)(config)) return yield* ActionsResourceNative.error(current, "invalid_input", "Runner enrollment requires name, labels and platform")
        const labels = yield* ActionsResourceNative.checked(current, () => routing(current, config.labels, config.platform))
        if (current.provider.kind === "github") {
          if (config.runnerGroupID === undefined) return yield* ActionsResourceNative.error(current, "invalid_input", "GitHub JIT enrollment requires an explicit native runnerGroupID; no group ID is guessed")
          const response = yield* ActionsResourceNative.send(services, current, { method: "POST", path: `${authority.root}/actions/runners/generate-jitconfig`,
            body: { name: config.name, runner_group_id: config.runnerGroupID, labels } }, [201])
          return yield* ActionsResourceNative.after(current, ActionsResourceNative.checked(current, () => {
            const native = ActionsResourceNative.decode(current, Schema.Struct({ runner: Schema.Struct({ id: GitHubNative.ID, name: Schema.NonEmptyString,
              labels: Schema.Array(GitHubLabel), runner_group_id: Schema.optionalKey(GitHubNative.Positive) }), encoded_jit_config: Schema.NonEmptyString }), response.data, true)
            if (native.runner.name !== config.name || native.runner.runner_group_id !== undefined && native.runner.runner_group_id !== config.runnerGroupID ||
              labels.some((label) => !native.runner.labels.some((item) => item.name.toLowerCase() === label.toLowerCase())))
              throw ActionsResourceNative.error(current, "outcome_unknown", "JIT configuration did not acknowledge the requested runner identity", "unknown")
            return { acknowledgement: { resourceID: String(native.runner.id) }, output: Actions.CommandOutput.make({ kind: "runnerJit",
              runnerID: String(native.runner.id), encodedConfiguration: native.encoded_jit_config }) }
          }))
        }
        const observation = yield* ActionsResourceNative.before(current, ActionsGitLabNative.make(services.transport).metadata(current))
        yield* ActionsResourceNative.checked(current, () => ActionsGitLabNative.requireVersion(current, observation, [16, 0], "user-linked runner enrollment"))
        const response = yield* ActionsResourceNative.send(services, current, { method: "POST", path: "user/runners",
          body: { runner_type: "project_type", project_id: current.projectID, description: config.name, tag_list: labels, locked: true, run_untagged: false } }, [201])
        return yield* ActionsResourceNative.after(current, ActionsResourceNative.checked(current, () => {
          const native = ActionsResourceNative.decode(current, Schema.Struct({ id: ActionsGitLabNative.ID, token: Schema.NonEmptyString,
            token_expires_at: Schema.optionalKey(Schema.NullOr(Schema.String)) }), response.data, true)
          return { acknowledgement: { resourceID: String(native.id) }, output: Actions.CommandOutput.make({ kind: "runnerToken", runnerID: String(native.id),
            token: native.token, ...(native.token_expires_at ? { expiresAt: native.token_expires_at } : {}) }) }
        }))
      }
      const runnerID = yield* ActionsResourceNative.checked(current, () => ActionsResourceNative.id(current, admitted.target.resourceID ?? ""))
      if (current.provider.kind === "github") {
        if (admitted.kind === "runner.assign") return yield* ActionsResourceNative.error(current, "capability_unavailable", "GitHub has no repository runner-assignment operation; enroll a repository runner")
        const response = yield* ActionsResourceNative.get(services, current, `${authority.root}/actions/runners/${runnerID}`)
        const native = yield* ActionsResourceNative.checked(current, () => ActionsResourceNative.decode(current, GitHubRunner, response.data))
        yield* ActionsResourceNative.checked(current, () => ActionsResourceNative.requireVersion(current, admitted, versionGithub(native)))
        if (String(native.id) !== runnerID) return yield* ActionsResourceNative.error(current, "binding_stale", "Native repository runner ID differs from admission")
        if (admitted.kind !== "resource.update") {
          yield* ActionsResourceNative.send(services, current, { method: "DELETE", path: `${authority.root}/actions/runners/${runnerID}` }, [204])
          return { acknowledgement: { resourceID: runnerID } }
        }
        if (!Schema.is(Config)(config)) return yield* ActionsResourceNative.error(current, "invalid_input", "Runner label editing requires name, labels and platform")
        const labels = yield* ActionsResourceNative.checked(current, () => {
          if (config.name !== native.name || config.runnerGroupID !== undefined)
            throw ActionsResourceNative.error(current, "capability_unavailable", "GitHub repository API edits labels only; runner renaming/group changes require native re-enrollment")
          const requested = routing(current, config.labels, config.platform)
          const readonly = native.labels.filter((label) => label.type === "read-only").map((label) => label.name.toLowerCase())
          const observed = platform(native.labels.map((label) => label.name))
          if (observed !== config.platform || readonly.some((label) => !requested.some((item) => item.toLowerCase() === label)))
            throw ActionsResourceNative.error(current, "capability_unavailable", "Platform/read-only labels describe the installed runner and cannot be changed by label editing")
          return requested.filter((label) => !readonly.includes(label.toLowerCase()))
        })
        const written = yield* ActionsResourceNative.send(services, current, { method: "PUT", path: `${authority.root}/actions/runners/${runnerID}/labels`, body: { labels } }, [200])
        yield* ActionsResourceNative.after(current, ActionsResourceNative.checked(current, () => {
          const data = ActionsResourceNative.decode(current, Schema.Struct({ labels: Schema.Array(GitHubLabel) }), written.data, true)
          const custom = data.labels.filter((label) => label.type === "custom").map((label) => label.name.toLowerCase()).sort()
          if (JSON.stringify(custom) !== JSON.stringify(labels.map((label) => label.toLowerCase()).sort()))
            throw ActionsResourceNative.error(current, "outcome_unknown", "Native runner labels did not acknowledge the requested routing", "unknown")
        }))
        return { acknowledgement: { resourceID: runnerID } }
      }
      const response = yield* ActionsResourceNative.get(services, current, `runners/${runnerID}`)
      const native = yield* ActionsResourceNative.checked(current, () => ActionsResourceNative.decode(current, GitLabRunner, response.data))
      const owner = yield* ownership(services, current, native)
      yield* ActionsResourceNative.checked(current, () => {
        if (String(native.id) !== runnerID || native.runner_type !== "project_type" || !owner.projectID ||
          admitted.kind !== "runner.assign" && owner.projectID !== current.projectID)
          throw ActionsResourceNative.error(current, "permission_denied", "Inherited or externally owned runners are read-only in this project")
        ActionsResourceNative.requireVersion(current, admitted, versionGitlab(native, owner))
      })
      if (admitted.kind === "runner.assign") {
        const owned = yield* ActionsResourceNative.get(services, current, `projects/${owner.projectID}`)
        yield* ActionsResourceNative.checked(current, () => {
          const project = ActionsResourceNative.decode(current, GitLabCommandNative.Project, owned.data)
          if (String(project.id) !== owner.projectID) throw ActionsResourceNative.error(current, "binding_stale", "Runner owner project identity changed during assignment preflight")
          GitLabCommandNative.role(current, project, 40)
          if (native.locked === true && owner.projectID !== current.projectID)
            throw ActionsResourceNative.error(current, "permission_denied", "Locked runner cannot be assigned outside its owning project")
        })
        const written = yield* ActionsResourceNative.send(services, current, { method: "POST", path: `${authority.root}/runners`, body: { runner_id: runnerID } }, [201])
        yield* ActionsResourceNative.after(current, ActionsResourceNative.checked(current, () => {
          if (String(ActionsResourceNative.decode(current, GitLabRunner, written.data, true).id) !== runnerID)
            throw ActionsResourceNative.error(current, "outcome_unknown", "Runner assignment response did not prove its exact native ID", "unknown")
        }))
        return { acknowledgement: { resourceID: runnerID } }
      }
      if (!native.projects?.some((project) => String(project.id) === current.projectID))
        return yield* ActionsResourceNative.error(current, "binding_stale", "Runner is not currently assigned to the bound native project")
      if (admitted.kind !== "resource.update") {
        if (native.projects.length !== 1) return yield* ActionsResourceNative.error(current, "permission_denied", "Deleting this runner would affect other projects; remove their assignments in the owning native scope first")
        yield* ActionsResourceNative.send(services, current, { method: "DELETE", path: `runners/${runnerID}` }, [204])
        return { acknowledgement: { resourceID: runnerID } }
      }
      if (!Schema.is(Config)(config)) return yield* ActionsResourceNative.error(current, "invalid_input", "Runner configuration requires name, labels and platform")
      const labels = yield* ActionsResourceNative.checked(current, () => routing(current, config.labels, config.platform))
      const written = yield* ActionsResourceNative.send(services, current, { method: "PUT", path: `runners/${runnerID}`, body: { description: config.name, tag_list: labels } }, [200])
      yield* ActionsResourceNative.after(current, ActionsResourceNative.checked(current, () => {
        const data = ActionsResourceNative.decode(current, GitLabRunner, written.data, true)
        if (String(data.id) !== runnerID || data.description !== config.name || JSON.stringify(data.tag_list?.slice().sort()) !== JSON.stringify(labels.slice().sort()))
          throw ActionsResourceNative.error(current, "outcome_unknown", "Native runner configuration did not acknowledge requested fields", "unknown")
      }))
      return { acknowledgement: { resourceID: runnerID } }
    }),
  }
}

function routing(binding: Actions.Binding, labels: string | readonly string[], selected: typeof Platform.Type) {
  const supplied = typeof labels === "string" ? labels.split(",").map((item) => item.trim()) : labels.slice()
  if (supplied.some((label) => !label || label.length > 255 || /[\x00-\x1f\x7f]/.test(label)) || supplied.length > 100)
    throw ActionsResourceNative.error(binding, "invalid_input", "Runner routing requires bounded nonempty labels/tags")
  const reserved = ["linux", "macos", "windows", "x64", "arm64", "self-hosted"]
  const result = [...(binding.provider.kind === "github" ? ["self-hosted"] : []), ...platforms[selected],
    ...supplied.filter((label) => !reserved.includes(label.toLowerCase()))]
  const unique = Array.from(new Map(result.map((label) => [label.toLowerCase(), label])).values())
  if (unique.length > 100) throw ActionsResourceNative.error(binding, "invalid_input", "Runner routing exceeds native label/tag limit")
  return unique
}

function platform(labels: readonly string[]) {
  const normalized = labels.map((label) => label.toLowerCase())
  return Object.entries(platforms).find((entry) => entry[1].every((label) => normalized.includes(label.toLowerCase())))?.[0]
}

function versionGithub(runner: typeof GitHubRunner.Type) {
  return ActionsResourceNative.version({ id: String(runner.id), name: runner.name, os: runner.os,
    status: runner.status, busy: runner.busy,
    labels: runner.labels.map((label) => ({ name: label.name, type: label.type })).sort((left, right) => left.name.localeCompare(right.name)) })
}

function github(binding: Actions.Binding, runner: typeof GitHubRunner.Type, requested?: string, writable = true): Actions.Resource {
  if (requested !== undefined && String(runner.id) !== requested) throw ActionsResourceNative.error(binding, "binding_stale", "Repository runner identity changed")
  // Native repository-scoped runner endpoint proves registration ownership. Label names prove no ownership.
  return { id: String(runner.id), bindingID: binding.id, kind: "runners", name: runner.name, scope: ActionsResourceNative.scope(binding),
    status: runner.busy ? "Busy" : runner.status === "online" ? "Online" : runner.status,
    data: { nativeID: String(runner.id), labels: runner.labels.map((label) => label.name), os: runner.os,
      state: runner.busy ? "Busy" : runner.status === "online" ? "Online" : runner.status,
      ...(platform(runner.labels.map((label) => label.name)) ? { platform: platform(runner.labels.map((label) => label.name)) ?? "" } : {}),
      origin: "Project runner", inherited: false, editable: writable, removable: writable, platformKind: "routing", resourceVersion: versionGithub(runner) } }
}

const ownership = Effect.fn("ActionsRunners.gitlabOwnership")(function* (services: Services, binding: Actions.Binding, runner: typeof GitLabRunner.Type) {
  if (runner.runner_type !== "project_type") return { projectID: undefined, labels: runner.tag_list ?? [] }
  if (!services.graphql) return yield* ActionsResourceNative.error(binding, "capability_unavailable", "GitLab runner ownership requires the bound /api/graphql seam; REST assignments do not prove owner project")
  const response = yield* ActionsResourceNative.before(binding, services.graphql(binding, { kind: "runner", id: String(runner.id) }))
  return yield* ActionsResourceNative.checked(binding, () => {
    const native = ActionsResourceNative.decode(binding, Owner, response.data)
    if (response.status !== 200 || native.errors?.length || !native.data.runner || native.data.runner.id !== `gid://gitlab/Ci::Runner/${runner.id}` || native.data.runner.runnerType !== "PROJECT_TYPE")
      throw ActionsResourceNative.error(binding, "capability_unavailable", "GitLab did not prove this project runner's native ownership")
    const owner = native.data.runner.ownerProject?.id
    if (!owner || !/^gid:\/\/gitlab\/Project\/[1-9]\d*$/.test(owner))
      throw ActionsResourceNative.error(binding, "capability_unavailable", "GitLab runner owner project is not visible to the current actor")
    return { projectID: owner.split("/").at(-1), labels: native.data.runner.tagList ?? [] }
  })
})

function versionGitlab(runner: typeof GitLabRunner.Type, owner: { projectID?: string; labels: readonly string[] }) {
  return ActionsResourceNative.version({ id: String(runner.id), name: runner.description, type: runner.runner_type,
    status: runner.status, paused: runner.paused, jobExecutionStatus: runner.job_execution_status ?? null,
    ownerProjectID: owner.projectID ?? null, labels: owner.labels.slice().sort(), locked: runner.locked ?? null,
    projects: runner.projects?.map((project) => String(project.id)).sort() ?? [] })
}

const gitlab = Effect.fn("ActionsRunners.gitlabResource")(function* (services: Services, binding: Actions.Binding, runner: typeof GitLabRunner.Type): Effect.fn.Return<Actions.Resource, import("../error").ActionsError> {
  const response = yield* ActionsResourceNative.get(services, binding, `runners/${runner.id}`)
  const detail = yield* ActionsResourceNative.checked(binding, () => ActionsResourceNative.decode(binding, GitLabRunner, response.data))
  if (String(detail.id) !== String(runner.id) || detail.runner_type !== runner.runner_type)
    return yield* ActionsResourceNative.error(binding, "binding_stale", "Native project runner detail changed identity/type")
  const owner = yield* ownership(services, binding, detail)
  const inherited = detail.runner_type !== "project_type" || owner.projectID !== binding.projectID
  return { id: String(detail.id), bindingID: binding.id, kind: "runners", name: detail.description ?? "", scope: ActionsResourceNative.scope(binding),
    status: detail.paused ? "Paused" : detail.job_execution_status === "active" ? "Busy" : detail.status === "online" ? "Online" : detail.status,
    data: { nativeID: String(detail.id), labels: owner.labels, runnerType: detail.runner_type, paused: detail.paused,
      state: detail.paused ? "Paused" : detail.job_execution_status === "active" ? "Busy" : detail.status === "online" ? "Online" : detail.status,
      ...(platform(owner.labels) ? { platform: platform(owner.labels) ?? "" } : {}),
      origin: detail.runner_type === "instance_type" ? "Inherited instance runner" : detail.runner_type === "group_type" ? "Inherited group runner"
        : inherited ? "Inherited project runner" : "Project runner", inherited, editable: !inherited, removable: !inherited,
      ownerProjectID: owner.projectID ?? null, platformKind: "routing", resourceVersion: versionGitlab(detail, owner) } }
})
~~~~

## AUT2-C28

```json
{"block_id":"AUT2-C28","type":"literal_source_excerpt","request_namespace":"J1 canonical groups; J2 mapping in index","requests":["RE-AUT2-04"],"body_anchors":["A30","A31"],"requested_subject":"Owners/take-ownership/play, inputs/variables em fases e source.write GH; editores em AUT1-C28/C29","source_category":"owned_population_source","path":"packages/core/src/actions/resources/schedules.ts","archive":"sources/packages/core/src/actions/resources/schedules.ts","commit":"1cde2ff7a71bcf7aecb5d030917b577165135d38","source_git_blob_sha":"700bc3658ebb06113d9027f740ff16d1e5f69cea","source_sha256":"e5664133d84a54b2187f6ba5b61d4d564579d7a58e6ed5801cc437f5454cc4ab","source_bytes":31805}
```

```json
{"first_line":1,"last_line":335,"bytes":31805,"sha256":"e5664133d84a54b2187f6ba5b61d4d564579d7a58e6ed5801cc437f5454cc4ab"}
```

~~~~typescript
export * as ActionsSchedules from "./schedules"

import { Actions } from "@orchestra/schema/actions"
import { Effect, Schema } from "effect"
import { ActionsContract } from "../contract"
import { GitHubNative } from "../github/native"
import { ActionsGitLabNative } from "../gitlab/native"
import { GitLabCommandInputs } from "../gitlab/commands/inputs"
import { GitLabCommandNative } from "../gitlab/commands/native"
import { ActionsResponse } from "../transport/response"
import { ActionsResourceNative } from "./native"
import { ActionsScheduleYaml } from "./schedule-yaml"

const Value = Schema.Union([Schema.String, Schema.Number, Schema.Boolean, Schema.Array(Schema.Json)])
const Variable = Schema.Struct({ key: Schema.NonEmptyString, value: Schema.String,
  variable_type: Schema.optionalKey(Schema.Literals(["env_var", "file"])) })
const Form = Schema.Struct({ provider: Actions.ProviderKind, name: Schema.NonEmptyString, cron: Schema.NonEmptyString,
  zone: Schema.NonEmptyString, ref: Schema.NonEmptyString, input: Schema.optionalKey(Schema.String),
  inputMode: Schema.optionalKey(Schema.Literals(["input", "variable"])), inputs: Schema.optionalKey(Schema.Record(Schema.String, Value)),
  variables: Schema.optionalKey(Schema.Array(Variable)), enabled: Schema.optionalKey(Schema.Boolean) })
const Toggle = Schema.Struct({ provider: Schema.Literal("gitlab"), enabled: Schema.Boolean })
const Schedule = Schema.Struct({ id: ActionsGitLabNative.ID, description: Schema.String, ref: Schema.NonEmptyString,
  cron: Schema.NonEmptyString, cron_timezone: Schema.NonEmptyString, active: Schema.Boolean,
  updated_at: Schema.NonEmptyString, next_run_at: Schema.optionalKey(Schema.NullOr(Schema.String)),
  owner: Schema.Struct({ id: ActionsGitLabNative.ID, username: Schema.NonEmptyString }),
  variables: Schema.optionalKey(Schema.Array(Schema.Struct({ key: Schema.NonEmptyString, variable_type: Schema.Literals(["env_var", "file"]) }))),
  inputs: Schema.optionalKey(Schema.Array(Schema.Struct({ name: Schema.NonEmptyString, value: Value }))) })
const Workflow = Schema.Struct({ id: GitHubNative.ID, path: Schema.NonEmptyString, name: Schema.NonEmptyString, state: Schema.NonEmptyString })

export type Publish = (binding: Actions.Binding, intent: Actions.OperationIntent, source: Actions.Source, text: string) => Effect.Effect<ActionsContract.CommandResult, import("../error").ActionsError>
type Services = ActionsResourceNative.Services & { readonly publish?: Publish }

export function make(services: Services): ActionsContract.ResourceDomain {
  return {
    list: Effect.fn("ActionsSchedules.list")(function* (binding: Actions.Binding, input: Actions.ResourceListInput) {
      const frozen = yield* ActionsResourceNative.checked(binding, () => ActionsResourceNative.selection(binding, input, "schedules", ["resourceID", "cursor", "limit"]))
      const current = frozen.binding
      if (current.provider.kind === "github") return yield* githubList(services, current, frozen.input)
      yield* ActionsGitLabNative.make(services.transport).project(current)
      const selected = yield* ActionsResourceNative.checked(current, () => GitHubNative.selection(current, "gitlab.schedules", {}, frozen.input.cursor, frozen.input.limit))
      const root = `projects/${current.projectID}/pipeline_schedules`
      if (frozen.input.resourceID !== undefined) {
        const id = yield* ActionsResourceNative.checked(current, () => ActionsResourceNative.id(current, frozen.input.resourceID ?? ""))
        const response = yield* ActionsResourceNative.get(services, current, `${root}/${id}`)
        const native = yield* ActionsResourceNative.checked(current, () => ActionsResourceNative.decode(current, Schedule, response.data))
        if (String(native.id) !== id) return yield* ActionsResourceNative.error(current, "binding_stale", "Native schedule ID differs from the requested project schedule")
        return { items: [resource(current, native)], total: 1, capturedAt: Date.now() }
      }
      const response = yield* ActionsResourceNative.get(services, current, root, { page: selected.page, per_page: selected.per_page })
      return yield* ActionsResourceNative.checked(current, () => {
        const native = ActionsResourceNative.decode(current, Schema.Array(Schedule), response.data)
        return { items: native.map((item) => resource(current, item)), capturedAt: Date.now(), ...ActionsResourceNative.pagination(current, response, selected, native.length) }
      })
    }),
    perform: Effect.fn("ActionsSchedules.perform")(function* (binding: Actions.Binding, intent: Actions.OperationIntent, payload: ActionsContract.Json) {
      const frozen = yield* ActionsResourceNative.checked(binding, () => ActionsResourceNative.capture(binding, intent, payload, "schedules",
        ["resource.create", "resource.update", "resource.delete", "schedule.play", "schedule.takeOwnership"], ["workflowID"]))
      const current = frozen.binding
      const admitted = frozen.intent
      if (current.provider.kind === "github") return yield* githubEdit(services, current, admitted, frozen.payload)
      if (admitted.target.workflowID !== undefined && admitted.target.workflowID !== ActionsGitLabNative.workflowID(current))
        return yield* ActionsResourceNative.error(current, "invalid_input", "Schedule workflow does not identify the bound project CI configuration")
      const input = yield* ActionsResourceNative.checked(current, () => {
        const value = admitted.kind === "resource.create" ? ActionsResourceNative.input(current, Form, frozen.payload)
          : admitted.kind === "resource.update" ? ActionsResourceNative.input(current, Schema.Union([Form, Toggle]), frozen.payload)
            : ActionsResourceNative.input(current, ActionsResourceNative.ProviderOnly, frozen.payload)
        if (value.provider !== "gitlab") throw ActionsResourceNative.error(current, "invalid_input", "Schedule payload belongs to another provider")
        if (admitted.kind === "resource.create" && (admitted.target.resourceID !== undefined || admitted.expected?.resourceVersion !== undefined))
          throw ActionsResourceNative.error(current, "invalid_input", "New project schedules have no existing resource ID/version")
        if (admitted.kind !== "resource.create" && admitted.target.resourceID === undefined)
          throw ActionsResourceNative.error(current, "invalid_input", "Schedule mutation requires an admitted native schedule ID")
        if (Schema.is(Form)(value)) {
          if (value.ref !== admitted.target.ref)
            throw ActionsResourceNative.error(current, "invalid_input", "Schedule execute ref differs from admission")
          ActionsScheduleYaml.cron(current, value.cron)
          GitHubNative.ref(current, value.ref)
          if (value.zone.length > 255 || /[\x00-\x1f\x7f]/.test(value.zone))
            throw ActionsResourceNative.error(current, "invalid_input", "Schedule timezone must be a bounded native timezone name")
        }
        return value
      })
      const form = Schema.is(Form)(input) ? input : undefined
      const authority = yield* ActionsResourceNative.authority(services, current, admitted.kind === "schedule.takeOwnership" ? 40 : 30)
      const selectedSource = yield* ActionsResourceNative.source(services, current, admitted)
      const id = admitted.target.resourceID
      const native = id === undefined ? undefined : yield* getSchedule(services, current, id)
      if (native) yield* ActionsResourceNative.checked(current, () => {
        ActionsResourceNative.requireVersion(current, admitted, version(native))
        if (admitted.kind === "resource.update" && native.owner.username !== current.account)
          throw ActionsResourceNative.error(current, "permission_denied", "Schedule editing requires its current owner; take ownership before editing")
        if (admitted.kind === "resource.delete" && native.owner.username !== current.account && (authority.level ?? 0) < 40)
          throw ActionsResourceNative.error(current, "permission_denied", "Deleting another actor's schedule requires the native Maintainer role")
        if (!form && admitted.target.ref !== undefined && !sameRef(native.ref, admitted.target.ref))
          throw ActionsResourceNative.error(current, "source_conflict", "Native schedule ref differs from the admitted execution ref")
      })
      const overrides = form ? yield* ActionsResourceNative.checked(current, () => formOverrides(current, form)) : undefined
      if (overrides?.variables?.length) yield* ActionsResourceNative.checked(current, () => {
        if (!authority.project) throw ActionsResourceNative.error(current, "capability_unavailable", "Schedule variable policy was not observed")
        GitLabCommandNative.variables(current, authority.project, authority.level ?? 0, true)
      })
      if (overrides?.inputs !== undefined) {
        const observation = yield* ActionsResourceNative.before(current, ActionsGitLabNative.make(services.transport).metadata(current))
        yield* ActionsResourceNative.checked(current, () => ActionsGitLabNative.requireVersion(current, observation, [18, 1], "schedule inputs"))
        const project = yield* ActionsResourceNative.before(current, ActionsGitLabNative.make(services.transport).project(current))
        const path = ActionsGitLabNative.configPath(project)
        if (!path || !ActionsGitLabNative.localPath(path)) return yield* ActionsResourceNative.error(current, "source_unresolved", "Schedule inputs require an authoritative local CI spec header")
        if (!selectedSource || admitted.target.path !== undefined && admitted.target.path !== path)
          return yield* ActionsResourceNative.error(current, "source_unresolved", "Schedule inputs require the captured native CI path/ref/commit")
        const source = yield* ActionsResourceNative.before(current, services.reader.source(current, { path, ref: selectedSource.commit }))
        if (source.bindingID !== current.id || source.path !== path || source.ref !== selectedSource.commit || source.commit !== selectedSource.commit)
          return yield* ActionsResourceNative.error(current, "source_unresolved", "Schedule input declarations were not proved at the admitted source ref")
        yield* ActionsResourceNative.before(current, GitLabCommandInputs.check(current, services.transport, source, overrides.inputs))
      }
      const path = `${authority.root}/pipeline_schedules${id === undefined ? "" : `/${id}`}`
      if (admitted.kind === "schedule.play") {
        const response = yield* ActionsResourceNative.send(services, current, { method: "POST", path: `${path}/play` }, [201])
        yield* ActionsResourceNative.after(current, ActionsResourceNative.checked(current, () => {
          const data = ActionsResourceNative.decode(current, Schema.Struct({ message: Schema.Literal("201 Created") }), response.data, true)
          return data
        }))
        return { acknowledgement: { resourceID: id, unattributed: true } }
      }
      if (admitted.kind === "schedule.takeOwnership") {
        const response = yield* ActionsResourceNative.send(services, current, { method: "POST", path: `${path}/take_ownership` }, [201, 200])
        return yield* ActionsResourceNative.after(current, ActionsResourceNative.checked(current, () => {
          const data = ActionsResourceNative.decode(current, Schedule, response.data, true)
          if (String(data.id) !== id || data.owner.username !== current.account)
            throw ActionsResourceNative.error(current, "outcome_unknown", "Schedule ownership response did not prove the current actor", "unknown")
          return { acknowledgement: { resourceID: String(data.id) } }
        }))
      }
      if (admitted.kind === "resource.delete") {
        yield* ActionsResourceNative.send(services, current, { method: "DELETE", path }, [204])
        return { acknowledgement: { resourceID: id } }
      }
      if (overrides?.inputs !== undefined && native && native.inputs === undefined)
        return yield* ActionsResourceNative.error(current, "capability_unavailable", "Existing schedule input names were not observed; replacement cannot be planned safely")
      const body: ActionsContract.Json | undefined = form ? { description: form.name, cron: form.cron, cron_timezone: form.zone, ref: form.ref,
        ...(form.enabled === undefined ? {} : { active: form.enabled }), ...(overrides?.inputs === undefined ? {} : { inputs: [
          ...Object.entries(overrides.inputs).map(([name, value]) => ({ name, value })),
          ...(native?.inputs ?? []).filter((item) => !Object.hasOwn(overrides.inputs ?? {}, item.name)).map((item) => ({ name: item.name, destroy: true })),
        ] }) }
        : Schema.is(Toggle)(input) ? { active: input.enabled } : undefined
      if (!body) return yield* ActionsResourceNative.error(current, "invalid_input", "Schedule command requires its exact native form")
      if (overrides?.variables && native && native.variables === undefined)
        return yield* ActionsResourceNative.error(current, "capability_unavailable", "Existing schedule variable keys/types were not observed; variable edits cannot be planned safely")
      const response = yield* ActionsResourceNative.send(services, current, { method: id === undefined ? "POST" : "PUT", path, body }, id === undefined ? [201] : [200])
      const written = yield* ActionsResourceNative.after(current, ActionsResourceNative.checked(current, () => {
        const data = ActionsResourceNative.decode(current, Schedule, response.data, true)
        if (id !== undefined && String(data.id) !== id || form &&
          (data.description !== form.name || data.cron !== form.cron || data.cron_timezone !== form.zone || !sameRef(data.ref, form.ref)) ||
          Schema.is(Toggle)(input) && data.active !== input.enabled)
          throw ActionsResourceNative.error(current, "outcome_unknown", "Native schedule did not acknowledge the requested form fields", "unknown")
        if (id === undefined && data.owner.username !== current.account)
          throw ActionsResourceNative.error(current, "outcome_unknown", "New schedule response did not prove current actor ownership", "unknown")
        return data
      }))
      if (overrides?.inputs !== undefined) {
        const observed = written.inputs === undefined ? yield* ActionsResourceNative.after(current, getSchedule(services, current, String(written.id))) : written
        yield* ActionsResourceNative.after(current, ActionsResourceNative.checked(current, () => {
          if (observed.inputs === undefined || !Schema.toEquivalence(Schema.Json)(Object.fromEntries(observed.inputs.map((item) => [item.name, item.value])), overrides.inputs ?? {}))
            throw ActionsResourceNative.error(current, "outcome_unknown", "Native schedule did not acknowledge the requested input values", "unknown")
        }))
      }
      // Variable endpoints are separate writes. Once the schedule write succeeds,
      // any later failure is partial/unknown; never roll back or automatically retry.
      if (overrides?.variables) yield* ActionsResourceNative.after(current, Effect.forEach(overrides.variables, (variable) => Effect.gen(function* () {
        const exists = native?.variables?.some((item) => item.key === variable.key) ?? false
        const variableResponse = yield* ActionsResourceNative.send(services, current, { method: exists ? "PUT" : "POST",
          path: `${authority.root}/pipeline_schedules/${written.id}/variables${exists ? `/${encodeURIComponent(variable.key)}` : ""}`, body: variable }, exists ? [200] : [201])
        yield* ActionsResourceNative.checked(current, () => {
          const data = ActionsResourceNative.decode(current, Variable, variableResponse.data, true)
          if (data.key !== variable.key || data.value !== variable.value || data.variable_type !== (variable.variable_type ?? "env_var"))
            throw ActionsResourceNative.error(current, "outcome_unknown", "Schedule variable response did not acknowledge its exact native key/type/value", "unknown")
        })
      }), { concurrency: 1 }))
      if (overrides?.variables && native?.variables) yield* ActionsResourceNative.after(current, Effect.forEach(
        native.variables.filter((item) => !overrides.variables?.some((variable) => variable.key === item.key)),
        (variable) => Effect.gen(function* () {
          const response = yield* ActionsResourceNative.send(services, current, { method: "DELETE",
            path: `${authority.root}/pipeline_schedules/${written.id}/variables/${encodeURIComponent(variable.key)}` }, [202])
          yield* ActionsResourceNative.checked(current, () => {
            const deleted = ActionsResourceNative.decode(current, Schema.Struct({ key: Schema.NonEmptyString, variable_type: Schema.Literals(["env_var", "file"]) }), response.data, true)
            if (deleted.key !== variable.key || deleted.variable_type !== variable.variable_type)
              throw ActionsResourceNative.error(current, "outcome_unknown", "Schedule variable deletion did not acknowledge its exact native key/type", "unknown")
          })
        }), { concurrency: 1 },
      ))
      return { acknowledgement: { resourceID: String(written.id) } }
    }),
  }
}

function formOverrides(binding: Actions.Binding, input: typeof Form.Type) {
  if ([input.input !== undefined, input.inputs !== undefined, input.variables !== undefined].filter(Boolean).length > 1)
    throw ActionsResourceNative.error(binding, "invalid_input", "Schedule overrides require one unambiguous input/variable representation")
  if (input.inputMode !== undefined && input.input === undefined)
    throw ActionsResourceNative.error(binding, "invalid_input", "Schedule inputMode requires the mock input field")
  const pair = input.input ? /^([A-Za-z_][A-Za-z0-9_]{0,254})=([\s\S]*)$/.exec(input.input) : undefined
  if (input.input && !pair) throw ActionsResourceNative.error(binding, "invalid_input", "Schedule input field requires one exact key=value pair")
  const inputs = input.inputs ?? (input.input !== undefined && input.inputMode === "input" ? pair ? { [pair[1]]: pair[2] } : {} : undefined)
  const variables = input.variables ?? (input.input !== undefined && input.inputMode !== "input" ? pair ? [{ key: pair[1], value: pair[2], variable_type: "env_var" as const }] : [] : undefined)
  if (variables && (new Set(variables.map((item) => item.key)).size !== variables.length || variables.some((item) => !/^[A-Za-z0-9_]{1,255}$/.test(item.key))))
    throw ActionsResourceNative.error(binding, "invalid_input", "Schedule variables require unique bounded native keys")
  if (variables && variables.length > 100 || inputs && Object.keys(inputs).length > 100 || input.input !== undefined && input.input.length > 1024 * 1024)
    throw ActionsResourceNative.error(binding, "invalid_input", "Schedule override configuration exceeds the bounded resource edit limit")
  return { inputs, variables }
}

function sameRef(native: string, selected: string) {
  return native === selected || !selected.startsWith("refs/") && (native === `refs/heads/${selected}` || native === `refs/tags/${selected}`)
}

function version(native: typeof Schedule.Type) {
  return ActionsResourceNative.version({ id: String(native.id), name: native.description, ref: native.ref,
    cron: native.cron, zone: native.cron_timezone, enabled: native.active, ownerID: String(native.owner.id), updatedAt: native.updated_at })
}

function resource(binding: Actions.Binding, native: typeof Schedule.Type): Actions.Resource {
  return { id: String(native.id), bindingID: binding.id, kind: "schedules", name: native.description, scope: ActionsResourceNative.scope(binding), owner: native.owner.username,
    status: native.active ? "Active" : "Paused", data: { nativeID: String(native.id), cron: native.cron, zone: native.cron_timezone, ref: native.ref,
      enabled: native.active, actor: native.owner.username, ownerID: String(native.owner.id), currentActor: binding.account ?? null,
      ownedByCurrentActor: native.owner.username === binding.account, editable: native.owner.username === binding.account,
      nextRunAt: native.next_run_at ?? null, resourceVersion: version(native), inputValuesRedacted: true,
      inputNames: native.inputs?.map((item) => item.name) ?? [], variableKeys: native.variables?.map((item) => ({ key: item.key, type: item.variable_type })) ?? [] } }
}

const getSchedule = Effect.fn("ActionsSchedules.get")(function* (services: Services, binding: Actions.Binding, id: string) {
  yield* ActionsResourceNative.checked(binding, () => ActionsResourceNative.id(binding, id))
  const response = yield* ActionsResourceNative.get(services, binding, `projects/${binding.projectID}/pipeline_schedules/${id}`)
  const native = yield* ActionsResourceNative.checked(binding, () => ActionsResourceNative.decode(binding, Schedule, response.data))
  if (String(native.id) !== id) return yield* ActionsResourceNative.error(binding, "binding_stale", "Native project schedule ID differs from admission")
  return native
})

const githubList = Effect.fn("ActionsSchedules.githubList")(function* (services: Services, binding: Actions.Binding, input: Actions.ResourceListInput) {
  const repo = yield* GitHubNative.repository(services.transport, binding)
  if (!repo.native.default_branch) return yield* ActionsResourceNative.error(binding, "source_unresolved", "GitHub schedule listing requires the observed native default branch")
  const response = yield* ActionsResourceNative.get(services, binding, `${repo.path}/commits/${encodeURIComponent(repo.native.default_branch)}`)
  const commit = yield* ActionsResourceNative.checked(binding, () => ActionsResourceNative.decode(binding, Schema.Struct({ sha: GitHubNative.SHA }), response.data).sha)
  const page = yield* ActionsResourceNative.before(binding, services.reader.workflows(binding, { ...(input.cursor === undefined ? {} : { cursor: input.cursor }), limit: input.limit ?? 20 }))
  const files = page.items.length === 0 ? new Set<string>() : yield* workflowFiles(services, binding, repo.path, commit)
  const selected = page.items.filter((workflow) => (input.resourceID === undefined || workflow.id === input.resourceID) && files.has(workflow.path))
  // One unreadable workflow source must not hide the schedules of the others: it
  // is reported as its own item. Auth, permission, rate-limit and transport
  // failures still fail the page.
  const items = yield* Effect.forEach(selected, (workflow) => Effect.gen(function* () {
    if (workflow.bindingID !== binding.id || !/^\.github\/workflows\/[^/]+\.ya?ml$/.test(workflow.path))
      return yield* ActionsResourceNative.error(binding, "source_unresolved", "Native schedule workflow path/ownership was not proved")
    const source = yield* ActionsResourceNative.before(binding, services.reader.source(binding, { path: workflow.path, ref: commit }))
    if (source.bindingID !== binding.id || source.path !== workflow.path || source.ref !== commit || source.commit !== commit)
      return yield* ActionsResourceNative.error(binding, "source_unresolved", "Workflow schedule source did not prove the native default-branch commit")
    const schedules = yield* ActionsResourceNative.checked(binding, () => ActionsScheduleYaml.inspect(binding, source.text))
    if (!schedules.length) return undefined
    return { id: workflow.id, bindingID: binding.id, kind: "schedules" as const, name: workflow.name ?? workflow.path,
      scope: ActionsResourceNative.scope(binding), status: workflow.state === "active" ? "Active" : workflow.state,
      data: { nativeID: workflow.id, workflowID: workflow.id, path: workflow.path, sourceVersion: source.version, commit,
        resourceVersion: ActionsResourceNative.version({ workflowID: workflow.id, sourceVersion: source.version, state: workflow.state }),
        cron: schedules.map((item) => item.cron).join(" · "), schedules, zone: "UTC", ref: repo.native.default_branch ?? "",
        enabled: workflow.state === "active", origin: "Workflow YAML", editMode: "source", bestEffort: true } }
  }).pipe(Effect.catchIf((error) => unreadable.includes(error.kind), (error) => Effect.succeed({ id: workflow.id, bindingID: binding.id, kind: "schedules" as const,
    name: workflow.name ?? workflow.path, scope: ActionsResourceNative.scope(binding),
    data: { nativeID: workflow.id, workflowID: workflow.id, path: workflow.path, commit, ref: repo.native.default_branch ?? "", zone: "UTC",
      origin: "Workflow YAML", editMode: "source", bestEffort: true, unreadable: true, problem: error.message, problemKind: error.kind } }))),
  { concurrency: 4 })
  // Cursor advances native workflows, including workflows with no schedules;
  // native workflow totals are not misrepresented as schedule totals.
  return { items: items.filter((item) => item !== undefined), capturedAt: Date.now(), ...(page.next === undefined ? {} : { next: page.next }) }
})

// Failures that describe one workflow source, not the provider connection.
const unreadable: readonly Actions.ErrorKind[] = ["source_unresolved", "source_conflict", "metadata_truncated", "invalid_input", "not_found"]

// The native list keeps workflows whose file left the default branch (deleted
// or branch-only) and GitHub-managed `dynamic/...` workflows. Neither has a
// default-branch YAML schedule and reading their source fails, so only files
// present in `.github/workflows` at the default-branch commit are read.
// https://docs.github.com/en/rest/repos/contents#get-repository-content
const workflowFiles = Effect.fn("ActionsSchedules.workflowFiles")(function* (services: Services, binding: Actions.Binding, repo: string, commit: string) {
  // Keep the transport's rejection evidence: only a definite 404 proves the directory is absent.
  const response = yield* ActionsResourceNative.before(binding, services.transport.request(binding, { method: "GET", path: `${repo}/contents/.github/workflows`, query: { ref: commit } }).pipe(
    Effect.catchIf((cause) => cause.kind === "not_found" && cause.disposition === "definitely_rejected", () => Effect.succeed(undefined)),
  ))
  if (!response || response.status === 404) return new Set<string>()
  if (response.status !== 200) {
    const failure = ActionsResponse.failure(binding.provider, 1, Buffer.alloc(0), response.status, { ...response.headers }, true)
    return yield* ActionsResourceNative.error(binding, failure.kind, "Workflow directory listing was rejected")
  }
  return yield* ActionsResourceNative.checked(binding, () => {
    const entries = ActionsResourceNative.decode(binding, Schema.Array(Schema.Struct({ type: Schema.String, path: Schema.String })), response.data)
    // The contents API stops at 1,000 directory entries without saying so.
    if (entries.length >= 1000) throw ActionsResourceNative.error(binding, "metadata_truncated", "Workflow directory listing reached the native contents limit")
    return new Set(entries.filter((entry) => entry.type === "file").map((entry) => entry.path))
  })
})

const githubEdit = Effect.fn("ActionsSchedules.githubEdit")(function* (services: Services, binding: Actions.Binding, intent: Actions.OperationIntent, payload: ActionsContract.Json) {
  if (!["resource.create", "resource.update", "resource.delete"].includes(intent.kind))
    return yield* ActionsResourceNative.error(binding, "capability_unavailable", "GitHub schedules are workflow YAML; play/ownership controls have no native schedule API")
  const input = yield* ActionsResourceNative.checked(binding, () => intent.kind === "resource.delete"
    ? ActionsResourceNative.input(binding, ActionsResourceNative.ProviderOnly, payload) : ActionsResourceNative.input(binding, Form, payload))
  if (input.provider !== "github") return yield* ActionsResourceNative.error(binding, "invalid_input", "Schedule payload belongs to another provider")
  if (!services.publish) return yield* ActionsResourceNative.error(binding, "capability_unavailable", "GitHub schedule changes require the owning SourcePublisher callback; open Edit YAML")
  const workflowID = yield* ActionsResourceNative.checked(binding, () => ActionsResourceNative.id(binding, intent.target.workflowID ?? intent.target.resourceID ?? ""))
  if (intent.target.resourceID !== undefined && intent.target.resourceID !== workflowID)
    return yield* ActionsResourceNative.error(binding, "invalid_input", "Schedule workflow and resource target identities differ")
  const authority = yield* ActionsResourceNative.authority(services, binding)
  const scopes = authority.headers["x-oauth-scopes"]?.split(",").map((scope) => scope.trim()).filter(Boolean)
  if (scopes?.length && !scopes.includes("workflow"))
    return yield* ActionsResourceNative.error(binding, "permission_denied", "Observed classic OAuth scopes deny publishing workflow-source changes")
  const repo = yield* GitHubNative.repository(services.transport, binding)
  if (!repo.native.default_branch || intent.target.ref !== repo.native.default_branch || !intent.expected?.sourceVersion || !intent.expected.commit)
    return yield* ActionsResourceNative.error(binding, "invalid_input", "GitHub schedule authoring requires captured default-branch ref, sourceVersion and commit")
  const response = yield* ActionsResourceNative.get(services, binding, `${repo.path}/actions/workflows/${workflowID}`)
  const workflow = yield* ActionsResourceNative.checked(binding, () => ActionsResourceNative.decode(binding, Workflow, response.data))
  if (String(workflow.id) !== workflowID || workflow.path !== intent.target.path || !/^\.github\/workflows\/[^/]+\.ya?ml$/.test(workflow.path))
    return yield* ActionsResourceNative.error(binding, "source_conflict", "Captured schedule source path differs from the exact native workflow")
  const source = yield* ActionsResourceNative.before(binding, services.reader.source(binding, { path: workflow.path, ref: intent.target.ref }))
  if (source.bindingID !== binding.id || source.path !== workflow.path || source.ref !== intent.target.ref || source.version !== intent.expected.sourceVersion || source.commit !== intent.expected.commit)
    return yield* ActionsResourceNative.error(binding, "source_conflict", "Workflow schedule source moved after admission")
  const text = yield* ActionsResourceNative.checked(binding, () => {
    ActionsResourceNative.requireVersion(binding, intent, ActionsResourceNative.version({ workflowID, sourceVersion: source.version, state: workflow.state }))
    const existing = ActionsScheduleYaml.inspect(binding, source.text)
    if (intent.kind === "resource.delete") return ActionsScheduleYaml.edit(binding, source.text, [])
    if (!Schema.is(Form)(input)) throw ActionsResourceNative.error(binding, "invalid_input", "Schedule command requires its exact native form")
    if (input.name !== workflow.name || input.zone !== "UTC" || input.ref !== intent.target.ref || input.input || input.inputs !== undefined || input.variables !== undefined || input.inputMode !== undefined || input.enabled !== undefined)
      throw ActionsResourceNative.error(binding, "capability_unavailable", "GitHub cron triggers have no separate name, execution inputs, timezone or pause state; edit workflow YAML explicitly")
    if (intent.kind === "resource.update" && existing.length !== 1)
      throw ActionsResourceNative.error(binding, "invalid_input", "Multiple workflow cron entries require an explicit source-editor edit")
    if (intent.kind === "resource.create" && existing.length)
      throw ActionsResourceNative.error(binding, "source_conflict", "Workflow already contains schedules; edit its existing YAML")
    return ActionsScheduleYaml.edit(binding, source.text, [{ cron: input.cron }])
  })
  return yield* services.publish(binding, intent, source, text)
})
~~~~

## AUT2-C29

```json
{"block_id":"AUT2-C29","type":"literal_source_excerpt","request_namespace":"J1 canonical groups; J2 mapping in index","requests":["RE-AUT2-04","RE-AUT2-06"],"body_anchors":["A35"],"requested_subject":"Inventory GH/GL, ownership, versões e estados de artifact","source_category":"owned_population_source","path":"packages/core/src/actions/output/artifacts.ts","archive":"sources/packages/core/src/actions/output/artifacts.ts","commit":"1cde2ff7a71bcf7aecb5d030917b577165135d38","source_git_blob_sha":"56d6c846172b96e1130b2bf8737712af9e0c5be0","source_sha256":"be26b08a227078ed6c0363be1f47ebdceda0b27a46749ad208d2642ea3ef46a7","source_bytes":5515}
```

```json
{"first_line":1,"last_line":73,"bytes":5515,"sha256":"be26b08a227078ed6c0363be1f47ebdceda0b27a46749ad208d2642ea3ef46a7"}
```

~~~~typescript
export * as OutputArtifacts from "./artifacts"

import { Actions } from "@orchestra/schema/actions"
import { Effect, Schema } from "effect"
import { ActionsContract } from "../contract"
import { ActionsCursor } from "../cursor"
import { ActionsError } from "../error"
import { OutputNative } from "./native"
import { OutputVersion } from "./version"

export const list = Effect.fn("ActionsOutput.artifacts")(function* (
  transport: ActionsContract.Transport, reader: ActionsContract.ReadAdapter, binding: Actions.Binding, input: Actions.ResourceListInput,
): Effect.fn.Return<Actions.ResourcePage, ActionsError> {
  const selected = yield* OutputNative.checked(binding, () => {
    OutputNative.selection(binding, input, Actions.ResourceListInput, ["kind", "runID", "cursor", "limit", "query"])
    if (input.kind !== "artifacts") throw OutputNative.error(binding, "capability_unavailable", "CI output only lists native artifacts")
    if (input.runID !== undefined) OutputNative.id(binding, input.runID)
    if (input.query !== undefined && (binding.provider.kind !== "github" || input.query.length > 1024 || /[\x00-\x1f\x7f]/.test(input.query)))
      throw OutputNative.error(binding, "invalid_input", "Artifact name filtering requires a bounded native GitHub name")
    const limit = ActionsCursor.limit(input.limit)
    const scope = `output:artifacts:${input.runID ?? "project"}`
    const filters = { runID: input.runID, name: input.query, per_page: limit }
    return { limit, scope, filters, page: ActionsCursor.page(binding, scope, filters, input.cursor) }
  })
  const root = yield* OutputNative.project(transport, binding)
  if (input.runID !== undefined) yield* OutputNative.run(reader, binding, input.runID)
  const request: ActionsContract.Request = {
    method: "GET",
    path: binding.provider.kind === "github"
      ? `${root}/actions/${input.runID ? `runs/${input.runID}/` : ""}artifacts`
      : `${root}/${input.runID ? `pipelines/${input.runID}/jobs` : "jobs"}`,
    query: { page: selected.page, per_page: selected.limit,
      ...(input.query === undefined ? {} : { name: input.query }),
      ...(binding.provider.kind === "gitlab" && input.runID ? { include_retried: true } : {}) },
  }
  const response = yield* OutputNative.get(transport, binding, request.path, request.query)
  return yield* OutputNative.checked(binding, () => {
    if (binding.provider.kind === "github") {
      const value = OutputNative.decode(binding, Schema.Struct({ total_count: OutputNative.Count,
        artifacts: Schema.Array(OutputNative.Artifact).check(Schema.isMaxLength(100)) }), response.data)
      const items = value.artifacts.map((artifact) => {
        OutputNative.artifactOwner(binding, artifact, undefined, input.runID)
        // Explicit native allowlist: no archive_download_url, actor tokens or unbounded provider JSON.
        return Actions.Resource.make({ id: String(artifact.id), bindingID: binding.id, kind: "artifacts",
          name: artifact.name, scope: String(artifact.workflow_run.id), status: artifact.expired ? "expired" : "available",
           data: { id: artifact.id, name: artifact.name, resourceVersion: OutputVersion.github(artifact), size_in_bytes: artifact.size_in_bytes, expired: artifact.expired,
            workflow_run: { id: artifact.workflow_run.id, repository_id: artifact.workflow_run.repository_id,
              ...(artifact.workflow_run.head_repository_id === undefined ? {} : { head_repository_id: artifact.workflow_run.head_repository_id }) },
            ...(artifact.digest === undefined ? {} : { digest: artifact.digest }),
            ...(artifact.created_at === undefined ? {} : { created_at: artifact.created_at }),
            ...(artifact.updated_at === undefined ? {} : { updated_at: artifact.updated_at }),
            ...(artifact.expires_at === undefined ? {} : { expires_at: artifact.expires_at }) } })
      })
      return { items, ...OutputNative.pagination(binding, request, selected.scope, selected.filters, response,
        selected.page, items.length, selected.limit, value.total_count) }
    }
    const jobs = OutputNative.decode(binding, Schema.Array(OutputNative.GitLabJob).check(Schema.isMaxLength(100)), response.data)
    const items = jobs.map((job) => {
      OutputNative.gitlabOwner(binding, job, undefined, input.runID)
      // GitLab archive identity IS job ID. Inventory includes erased/expired/no-artifact jobs.
      return Actions.Resource.make({ id: String(job.id), bindingID: binding.id, kind: "artifacts", name: OutputNative.gitlabArchive(job)?.filename ?? job.name,
        scope: String(job.pipeline.id), owner: String(job.id), status: OutputNative.gitlabState(job),
         data: { id: job.id, name: job.name, resourceVersion: OutputVersion.gitlab(job), status: job.status, pipeline: job.pipeline,
          artifacts: job.artifacts.map((artifact) => ({ file_type: artifact.file_type, size: artifact.size, filename: artifact.filename,
            ...(artifact.file_format === undefined ? {} : { file_format: artifact.file_format }) })),
          ...(job.artifacts_file === undefined ? {} : { artifacts_file: job.artifacts_file }),
          ...(job.artifacts_expire_at === undefined ? {} : { artifacts_expire_at: job.artifacts_expire_at }),
          ...(job.erased_at === undefined ? {} : { erased_at: job.erased_at }) } })
    })
    return { items, ...OutputNative.pagination(binding, request, selected.scope, selected.filters, response,
      selected.page, jobs.length, selected.limit) }
  })
})
~~~~

## AUT2-C30

```json
{"block_id":"AUT2-C30","type":"literal_source_excerpt","request_namespace":"J1 canonical groups; J2 mapping in index","requests":["RE-AUT2-04","RE-AUT2-06"],"body_anchors":["A37"],"requested_subject":"Delete/keep completos com target/version/ownership e pós-condição","source_category":"owned_population_source","path":"packages/core/src/actions/output/mutations.ts","archive":"sources/packages/core/src/actions/output/mutations.ts","commit":"1cde2ff7a71bcf7aecb5d030917b577165135d38","source_git_blob_sha":"2d165747ebfc35f05a4c0244fd06134780482b88","source_sha256":"b9151642332518eec3151825cb55bd2b0f65ba275d77e1d107ac29feb3a323e0","source_bytes":4523}
```

```json
{"first_line":1,"last_line":58,"bytes":4523,"sha256":"b9151642332518eec3151825cb55bd2b0f65ba275d77e1d107ac29feb3a323e0"}
```

~~~~typescript
export * as ActionsArtifactCommands from "./mutations"

import { Actions } from "@orchestra/schema/actions"
import { Effect, Schema } from "effect"
import { ActionsContract } from "../contract"
import { ActionsResourceNative } from "../resources/native"
import { OutputNative } from "./native"
import { OutputVersion } from "./version"

const Input = Schema.Struct({ provider: Actions.ProviderKind })

export function make(input: { transport: ActionsContract.Transport; reader: (binding: Actions.Binding) => ActionsContract.ReadAdapter }) {
  return Effect.fn("ActionsArtifacts.perform")(function* (binding: Actions.Binding, intent: Actions.OperationIntent, payload: ActionsContract.Json) {
    const services = { transport: input.transport, reader: input.reader(binding) }
    const id = yield* ActionsResourceNative.checked(binding, () => {
      const decoded = ActionsResourceNative.input(binding, Input, payload)
      if (decoded.provider !== binding.provider.kind || intent.target.resourceKind !== "artifacts" ||
        intent.binding.id !== binding.id || intent.binding.revision !== binding.revision || !intent.target.resourceID ||
        !["resource.delete", "artifact.keep"].includes(intent.kind) || intent.expected?.attempt !== undefined || intent.expected?.commit !== undefined || intent.expected?.sourceVersion !== undefined ||
        Object.keys(intent.target).some((key) => !["resourceKind", "resourceID", "scope", "runID"].includes(key)))
        throw ActionsResourceNative.error(binding, "invalid_input", "Artifact command does not match its native admission")
      return ActionsResourceNative.id(binding, intent.target.resourceID)
    })
    if (binding.provider.kind === "github" && intent.kind === "artifact.keep")
      return yield* ActionsResourceNative.error(binding, "capability_unavailable", "GitHub Actions has no native artifact keep operation")
    const authority = yield* ActionsResourceNative.authority(services, binding, intent.kind === "artifact.keep" ? 30 : 40)
    if (binding.provider.kind === "github") {
      const path = `${authority.root}/actions/artifacts/${id}`
      const response = yield* ActionsResourceNative.get(services, binding, path)
      yield* ActionsResourceNative.before(binding, ActionsResourceNative.checked(binding, () => {
        const native = ActionsResourceNative.decode(binding, OutputNative.Artifact, response.data)
        OutputNative.artifactOwner(binding, native, id, intent.target.runID)
        if (intent.target.scope !== undefined && intent.target.scope !== String(native.workflow_run.id))
          throw ActionsResourceNative.error(binding, "binding_stale", "Artifact scope differs from its admitted native run")
        ActionsResourceNative.requireVersion(binding, intent, OutputVersion.github(native))
      }))
      yield* ActionsResourceNative.send(services, binding, { method: "DELETE", path }, [204])
      return { acknowledgement: { resourceID: id } }
    }
    const job = yield* ActionsResourceNative.get(services, binding, `${authority.root}/jobs/${id}`)
    const native = yield* ActionsResourceNative.before(binding, ActionsResourceNative.checked(binding, () => {
      const native = ActionsResourceNative.decode(binding, OutputNative.GitLabJob, job.data)
      OutputNative.gitlabOwner(binding, native, id, intent.target.runID)
      if (intent.target.scope !== undefined && intent.target.scope !== String(native.pipeline.id))
        throw ActionsResourceNative.error(binding, "binding_stale", "Artifact scope differs from its admitted native pipeline")
      ActionsResourceNative.requireVersion(binding, intent, OutputVersion.gitlab(native))
      return native
    }))
    const response = yield* ActionsResourceNative.send(services, binding, { method: intent.kind === "artifact.keep" ? "POST" : "DELETE",
      path: `${authority.root}/jobs/${id}/artifacts${intent.kind === "artifact.keep" ? "/keep" : ""}` }, intent.kind === "artifact.keep" ? [200] : [204])
    if (intent.kind === "artifact.keep") yield* ActionsResourceNative.after(binding, ActionsResourceNative.checked(binding, () => {
      const kept = ActionsResourceNative.decode(binding, OutputNative.GitLabJob, response.data, true)
      OutputNative.gitlabOwner(binding, kept, id, String(native.pipeline.id))
      if (kept.artifacts_expire_at !== null) throw ActionsResourceNative.error(binding, "outcome_unknown", "Native artifact keep response did not prove removed expiry", "unknown")
    }))
    return { acknowledgement: { resourceID: id } }
  })
}
~~~~

## AUT2-C31

```json
{"block_id":"AUT2-C31","type":"literal_source_excerpt","request_namespace":"J1 canonical groups; J2 mapping in index","requests":["RE-AUT2-04","RE-AUT2-06"],"body_anchors":["A37"],"requested_subject":"Campos selecionados de versão e expiry observada","source_category":"owned_population_source","path":"packages/core/src/actions/output/version.ts","archive":"sources/packages/core/src/actions/output/version.ts","commit":"1cde2ff7a71bcf7aecb5d030917b577165135d38","source_git_blob_sha":"a42fd54db9202bf822a439bb47ce4f216101a8e1","source_sha256":"935301ed0b3e64a03122d40ef4fcf58ef119c5c8b04c04b1f113bcb29163c6b9","source_bytes":1050}
```

```json
{"first_line":1,"last_line":16,"bytes":1050,"sha256":"935301ed0b3e64a03122d40ef4fcf58ef119c5c8b04c04b1f113bcb29163c6b9"}
```

~~~~typescript
export * as OutputVersion from "./version"

import { ActionsResourceNative } from "../resources/native"
import { OutputNative } from "./native"

export function github(value: typeof OutputNative.Artifact.Type) {
  return ActionsResourceNative.version({ id: String(value.id), runID: String(value.workflow_run.id), repositoryID: String(value.workflow_run.repository_id),
    size: value.size_in_bytes, expired: value.expired, digest: value.digest ?? null, createdAt: value.created_at ?? null,
    updatedAt: value.updated_at ?? null, expiryObserved: value.expires_at !== undefined, expiresAt: value.expires_at ?? null })
}

export function gitlab(value: typeof OutputNative.GitLabJob.Type) {
  return ActionsResourceNative.version({ id: String(value.id), runID: String(value.pipeline.id), projectID: String(value.pipeline.project_id),
    archive: value.artifacts_file ?? null, artifacts: value.artifacts, erasedAt: value.erased_at ?? null,
    expiryObserved: value.artifacts_expire_at !== undefined, expiresAt: value.artifacts_expire_at ?? null })
}
~~~~

## AUT2-C32

```json
{"block_id":"AUT2-C32","type":"literal_source_excerpt","request_namespace":"J1 canonical groups; J2 mapping in index","requests":["RE-AUT2-05"],"body_anchors":["A32"],"requested_subject":"CLI target/argv/stdin/ambiente, host/origin/path e ausência de shell no command builder","source_category":"owned_population_source","path":"packages/core/src/actions/transport/cli.ts","archive":"sources/packages/core/src/actions/transport/cli.ts","commit":"1cde2ff7a71bcf7aecb5d030917b577165135d38","source_git_blob_sha":"695d1c8b2cc0872ad8e2a3d554a4b010674f834c","source_sha256":"94d766a8ffb45ec126698e2cf571f7a328261579edc1969147f2043c500df819","source_bytes":5166}
```

```json
{"first_line":1,"last_line":90,"bytes":5166,"sha256":"94d766a8ffb45ec126698e2cf571f7a328261579edc1969147f2043c500df819"}
```

~~~~typescript
export * as ActionsCli from "./cli"

import { Actions } from "@orchestra/schema/actions"
import { Effect } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { which } from "../../util/which"
import { ActionsContract } from "../contract"
import { ActionsError } from "../error"

export const names = { github: "gh", gitlab: "glab" } as const

export function error(provider: Actions.Provider, kind: Actions.ErrorKind, message: string, disposition: Actions.SendDisposition = "unknown") {
  return new ActionsError({ kind, message, provider: provider.kind, disposition })
}

export const target = Effect.fn("ActionsTransport.target")(function* (provider: Actions.Provider) {
  const host = URL.parse(`https://${provider.hostname}`)
  if (!host || host.host !== provider.hostname || host.pathname !== "/" || host.username || host.password || host.search || host.hash)
    return yield* error(provider, "host_mismatch", "Provider hostname must be an explicit canonical HTTPS host", "definitely_unsent")
  const origin = provider.kind === "github" && provider.hostname === "github.com"
    ? "https://api.github.com"
    : host.origin
  const base = provider.kind === "gitlab" ? `${origin}/api/v4` : `${origin}/api/v3`
  if (provider.apiOrigin !== origin && (provider.hostname === "github.com" || provider.apiOrigin !== base))
    return yield* error(provider, "host_mismatch", "Provider API origin does not match the CLI hostname", "definitely_unsent")
  if ((provider.kind === "gitlab" && provider.hostname === "github.com") ||
      (provider.kind === "github" && provider.hostname === "gitlab.com"))
    return yield* error(provider, "host_mismatch", "Provider kind does not match the hostname", "definitely_unsent")
  const executable = which(names[provider.kind])
  if (!executable) return yield* error(provider, "cli_missing", `${names[provider.kind]} is not installed on this server`, "definitely_unsent")
  return executable
})

export const endpoint = Effect.fn("ActionsTransport.endpoint")(function* (provider: Actions.Provider, input: ActionsContract.Request) {
  // Raw CLI/URL syntax is separate from encoded segment data. An encoded slash
  // belongs to one native GitLab project/file argument, never a new URL authority.
  const segments = yield* Effect.try({
    try: () => input.path.replace(/^\//, "").split("/").map(decodeURIComponent),
    catch: () => error(provider, "invalid_input", "Request path has invalid URL encoding", "definitely_unsent"),
  })
  if (!/^(GET|POST|PUT|PATCH|DELETE)$/.test(input.method) ||
      !/^\/?[A-Za-z0-9_]/.test(input.path) || /[\s\\?#{}:]/.test(input.path) ||
      segments.some((segment) => /\\|%[0-9a-f]{2}|[\x00-\x1f\x7f]/i.test(segment) ||
        segment.split("/").some((part) => !part || part === "." || part === "..")))
    return yield* error(provider, "invalid_input", "Request path must be a literal relative API endpoint", "definitely_unsent")
  const entries = Object.entries(input.query ?? {})
  if (entries.some(([key, value]) => !/^[\w[\].-]+$/.test(key) ||
      /token|secret|password|authorization|private.?key|^value$/i.test(key) ||
      (typeof value === "number" && !Number.isFinite(value))))
    return yield* error(provider, "invalid_input", "Sensitive values belong in JSON stdin, not query arguments", "definitely_unsent")
  const query = new URLSearchParams(entries.map(([key, value]) => [key, String(value)])).toString()
  return `${input.path.replace(/^\//, "")}${query ? `?${query}` : ""}`
})

export function command(directory: string, provider: Actions.Provider, executable: string, args: readonly string[], stdin: "pipe" | "ignore") {
  const env = {
    GH_PROMPT_DISABLED: "1", GH_NO_UPDATE_NOTIFIER: "1", GH_DEBUG: "", GH_FORCE_TTY: "",
    GLAB_NO_PROMPT: "1", GLAB_CHECK_UPDATE: "false", GLAB_SHOW_WHATS_NEW: "false",
    GLAB_NOTIFY_SKILL_UPDATES: "false", GLAB_DEBUG: "false", GLAB_DEBUG_HTTP: "false",
    GLAB_SEND_TELEMETRY: "false", CI: "false", GITLAB_CI: "false",
    NO_COLOR: "1", CLICOLOR: "0", CLICOLOR_FORCE: "0", FORCE_COLOR: "0", TERM: "dumb",
    GH_PAGER: "", GLAB_PAGER: "", PAGER: "",
    // A nonempty slash overrides glab's configured subfolder and trims to root.
    GITLAB_API_HOST: provider.hostname, GLAB_API_PROTOCOL: "https", GITLAB_SUBFOLDER: "/",
  }
  return ChildProcess.make(executable, args, {
    cwd: directory,
    shell: false,
    extendEnv: false,
    env: {
      ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !Object.keys(env).some((name) => name === key.toUpperCase()))),
      ...env,
    },
    stdin,
    stdout: "pipe",
    stderr: "pipe",
    forceKillAfter: "1 second",
  })
}

export function args(provider: Actions.Provider, input: ActionsContract.Request, path: string, metadata: boolean) {
  return [
    "api", "--hostname", provider.hostname, "--method", input.method,
    ...(metadata ? ["--include"] : []),
    ...(provider.kind === "github" && provider.hostname === "github.com"
      ? ["--header", "X-GitHub-Api-Version: 2026-03-10"] : []),
    ...(input.body === undefined ? [] : ["--header", "Content-Type: application/json", "--input", "-"]),
    "--", path,
  ]
}
~~~~

## AUT2-C33

```json
{"block_id":"AUT2-C33","type":"literal_source_excerpt","request_namespace":"J1 canonical groups; J2 mapping in index","requests":["RE-AUT2-05"],"body_anchors":["A33"],"requested_subject":"Qualificação glab, token/config, CA/mTLS, arquivos regulares e limites","source_category":"owned_population_source","path":"packages/core/src/actions/transport/credentials.ts","archive":"sources/packages/core/src/actions/transport/credentials.ts","commit":"1cde2ff7a71bcf7aecb5d030917b577165135d38","source_git_blob_sha":"e9fb72f248bb8500d5fc14d053ddb95396be3819","source_sha256":"36b0b3a3ed180de68ed8c8497c7231728ec4aabfd79fd67de34e33654b109010","source_bytes":5469}
```

```json
{"first_line":1,"last_line":85,"bytes":5469,"sha256":"36b0b3a3ed180de68ed8c8497c7231728ec4aabfd79fd67de34e33654b109010"}
```

~~~~typescript
export * as ActionsCredentials from "./credentials"

import { open } from "node:fs/promises"
import { constants } from "node:fs"
import path from "node:path"
import { rootCertificates } from "node:tls"
import { Actions } from "@orchestra/schema/actions"
import { Effect, Stream } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { AppProcess } from "../../process"
import { ActionsCli } from "./cli"

const commit = "570955d4252f860d6b0cbf3fd2ec44f86a7e6957"
const keys = ["token", "job_token", "is_oauth2", "ca_cert", "client_cert", "client_key"] as const

// Request-memory only. This module neither reads/copies a CLI config file nor
// exports credential values through the public Transport response/identity seam.
export const read = Effect.fn("ActionsTransport.credentials")(function* (proc: AppProcess.Interface, directory: string, provider: Actions.Provider) {
  const executable = yield* ActionsCli.target(provider)
  const command = ActionsCli.command(directory, provider, executable, [], "ignore")
  const get = (args: string[]) => Effect.scoped(Effect.gen(function* () {
    const handle = yield* proc.spawn(ChildProcess.make(executable, args, command.options))
    const result = yield* Effect.all({
      stdout: capture(handle.stdout), stderr: capture(handle.stderr), code: handle.exitCode,
    }, { concurrency: "unbounded" })
    if (result.code !== 0) return yield* ActionsCli.error(provider, "not_authenticated", "GitLab local sign-in configuration could not be read", "definitely_unsent")
    return yield* Effect.try({
      try: () => new TextDecoder("utf-8", { fatal: true }).decode(result.stdout).replace(/\r?\n$/, ""),
      catch: () => ActionsCli.error(provider, "not_authenticated", "GitLab local sign-in configuration is not valid UTF-8", "definitely_unsent"),
    })
  })).pipe(
    Effect.mapError(() => ActionsCli.error(provider, "not_authenticated", "GitLab local sign-in configuration could not be read safely", "definitely_unsent")),
    Effect.timeoutOrElse({ duration: "10 seconds", orElse: () => Effect.fail(ActionsCli.error(provider, "not_authenticated", "GitLab local configuration deadline exceeded", "definitely_unsent")) }),
  )
  const version = /^glab (\S+) \(([a-f0-9]+)\)$/.exec(yield* get(["version"]))
  if (version?.[1] !== "1.118.0" || !version[2] || version[2].length < 8 || !commit.startsWith(version[2]))
    return yield* ActionsCli.error(provider, "capability_unavailable", "GitLab local configuration reads require qualified glab 1.118.0", "definitely_unsent")
  const values = Object.fromEntries(yield* Effect.forEach(keys, (key) => get(["config", "get", key, "--host", provider.hostname]).pipe(Effect.map((value) => [key, value] as const))))
  const env = command.options.env ?? {}
  // Match v1.118.0's environment-PAT precedence over a stored OAuth flag.
  const oauth = values.is_oauth2 === "true" && (!(env.GITLAB_TOKEN || env.GITLAB_ACCESS_TOKEN) || !!env.GLAB_IS_OAUTH2)
  const token = values.token || (!oauth ? values.job_token : "")
  if (!token || !/^[\x21-\x7e]+$/.test(token))
    return yield* ActionsCli.error(provider, "not_authenticated", "GitLab sign-in is missing or unusable; sign in with the CLI", "definitely_unsent")
  if (!!values.client_cert !== !!values.client_key)
    return yield* ActionsCli.error(provider, "invalid_input", "GitLab mTLS requires both client certificate and key", "definitely_unsent")
  const material = (reference: string) => reference ? file(directory, reference).pipe(
    Effect.mapError(() => ActionsCli.error(provider, "invalid_input", "Configured GitLab TLS material could not be read safely", "definitely_unsent")),
  ) : Effect.succeed(undefined)
  const tls = yield* Effect.all({ ca: material(values.ca_cert), cert: material(values.client_cert), key: material(values.client_key) })
  return {
    headers: { [oauth ? "Authorization" : values.token ? "PRIVATE-TOKEN" : "JOB-TOKEN"]: oauth ? `Bearer ${token}` : token },
    ca: tls.ca ? [...rootCertificates, tls.ca] : undefined,
    cert: tls.cert, key: tls.key,
  }
})
export type Snapshot = Effect.Success<ReturnType<typeof read>>

function capture<E>(stream: Stream.Stream<Uint8Array, E>) {
  return stream.pipe(Stream.runFoldEffect(() => ({ bytes: 0, chunks: [] as Uint8Array[] }), (state, chunk) => {
    if (state.bytes + chunk.length > 16 * 1024) return Effect.fail(new Error("Local configuration capture limit"))
    state.bytes += chunk.length
    state.chunks.push(chunk)
    return Effect.succeed(state)
  }), Effect.map((state) => Buffer.concat(state.chunks)))
}

function file(directory: string, reference: string) {
  return Effect.acquireUseRelease(
    Effect.tryPromise(() => open(path.resolve(directory, reference), constants.O_RDONLY | constants.O_NONBLOCK)),
    (handle) => Effect.tryPromise(async () => {
      if (!(await handle.stat()).isFile()) throw new Error("TLS reference is not a regular file")
      const buffer = Buffer.alloc(256 * 1024 + 1)
      const state = { bytes: 0 }
      while (state.bytes < buffer.length) {
        const read = await handle.read(buffer, state.bytes, buffer.length - state.bytes, null)
        if (!read.bytesRead) break
        state.bytes += read.bytesRead
      }
      if (state.bytes === buffer.length) throw new Error("TLS material capture limit")
      return new TextDecoder("utf-8", { fatal: true }).decode(buffer.subarray(0, state.bytes))
    }),
    (handle) => Effect.promise(() => handle.close()),
  )
}
~~~~

## AUT2-C34

```json
{"block_id":"AUT2-C34","type":"literal_source_excerpt","request_namespace":"J1 canonical groups; J2 mapping in index","requests":["RE-AUT2-05","RE-AUT2-06"],"body_anchors":["A33"],"requested_subject":"Snapshot por pedido, ator e write, rotas raw e framing de upload multipart","source_category":"owned_population_source","path":"packages/core/src/actions/transport/gitlab.ts","archive":"sources/packages/core/src/actions/transport/gitlab.ts","commit":"1cde2ff7a71bcf7aecb5d030917b577165135d38","source_git_blob_sha":"a21535f1c3014d492d7f07e98250bfb9e6cc3b3a","source_sha256":"94a67ca1521b8ce37b40b34a93d36d9986bdbf3727e2152399dd69b14214aef0","source_bytes":5999}
```

```json
{"first_line":1,"last_line":73,"bytes":5999,"sha256":"94a67ca1521b8ce37b40b34a93d36d9986bdbf3727e2152399dd69b14214aef0"}
```

~~~~typescript
export * as ActionsGitlab from "./gitlab"

import { randomUUID } from "node:crypto"
import { Actions } from "@orchestra/schema/actions"
import { Effect, Option, Schema, Stream } from "effect"
import { AppProcess } from "../../process"
import { ActionsContract } from "../contract"
import { ActionsError } from "../error"
import { ActionsCli } from "./cli"
import { ActionsCredentials } from "./credentials"
import { ActionsHttp } from "./http"
import { ActionsIdentity } from "./identity"

export function make(directory: string, proc: AppProcess.Interface) {
  const validate = Effect.fn("ActionsTransport.gitlabActor")(function* (binding: Actions.Binding, snapshot: ActionsCredentials.Snapshot) {
    if (!binding.account) return yield* ActionsCli.error(binding.provider, "binding_stale", "GitLab binding has no verified sign-in identity", "definitely_unsent")
    const user = yield* ActionsHttp.metadata(binding.provider, snapshot, { method: "GET", path: "user" })
      .pipe(Effect.mapError((error) => new ActionsError({ ...error, message: error.message, disposition: "definitely_unsent" })))
    const account = ActionsIdentity.account(binding.provider, user.data)
    if (Option.isNone(account) || account.value !== binding.account)
      return yield* ActionsCli.error(binding.provider, "binding_stale", "GitLab sign-in identity changed; rebind before mutation", "definitely_unsent")
  })
  return {
    resolve: Effect.fn("ActionsTransport.gitlabResolve")(function* (provider: Actions.Provider, projectPath: string) {
      const snapshot = yield* ActionsCredentials.read(proc, directory, provider)
      const project = yield* ActionsHttp.metadata(provider, snapshot, { method: "GET", path: `projects/${encodeURIComponent(projectPath)}` })
      const identity = ActionsIdentity.project(provider, project.data)
      if (Option.isNone(identity)) return yield* ActionsCli.error(provider, "transport_failed", "Provider did not return native project identity")
      const user = yield* ActionsHttp.metadata(provider, snapshot, { method: "GET", path: "user" })
      const account = ActionsIdentity.account(provider, user.data)
      if (Option.isNone(account)) return yield* ActionsCli.error(provider, "not_authenticated", "Provider did not return the current signed-in account")
      return { ...identity.value, account: account.value }
    }),
    request: Effect.fn("ActionsTransport.gitlabRequest")(function* (binding: Actions.Binding, input: ActionsContract.Request) {
      yield* ActionsCli.endpoint(binding.provider, input)
      if (input.body !== undefined && Option.isNone(Schema.decodeUnknownOption(Schema.Json)(input.body)))
        return yield* ActionsCli.error(binding.provider, "invalid_input", "Request body must be JSON metadata", "definitely_unsent")
      const snapshot = yield* ActionsCredentials.read(proc, directory, binding.provider)
      if (input.method !== "GET") yield* validate(binding, snapshot)
      return yield* ActionsHttp.metadata(binding.provider, snapshot, input)
    }),
    open: Effect.fn("ActionsTransport.gitlabOpen")(function* (binding: Actions.Binding, input: ActionsContract.BoundRequest) {
      yield* ActionsCli.endpoint(binding.provider, input)
      if (input.method !== "GET" || input.body !== undefined || input.query !== undefined ||
        !/^[1-9]\d{0,127}$/.test(binding.projectID) ||
        !new RegExp(`^projects/${binding.projectID}/jobs/[1-9]\\d{0,127}/(?:trace|artifacts(?:/.*)?)$`).test(input.path))
        return yield* ActionsCli.error(binding.provider, "invalid_input", "Raw opening requires an exact bound GitLab job trace or artifact GET", "definitely_unsent")
      const snapshot = yield* ActionsCredentials.read(proc, directory, binding.provider)
      yield* validate(binding, snapshot)
      return yield* ActionsHttp.openRaw(binding.provider, snapshot, input)
    }),
    bytes: (binding: Actions.Binding, input: ActionsContract.Request) => Stream.unwrap(Effect.gen(function* () {
      yield* ActionsCli.endpoint(binding.provider, input)
      if (input.method !== "GET" || input.body !== undefined)
        return yield* ActionsCli.error(binding.provider, "invalid_input", "Raw byte downloads require GET without a body", "definitely_unsent")
      return ActionsHttp.bytes(binding.provider, yield* ActionsCredentials.read(proc, directory, binding.provider), input)
    })),
    upload: Effect.fn("ActionsTransport.gitlabUpload")(function* (binding: Actions.Binding, input: ActionsContract.Request, file: { filename: string; bytes: Stream.Stream<Uint8Array, ActionsError> }) {
      if (!file.filename || file.filename === "." || file.filename === ".." || file.filename !== file.filename.trim() ||
          /[\\/:\x00-\x1f\x7f]/.test(file.filename) || file.filename.length > 255 || input.method !== "POST" ||
          input.path.replace(/^\//, "") !== `projects/${encodeURIComponent(binding.projectID)}/secure_files` ||
          input.body !== undefined || input.query?.name !== file.filename)
        return yield* ActionsCli.error(binding.provider, "invalid_input", "Secure File upload requires an exact safe filename and matching native name query", "definitely_unsent")
      yield* ActionsCli.endpoint(binding.provider, input)
      const snapshot = yield* ActionsCredentials.read(proc, directory, binding.provider)
      yield* validate(binding, snapshot)
      const boundary = `orchestra-${randomUUID()}`
      const prefix = new TextEncoder().encode(`--${boundary}\r\nContent-Disposition: form-data; name="name"\r\n\r\n${file.filename}\r\n--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${file.filename.replace(/["\\]/g, "\\$&")}"\r\nContent-Type: application/octet-stream\r\n\r\n`)
      const body = Stream.concat(Stream.make(prefix), Stream.concat(file.bytes, Stream.make(new TextEncoder().encode(`\r\n--${boundary}--\r\n`))))
      return yield* ActionsHttp.metadata(binding.provider, snapshot, input, body, `multipart/form-data; boundary=${boundary}`)
    }),
  }
}
~~~~

## AUT2-C35

```json
{"block_id":"AUT2-C35","type":"literal_source_excerpt","request_namespace":"J1 canonical groups; J2 mapping in index","requests":["RE-AUT2-05","RE-AUT2-06"],"body_anchors":["A33","A34"],"requested_subject":"HTTPS verificado, phase sticky, request/body/backpressure/erro/abort e streams","source_category":"owned_population_source","path":"packages/core/src/actions/transport/http.ts","archive":"sources/packages/core/src/actions/transport/http.ts","commit":"1cde2ff7a71bcf7aecb5d030917b577165135d38","source_git_blob_sha":"cb71e6424c0f4b9c7e714667f1298e46fe3a502d","source_sha256":"b3e60d9d087592f8847f53d94e60d3ece75cf827014407f9b4a66dfc78cc0ae7","source_bytes":10713}
```

```json
{"first_line":1,"last_line":186,"bytes":10713,"sha256":"b3e60d9d087592f8847f53d94e60d3ece75cf827014407f9b4a66dfc78cc0ae7"}
```

~~~~typescript
export * as ActionsHttp from "./http"

import { request } from "node:https"
import type { IncomingMessage } from "node:http"
import type { Socket } from "node:net"
import { checkServerIdentity } from "node:tls"
import { NodeStream } from "@effect/platform-node"
import { Actions } from "@orchestra/schema/actions"
import { Cause, Deferred, Effect, Exit, Fiber, Scope, Stream } from "effect"
import { ActionsContract } from "../contract"
import { ActionsError } from "../error"
import { ActionsCli } from "./cli"
import { ActionsCredentials } from "./credentials"
import { ActionsResponse } from "./response"

const certificateFailures = new Set([
  "CERT_HAS_EXPIRED", "CERT_NOT_YET_VALID", "CERT_REVOKED", "CERT_UNTRUSTED",
  "DEPTH_ZERO_SELF_SIGNED_CERT", "SELF_SIGNED_CERT_IN_CHAIN",
  "UNABLE_TO_GET_ISSUER_CERT", "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE", "ERR_TLS_CERT_ALTNAME_INVALID",
])

export function requestError(provider: Actions.Provider, cause: unknown, phase: "handshake" | "http_possible") {
  const verification = cause instanceof Error && "code" in cause && typeof cause.code === "string" && certificateFailures.has(cause.code)
  return ActionsCli.error(provider, "transport_failed", verification ? "GitLab TLS verification failed" : "GitLab HTTPS request failed",
    verification && phase === "handshake" ? "definitely_unsent" : "unknown")
}

export const metadata = Effect.fn("ActionsTransport.httpsMetadata")(function* (
  provider: Actions.Provider, snapshot: ActionsCredentials.Snapshot, input: ActionsContract.Request,
  body: Stream.Stream<Uint8Array, ActionsError> = input.body === undefined ? Stream.empty : Stream.make(new TextEncoder().encode(JSON.stringify(input.body))),
  contentType = "application/json",
) {
  return yield* Effect.scoped(Effect.gen(function* () {
    const handle = yield* open(provider, snapshot, input, body, contentType, "30 seconds")
    const response = yield* handle.response
    const result = yield* responseBytes(provider, response, handle).pipe(Stream.runFoldEffect(() => ({ size: 0, chunks: [] as Uint8Array[] }), (state, chunk) => {
      if (state.size + chunk.length > 2 * 1024 * 1024)
        return Effect.fail(ActionsCli.error(provider, "metadata_truncated", "GitLab metadata capture limit exceeded"))
      state.size += chunk.length
      state.chunks.push(chunk)
      return Effect.succeed(state)
    }))
    yield* Fiber.join(handle.input)
    return yield* ActionsResponse.http(provider, response.statusCode ?? 0, headers(response), Buffer.concat(result.chunks))
  }))
})

export function bytes(provider: Actions.Provider, snapshot: ActionsCredentials.Snapshot, input: ActionsContract.Request) {
  return Stream.unwrap(Effect.gen(function* () {
    const handle = yield* open(provider, snapshot, input, Stream.empty, "application/octet-stream", "5 minutes")
    const response = yield* handle.response
    if ((response.statusCode ?? 0) < 200 || (response.statusCode ?? 0) > 299) {
      if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400)
        return yield* ActionsCli.error(provider, "host_mismatch", "Authenticated GitLab redirects require explicit credential-free transfer")
      return yield* ActionsResponse.failure(provider, 1, Buffer.alloc(0), response.statusCode, headers(response), true)
    }
    return responseBytes(provider, response, handle)
  }))
}

export const openRaw = Effect.fn("ActionsTransport.httpsOpenRaw")(function* (
  provider: Actions.Provider, snapshot: ActionsCredentials.Snapshot, input: ActionsContract.BoundRequest,
): Effect.fn.Return<ActionsContract.RawResponse, ActionsError, Scope.Scope> {
  if (provider.kind !== "gitlab" || input.method !== "GET" || input.body !== undefined)
    return yield* ActionsCli.error(provider, "invalid_input", "Native raw opening requires a GitLab GET without a body", "definitely_unsent")
  const scope = yield* Scope.make()
  yield* Effect.addFinalizer((exit) => Scope.close(scope, exit))
  const handle = yield* open(provider, snapshot, input, Stream.empty, "application/octet-stream", "5 minutes").pipe(Scope.provide(scope))
  const response = yield* handle.response
  return {
    status: response.statusCode ?? 0, headers: headers(response), body: responseBytes(provider, response, handle),
    close: Scope.close(scope, Exit.void),
  }
})

const open = Effect.fn("ActionsTransport.httpsOpen")(function* (
  provider: Actions.Provider, snapshot: ActionsCredentials.Snapshot, input: ActionsContract.Request,
  body: Stream.Stream<Uint8Array, ActionsError>, contentType: string, deadline: "30 seconds" | "5 minutes",
) {
  const endpoint = yield* ActionsCli.endpoint(provider, input)
  const origin = URL.parse(provider.apiOrigin)
  const url = origin && URL.parse(`${origin.origin}/api/v4/${endpoint}`)
  if (!origin || !url || url.protocol !== "https:" || url.origin !== origin.origin || url.host !== provider.hostname)
    return yield* ActionsCli.error(provider, "host_mismatch", "GitLab HTTPS destination differs from the binding origin", "definitely_unsent")
  const response = yield* Deferred.make<IncomingMessage, ActionsError>()
  const failure = yield* Deferred.make<never, ActionsError>()
  const abort = new AbortController()
  const state = { error: undefined as ActionsError | undefined, response: undefined as IncomingMessage | undefined, socket: undefined as Socket | undefined,
    phase: "handshake" as "handshake" | "http_possible" }
  const req = yield* Effect.acquireRelease(Effect.try({
    try: () => request(url, {
      method: input.method, agent: false, rejectUnauthorized: true, minVersion: "TLSv1.2", signal: abort.signal,
      ca: snapshot.ca, cert: snapshot.cert, key: snapshot.key,
      // Verification success precedes authenticated HTTP. Keep this transition
      // sticky: later renegotiation/certificate/TLS failures cannot prove unsent.
      checkServerIdentity: (hostname, certificate) => {
        const error = checkServerIdentity(hostname, certificate)
        if (!error) state.phase = "http_possible"
        return error
      },
      headers: { ...snapshot.headers, "Content-Type": contentType, Connection: "close" },
    }),
    catch: () => ActionsCli.error(provider, "invalid_input", "GitLab HTTPS request could not be constructed safely", "definitely_unsent"),
  }), (req) => Effect.sync(() => { abort.abort(); state.response?.destroy(); state.socket?.destroy(); req.destroy() }))
  const fail = (error: ActionsError) => {
    state.error ??= error
    Deferred.doneUnsafe(response, Exit.fail(state.error))
    Deferred.doneUnsafe(failure, Exit.fail(state.error))
  }
  req.on("error", (cause) => {
    fail(requestError(provider, cause, state.phase))
  })
  req.on("socket", (socket) => {
    state.socket = socket
    socket.once("secureConnect", () => { state.phase = "http_possible" })
  })
  req.once("response", (incoming) => {
    state.phase = "http_possible"
    state.response = incoming
    incoming.on("error", () => fail(ActionsCli.error(provider, "transfer_failed", "GitLab HTTPS response failed")))
    incoming.on("aborted", () => fail(ActionsCli.error(provider, "transfer_failed", "GitLab HTTPS response ended prematurely")))
    Deferred.doneUnsafe(response, Exit.succeed(incoming))
  })
  yield* Effect.forkScoped(Effect.sleep(deadline).pipe(Effect.andThen(Effect.sync(() => {
    fail(ActionsCli.error(provider, "transfer_failed", "GitLab HTTPS deadline exceeded"))
    abort.abort()
    state.response?.destroy()
    state.socket?.destroy()
    req.destroy()
  }))))
  const sent = yield* Effect.forkScoped(Stream.runForEach(body, (chunk) => Effect.callback<void, ActionsError>((resume) => {
    const progress = { written: false, returned: false, drained: false, blocked: false }
    const done = () => {
      if (!progress.returned || !progress.written || (progress.blocked && !progress.drained)) return
      req.off("drain", drain)
      resume(Effect.void)
    }
    const drain = () => { progress.drained = true; done() }
    // Bun can signal drain synchronously during write. Install before writing;
    // wait on callback plus backpressure instead of accumulating the whole body.
    req.once("drain", drain)
    progress.blocked = !req.write(chunk, (error) => {
      if (error) { req.off("drain", drain); resume(Effect.fail(ActionsCli.error(provider, "transfer_failed", "GitLab HTTPS upload failed"))); return }
      progress.written = true; done()
    })
    progress.returned = true
    done()
    return Effect.sync(() => req.off("drain", drain))
  }).pipe(Effect.andThen(Effect.callback<void>((resume) => {
    // Let the Node/Bun I/O pump consume a chunk before the next producer pull.
    const turn = setImmediate(() => resume(Effect.void))
    return Effect.sync(() => clearImmediate(turn))
  })))).pipe(
    Effect.andThen(Effect.callback<void>((resume) => {
      const finished = () => resume(Effect.void)
      req.once("finish", finished)
      req.end()
      return Effect.sync(() => req.off("finish", finished))
    })),
    Effect.raceFirst(Deferred.await(failure)),
    Effect.mapError((error) => new ActionsError({ ...error, message: error.message, disposition: "unknown" })),
    Effect.catchCause((cause) => {
      const error = Cause.squash(cause)
      return Effect.fail(error instanceof ActionsError ? error : ActionsCli.error(provider, "transfer_failed", "GitLab HTTPS upload producer failed"))
    }),
    Effect.tapError((error) => Effect.sync(() => { fail(error); abort.abort(); state.socket?.destroy(); req.destroy() })),
  ))
  return { response: Deferred.await(response).pipe(Effect.raceFirst(Deferred.await(failure))), failure: Deferred.await(failure), input: sent, state }
})

function responseBytes(provider: Actions.Provider, response: IncomingMessage, handle: Effect.Success<ReturnType<typeof open>>) {
  return NodeStream.fromReadable<Uint8Array, ActionsError>({ evaluate: () => response,
    onError: () => handle.state.error ?? ActionsCli.error(provider, "transfer_failed", "GitLab HTTPS response failed"),
  }).pipe(
    Stream.concat(Stream.fromEffect(Effect.suspend(() => response.complete && !response.aborted ? Effect.void
      : Effect.fail(handle.state.error ?? ActionsCli.error(provider, "transfer_failed", "GitLab HTTPS response ended prematurely")))).pipe(Stream.drain)),
    Stream.interruptWhen(handle.failure),
    Stream.mapError((error) => handle.state.error ?? error),
  )
}

function headers(response: IncomingMessage) {
  return Object.fromEntries(Object.entries(response.headers).filter((entry): entry is [string, string | string[]] => entry[1] !== undefined)
    .map(([key, value]) => [key, Array.isArray(value) ? value.join(", ") : value]))
}
~~~~

## AUT2-C36

```json
{"block_id":"AUT2-C36","type":"literal_source_excerpt","request_namespace":"J1 canonical groups; J2 mapping in index","requests":["RE-AUT2-05"],"body_anchors":["A32","A33"],"requested_subject":"Parsers nativos de projeto/conta chamados pelo transporte","source_category":"owned_population_source","path":"packages/core/src/actions/transport/identity.ts","archive":"sources/packages/core/src/actions/transport/identity.ts","commit":"1cde2ff7a71bcf7aecb5d030917b577165135d38","source_git_blob_sha":"4d9b3812a6078439d5a654bc198e5426e55b1cb2","source_sha256":"0760871fde3a3eb2f8b3a5895cae66a50266a2b731208af0a533b31570536a4a","source_bytes":1531}
```

```json
{"first_line":1,"last_line":24,"bytes":1531,"sha256":"0760871fde3a3eb2f8b3a5895cae66a50266a2b731208af0a533b31570536a4a"}
```

~~~~typescript
export * as ActionsIdentity from "./identity"

import { Option, Schema } from "effect"
import { Actions } from "@orchestra/schema/actions"

const nativeID = Schema.Union([
  Schema.String.check(Schema.isPattern(/^0*[1-9]\d*$/)),
  Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER })),
])
const githubProject = Schema.decodeUnknownOption(Schema.Struct({ id: nativeID, full_name: Schema.NonEmptyString }))
const gitlabProject = Schema.decodeUnknownOption(Schema.Struct({ id: nativeID, path_with_namespace: Schema.NonEmptyString }))
const githubAccount = Schema.decodeUnknownOption(Schema.Struct({ login: Schema.String.check(Schema.isPattern(/^(?=.{1,39}$)[a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)*(?:\[bot\])?$/)) }))
const gitlabAccount = Schema.decodeUnknownOption(Schema.Struct({ username: Schema.String.check(Schema.isPattern(/^(?=.{2,255}$)(?!.*\.\.)(?!.*\.(?:git|atom)$)[a-zA-Z0-9_][a-zA-Z0-9_.-]*[a-zA-Z0-9_-]$/i)) }))

export function project(provider: Actions.Provider, data: unknown) {
  return provider.kind === "github"
    ? githubProject(data).pipe(Option.map((data) => ({ projectID: String(data.id), projectPath: data.full_name })))
    : gitlabProject(data).pipe(Option.map((data) => ({ projectID: String(data.id), projectPath: data.path_with_namespace })))
}

export function account(provider: Actions.Provider, data: unknown) {
  return provider.kind === "github" ? githubAccount(data).pipe(Option.map((data) => data.login))
    : gitlabAccount(data).pipe(Option.map((data) => data.username))
}
~~~~

## AUT2-C37

```json
{"block_id":"AUT2-C37","type":"literal_source_excerpt","request_namespace":"J1 canonical groups; J2 mapping in index","requests":["RE-AUT2-05"],"body_anchors":["A34"],"requested_subject":"Parsers headers/JSON/saída completa; failure56–76 reutilizado de AUT1-C45","source_category":"owned_population_source","path":"packages/core/src/actions/transport/response.ts","archive":"sources/packages/core/src/actions/transport/response.ts","commit":"1cde2ff7a71bcf7aecb5d030917b577165135d38","source_git_blob_sha":"09aed710878c0e33f33b7e1a8d566074a44ad30a","source_sha256":"dbe2d9284661b36cee41b379cba34f29cd6910df7757b10b94136eb12e6d8192","source_bytes":4934}
```

```json
{"first_line":1,"last_line":55,"bytes":3183,"sha256":"c0414db9df802aa5d2a9a30f69717e369b9c191bcb93fba263a6f42d2b44c37b"}
```

~~~~typescript
export * as ActionsResponse from "./response"

import { Actions } from "@orchestra/schema/actions"
import { Effect, Option, Schema } from "effect"
import { ActionsContract } from "../contract"
import { ActionsError } from "../error"
import { ActionsCli } from "./cli"

const json = Schema.decodeUnknownOption(Schema.UnknownFromJsonString.pipe(Schema.decodeTo(Schema.Json)))

export const http = Effect.fn("ActionsTransport.httpResponse")(function* (provider: Actions.Provider, status: number, headers: Record<string, string>, body: Buffer) {
  if (status >= 300 && status < 400)
    return yield* ActionsCli.error(provider, "host_mismatch", "Authenticated GitLab redirects require explicit credential-free transfer")
  const text = yield* Effect.try({
    try: () => new TextDecoder("utf-8", { fatal: true }).decode(body),
    catch: () => ActionsCli.error(provider, "transport_failed", "GitLab metadata is not valid UTF-8"),
  })
  const data = json(text)
  if (status < 200 || status > 299) return yield* failure(provider, 1, Buffer.alloc(0), status, headers, Option.isSome(data))
  if ([201, 202, 204].includes(status) && !text.trim()) return { status, headers, data: null }
  if (Option.isNone(data)) return yield* ActionsCli.error(provider, "transport_failed", "GitLab response is not valid JSON metadata")
  return { status, headers, data: data.value }
})

export const parse = Effect.fn("ActionsTransport.response")(function* (
  provider: Actions.Provider,
  result: { stdout: Buffer; stderr: Buffer; exitCode: number },
): Effect.fn.Return<ActionsContract.Response, ActionsError> {
  const text = result.stdout.toString("utf8")
  const boundary = /\r?\n\r?\n/.exec(text)
  const status = /^HTTP\/\d+(?:\.\d+)? (\d{3})(?: [^\r\n]*)?\r?\n/.exec(text)
  if (!boundary || !status) {
    if (result.exitCode !== 0) return yield* failure(provider, result.exitCode, result.stderr)
    return yield* ActionsCli.error(provider, "transport_failed", "CLI response is missing HTTP status or headers")
  }
  const lines = text.slice(status[0].length, boundary.index).split(/\r?\n/).filter(Boolean)
  if (lines.some((line) => !/^[!#$%&'*+.^_`|~\w-]+:[^\r\n]*$/.test(line)))
    return yield* ActionsCli.error(provider, "transport_failed", "CLI response has invalid HTTP headers")
  const headers = Object.fromEntries(lines.reduce((headers, line) => {
    const index = line.indexOf(":")
    const key = line.slice(0, index).toLowerCase()
    const value = line.slice(index + 1).trim()
    headers.set(key, headers.has(key) ? `${headers.get(key)}, ${value}` : value)
    return headers
  }, new Map<string, string>()))
  const code = Number(status[1])
  const body = text.slice(boundary.index + boundary[0].length)
  const data = json(body)
  if (code < 200 || code > 299 || result.exitCode !== 0)
    return yield* failure(provider, result.exitCode, result.stderr, code, headers, Option.isSome(data))
  if ([201, 202, 204].includes(code) && !body.trim()) return { status: code, headers, data: null }
  if (Option.isNone(data)) return yield* ActionsCli.error(provider, "transport_failed", "CLI response is not valid JSON metadata")
  return { status: code, headers, data: data.value }
})

~~~~

## AUT2-C38

```json
{"block_id":"AUT2-C38","type":"literal_source_excerpt","request_namespace":"J1 canonical groups; J2 mapping in index","requests":["RE-AUT2-05","RE-AUT2-06"],"body_anchors":["A32"],"requested_subject":"Process capture/bytes: buffers/timeout, stdin, watchdog, scope, backpressure e exit após EOF","source_category":"owned_population_source","path":"packages/core/src/actions/transport/process.ts","archive":"sources/packages/core/src/actions/transport/process.ts","commit":"1cde2ff7a71bcf7aecb5d030917b577165135d38","source_git_blob_sha":"5da8d9899becf4814f9a3011adfafc50d20c5239","source_sha256":"03b52b82e18a5a9a0ec515895218574eefbc433597eeb64b0fb13f452575ce9b","source_bytes":5454}
```

```json
{"first_line":1,"last_line":91,"bytes":5454,"sha256":"03b52b82e18a5a9a0ec515895218574eefbc433597eeb64b0fb13f452575ce9b"}
```

~~~~typescript
export * as ActionsProcess from "./process"

import { Actions } from "@orchestra/schema/actions"
import { Deferred, Effect, Exit, Fiber, Scope, Stream } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { AppProcess } from "../../process"
import { ActionsError } from "../error"
import { ActionsCli } from "./cli"
import { ActionsResponse } from "./response"

const METADATA_LIMIT = 2 * 1024 * 1024
const STDERR_LIMIT = 16 * 1024

export const capture = Effect.fn("ActionsTransport.capture")(function* (
  proc: AppProcess.Interface,
  provider: Actions.Provider,
  command: ChildProcess.Command,
  stdin: Stream.Stream<Uint8Array, ActionsError> = Stream.empty,
) {
  return yield* Effect.scoped(Effect.gen(function* () {
    if (provider.kind !== "github") return yield* ActionsCli.error(provider, "capability_unavailable", "GitLab API calls require the HTTPS transport", "definitely_unsent")
    // A producer's unsent error cannot describe the CLI call after stdin starts.
    return yield* collect(proc, provider, command, stdin).pipe(
      Effect.mapError((cause) => cause instanceof ActionsError
        ? new ActionsError({ ...cause, message: cause.message, disposition: "unknown" })
        : ActionsCli.error(provider, "transport_failed", "Provider CLI process failed")),
    )
  })).pipe(
    Effect.timeoutOrElse({ duration: "30 seconds", orElse: () => Effect.fail(ActionsCli.error(provider, "transport_failed", "Provider CLI metadata deadline exceeded")) }),
  )
})

export function bytes(proc: AppProcess.Interface, provider: Actions.Provider, command: ChildProcess.Command) {
  return Stream.unwrap(Effect.gen(function* () {
    if (provider.kind !== "github") return yield* ActionsCli.error(provider, "capability_unavailable", "GitLab API calls require the HTTPS transport", "definitely_unsent")
    const scope = yield* Scope.make()
    // Successful early stream disposal cannot adopt a live transfer child.
    yield* Effect.addFinalizer((exit) => Scope.close(scope, Exit.isFailure(exit) ? exit : Exit.interrupt()))
    const stopped = yield* Deferred.make<never, ActionsError>()
    yield* Effect.forkScoped(Effect.sleep("5 minutes").pipe(Effect.andThen(Effect.gen(function* () {
      const error = ActionsCli.error(provider, "transfer_failed", "Provider CLI byte transfer deadline exceeded")
      yield* Deferred.fail(stopped, error)
      yield* Scope.close(scope, Exit.fail(error)).pipe(Effect.uninterruptible)
    }))))
    const handle = yield* proc.spawn(command).pipe(Scope.provide(scope), Effect.raceFirst(Deferred.await(stopped)))
    // Expected signal termination is data, not an unobserved failed monitor fiber.
    const exited = yield* handle.exitCode.pipe(Effect.exit, Effect.forkIn(scope))
    const stderr = yield* AppProcess.collectStream(handle.stderr, STDERR_LIMIT).pipe(Effect.exit, Effect.forkIn(scope))
    const tail = Stream.fromEffect(Effect.gen(function* () {
      const code = yield* Fiber.join(exited).pipe(Effect.flatMap((exit) => exit))
      const diagnostic = yield* Fiber.join(stderr).pipe(Effect.flatMap((exit) => exit))
      if (code !== 0) {
        const error = ActionsResponse.failure(provider, code, diagnostic.buffer)
        return yield* new ActionsError({ ...error, message: error.message, disposition: error.disposition, kind: error.kind === "transport_failed" ? "transfer_failed" : error.kind })
      }
    })).pipe(Stream.drain)
    const pull = yield* Stream.toPull(Stream.concat(handle.stdout, tail)).pipe(Scope.provide(scope), Effect.raceFirst(Deferred.await(stopped)))
    const stderrFailure = Fiber.join(stderr).pipe(Effect.flatMap((exit) => Exit.isFailure(exit) ? Effect.failCause(exit.cause) : Effect.never))
    return Stream.fromPull(Effect.succeed(Effect.gen(function* () {
      if (yield* Deferred.isDone(stopped)) return yield* Deferred.await(stopped)
      const exit = yield* pull.pipe(Effect.raceFirst(stderrFailure), Effect.raceFirst(Deferred.await(stopped)), Effect.exit)
      if (yield* Deferred.isDone(stopped)) return yield* Deferred.await(stopped)
      return yield* exit
    })))
  })).pipe(
    Stream.mapError((cause) => cause instanceof ActionsError ? cause : ActionsCli.error(provider, "transfer_failed", "Provider CLI byte transfer failed")),
  )
}

const collect = Effect.fn("ActionsTransport.collect")(function* (
  proc: AppProcess.Interface, provider: Actions.Provider, command: ChildProcess.Command,
  stdin: Stream.Stream<Uint8Array, ActionsError> = Stream.empty,
) {
  const handle = yield* proc.spawn(command)
  const result = yield* Effect.all({
    stdout: bounded(handle.stdout, provider, METADATA_LIMIT),
    stderr: bounded(handle.stderr, provider, STDERR_LIMIT),
    exitCode: handle.exitCode, input: Stream.run(stdin, handle.stdin),
  }, { concurrency: "unbounded" })
  return { stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode }
})

function bounded<E>(stream: Stream.Stream<Uint8Array, E>, provider: Actions.Provider, limit: number) {
  return Stream.runFoldEffect(stream, () => ({ chunks: [] as Uint8Array[], size: 0 }), (state, chunk) => {
    if (state.size + chunk.byteLength > limit)
      return Effect.fail(ActionsCli.error(provider, "metadata_truncated", "Provider CLI output exceeded the metadata capture limit"))
    state.chunks.push(chunk)
    state.size += chunk.byteLength
    return Effect.succeed(state)
  }).pipe(Effect.map((state) => Buffer.concat(state.chunks)))
}
~~~~

## AUT2-C39

```json
{"block_id":"AUT2-C39","type":"literal_source_excerpt","request_namespace":"J1 canonical groups; J2 mapping in index","requests":["RE-AUT2-06"],"body_anchors":["A35","A36"],"requested_subject":"Chamador de open(renew=true), recusa 206/content-range antes de body, watchdog e Scope/Pull","source_category":"owned_population_source","path":"packages/core/src/actions/output/index.ts","archive":"sources/packages/core/src/actions/output/index.ts","commit":"1cde2ff7a71bcf7aecb5d030917b577165135d38","source_git_blob_sha":"97a1115aea631b1a1b8b7dc6ad438e3fb5bb1ace","source_sha256":"acf076da8a2806947561dc865a4eeb1db09d34494a3fb977c81166e04acbbc00","source_bytes":4816}
```

```json
{"first_line":1,"last_line":66,"bytes":4816,"sha256":"acf076da8a2806947561dc865a4eeb1db09d34494a3fb977c81166e04acbbc00"}
```

~~~~typescript
export * as ActionsOutput from "./index"

import { Actions } from "@orchestra/schema/actions"
import { Deferred, Effect, Exit, Scope, Stream } from "effect"
import { ActionsContract } from "../contract"
import { ActionsError } from "../error"
import { OutputArtifacts } from "./artifacts"
import { OutputDownload } from "./download"
import { OutputHeaders } from "./headers"
import { OutputNative } from "./native"
import { OutputTarget } from "./target"

export function make(input: { transport: ActionsContract.Transport; reader: ActionsContract.ReadAdapter }) {
  const bound = <A, R>(binding: Actions.Binding, effect: Effect.Effect<A, ActionsError, R>) => effect.pipe(
    Effect.mapError((error) => new ActionsError({ ...error, message: error.message, disposition: error.disposition,
      bindingID: binding.id, provider: binding.provider.kind })))
  return {
    artifacts: (binding: Actions.Binding, value: Actions.ResourceListInput) => bound(binding,
      OutputArtifacts.list(input.transport, input.reader, binding, value).pipe(Effect.timeoutOrElse({ duration: "30 seconds",
        orElse: () => Effect.fail(OutputNative.error(binding, "transport_failed", "CI artifact inventory deadline exceeded")) }))),
    info: (binding: Actions.Binding, value: Actions.TransferInput): Effect.Effect<OutputHeaders.Info, ActionsError> => bound(binding,
      Effect.scoped(Effect.gen(function* () {
        const target = yield* OutputTarget.resolve(input.transport, input.reader, binding, value)
        if (binding.provider.kind === "github") return target.info
        const opened = yield* OutputDownload.open(input.transport, input.reader, binding, value, target)
        const info = yield* OutputNative.checked(binding, () => OutputHeaders.info(binding, opened.info, opened.response.headers))
        yield* opened.response.close
        return info
      })).pipe(Effect.timeoutOrElse({ duration: "30 seconds", orElse: () => Effect.fail(OutputNative.error(binding, "transfer_failed", "CI output metadata deadline exceeded")) }))),
    read: (binding: Actions.Binding, value: Actions.TransferInput): Stream.Stream<Uint8Array, ActionsError> => Stream.unwrap(bound(binding,
      Effect.gen(function* () {
        const scope = yield* Scope.make()
        yield* Effect.addFinalizer((exit) => Scope.close(scope, exit))
        const failure = yield* Deferred.make<never, ActionsError>()
        // Closing child scope tears down socket/process directly; pull-based stream
        // timeouts alone cannot release resources under a blocked consumer.
        yield* Effect.forkScoped(Effect.sleep("5 minutes").pipe(Effect.andThen(Effect.gen(function* () {
          const error = OutputNative.error(binding, "transfer_failed", "CI output transfer deadline exceeded")
          yield* Deferred.fail(failure, error)
          // Finish resource finalizers even if downstream disposes this watchdog.
          yield* Scope.close(scope, Exit.fail(error)).pipe(Effect.uninterruptible)
        }))))
        const stream = yield* Effect.gen(function* () {
          const target = yield* OutputTarget.resolve(input.transport, input.reader, binding, value)
          if (binding.provider.kind === "github") return input.transport.bytes(binding, target.request)
          const opened = yield* OutputDownload.open(input.transport, input.reader, binding, value, target, true)
          if (opened.response.status === 206 || opened.response.headers["content-range"] !== undefined)
            return yield* OutputNative.error(binding, "transfer_failed", "CI output endpoint returned an unrequested partial transfer")
          yield* OutputNative.checked(binding, () => OutputHeaders.info(binding, opened.info, opened.response.headers))
          return opened.response.body
        }).pipe(Scope.provide(scope), Effect.raceFirst(Deferred.await(failure)))
        // Bind the channel's actual resource scope, not merely its service context.
        // Nested Stream.unwrap (GH spawn) acquires in this watchdog-owned scope.
        const pull = yield* Stream.toPull(stream).pipe(Scope.provide(scope), Effect.raceFirst(Deferred.await(failure)))
        // Preserve deadline failure across downstream-held chunks and cached EOF.
        return Stream.fromPull(Effect.succeed(Effect.gen(function* () {
          if (yield* Deferred.isDone(failure)) return yield* Deferred.await(failure)
          const exit = yield* pull.pipe(Effect.raceFirst(Deferred.await(failure)), Effect.exit)
          if (yield* Deferred.isDone(failure)) return yield* Deferred.await(failure)
          return yield* exit
        }))).pipe(
          Stream.mapError((error) => new ActionsError({ ...error, message: error.message, disposition: error.disposition,
            bindingID: binding.id, provider: binding.provider.kind })))
      }))),
  }
}
~~~~

## AUT2-C40

```json
{"block_id":"AUT2-C40","type":"literal_source_excerpt","request_namespace":"J1 canonical groups; J2 mapping in index","requests":["RE-AUT2-06"],"body_anchors":["A35"],"requested_subject":"Targets/IDs/attempts/single-file path, ownership e endpoint exato","source_category":"owned_population_source","path":"packages/core/src/actions/output/target.ts","archive":"sources/packages/core/src/actions/output/target.ts","commit":"1cde2ff7a71bcf7aecb5d030917b577165135d38","source_git_blob_sha":"9195013d45d2b5deec234398d8a4fde834bf8edd","source_sha256":"162391bc77848f4dc03cb6b340375cfc732bc7f3137a810998196ef17f03bf2d","source_bytes":7464}
```

```json
{"first_line":1,"last_line":103,"bytes":7464,"sha256":"162391bc77848f4dc03cb6b340375cfc732bc7f3137a810998196ef17f03bf2d"}
```

~~~~typescript
export * as OutputTarget from "./target"

import { Actions } from "@orchestra/schema/actions"
import { Effect } from "effect"
import { ActionsContract } from "../contract"
import { ActionsError } from "../error"
import { OutputNative } from "./native"
import { OutputHeaders } from "./headers"

export type Target = { readonly request: ActionsContract.BoundRequest; readonly info: Actions.TransferInfo }

export const resolve = Effect.fn("ActionsOutput.target")(function* (
  transport: ActionsContract.Transport, reader: ActionsContract.ReadAdapter, binding: Actions.Binding, input: Actions.TransferInput,
): Effect.fn.Return<Target, ActionsError> {
  yield* OutputNative.checked(binding, () => {
    OutputNative.selection(binding, input, Actions.TransferInput, ["kind", "id", "runID", "attempt", "path"])
    OutputNative.id(binding, input.id)
    if (input.runID !== undefined) OutputNative.id(binding, input.runID)
    if (input.attempt !== undefined && (!Number.isSafeInteger(input.attempt) || input.attempt < 1))
      throw OutputNative.error(binding, "invalid_input", "CI output attempt must be a safe positive native integer")
    if (input.kind === "secureFile") throw OutputNative.error(binding, "capability_unavailable", "Secure Files are outside CI output")
    if (input.path !== undefined) {
      OutputNative.filePath(binding, input.path)
      if (binding.provider.kind !== "gitlab" || input.kind !== "artifact")
        throw OutputNative.error(binding, "capability_unavailable", "Direct artifact file reads require the native GitLab job API")
    }
    if (binding.provider.kind === "gitlab" && (input.kind === "runLog" || input.attempt !== undefined))
      throw OutputNative.error(binding, "capability_unavailable", "GitLab exposes job traces and immutable job IDs, not pipeline logs or numeric run attempts")
    if (binding.provider.kind === "github" && input.kind === "artifact" && input.attempt !== undefined)
      throw OutputNative.error(binding, "capability_unavailable", "GitHub artifact metadata does not attribute an artifact to a numeric run attempt")
    if (input.kind === "runLog" && input.runID !== undefined && input.id !== input.runID)
      throw OutputNative.error(binding, "invalid_input", "Run log ID must equal the selected run ID")
  })
  const root = yield* OutputNative.project(transport, binding)
  if (binding.provider.kind === "gitlab") {
    const response = yield* OutputNative.get(transport, binding, `${root}/jobs/${input.id}`)
    const job = yield* OutputNative.checked(binding, () => {
      const job = OutputNative.decode(binding, OutputNative.GitLabJob, response.data)
      OutputNative.gitlabOwner(binding, job, input.id, input.runID)
      if (job.erased_at) throw OutputNative.error(binding, "not_found", "GitLab job output was erased")
      if (input.kind === "artifact" && OutputNative.gitlabState(job) === "expired")
        throw OutputNative.error(binding, "not_found", "GitLab job artifacts are expired or unavailable")
      if (input.kind === "artifact" && !OutputNative.gitlabArchive(job))
        throw OutputNative.error(binding, "capability_unavailable", "GitLab job has no native downloadable artifact archive")
      return job
    })
    yield* OutputNative.run(reader, binding, String(job.pipeline.id))
    const archive = OutputNative.gitlabArchive(job)
    const path = input.path === undefined ? undefined : yield* OutputNative.checked(binding, () => OutputNative.filePath(binding, input.path ?? ""))
    return { request: { method: "GET", path: `${root}/jobs/${input.id}/${input.kind === "jobLog" ? "trace" : `artifacts${path === undefined ? "" : `/${path}`}`}` },
      info: { filename: OutputHeaders.filename(input.kind === "jobLog" ? `job-${input.id}.log`
        : input.path ?? archive?.filename ?? `job-${input.id}-artifacts.zip`, `job-${input.id}.bin`),
        contentType: input.kind === "jobLog" || path !== undefined ? "text/plain" : "application/zip",
        ...(input.kind === "artifact" && path === undefined && archive ? { size: archive.size } : {}) } }
  }
  if (input.kind === "artifact") {
    const response = yield* OutputNative.get(transport, binding, `${root}/actions/artifacts/${input.id}`)
    const artifact = yield* OutputNative.checked(binding, () => {
      const value = OutputNative.decode(binding, OutputNative.Artifact, response.data)
      OutputNative.artifactOwner(binding, value, input.id, input.runID)
      if (value.expired) throw OutputNative.error(binding, "not_found", "GitHub artifact has expired")
      return value
    })
    yield* OutputNative.run(reader, binding, String(artifact.workflow_run.id))
    return { request: { method: "GET", path: `${root}/actions/artifacts/${input.id}/zip` },
      info: { filename: OutputHeaders.filename(`${artifact.name}.zip`, `artifact-${input.id}.zip`), contentType: "application/zip",
        size: artifact.size_in_bytes, ...(artifact.digest ? { digest: artifact.digest } : {}) } }
  }
  if (input.kind === "jobLog") {
    const response = yield* OutputNative.get(transport, binding, `${root}/actions/jobs/${input.id}`)
    const job = yield* OutputNative.checked(binding, () => {
      const value = OutputNative.decode(binding, OutputNative.GitHubJob, response.data)
      if (String(value.id) !== input.id || (input.runID !== undefined && String(value.run_id) !== input.runID) ||
        (input.attempt !== undefined && value.run_attempt !== input.attempt))
        throw OutputNative.error(binding, "binding_stale", "GitHub log job differs from the selected job, run or attempt")
      return value
    })
    yield* requireAttempt(transport, reader, binding, root, String(job.run_id), job.run_attempt)
    return { request: { method: "GET", path: `${root}/actions/jobs/${input.id}/logs` },
      info: { filename: `job-${input.id}-attempt-${job.run_attempt}.log`, contentType: "text/plain" } }
  }
  const run = yield* OutputNative.run(reader, binding, input.id)
  const attempt = input.attempt ?? run.attempt
  if (attempt === undefined) return yield* OutputNative.error(binding, "capability_unavailable", "GitHub run metadata did not identify the log attempt")
  yield* requireAttempt(transport, reader, binding, root, input.id, attempt, run)
  return { request: { method: "GET", path: `${root}/actions/runs/${input.id}/attempts/${attempt}/logs` },
    info: { filename: `run-${input.id}-attempt-${attempt}-logs.zip`, contentType: "application/zip" } }
})

const requireAttempt = Effect.fn("ActionsOutput.attempt")(function* (
  transport: ActionsContract.Transport, reader: ActionsContract.ReadAdapter, binding: Actions.Binding, root: string,
  runID: string, attempt: number, observed?: Actions.Run,
) {
  const run = observed ?? (yield* OutputNative.run(reader, binding, runID))
  if (run.attempt === undefined || attempt > run.attempt)
    return yield* OutputNative.error(binding, "binding_stale", "Selected GitHub log attempt does not exist on this run")
  const response = yield* OutputNative.get(transport, binding, `${root}/actions/runs/${runID}/attempts/${attempt}`)
  yield* OutputNative.checked(binding, () => {
    const value = OutputNative.decode(binding, OutputNative.GitHubAttempt, response.data)
    if (String(value.id) !== runID || String(value.repository.id) !== binding.projectID || value.run_attempt !== attempt)
      throw OutputNative.error(binding, "binding_stale", "GitHub native log attempt belongs to a different repository, run or attempt")
  })
})
~~~~

## AUT2-C41

```json
{"block_id":"AUT2-C41","type":"literal_source_excerpt","request_namespace":"J1 canonical groups; J2 mapping in index","requests":["RE-AUT2-04","RE-AUT2-06"],"body_anchors":["A35"],"requested_subject":"Schemas/ownership/erased/expired e parsers de outputs nativos","source_category":"owned_population_source","path":"packages/core/src/actions/output/native.ts","archive":"sources/packages/core/src/actions/output/native.ts","commit":"1cde2ff7a71bcf7aecb5d030917b577165135d38","source_git_blob_sha":"93f8202c25955c4105c25f2ccdfada2df3352ad3","source_sha256":"200f3167fa58f45c0d9470ae9d50145392a05bb23f193c22e750214ca73a775b","source_bytes":10694}
```

```json
{"first_line":1,"last_line":167,"bytes":10694,"sha256":"200f3167fa58f45c0d9470ae9d50145392a05bb23f193c22e750214ca73a775b"}
```

~~~~typescript
export * as OutputNative from "./native"

import { Actions } from "@orchestra/schema/actions"
import { Effect, Option, Schema } from "effect"
import { ActionsContract } from "../contract"
import { ActionsError } from "../error"
import { ActionsCursor } from "../cursor"
import { ActionsResponse } from "../transport/response"

export const ID = Schema.Union([
  Schema.String.check(Schema.isPattern(/^[1-9]\d{0,127}$/)),
  Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER })),
])
export const Count = Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER }))
export const Positive = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER }))
export const Text = Schema.String.check(Schema.isMaxLength(4096))
export const Time = Schema.String.check(Schema.isMaxLength(64),
  Schema.isPattern(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/),
  Schema.makeFilter((value: string) => Number.isFinite(Date.parse(value)) ? undefined : "Invalid native timestamp"))
export const Artifact = Schema.Struct({
  id: ID, name: Text, size_in_bytes: Count, expired: Schema.Boolean,
  created_at: Schema.optionalKey(Time), updated_at: Schema.optionalKey(Time), expires_at: Schema.optionalKey(Schema.NullOr(Time)),
  digest: Schema.optionalKey(Schema.NullOr(Schema.String.check(Schema.isPattern(/^sha256:[a-f0-9]{64}$/i)))),
  workflow_run: Schema.Struct({ id: ID, repository_id: ID, head_repository_id: Schema.optionalKey(ID),
    head_branch: Schema.optionalKey(Schema.NullOr(Text)), head_sha: Schema.optionalKey(Text) }),
})
export const GitHubJob = Schema.Struct({ id: ID, run_id: ID, run_attempt: Positive, name: Text })
export const GitHubAttempt = Schema.Struct({ id: ID, run_attempt: Positive, repository: Schema.Struct({ id: ID }) })
export const GitLabFile = Schema.Struct({ file_type: Text, size: Count, filename: Text, file_format: Schema.optionalKey(Schema.NullOr(Text)) })
const EmptyArtifactFile = Schema.Struct({}).annotate({ parseOptions: { onExcessProperty: "error" } })
export const GitLabJob = Schema.Struct({
  id: ID, name: Text, status: Schema.NullOr(Text), pipeline: Schema.Struct({ id: ID, project_id: ID }),
  artifacts: Schema.Array(GitLabFile).check(Schema.isMaxLength(1000)),
  artifacts_file: Schema.optionalKey(Schema.NullOr(Schema.Union([Schema.Struct({ filename: Text, size: Count }), EmptyArtifactFile]))),
  artifacts_expire_at: Schema.optionalKey(Schema.NullOr(Time)), erased_at: Schema.optionalKey(Schema.NullOr(Time)),
})

export function error(binding: Actions.Binding, kind: Actions.ErrorKind, message: string) {
  return new ActionsError({ kind, message, bindingID: binding.id, provider: binding.provider.kind,
    disposition: kind === "invalid_input" || kind === "capability_unavailable" ? "definitely_unsent" : "unknown" })
}

export function checked<A>(binding: Actions.Binding, body: () => A) {
  return Effect.try({ try: body, catch: (cause) => cause instanceof ActionsError ? cause
    : error(binding, "transport_failed", "CI output metadata could not be interpreted safely") })
}

export function decode<A>(binding: Actions.Binding, schema: Schema.Decoder<A>, data: unknown): A {
  const decoded = Schema.decodeUnknownOption(schema)(data)
  if (Option.isNone(decoded)) throw error(binding, "transport_failed", "Provider returned invalid native CI output metadata")
  return decoded.value
}

export function id(binding: Actions.Binding, value: string) {
  if (typeof value !== "string" || !/^[1-9]\d{0,127}$/.test(value))
    throw error(binding, "invalid_input", "CI output target ID must be a canonical positive decimal")
  return value
}

export function root(binding: Actions.Binding) {
  return `${binding.provider.kind === "github" ? "repositories" : "projects"}/${id(binding, binding.projectID)}`
}

export function selection(binding: Actions.Binding, input: object, schema: Schema.Top, fields: readonly string[]) {
  if (Option.isNone(Schema.decodeUnknownOption(Schema.toType(schema))(input)) || Object.keys(input).some((key) => !fields.includes(key)))
    throw error(binding, "invalid_input", "CI output selection contains invalid or unsupported fields")
}

export function filePath(binding: Actions.Binding, value: string) {
  if (!value || value.length > 4096 || /[\\%?#{}:\x00-\x1f\x7f]/.test(value) ||
    value.split("/").some((part) => !part || part === "." || part === ".."))
    throw error(binding, "invalid_input", "Artifact file path must be an exact archive-relative native path")
  return value.split("/").map(encodeURIComponent).join("/")
}

export const get = Effect.fn("ActionsOutput.get")(function* (transport: ActionsContract.Transport, binding: Actions.Binding, path: string, query?: ActionsContract.Request["query"]) {
  const response = yield* transport.request(binding, { method: "GET", path, ...(query ? { query } : {}) })
  if (response.status !== 200) return yield* ActionsResponse.failure(binding.provider, 1, Buffer.alloc(0), response.status, { ...response.headers })
  yield* checked(binding, () => {
    if (Buffer.byteLength(JSON.stringify(response.data)) > 2 * 1024 * 1024)
      throw error(binding, "metadata_truncated", "CI output metadata capture limit exceeded")
  })
  return response
})

export const project = Effect.fn("ActionsOutput.project")(function* (transport: ActionsContract.Transport, binding: Actions.Binding) {
  const path = yield* checked(binding, () => root(binding))
  const response = yield* get(transport, binding, path)
  yield* checked(binding, () => {
    if (String(decode(binding, Schema.Struct({ id: ID }), response.data).id) !== binding.projectID)
      throw error(binding, "binding_stale", "CI output project identity differs from the immutable binding")
  })
  return path
})

export const run = Effect.fn("ActionsOutput.run")(function* (reader: ActionsContract.ReadAdapter, binding: Actions.Binding, runID: string) {
  yield* checked(binding, () => id(binding, runID))
  const value = yield* reader.run(binding, runID)
  return yield* checked(binding, () => {
    if (Buffer.byteLength(JSON.stringify(value)) > 2 * 1024 * 1024)
      throw error(binding, "metadata_truncated", "CI output run metadata capture limit exceeded")
    const run = decode(binding, Actions.Run, value)
    if (run.attempt !== undefined && (!Number.isSafeInteger(run.attempt) || run.attempt < 1))
      throw error(binding, "transport_failed", "CI output run metadata returned an invalid attempt")
    if (run.id !== runID || run.bindingID !== binding.id || (run.repositoryID !== undefined && run.repositoryID !== binding.projectID))
      throw error(binding, "binding_stale", "CI output run does not belong to this binding and run selection")
    return run
  })
})

export function pagination(binding: Actions.Binding, request: ActionsContract.Request, scope: string,
  filters: Readonly<Record<string, unknown>>, response: ActionsContract.Response, page: number, count: number, limit: number, nativeTotal?: number) {
  const next = ActionsCursor.next(response.headers)
  const headerTotal = ActionsCursor.total(response.headers)
  const total = nativeTotal ?? headerTotal
  const fail = () => error(binding, "transport_failed", "Provider returned invalid CI output pagination metadata")
  if (count > limit || (next !== undefined && (next !== page + 1 || count === 0)) ||
    (nativeTotal !== undefined && headerTotal !== undefined && nativeTotal !== headerTotal)) throw fail()
  if (response.headers.link !== undefined) {
    const origin = binding.provider.apiOrigin.replace(/\/api\/v4\/?$/, "")
    const base = binding.provider.kind === "gitlab" ? `${origin}/api/v4` : origin
    const expected = new URL(`${base}/${request.path}`)
    response.headers.link.split(",").forEach((part) => {
      const match = /^\s*<([^>]+)>;\s*rel="?(next|prev|first|last)"?\s*$/.exec(part)
      const url = match && URL.parse(match[1])
      if (!url || url.origin !== expected.origin || url.pathname !== expected.pathname || url.username || url.password || url.hash) throw fail()
      const value = url.searchParams.get("page")
      if (!value || !/^[1-9]\d*$/.test(value) || Number(value) > 100_000) throw fail()
      const wanted = { ...request.query, page: Number(value) }
      if (Array.from(url.searchParams).length !== Object.keys(wanted).length ||
        Object.entries(wanted).some(([key, value]) => url.searchParams.get(key) !== String(value))) throw fail()
    })
    if (ActionsCursor.next({ link: response.headers.link }) !== next) throw fail()
  }
  if (total !== undefined && (total < (page - 1) * limit + count ||
    (next === undefined && total > page * limit) || (next !== undefined && total <= page * limit))) throw fail()
  if (next === undefined && total === undefined && count === limit && response.headers.link === undefined && response.headers["x-next-page"] === undefined) throw fail()
  return { ...(next === undefined ? {} : { next: ActionsCursor.encode(binding, scope, filters, next) }),
    ...(total === undefined ? {} : { total }), capturedAt: Date.now() }
}

export function gitlabOwner(binding: Actions.Binding, job: typeof GitLabJob.Type, jobID?: string, runID?: string) {
  if (String(job.pipeline.project_id) !== binding.projectID || (jobID !== undefined && String(job.id) !== jobID) ||
    (runID !== undefined && String(job.pipeline.id) !== runID))
    throw error(binding, "binding_stale", "GitLab artifact job does not belong to the selected project, pipeline and job")
}

export function artifactOwner(binding: Actions.Binding, artifact: typeof Artifact.Type, artifactID?: string, runID?: string) {
  if (String(artifact.workflow_run.repository_id) !== binding.projectID || (artifactID !== undefined && String(artifact.id) !== artifactID) ||
    (runID !== undefined && String(artifact.workflow_run.id) !== runID))
    throw error(binding, "binding_stale", "GitHub artifact does not belong to the selected repository, run and artifact")
}

export function gitlabState(job: typeof GitLabJob.Type) {
  if (job.erased_at) return "erased"
  if (job.artifacts_expire_at && Date.parse(job.artifacts_expire_at) <= Date.now()) return "expired"
  if (gitlabArchive(job)) return "available"
  return "unavailable"
}

export function gitlabArchive(job: typeof GitLabJob.Type) {
  const file = job.artifacts_file
  if (file && "filename" in file && typeof file.filename === "string" && "size" in file && typeof file.size === "number" && file.filename)
    return { filename: file.filename, size: file.size }
  const artifact = job.artifacts.find((file) => file.file_type === "archive" && !!file.filename)
  return artifact && { filename: artifact.filename, size: artifact.size }
}
~~~~

## AUT2-C42

```json
{"block_id":"AUT2-C42","type":"literal_source_excerpt","request_namespace":"J1 canonical groups; J2 mapping in index","requests":["RE-AUT2-06"],"body_anchors":["A36"],"requested_subject":"Open/redirect/renew antes de bytes, revalidação e renew=false","source_category":"owned_population_source","path":"packages/core/src/actions/output/download.ts","archive":"sources/packages/core/src/actions/output/download.ts","commit":"1cde2ff7a71bcf7aecb5d030917b577165135d38","source_git_blob_sha":"b3e1e73f3a0f7f3604bae702cb749983f4178f29","source_sha256":"4dcb6f81b4fd186dbcd19da13ff1a0c0a47df7ba9e4ea7eb8ee5734959d4b8f7","source_bytes":2496}
```

```json
{"first_line":1,"last_line":39,"bytes":2496,"sha256":"4dcb6f81b4fd186dbcd19da13ff1a0c0a47df7ba9e4ea7eb8ee5734959d4b8f7"}
```

~~~~typescript
export * as OutputDownload from "./download"

import { Actions } from "@orchestra/schema/actions"
import { Effect, Scope } from "effect"
import { ActionsContract } from "../contract"
import { ActionsError } from "../error"
import { ActionsResponse } from "../transport/response"
import { OutputNative } from "./native"
import { OutputSigned } from "./signed"
import { OutputTarget } from "./target"

export const open = Effect.fn("ActionsOutput.downloadOpen")(function* (
  transport: ActionsContract.Transport, reader: ActionsContract.ReadAdapter, binding: Actions.Binding,
  input: Actions.TransferInput, target: OutputTarget.Target, renew = false,
): Effect.fn.Return<{ response: ActionsContract.RawResponse; info: Actions.TransferInfo }, ActionsError, Scope.Scope> {
  if (!transport.open) return yield* OutputNative.error(binding, "capability_unavailable", "GitLab CI output requires the scoped native raw-opening transport")
  const native = yield* transport.open(binding, target.request)
  if (native.status >= 200 && native.status < 300) return { response: native, info: target.info }
  if (![301, 302, 303, 307, 308].includes(native.status)) {
    yield* native.close
    return yield* ActionsResponse.failure(binding.provider, 1, Buffer.alloc(0), native.status, { ...native.headers })
  }
  const location = native.headers.location
  yield* native.close
  if (!location) return yield* OutputNative.error(binding, "transfer_failed", "Native CI output redirect has no Location")
  const base = yield* OutputNative.checked(binding, () => new URL(`${new URL(binding.provider.apiOrigin).origin}/api/v4/${target.request.path}`))
  const signed = yield* OutputSigned.follow(binding, location, base)
  if (signed.status >= 200 && signed.status < 300) return { response: signed, info: target.info }
  yield* signed.close
  // One read-only renewal, before any byte reaches caller. Revalidate identities
  // and GET original native endpoint; never replay an expired signed URL.
  if (renew && [401, 403, 404].includes(signed.status)) {
    const fresh = yield* OutputTarget.resolve(transport, reader, binding, input)
    if (fresh.request.path !== target.request.path)
      return yield* OutputNative.error(binding, "binding_stale", "Signed URL renewal changed the selected native output endpoint")
    return yield* open(transport, reader, binding, input, fresh, false)
  }
  return yield* ActionsResponse.failure(binding.provider, 1, Buffer.alloc(0), signed.status, { ...signed.headers })
})
~~~~

## AUT2-C43

```json
{"block_id":"AUT2-C43","type":"literal_source_excerpt","request_namespace":"J1 canonical groups; J2 mapping in index","requests":["RE-AUT2-06"],"body_anchors":["A36"],"requested_subject":"HTTPS sem credenciais nativas, validação de cada hop, bounds e EOF completo","source_category":"owned_population_source","path":"packages/core/src/actions/output/signed.ts","archive":"sources/packages/core/src/actions/output/signed.ts","commit":"1cde2ff7a71bcf7aecb5d030917b577165135d38","source_git_blob_sha":"e3f97544c559f1cc5b67623a047a431a37219117","source_sha256":"0432ae5abfc0aa4d7cefb225433a0da3e3cff8539e110dab54dafedf9e833bc8","source_bytes":5817}
```

```json
{"first_line":1,"last_line":90,"bytes":5817,"sha256":"0432ae5abfc0aa4d7cefb225433a0da3e3cff8539e110dab54dafedf9e833bc8"}
```

~~~~typescript
export * as OutputSigned from "./signed"

import { request } from "node:https"
import type { IncomingMessage } from "node:http"
import type { Socket } from "node:net"
import { checkServerIdentity } from "node:tls"
import { NodeStream } from "@effect/platform-node"
import { Actions } from "@orchestra/schema/actions"
import { Deferred, Effect, Exit, Scope, Stream } from "effect"
import { ActionsContract } from "../contract"
import { ActionsError } from "../error"
import { OutputNative } from "./native"

export function destination(binding: Actions.Binding, location: string | undefined, base?: URL) {
  const url = location !== undefined && URL.parse(location, base)
  if (!location || location.length > 8192 || /[\s\\\x00-\x1f\x7f]/.test(location) ||
    /%(?:0[0-9a-f]|1[0-9a-f]|7f)/i.test(location) || !url || url.protocol !== "https:" || !url.hostname ||
    url.username || url.password || url.hash || location.includes("#"))
    throw OutputNative.error(binding, "host_mismatch", "Signed CI output destination must be credential-free HTTPS without fragments or controls")
  return url
}

// Bare Node HTTPS. Deliberately accepts neither native credentials, client TLS
// material, cookies nor caller headers. Every redirect is separately validated.
export const open = Effect.fn("ActionsOutput.signedOpen")(function* (
  binding: Actions.Binding, url: URL,
): Effect.fn.Return<ActionsContract.RawResponse, ActionsError, Scope.Scope> {
  yield* OutputNative.checked(binding, () => destination(binding, url.href))
  const scope = yield* Scope.make()
  yield* Effect.addFinalizer((exit) => Scope.close(scope, exit))
  return yield* Effect.gen(function* () {
    const response = yield* Deferred.make<IncomingMessage, ActionsError>()
    const failure = yield* Deferred.make<never, ActionsError>()
    const state = { response: undefined as IncomingMessage | undefined, socket: undefined as Socket | undefined,
      error: undefined as ActionsError | undefined }
    const abort = new AbortController()
    const req = yield* Effect.acquireRelease(Effect.try({
      try: () => request(url, {
        method: "GET", agent: false, signal: abort.signal, rejectUnauthorized: true, minVersion: "TLSv1.2",
        checkServerIdentity, maxHeaderSize: 16 * 1024,
        headers: { Accept: "application/octet-stream", Connection: "close" },
      }),
      catch: () => OutputNative.error(binding, "transfer_failed", "Signed CI output request could not be opened"),
    }), (req) => Effect.sync(() => { abort.abort(); state.response?.destroy(); state.socket?.destroy(); req.destroy() }))
    const fail = (error: ActionsError) => {
      state.error ??= error
      Deferred.doneUnsafe(response, Exit.fail(state.error))
      Deferred.doneUnsafe(failure, Exit.fail(state.error))
    }
    req.on("error", () => fail(OutputNative.error(binding, "transfer_failed", "Signed CI output HTTPS or TLS request failed")))
    req.on("socket", (socket) => { state.socket = socket })
    req.once("response", (incoming) => {
      state.response = incoming
      incoming.on("error", () => fail(OutputNative.error(binding, "transfer_failed", "Signed CI output response failed")))
      incoming.on("aborted", () => fail(OutputNative.error(binding, "transfer_failed", "Signed CI output response ended prematurely")))
      Deferred.doneUnsafe(response, Exit.succeed(incoming))
    })
    // Own watchdog closes socket even when downstream holds a chunk forever.
    yield* Effect.forkScoped(Effect.sleep("5 minutes").pipe(Effect.andThen(Effect.sync(() => {
      fail(OutputNative.error(binding, "transfer_failed", "Signed CI output deadline exceeded"))
      abort.abort(); state.response?.destroy(); state.socket?.destroy(); req.destroy()
    }))))
    req.end()
    const incoming = yield* Deferred.await(response).pipe(Effect.timeoutOrElse({ duration: "30 seconds",
      orElse: () => Effect.fail(OutputNative.error(binding, "transfer_failed", "Signed CI output response header deadline exceeded")) }))
    return { status: incoming.statusCode ?? 0,
      headers: Object.fromEntries(Object.entries(incoming.headers)
        .filter((entry): entry is [string, string | string[]] => entry[1] !== undefined)
        .map(([key, value]) => [key, Array.isArray(value) ? value.join(", ") : value])),
      body: NodeStream.fromReadable<Uint8Array, ActionsError>({ evaluate: () => incoming,
        onError: () => state.error ?? OutputNative.error(binding, "transfer_failed", "Signed CI output response failed") }).pipe(
        Stream.concat(Stream.fromEffect(Effect.suspend(() => incoming.complete && !incoming.aborted ? Effect.void
          : Effect.fail(state.error ?? OutputNative.error(binding, "transfer_failed", "Signed CI output response ended prematurely")))).pipe(Stream.drain)),
        Stream.interruptWhen(Deferred.await(failure)), Stream.mapError((error) => state.error ?? error)),
      close: Scope.close(scope, Exit.void) }
  }).pipe(Scope.provide(scope), Effect.tapError(() => Scope.close(scope, Exit.void)))
})

export const follow = Effect.fn("ActionsOutput.signedFollow")(function* (
  binding: Actions.Binding, location: string, base: URL, hops = 0,
): Effect.fn.Return<ActionsContract.RawResponse, ActionsError, Scope.Scope> {
  if (hops >= 3) return yield* OutputNative.error(binding, "transfer_failed", "Signed CI output redirect limit exceeded")
  const url = yield* OutputNative.checked(binding, () => destination(binding, location, base))
  const response = yield* open(binding, url)
  if (![301, 302, 303, 307, 308].includes(response.status)) return response
  const next = response.headers.location
  yield* response.close
  if (!next) return yield* OutputNative.error(binding, "transfer_failed", "Signed CI output redirect has no Location")
  return yield* follow(binding, next, url, hops + 1)
})
~~~~

## AUT2-C44

```json
{"block_id":"AUT2-C44","type":"literal_source_excerpt","request_namespace":"J1 canonical groups; J2 mapping in index","requests":["RE-AUT2-06"],"body_anchors":["A36"],"requested_subject":"Parsing e sanitização de filename/headers, digest como metadado","source_category":"owned_population_source","path":"packages/core/src/actions/output/headers.ts","archive":"sources/packages/core/src/actions/output/headers.ts","commit":"1cde2ff7a71bcf7aecb5d030917b577165135d38","source_git_blob_sha":"f7d5a6f28a5e7752f07ec01008136dc470c6fe61","source_sha256":"80cb68c5a02e39fd450630d1e8817d7435ada999c212c3b1e8e568a0d1a35549","source_bytes":3345}
```

```json
{"first_line":1,"last_line":46,"bytes":3345,"sha256":"80cb68c5a02e39fd450630d1e8817d7435ada999c212c3b1e8e568a0d1a35549"}
```

~~~~typescript
export * as OutputHeaders from "./headers"

import { Actions } from "@orchestra/schema/actions"
import { OutputNative } from "./native"

// Additive metadata proposal for parent Schema/Protocol assembly. No Range request
// is invented when the public input has no range field.
export type Info = Actions.TransferInfo & { readonly contentRange?: string; readonly acceptRanges?: string }

export function filename(value: string, fallback: string) {
  const name = value.split(/[\\/]/).at(-1)?.replace(/[\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069<>:"|?*]/g, "_").trim().slice(0, 200).replace(/[. ]+$/, "")
  if (!name || name === "." || name === "..") return fallback
  return /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name) ? `_${name}` : name
}

export function info(binding: Actions.Binding, native: Actions.TransferInfo, headers: Readonly<Record<string, string>>): Info {
  const disposition = headers["content-disposition"]
  if (disposition !== undefined && (disposition.length > 8192 || /[\x00-\x1f\x7f]/.test(disposition)))
    throw OutputNative.error(binding, "transport_failed", "Provider returned invalid CI output Content-Disposition")
  const extended = disposition && /(?:^|;)\s*filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1]
  const plain = disposition && /(?:^|;)\s*filename=(?:"([^"\r\n]*)"|([^;]*))/i.exec(disposition)
  const name = extended ? decodeURIComponent(extended.trim()) : plain?.[1] ?? plain?.[2]?.trim()
  const type = safeHeader(binding, headers["content-type"], 512)
  if (type !== undefined && !/^[\w!#$&^.+-]+\/[\w!#$&^.+-]+(?:\s*;[^\r\n]*)?$/.test(type))
    throw OutputNative.error(binding, "transport_failed", "Provider returned invalid CI output Content-Type")
  const length = headers["content-length"]
  if (length !== undefined && (!/^\d+$/.test(length) || !Number.isSafeInteger(Number(length))))
    throw OutputNative.error(binding, "transport_failed", "Provider returned invalid CI output Content-Length")
  const digest = safeHeader(binding, headers["content-digest"] ?? headers.digest ?? headers["x-amz-checksum-sha256"] ?? native.digest, 1024)
  const contentRange = safeHeader(binding, headers["content-range"], 128)
  if (contentRange !== undefined && !/^bytes (?:\d+-\d+|\*)\/(?:\d+|\*)$/.test(contentRange))
    throw OutputNative.error(binding, "transport_failed", "Provider returned invalid CI output Content-Range")
  const acceptRanges = headers["accept-ranges"]
  if (acceptRanges !== undefined && acceptRanges !== "bytes" && acceptRanges !== "none")
    throw OutputNative.error(binding, "transport_failed", "Provider returned invalid CI output Accept-Ranges")
  return { filename: filename(name ?? native.filename, native.filename), contentType: type ?? native.contentType,
    ...(length === undefined ? (native.size === undefined ? {} : { size: native.size }) : { size: Number(length) }),
    ...(digest === undefined ? {} : { digest }), ...(contentRange === undefined ? {} : { contentRange }),
    ...(acceptRanges === undefined ? {} : { acceptRanges }) }
}

function safeHeader(binding: Actions.Binding, value: string | undefined, maximum: number) {
  if (value !== undefined && (value.length > maximum || /[\x00-\x1f\x7f]/.test(value)))
    throw OutputNative.error(binding, "transport_failed", "Provider returned invalid CI output transfer headers")
  return value
}
~~~~

## AUT2-X01

```json
{"block_id":"AUT2-X01","type":"literal_source_excerpt","request_namespace":"J1 canonical groups; J2 mapping in index","requests":["RE-AUT2-03","RE-AUT2-04","RE-AUT2-06"],"body_anchors":["A23","A35"],"requested_subject":"ResourceKind/ResourceListInput/TransferInput/TransferInfo consumidos pelo Core","source_category":"external_S1_04_raw_source","path":"packages/schema/src/actions/resource.ts","archive":"external-sources/packages/schema/src/actions/resource.ts","commit":"1cde2ff7a71bcf7aecb5d030917b577165135d38","source_git_blob_sha":"1346f69568a3796c88a55ed9d06ed4cc762aa93b","source_sha256":"5579f778bc5055f362058bf0e9386e6098af2f2cba3700ef68de1381aab6f576","source_bytes":2429}
```

```json
{"first_line":1,"last_line":57,"bytes":2429,"sha256":"5579f778bc5055f362058bf0e9386e6098af2f2cba3700ef68de1381aab6f576"}
```

~~~~typescript
import { Schema } from "effect"
import { BindingID } from "./identity"
import { optional, PositiveInt } from "../schema"

export const ResourceKind = Schema.Literals([
  "artifacts", "environments", "deployments", "variables", "runners", "caches", "schedules",
  "triggers", "secureFiles", "resourceGroups", "pipelineVariables", "testReports", "policy",
]).annotate({ identifier: "Actions.ResourceKind" })
export type ResourceKind = typeof ResourceKind.Type

export const Resource = Schema.Struct({
  id: Schema.NonEmptyString,
  bindingID: BindingID,
  kind: ResourceKind,
  name: Schema.String,
  scope: optional(Schema.String),
  owner: optional(Schema.String),
  status: optional(Schema.String),
  sensitive: optional(Schema.Boolean),
  // Provider details are JSON, not unrestricted runtime values. Adapters redact sensitive fields.
  data: Schema.Json,
}).annotate({ identifier: "Actions.Resource" })
export interface Resource extends Schema.Schema.Type<typeof Resource> {}

export const ResourceListInput = Schema.Struct({
  kind: ResourceKind,
  runID: optional(Schema.String),
  resourceID: optional(Schema.String),
  scope: optional(Schema.String),
  ref: optional(Schema.String),
  query: optional(Schema.String),
  cursor: optional(Schema.String),
  limit: optional(PositiveInt),
}).annotate({ identifier: "Actions.ResourceListInput" })
export interface ResourceListInput extends Schema.Schema.Type<typeof ResourceListInput> {}

export const ResourcePage = Schema.Struct({
  items: Schema.Array(Resource), next: optional(Schema.String), total: optional(Schema.Number), capturedAt: Schema.Number,
}).annotate({ identifier: "Actions.ResourcePage" })
export interface ResourcePage extends Schema.Schema.Type<typeof ResourcePage> {}

export const TransferInput = Schema.Struct({
  kind: Schema.Literals(["jobLog", "runLog", "artifact", "secureFile"]),
  id: Schema.NonEmptyString,
  runID: optional(Schema.String),
  attempt: optional(PositiveInt),
  path: optional(Schema.String),
}).annotate({ identifier: "Actions.TransferInput" })
export interface TransferInput extends Schema.Schema.Type<typeof TransferInput> {}

export const TransferInfo = Schema.Struct({
  filename: Schema.String,
  contentType: Schema.String,
  size: optional(Schema.Number),
  digest: optional(Schema.String),
}).annotate({ identifier: "Actions.TransferInfo" })
export interface TransferInfo extends Schema.Schema.Type<typeof TransferInfo> {}
~~~~
