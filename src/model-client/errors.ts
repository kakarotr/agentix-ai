class StructuredOutputParseError extends Error {
  readonly rawResponse: string

  constructor(message: string, options: { rawResponse: string, cause?: unknown }) {
    super(message, { cause: options.cause })
    this.name = "StructuredOutputParseError"
    this.rawResponse = options.rawResponse
  }
}

class ModelNetworkError extends Error {
  constructor(message: string, options: { cause?: unknown }) {
    super(message, { cause: options.cause })
    this.name = "ModelNetworkError"
  }
}

class ModelHTTPError extends Error {
  readonly statusCode: number
  readonly responseBody: string

  constructor(message: string, options: { statusCode: number; responseBody: string }) {
    super(message)
    this.name = "ModelHttpError"
    this.statusCode = options.statusCode
    this.responseBody = options.responseBody
  }
}

export {
  ModelHTTPError,
  ModelNetworkError,
  StructuredOutputParseError
}