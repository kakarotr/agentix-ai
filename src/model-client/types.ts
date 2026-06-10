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
  | { type: "tool-use", toolUse: ToolUseBlock }
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