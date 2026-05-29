import { TextBlock } from "@/messages/content-block.js"

interface ImageBlock {
  type: "image_url"
  imageUrl: { url: string }
}

interface SystemMessage {
  role: "system"
  content: string
}

interface UserMessage {
  role: "user"
  content: string | Array<TextBlock | ImageBlock>
}

interface ToolFunction {
  name: string
  arguments: string
}

interface ToolCall {
  id: string
  type: "function"
  function: ToolFunction
}

interface AssistantMessage {
  role: "assistant"
  content: string | null
  toolCalls?: ToolCall[]
}

interface ToolMessage {
  role: "tool"
  content: string
  toolCallId: string
}

type OpenAIModelMessage = SystemMessage | UserMessage | AssistantMessage | ToolMessage

export {
  SystemMessage,
  UserMessage,
  AssistantMessage,
  ToolMessage,
  OpenAIModelMessage
}
