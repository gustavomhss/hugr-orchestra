import { Match, Switch } from "solid-js"
import { UserMessage, AssistantMessage, MessageProps } from "./types"
import { UserMessageDisplay } from "./user"
import { AssistantMessageDisplay } from "./assistant"

export function Message(props: MessageProps) {
  return (
    <Switch>
      <Match when={props.message.role === "user" && props.message}>
        {(userMessage) => (
          <UserMessageDisplay
            message={userMessage() as UserMessage}
            parts={props.parts}
            actions={props.actions}
            useV2Actions={props.useV2Actions}
            comments={props.comments}
          />
        )}
      </Match>
      <Match when={props.message.role === "assistant" && props.message}>
        {(assistantMessage) => (
          <AssistantMessageDisplay
            message={assistantMessage() as AssistantMessage}
            parts={props.parts}
            showAssistantCopyPartID={props.showAssistantCopyPartID}
            showReasoningSummaries={props.showReasoningSummaries}
            useV2Actions={props.useV2Actions}
          />
        )}
      </Match>
    </Switch>
  )
}
