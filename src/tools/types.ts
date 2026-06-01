import z from "zod"

interface ToolDefinition {
  name: string
  description: string
  inputSchema: z.ZodObject<any>
}

export {
  ToolDefinition
}