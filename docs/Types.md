# Types

## 类型定义

- `messages`: 消息相关的类型定义
- `model-client`: 调用模型相关的类型定义
- `tools`: 工具相关的类型定义

## messages

content-block.ts

```ts
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
  toolUseId: string
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
```

message.ts

```ts
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
```

## model-client

```ts
import { AssistantMessage, ModelMessage, ToolUseBlock } from "@/messages/index.js";
import { ToolDefinition } from "@/tools/types.js";

interface OutputTokensDetails {
  thinkingTokens: number
}

interface Usage {
  inputTokens: number
  outputTokens: number
  outputTokensDetails?: OutputTokensDetails
  totalTokens: number
}

type MessageStreamEvent = 
  | { type: "text-delta", text: string }
  | { type: "thinking-delta", text: string }
  | { type: "tool_use", toolUse: ToolUseBlock }
  | { type: "complete", result: ModelResponse }

type StopReason = "end_turn" | "tool_use" | "max_tokens"

interface SamplingArgs {
  temperature?: number
  topK?: number
  topP?: number
  maxTokens: number
  frequencyPenalty?: number
}

interface ModelRequest {
  model: string
  system?: string
  messages: ModelMessage[]
  tools?: ToolDefinition[]
  samplingArgs?: SamplingArgs
}

interface ModelResponse {
  id: string
  model: string
  message: AssistantMessage
  stopReason: StopReason
  usage: Usage
}

export {
  Usage,
  StopReason,
  MessageStreamEvent,
  SamplingArgs,
  ModelRequest,
  ModelResponse
}
```

adaptor/openai.ts

```ts
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
```

## tools

```ts
import z from "zod"

interface ToolDefinition {
  name: string
  description: string
  inputSchema: z.ZodObject<z.ZodRawShape>
}

interface Tool <TSchema extends z.ZodObject<z.ZodRawShape>> extends ToolDefinition {
  inputSchema: TSchema
  execute: (input: z.infer<TSchema>) => Promise<unknown>
}

export {
  Tool,
  ToolDefinition
}
```