import { OpenAIModelClient } from "@/index"
import z from "zod"

const client = new OpenAIModelClient({
  baseURL: "https://api.deepseek.com/v1/chat/completions",
  apiKey: "sk-ec75c7019f3740fc86049ce2092b61a6"
})

const response = client.stream({
  model: "deepseek-v4-flash",
  system: "你是一个智能助手，帮我完成任务",
  messages: [
    {
      role: "user",
      content: "查询今天的新闻"
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

for await (const chunk of response) {
  // console.log(chunk)
}