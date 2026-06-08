import z, { ZodType, output } from "zod"
import { AssistantContentBlock, TextBlock, ToolUseBlock } from "@/messages/content-block.js"
import { ModelClient } from "@/model-client/client.js"
import { MessageStreamEvent, ModelRequest, ModelResponse, StopReason } from "@/model-client/types.js"
import { ModelMessage } from "@/messages/message.js"
import { ModelHTTPError, ModelNetworkError, StructuredOutputParseError } from "@/model-client/errors.js"

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
  tool_calls?: ToolCall[]
}

interface ToolMessage {
  role: "tool"
  content: string
  tool_call_id: string
}

type OpenAIModelMessage = SystemMessage | UserMessage | AssistantMessage | ToolMessage

interface OpenAIResponse {
  id: string
  model: string
  choices: Array<{
    index: number
    finish_reason: 'stop' | 'length' | 'tool_calls'
    message: {
      role: "assistant"
      content?: string
      reasoning_content?: string
      tool_calls?: Array<{
        index: number
        id: string
        type: "function"
        function: {
          name: string
          arguments: string
        }
      }>
    }
  }>
  usage: {
    prompt_tokens: number
    completion_tokens: number
    completion_tokens_details?: {
      reasoning_tokens: number
    }
    total_tokens: number
  }
}

