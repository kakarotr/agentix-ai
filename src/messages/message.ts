import { AssistantContentBlock, UserContentBlock } from "./content-block.js"

interface UserMessage {
  role: "user"
  content: string | UserContentBlock[]
}

interface AssistantMessage {
  role: "assistant"
  content: string | AssistantContentBlock[]
}

type ModelMessage = UserMessage | AssistantMessage

export type {
  UserMessage,
  AssistantMessage,
  ModelMessage
}