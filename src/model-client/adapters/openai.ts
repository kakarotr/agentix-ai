import { TextBlock } from "@/messages/content-block.js"
import { ModelClient } from "../client.js"
import { MessageStreamEvent, ModelRequest, ModelResponse } from "../types.js"
import { ZodType, output } from "zod"

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
      headers: this.buildHeader(),
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

  private buildHeader() {
    return {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "Authorization": `Bearer ${this.apiKey}`
    }
  }
}