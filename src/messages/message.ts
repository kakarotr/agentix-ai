import { AssistantContentBlock, UserContentBlock } from "./content-block.js"

interface UserMessage {
  role: "user"
  content: UserContentBlock[]
}

interface AssistantMessage {
  role: "assistant"
  content: AssistantContentBlock[]
}

type ModelMessage = UserMessage | AssistantMessage

export {
  UserMessage,
  AssistantMessage,
  ModelMessage
}