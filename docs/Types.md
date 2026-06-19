# Types

## messages

消息模块定义了与模型交互时使用的消息结构。内容块（Content Block）是消息的基本单元，用户消息和助手消息都由不同类型的内容块组合而成。

```typescript
// src/messages/content-block.ts

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
```

```typescript
// src/messages/message.ts

interface UserMessage {
  role: "user"
  content: string | UserContentBlock[]
}

interface AssistantMessage {
  role: "assistant"
  content: string | AssistantContentBlock[]
}

type ModelMessage = UserMessage | AssistantMessage
```

## tools

工具模块定义了工具的描述结构与执行接口。`ToolDefinition` 用于向模型声明工具能力，`Tool` 在此基础上附加了实际执行逻辑。

```typescript
// src/tools/types.ts

interface ToolDefinition {
  name: string
  description: string
  inputSchema: z.ZodObject<z.ZodRawShape>
}

interface Tool<TSchema extends z.ZodObject<z.ZodRawShape>> extends ToolDefinition {
  inputSchema: TSchema
  execute: (input: z.infer<TSchema>) => Promise<unknown>
}
```

## model-client

模型客户端模块负责与模型 API 的通信。包含请求/响应的数据结构、流式事件类型、错误类，以及供各适配器继承的抽象基类。

```typescript
// src/model-client/types.ts

interface OutputTokensDetails {
  thinkingTokens: number
}

interface Usage {
  inputTokens: number
  outputTokens: number
  outputTokensDetails?: OutputTokensDetails
  totalTokens: number
}

type StopReason = "end_turn" | "tool_use" | "max_tokens"

interface SamplingArgs {
  maxTokens: number
  temperature?: number
  topK?: number
  topP?: number
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

type MessageStreamEvent =
  | { type: "text-delta";     text: string }
  | { type: "thinking-delta"; text: string }
  | { type: "tool-use";       toolUse: ToolUseBlock }
  | { type: "complete";       result: ModelResponse }
```

```typescript
// src/model-client/errors.ts

class StructuredOutputParseError extends Error {
  readonly rawResponse: string
  constructor(message: string, options: { rawResponse: string; cause?: unknown })
}

class ModelNetworkError extends Error {
  constructor(message: string, options: { cause?: unknown })
}

class ModelHTTPError extends Error {
  readonly statusCode: number
  readonly responseBody: string
  constructor(message: string, options: { statusCode: number; responseBody: string })
}
```

```typescript
// src/model-client/client.ts

abstract class ModelClient {
  protected baseURL: string
  protected apiKey: string

  constructor(options: { baseURL: string; apiKey: string })

  // 构造标准请求头，包含 Content-Type、Accept 和 Bearer 认证
  protected buildHeaders(): Record<string, string>

  // 向 baseURL 发送 POST 请求；网络异常抛 ModelNetworkError，非 2xx 抛 ModelHTTPError
  protected async fetchPost(body: unknown): Promise<Response>

  // 同步生成，等待模型返回完整响应
  abstract generate(request: ModelRequest): Promise<ModelResponse>

  // 流式生成，逐步 yield MessageStreamEvent，最后以 "complete" 事件结束
  abstract stream(request: ModelRequest): AsyncIterable<MessageStreamEvent>

  // 结构化输出，根据传入的 Zod Schema 约束模型响应格式并返回推断类型
  abstract structuredOutput<T extends z.ZodType>(request: ModelRequest, schema: T): Promise<z.infer<T>>
}
```
