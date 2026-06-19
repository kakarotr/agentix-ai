import z from "zod";
import { MessageStreamEvent, ModelRequest, ModelResponse } from "./types.js";
import { ModelHTTPError, ModelNetworkError } from "./errors.js";

abstract class ModelClient {
  protected baseURL: string
  protected apiKey: string

  constructor(options: { baseURL: string; apiKey: string }) {
    this.baseURL = options.baseURL
    this.apiKey = options.apiKey
  }

  protected buildHeaders(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "Authorization": `Bearer ${this.apiKey}`
    }
  }

  protected async fetchPost(body: unknown): Promise<Response> {
    let response: Response
    try {
      response = await fetch(this.baseURL, {
        method: "POST",
        headers: this.buildHeaders(),
        body: JSON.stringify(body)
      })
    } catch (err) {
      throw new ModelNetworkError("Request failed", { cause: err })
    }

    if (!response.ok) {
      const text = await response.text()
      throw new ModelHTTPError(`API error: ${response.status}`, { statusCode: response.status, responseBody: text })
    }

    return response
  }

  abstract generate(request: ModelRequest): Promise<ModelResponse>
  abstract stream(request: ModelRequest): AsyncIterable<MessageStreamEvent>
  abstract structuredOutput<T extends z.ZodType>(request: ModelRequest, schema: T): Promise<z.infer<T>>
}

export {
  ModelClient
}