interface TextBlock {
  type: "text"
  text: string
}

interface ImageBase64Source {
  data: string
  mediaType: string
  type: "base64"
}

interface ImageBlock {
  type: "image"
  source: ImageBase64Source
}

interface ToolUseBlock {
  type: "tool_use"
  id: string
  name: string
  input: Record<string, unknown>
}

interface ToolResultBlock {
  type: "tool_result"
  tool_use_id: string
  content: string | Array<TextBlock | ImageBlock>
}

interface ThinkingBlock {
  type: "thinking"
  thinking: string
  signature: string
}

interface RedactedThinkingBlock {
  type: "redacted_thinking"
  data: string
}

type UserContentBlock = TextBlock | ImageBlock | ToolResultBlock
type AssistantContentBlock = TextBlock | ThinkingBlock | ToolUseBlock | RedactedThinkingBlock

export {
  TextBlock,
  ImageBlock,
  ToolUseBlock,
  ToolResultBlock,
  ThinkingBlock,
  RedactedThinkingBlock,
  UserContentBlock,
  AssistantContentBlock
}