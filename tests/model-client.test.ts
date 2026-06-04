import { OpenAIModelClient } from "@/index"
import z from "zod"

const client = new OpenAIModelClient({
  baseURL: "",
  apiKey: ""
})

client.generate({
  model: "claude-sonnet-4-6",
  system: "系统提示词",
  messages: [
    {
      role: "user",
      content: [
        { type: "text", text: "解释一下这张图片" },
        { type: "image", source: { type: "base64", mediaType: "image", data: "xxxx" } }
      ]
    },
    {
      role: "assistant",
      content: "xxxxxxx"
    }
  ],
  tools: [
    {
      name: "web_search",
      description: "搜索网页内容",
      inputSchema: z.object({
        query: z.string().describe("搜索关键词"),
        count: z.number().describe("搜索网页的数量")
      })
    }
  ],
  samplingArgs: {
    maxTokens: 1024,
    temperature: 0.8,
    topP: 0.9,
    frequencyPenalty: 1.2
  }
})