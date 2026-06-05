import { AssistantMessage, ModelMessage, ToolUseBlock } from "@/messages/index.js";
import { ToolDefinition } from "@/tools/types.js";

interface Usage {
  inputTokens: number
  outputTokens: number
}

type MessageStreamEvent = 
  | { type: "text_delta", text: string }
  | { type: "thinking_delta", text: string }
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