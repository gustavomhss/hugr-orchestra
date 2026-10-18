# Read API assembly

Four implemented groups are assembled: bindings, durable operation admission/readback,
workflow/source/graph and runs/jobs. Core's Location node supplies the verified read
adapters. Non-Git Locations boot normally; repository validation is lazy on Actions use.

Resource and raw transfer group declarations remain frozen source contracts but are
not exposed by the assembled API until their W3 implementations/handlers exist.
No placeholder success or not_implemented route is installed. Handwritten Client
transfer URLs remain frozen and await that source integration. Public code generation
is rerun for the actual assembled groups.

Run readback confirms only attributable native dispatch/retry/cancellation states;
unattributed receipts and unproved observations remain pending. Resource/source write
readback and native domain mutation payloads remain part of the command work packages.
No operation is re-executed or prepared by readback.
