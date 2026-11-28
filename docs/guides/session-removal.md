# Removing a session

Deleting a parent session stops the runs of that session and its descendants before deletion finishes. Pending wakeups for those sessions are discarded.

While removal is in progress, the affected sessions cannot accept new prompts, create children or restart. Reusing an affected session ID during that interval also fails. Operations on unrelated session trees can continue.

Canceling the request after removal has taken ownership does not undo the deletion. Removal finishes stopping its runs and cleaning up before releasing that ownership. An explicit resume whose session disappeared reports that the session was not found.