class OpenAIModelClient extends ModelClient {
  async generate(request: ModelRequest): Promise<ModelResponse> {
    let response: Response

    try {
      response = await fetch(this.baseURL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "Authorization": `Bearer ${this.apiKey}`
        },
        body: this.buildBody(request)
      })
    } catch (err) {
      throw new ModelNetworkError("Request failed", { cause: err })
    }

    if (!response.ok) {
      const body = await response.text()
      throw new ModelHTTPError(`OpenAI API error: ${response.status}`, { statusCode: response.status, responseBody: body })
    }

    const data = await response.json() as OpenAIResponse
    return this.convertResponse(data)
  }

  stream(request: ModelRequest): AsyncIterable<MessageStreamEvent> {
    throw new Error("Method not implemented.")
  }

  structuredOutput<T extends ZodType>(request: ModelRequest, schema: T): Promise<output<T>> {
    throw new Error("Method not implemented.")
  }

  private buildBody(request: ModelRequest) {
    let bindTools = undefined
    if (request.tools) {
      bindTools = request.tools.map(tool => {
        const { $schema, ...parameters } = z.toJSONSchema(tool.inputSchema)

        return {
          type: "function",
          function: {
            name: tool.name,
            description: tool.description,
            parameters: {
              ...parameters
            },
            struct: false
          }
        }
      })
    }

    let samplingArgs: Record<string, unknown> | undefined = undefined
    if (request.samplingArgs) {
      samplingArgs = {
        maxTokens: request.samplingArgs.maxTokens,
      }

      if (request.samplingArgs.temperature) {
        samplingArgs["temperature"] = request.samplingArgs.temperature
      }

      if (request.samplingArgs.topP) {
        samplingArgs["top_p"] = request.samplingArgs.topP
      }

      if (request.samplingArgs.frequencyPenalty) {
        samplingArgs["frequency_penalty"] = request.samplingArgs.frequencyPenalty
      }
    }

    const data = {
      model: request.model,
      messages: this.convertMessages(request.system, request.messages),
      ...(bindTools !== undefined ? { tools: bindTools } : {}),
      ...(samplingArgs !== undefined ? samplingArgs : {})
    }
    return JSON.stringify(data)
  }

  private convertMessages(system: string | undefined, messages: ModelMessage[]): OpenAIModelMessage[] {
    const openaiMessages: OpenAIModelMessage[] = []

    if (system) {
      openaiMessages.push({ role: "system", content: system })
    }

    for (const message of messages) {
      if (message.role === "user") {
        if (typeof message.content === "string") {
          openaiMessages.push({ role: "user", content: message.content })
        } else {
          const textBlocks: TextBlock[] = []
          const imageBlocks: ImageBlock[] = []
          const userBlocks: Array<TextBlock | ImageBlock> = []

          for (const block of message.content) {
            if (block.type === "tool_result") {
              let blockContent: string = ""
              if (typeof block.content === "string") {
                blockContent = block.content
              } else {
                const textBlocks = block.content
                  .filter((item): item is TextBlock => item.type === "text")
                  .map(item => item.text)
                blockContent = textBlocks.join("")
              }
              openaiMessages.push({ role: "tool", tool_call_id: block.toolUseId, content: blockContent })
            } else {
              if (block.type === "text") {
                textBlocks.push(block)
              } else if (block.type === "image") {
                imageBlocks.push({ type: "image_url", imageUrl: { url: `data:${block.source.mediaType};base64,${block.source.data}` } })
              }
            }

            if (textBlocks.length > 0 || imageBlocks.length > 0) {
              if (textBlocks.length > 0) {
                userBlocks.push(...textBlocks)
              }
              if (imageBlocks.length > 0) {
                userBlocks.push(...imageBlocks)
              }
            }
          }

          if (textBlocks.length > 0 || imageBlocks.length > 0) {
            openaiMessages.push({ role: "user", content: userBlocks })
          }
        }
      } else {
        let content: string | null = null
        let toolCalls: ToolCall[] | undefined = undefined

        if (typeof message.content === "string") {
          content = message.content
        } else {
          const textBlocks: TextBlock[] = []
          const toolUseBlocks: ToolUseBlock[] = []

          for (const block of message.content) {
            if (block.type === "text") {
              textBlocks.push(block)
            } else if (block.type === "tool_use") {
              toolUseBlocks.push(block)
            }
          }

          if (textBlocks.length > 0) {
            content = textBlocks.map(item => item.text).join("")
          }

          if (toolUseBlocks.length > 0) {
            toolCalls = toolUseBlocks.map(item => ({
              id: item.id,
              type: "function",
              function: {
                name: item.name,
                arguments: JSON.stringify(item.input)
              }
            }))
          }
        }

        openaiMessages.push({ role: "assistant", content, ...(toolCalls !== undefined ? { tool_calls: toolCalls } : {}) })
      }
    }

    return openaiMessages
  }

  private convertResponse(data: OpenAIResponse): ModelResponse {
    const choice = data.choices[0]!

    const hasThinkingContent = !!choice.message.reasoning_content
    const hasToolUse = !!choice.message.tool_calls
    const generateContent = choice.message.content
    let content: string | AssistantContentBlock[]

    if (!hasThinkingContent && !hasToolUse) {
      content = choice.message.content || ""
    } else {
      content = []

      if (hasThinkingContent) {
        content.push({
          type: "thinking",
          thinking: choice.message.reasoning_content!,
          signature: ""
        })
      }

      if (generateContent) {
        content.push({
          type: "text",
          text: generateContent
        })
      }

      if (hasToolUse) {
        const toolCalls = data.choices[0]!.message.tool_calls!
        for (const toolCall of toolCalls) {
          
          let input: Record<string, unknown>
          try {
            input = JSON.parse(toolCall.function.arguments)
          } catch (err) {
            throw new StructuredOutputParseError(
              `Failed to parse tool call arguments for "${toolCall.function.name}"`,
              { rawResponse: toolCall.function.arguments, cause: err }
            )
          }

          content.push({
            type: "tool_use",
            id: toolCall.id,
            name: toolCall.function.name,
            input
          })
        }
      }
    }

    let stopReason: StopReason = "end_turn"
    const finishReason = data.choices[0]!.finish_reason
    if (finishReason === "stop") {
      stopReason = "end_turn"
    } else if (finishReason === "length") {
      stopReason = "max_tokens"
    } else if (finishReason === "tool_calls") {
      stopReason = "tool_use"
    }

    return {
      id: data.id,
      model: data.model,
      message: { role: "assistant", content: content },
      stopReason,
      usage: {
        inputTokens: data.usage.prompt_tokens,
        outputTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens,
        ...(data.usage.completion_tokens_details ? {
          outputTokensDetails: {
            thinkingTokens: data.usage.completion_tokens_details.reasoning_tokens
          }
        } : {})
      }
    }
  }
}

export {
  OpenAIModelClient
}