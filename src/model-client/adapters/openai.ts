import { TextBlock, ToolUseBlock } from "@/messages/content-block.js"
import { ModelClient } from "../client.js"
import { MessageStreamEvent, ModelRequest, ModelResponse } from "../types.js"
import z, { ZodType, output } from "zod"
import { ModelMessage } from "@/messages/message.js"

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

class OpenAIModelClient extends ModelClient {
  async generate(request: ModelRequest): Promise<ModelResponse> {
    const response = fetch(this.baseURL, {
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Authorization": `Bearer ${this.apiKey}`
      },
      body: this.buildBody(request)
    })

    const responseData = await response
      .then(value => value.json())
      .catch(err => console.error(err))

    return Promise.reject()
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
        const jsonSchema = z.toJSONSchema(tool.inputSchema)
        delete jsonSchema.$schema

        return {
          type: "function",
          function: {
            name: tool.name,
            description: tool.description,
            parameters: {
              ...jsonSchema
            },

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
              openaiMessages.push({ role: "tool", toolCallId: block.toolUseId, content: blockContent })
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

        openaiMessages.push({ role: "assistant", content, ...(toolCalls !== undefined ? { toolCalls } : {}) })
      }
    }

    return openaiMessages
  }
}

export {
  OpenAIModelClient
}