class StructuredOutputParseError extends Error {
  readonly rawResponse: string

  constructor(message: string, options: { rawResponse: string, cause?: unknown }) {
    super(message, { cause: options.cause })
    this.name = "StructuredOutputParseError"
    this.rawResponse = options.rawResponse
  }
}