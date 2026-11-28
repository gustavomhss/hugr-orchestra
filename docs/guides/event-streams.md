# Event streams

The Promise client exposes event subscriptions as async iterables; the Effect client exposes streams. Neither client reconnects automatically.

Promise SSE parsing accepts valid events without a fixed frame-size ceiling, matching the current Effect decoder and ordinary Promise JSON transport. Large attachments and other event content remain intact. This does not guarantee bounded memory: a large payload or an incomplete frame can retain substantial memory.

Pass an `AbortSignal` in Promise request options to cancel a subscription, or leave its `for await` loop. Ending iteration cancels the response reader and releases its lock. Malformed JSON still fails the subscription with `ClientError` reason `MalformedResponse`.
