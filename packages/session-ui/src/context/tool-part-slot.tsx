import { createContext, useContext, type Component } from "solid-js"
import type { Transcript } from "../transcript-model"

/**
 * Lets the host render extra content under a tool part, such as the artifact chips the app draws for capability
 * results. Session UI never depends on the host, so the host supplies the component.
 */
export const ToolPartSlot = createContext<Component<{ part: Transcript.ToolPart }>>()

export const useToolPartSlot = () => useContext(ToolPartSlot)
