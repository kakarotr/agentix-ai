import z, { ZodType, output } from "zod"
import { AssistantContentBlock, TextBlock, ToolUseBlock } from "@/messages/content-block.js"
import { ModelClient } from "@/model-client/client.js"
import { MessageStreamEvent, ModelRequest, ModelResponse, StopReason, Usage } from "@/model-client/types.js"
import { ModelMessage } from "@/messages/message.js"
import { ModelHTTPError, StructuredOutputParseError } from "@/model-client/errors.js"
import { createParser } from "eventsource-parser"
import { EventSourceParserStream } from "eventsource-parser/stream"

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

interface OpenAIUsage {
  prompt_tokens: number
  completion_tokens: number
  completion_tokens_details?: {
    reasoning_tokens: number
  }
  total_tokens: number
}

interface OpenAIToolCall {
  index: number
  id: string
  type: "function"
  function: {
    name: string
    arguments: string
  }
}

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
      tool_calls?: Array<OpenAIToolCall>
    }
  }>
  usage: OpenAIUsage
}

interface OpenAIStreamResponse {
  id: string
  model: string
  choices: Array<{
    index: number
    delta: {
      content?: string
      reasoning_content?: string
      tool_calls: Array<OpenAIToolCall>
    }
    finish_reason?: 'stop' | 'length' | 'tool_calls'
  }>
  usage?: OpenAIUsage
}

interface OpenAIToolCallChunk {
  id?: string
  type?: string
  name?: string
  arguments?: string
}

class OpenAIModelClient extends ModelClient {
  async generate(request: ModelRequest): Promise<ModelResponse> {
    const response = await this.fetchPost(this.buildBody(request))
    const data = await response.json() as OpenAIResponse
    return this.convertResponse(data)
  }

  async *stream(request: ModelRequest): AsyncIterable<MessageStreamEvent> {
    const response = await this.fetchPost({
      ...this.buildBody(request),
      stream: true,
      inculde_usage: true
    })

    if (!response.body) {
      throw new ModelHTTPError(`OpenAI API error: response body is null`, { statusCode: 0, responseBody: "null" })
    }

    const eventStream = response.body
      .pipeThrough(new TextDecoderStream())
      .pipeThrough(new EventSourceParserStream())

    let id = ""
    let modelName = ""
    let stopReason: StopReason = "end_turn"
    let usage: Usage = {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0
    }
    const contentBuffer: string[] = []
    const reasoningContentBuffer: string[] = []
    const toolCallsBuffer: Record<number, OpenAIToolCallChunk> = {}

    for await (const event of eventStream) {
      if (event.data === "[DONE]") {
        break
      }
      const chunk = JSON.parse(event.data) as OpenAIStreamResponse

      id = chunk.id
      modelName = chunk.model

      const choice = chunk.choices[0]!
      const delta = choice.delta

      if (delta.content) {
        contentBuffer.push(delta.content)
        yield {
          type: "text-delta",
          text: delta.content
        }
      }

      if (delta.reasoning_content) {
        reasoningContentBuffer.push(delta.reasoning_content)
        yield {
          type: "thinking-delta",
          text: delta.reasoning_content
        }
      }

      if (choice.finish_reason) {
        stopReason = this.parseStopReason(choice.finish_reason)
      }

      if (chunk.usage) {
        usage = this.parseUsage(chunk.usage)
      }

      if (delta.tool_calls) {
        for (const toolCall of delta.tool_calls) {
          const index = toolCall.index
          const toolCallId = toolCall.id
          const toolName = toolCall?.function?.name
          const args = toolCall?.function?.arguments
          
          if (toolCallId) {
            toolCallsBuffer[index] = { ...toolCallsBuffer[index], id: toolCallId, type: "function", arguments: "" }
          }

          if (toolName) {
            toolCallsBuffer[index] = { ...toolCallsBuffer[index], name: toolName }
          }

          if (args) {
            toolCallsBuffer[index]!.arguments += args
          }
        }
      }
    }

    const toolCalls: OpenAIToolCall[] = []

    for (const [key, value] of Object.entries(toolCallsBuffer)) {
      const toolCall: OpenAIToolCall = {
        index: Number(key),
        type: "function",
        id: value.id!,
        function: {
          name: value.name!,
          arguments: value.arguments!
        }
      }
      toolCalls.push(toolCall)

      yield {
        type: "tool-use",
        toolUse: {
          id: value.id!,
          type: "tool_use",
          name: value.name!,
          input: JSON.parse(value.arguments!)
        }
      }
    }

    yield {
      type: "complete",
      result: {
        id,
        model: modelName,
        message: {
          role: "assistant",
          content: this.parseContent(
            contentBuffer.length > 0 ? contentBuffer.join("") : undefined,
            reasoningContentBuffer.length > 0 ? reasoningContentBuffer.join("") : undefined,
            toolCalls.length > 0 ? toolCalls : undefined
          )
        },
        stopReason,
        usage
      }
    }
  }

  async structuredOutput<T extends ZodType>(
    request: ModelRequest, 
    schema: T, 
    responseFormat: "json_object" | "json_schema" = "json_object"
  ): Promise<output<T>> {
    const { $schema, ...jsonSchema } = z.toJSONSchema(schema)

    const response = await this.fetchPost({
      ...this.buildBody(request),
      response_format: {
        type: responseFormat,
        ...(responseFormat === "json_schema" ? {
          name: "response",
          strict: true,
          schema: jsonSchema
        } : {})
      }
    })

    const data = await response.json() as OpenAIResponse
    const raw = data.choices[0]!.message.content

    if (!raw) {
      throw new StructuredOutputParseError("Model returned empty content", { rawResponse: "" })
    }

    try {
      const parsed = JSON.parse(raw)
      return schema.parse(parsed) as output<T>
    } catch (err) {
      throw new StructuredOutputParseError(
            "Failed to parse structured output",
            { rawResponse: raw, cause: err }
          )
    }
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
    return data
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
    const stopReason = this.parseStopReason(choice.finish_reason)
    return {
      id: data.id,
      model: data.model,
      message: { 
        role: "assistant", 
        content: this.parseContent(choice.message.content, choice.message.reasoning_content, choice.message.tool_calls) 
      },
      stopReason,
      usage: this.parseUsage(data.usage)
    }
  }

  private parseStopReason(finishReason: 'stop' | 'length' | 'tool_calls'): StopReason {
    let stopReason: StopReason = "end_turn"
    if (finishReason === "stop") {
      stopReason = "end_turn"
    } else if (finishReason === "length") {
      stopReason = "max_tokens"
    } else if (finishReason === "tool_calls") {
      stopReason = "tool_use"
    }
    return stopReason
  }

  private parseUsage(usage: OpenAIUsage): Usage {
    return {
      inputTokens: usage.prompt_tokens,
      outputTokens: usage.completion_tokens,
      totalTokens: usage.total_tokens,
      ...(usage.completion_tokens_details ? {
        outputTokensDetails: {
          thinkingTokens: usage.completion_tokens_details.reasoning_tokens
        }
      } : {})
    }
  }

  private parseContent(
    generateContent: string | undefined, 
    reasoningContent: string | undefined, 
    toolCalls: OpenAIToolCall[] | undefined
  ) {
    let content: string | AssistantContentBlock[]
    const hasThinkingContent = !!reasoningContent
    const hasToolUse = !!toolCalls

    if (!hasThinkingContent && !hasToolUse) {
      content = generateContent || ""
    } else {
      content = []

      if (hasThinkingContent) {
        content.push({
          type: "thinking",
          thinking: reasoningContent!,
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
    return content
  }
}

export {
  OpenAIModelClient
}