import z from "zod"

interface ToolDefinition {
  name: string
  description: string
  inputSchema: z.ZodObject<z.ZodRawShape>
}

interface Tool <TSchema extends z.ZodObject<z.ZodRawShape>> extends ToolDefinition {
  inputSchema: TSchema
  execute: (input: z.infer<TSchema>) => Promise<unknown>
}

export {
  Tool,
  ToolDefinition
}