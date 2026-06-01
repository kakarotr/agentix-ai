import z from "zod";
import { MessageStreamEvent, ModelRequest, ModelResponse } from "./types.js";

abstract class  ModelClient {
  protected baseURL: string
  protected apiKey: string

  constructor(options: { baseURL: string; apiKey: string }) {
    this.baseURL = options.baseURL
    this.apiKey = options.apiKey
  }

  abstract generate(request: ModelRequest): Promise<ModelResponse>
  abstract stream(request: ModelRequest): AsyncIterable<MessageStreamEvent>
  abstract structuredOutput<T extends z.ZodType>(request: ModelRequest, schema: T): Promise<z.infer<T>>
}

export {
  ModelClient
}