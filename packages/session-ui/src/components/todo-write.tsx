import { createMemo, For, Show } from "solid-js"
import { Checkbox } from "@opencode-ai/ui/checkbox"
import { useI18n } from "@opencode-ai/ui/context/i18n"
import { BasicTool } from "./basic-tool"
import { confirmedTodos } from "./confirmed-todos"
import type { ToolProps } from "./message-part"

export function TodoWrite(props: ToolProps) {
  const i18n = useI18n()
  const todos = createMemo(() => confirmedTodos(props))
  const subtitle = createMemo(() => {
    const list = todos() ?? []
    return `${list.filter((todo) => todo.status === "completed").length}/${list.length}`
  })

  return (
    <Show when={todos()}>
      {(todos) => (
        <BasicTool
          {...props}
          defaultOpen={props.defaultOpen ?? true}
          icon="checklist"
          trigger={{ title: i18n.t("ui.tool.todos"), subtitle: subtitle() }}
        >
          <Show when={todos().length}>
            <div data-component="todos">
              <For each={todos()}>
                {(todo) => (
                  <Checkbox readOnly checked={todo.status === "completed"}>
                    <span
                      data-slot="message-part-todo-content"
                      data-completed={todo.status === "completed" ? "completed" : undefined}
                    >
                      {todo.content}
                    </span>
                  </Checkbox>
                )}
              </For>
            </div>
          </Show>
        </BasicTool>
      )}
    </Show>
  )
}
