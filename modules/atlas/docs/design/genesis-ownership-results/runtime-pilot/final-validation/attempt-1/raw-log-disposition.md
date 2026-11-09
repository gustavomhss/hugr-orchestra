# Raw log disposition — report-only correction

The original run and `log-manifest-attempt-1.json` remain unchanged. The manifest names the original
downloaded log files and their exact SHA-256 digests; it does not now mean those files ship in Git.

Repository guard `agent-scratch` rejected the three newly copied `.log` files. Only those duplicate
repository copies were removed, after comparing every byte against the preserved originals under the
campaign's external `final-ci-failures/` directory. Their three rename-ledger pins were removed as well;
no other pin or record changed, and the guard was not waived or weakened.

Raw originals remain at the exact campaign location recorded in the working session and are also
retrievable by job ID through GitHub Actions while retained. Job IDs and hashes are in the unchanged
manifest. Earlier receipts saying all raw logs were inside this directory describe the superseded
archive arrangement, not a claim that the originals were discarded.

The lead's diagnosis remains: both core jobs failed the same rename guard; Atlas reported five stale
wire/template assertions. The separate scoped test and mutation reports establish the proposed repair;
consumer acceptance, integrated acceptance and repository hygiene remain distinct judgments.
