# Import a session transcript

`orchestra import transcript.json` restores text from an Orchestra CLI export or an app export containing `messages: [{ info, parts }]`. Text parts in an app message or native assistant content are joined in their original order. File-only and tool messages are skipped.

The importer validates the whole transcript before creating a Session and refuses a Session ID that already exists. Each restored message is recorded as synthetic context with execution disabled. Importing does not start a model, execution host, or tool call. The command completes after all text has been recorded.
