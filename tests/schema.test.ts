import z from "zod";

const inputSchema: z.ZodObject<z.ZodRawShape> = z.object({
  query: z.string().describe("查询的内容"),
  limit: z.number().describe("查询的条数").optional(),
  metadata: z.enum(["apple", "bear"]).describe("枚举")
})

console.log(z.toJSONSchema(inputSchema))