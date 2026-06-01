# Architecture

## 技术栈

- Runtime：Node.js 22.x，优先使用原生能力，减少外部依赖
- 语言：TypeScript 严格模式
- Schema / 运行时校验：Zod，类型与运行时行为保持一致
- 异步模型：全部异步，无同步 API
- 目标产物：NPM Library

## 全局设计原则

- 组合大于继承，贯穿所有模块
- Composable-first：核心模块可自由组合，同时提供 opinionated 的默认组合方案
- 不确定是否稳定的接口优先不暴露，后续加比删容易
- Breaking change 无需遵守 semver 仪式，可以直接做

## API 设计原则

- 命名需要自解释
- 所有 public 类型必须显式导出
- 扩展点需要提前设计，不要等到需要时再加
- 错误信息要有意义，包含上下文和可能的修复方向

## 模块划分

### AgentConfig
静态配置，持有 system prompt、tools、model 参数等。可复用，immutable，与运行时状态严格分离。

### State
运行时状态，持有 conversation history、memory 当前内容等。每个会话独立，是普通数据结构，天然支持序列化和持久化。

### Runner
无状态执行器，接收 AgentConfig + State 执行 ReAct loop。是整个框架最基础的执行单元。

**Loop 结构**：发送 messages + tools → 有 tool_calls 则执行并追加结果继续循环 → 无 tool_calls 则返回。

**事件流**：Runner 在 loop 过程中持续 emit 类型化事件，包括 token_delta、tool_call_start、tool_call_result、iteration_start、iteration_end、compression_triggered、memory_extracted、human_input_required 等。Streaming、Observability、Human-in-the-loop 三个功能共享同一套事件基础设施。

**对外提供两个函数**：
- 流式函数：返回 `AsyncIterable<AgentEvent>`，支持全部功能
- 一次性函数：流式函数的薄封装，直接返回最终结果，不支持 Human-in-the-loop。若 AgentConfig 中配置了需要人工审批的 tool，调用一次性函数应明确报错

**扩展点**：通过 lifecycle hooks 暴露（LLM 调用前后、tool 执行前后、每次迭代后），不对外暴露 loop 结构本身。

**Compression / Memory 协调**：Context Compression 与 Memory 互不依赖，均以接口形式注入 Runner，Runner 依赖二者的接口而非具体实现。流程由 Runner 居中协调：loop 检测到压缩条件 → 调用 compression 产出摘要替换旧消息，同时拿回被驱逐的原始消息 → Runner 将被驱逐内容交给 memory 提取 → Runner 统一 emit compression_triggered 与 memory_extracted。所谓"单向通知 Memory"由 Runner 中介完成，compression 与 memory 之间不存在直接依赖。

### Plan-Execute
以组合方式构建在 Runner 之上，不继承 Runner。由三部分组成：
- **Planner**：负责生成 step 列表，只关心任务拆解
- **Runner**：负责执行单个 step，完全不感知自己处于 Plan-Execute 上下文中
- **Orchestrator**：持有 Planner 和 Runner，负责协调两者

实现 Plan-Execute 时只需聚焦 Planner 和 Orchestrator，底层执行直接复用 Runner。

### ModelClient
LLM provider 的抽象层。内部使用 neutral message format，表达能力对齐 Anthropic 的 content block 模型（text、tool_use、tool_result、image、document 等）。两个 provider 架构地位对等，不存在谁是 native 格式。

当前实现 OpenAI adapter，预留 Anthropic adapter。OpenAI adapter 负责将 neutral format 降级翻译，信息损失由 adapter 承担。Provider 实现细节不应泄漏到上层 API。

支持 Streaming 和 Structured Output：
- Streaming：ModelClient 处理 provider 原始流，向上暴露，由 Runner 消费并转化为类型化事件
- Structured Output：通过独立的 `generateStructured<T>` 方法暴露，不与 `generate` 共用。ModelClient 将 Zod schema 转为 provider 要求的格式传给 LLM，拿回响应后在内部完成JSON 解析与 schema 校验，直接返回类型化结果 `Promise<z.infer<T>>`。校验失败抛出语义明确的错误类型，不透传原始 Zod error。`stream` 不支持结构化输出。
### Tool System
工具定义与执行。MCP 作为 Tool System 的一个 adapter，与函数工具平级，需额外处理 MCP server 的连接生命周期（连接管理、断线重连、capability negotiation）。

### Context Compression
由 Runner 在 loop 中检测 token 数达到模型上下文窗口的一定比例时触发。策略为 summarization：由 LLM 将旧消息压缩为摘要替换原始消息，并向 Runner 返回被驱逐的原始消息。Compression 只负责压缩本身，不感知 Memory 的存在；被驱逐内容是否长期保留由 Runner 转交 Memory 决定。

### Memory
跨会话记忆，用户完全无感知，由框架自动管理。

Runner 在压缩后将被驱逐的内容交给 Memory，由模型判断其中是否有值得长期保留的信息，有则提取核心内容存储。Memory 只接收待处理的消息，既不感知 Context Compression 的存在，也不知道内容来自压缩。

新会话开始时，相关记忆在会话装配（bootstrap）阶段注入 system prompt——以 AgentConfig 为基础派生出 effective system prompt 喂给初始 State，而非修改 AgentConfig 本身（AgentConfig 保持 immutable）。注入发生在 bootstrap，不进入 loop。

### Observability
独立模块，订阅 Runner 的事件流，记录结构化追踪数据（token 用量、latency、tool 调用链、每个 step 的输入输出等）。与 Streaming 共享事件基础设施，不需要独立的数据采集机制。

### Human-in-the-loop
两种触发方式：
- **模型触发**：模型判断当前操作需要人类确认，调用特殊的 request_human_input tool
- **Tool 标记触发**：用户在定义 tool 时标记为需要人工审批，Runner 在执行前自动触发

两种方式统一表现为 Runner emit `human_input_required` 事件后挂起，等待调用方通过 resume 接口传回决定后继续 loop。仅在流式函数中可用。本身不是独立模块，完全由 Runner 的事件 + resume 机制实现。

## LLM Provider 策略

当前阶段仅支持 OpenAI 协议，以后只扩展 Anthropic，不支持其他 provider。