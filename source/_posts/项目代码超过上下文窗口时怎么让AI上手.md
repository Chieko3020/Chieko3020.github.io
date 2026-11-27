---
title: 项目代码超过上下文窗口时，怎么让 AI 上手
date: 2026-11-28 03:12:00
updated: 2026-11-28 03:12:00
tags: "你知道吗"
categories: "只属于你的小妙招 <br> 看似有用实则没用"
cover: /images/画廊/pixiv/141206651_p0_master1200.webp
excerpt: 一次上下文管理面试题的复盘：项目读不完时，怎么让 AI 找到该读的部分、记住该记的决策
mermaid: false
---

- 某次面试被问到：项目所有代码加起来远超过上下文窗口，你怎么让 AI 开始上手开发，提示词怎么写。
- 当时回答了不要直接把整个项目贴进去、把要改的文件引用出来、日志先落盘再引用、常用流程固化成 skill。面试官接着问“除了这些方法之外，你还会怎么管理上下文”，我没有答出成体系的内容。
- 复盘时发现，之前的回答只讲了“少给”，没有讲“怎么找、怎么记、怎么压缩、怎么验证”。这里按上下文工程的角度补一份。

# 太长不看

- 上下文是工作记忆，不是仓库。目标是找到“最小的高信号 token 集合”，不是把能塞的都塞进去。
- 先给地图，再按需检索。让 AI 用 glob、grep、符号搜索和代码索引自己找文件，而不是由人把代码粘进去。
- 明确非目标，长内容落盘，项目记忆常驻，流程固化成 skill 或命令。
- 长任务用计划、子会话、压缩和交接；用测试、构建和证据验收，不靠“AI 说完成了”。

# 先分清几类上下文

上下文可以按生命周期分成几类。这个划分背后的原则是：好的上下文工程不是把能塞的都塞进去，而是找最小的高信号 token 集合。

> 原文：good context engineering means finding the smallest possible set of high-signal tokens that maximize the likelihood of some desired outcome.
>
> 翻译：好的上下文工程，是找到一组尽可能小、信号尽可能强的 token，让期望结果出现的概率最大。
>
> 来源：[Effective context engineering for AI agents — Anthropic](https://www.anthropic.com/research/effective-context-engineering-for-ai-agents)

| 类型 | 内容 | 生命周期 | 放在哪 |
| --- | --- | --- | --- |
| 常驻项目记忆 | 构建、测试、目录结构、约定、常见坑、非目标 | 每个会话都读 | `CLAUDE.md`、`AGENTS.md` 或同类文件 |
| 当前任务上下文 | 目标、相关文件、约束、验收条件 | 当前任务 | 提示词、计划、SPEC |
| 运行时检索 | 代码片段、日志、文档、测试输出 | 用到时才加载 | 文件路径、grep 结果、工具输出 |

- 常驻记忆要短。它每个会话都占上下文，写得越长，真正留给任务的注意力越少。
- 任务上下文要具体。目标、边界、验收条件写清楚，比多贴十个文件更有用。
- 检索上下文要可丢弃。日志、构建输出、搜索结果读完就压缩成结论，不要把原始内容一直留在历史里。
- 还有一类是历史上下文：对话本身。它不会自动变小，随着 token 增加，模型准确回忆的能力会下降，也就是 context rot；接近上限时要压缩或交接。

> 原文：as the number of tokens in the context window increases, the model’s ability to accurately recall information from that context decreases.
>
> 翻译：随着上下文窗口中的 token 数量增加，模型从该上下文中准确回忆信息的能力会下降。
>
> 来源：[Effective context engineering for AI agents — Anthropic](https://www.anthropic.com/research/effective-context-engineering-for-ai-agents)

# 上手一个新仓库的顺序

- 先读 README、构建脚本、测试入口和顶层目录，不要从某个随机文件开始读。
- 跑一遍构建和测试，确认环境能工作。构建命令、测试命令、失败原因，都是后续提示词的素材。
- 看入口点：HTTP 服务的路由入口、CLI 的 main、任务的调度入口、数据层的写入路径。
- 看最近提交和目录变更，判断哪些模块在活跃开发。
- 让 AI 先产出仓库地图，不改代码：

```text
先不要改代码。阅读 README、构建脚本、测试入口和 src/ 顶层目录，输出：
1. 模块地图：每个目录负责什么，依赖方向是什么
2. 一条请求从入口到存储经过哪些模块
3. 如果要改 <功能>，需要读哪些文件，先读哪几个
4. 你目前不确定、需要我确认的问题
```

- 这份地图就是后续检索的索引。它不需要覆盖每个函数，只要能让 AI 知道“该往哪找”。
- 地图里要写清楚不确定的地方。让 AI 承认不知道，比让它编一个完整架构更有用。

# 让 AI 自己找，而不是把代码塞进去

- 文件路径、目录名、文件名、时间戳本身就是上下文。`tests/test_utils.py` 和 `src/core_logic/test_utils.py` 传达的信息完全不同。
- 精确符号用 grep 或 LSP，语义查找用代码索引或 RAG。两者不是替代关系：找 `class Foo` 用 grep 更快，找“哪里处理了重试”可能要靠语义检索。
- 检索工具应该返回高信号片段，而不是整文件。给文件路径和行号区间，让 AI 只读需要的那一段。
- 让 AI 先列“我要读哪些文件、为什么”，人确认后再读。这样能在加载前发现方向错误。

```bash
# 先定位，再读窗口
rg -n "class OrderService|RetryPolicy" src include
git log --oneline -20 -- src/order
```

- “just in time”检索的核心是：平时只保留引用，真正需要时再通过工具加载。Anthropic 把这种方式描述为维护文件路径、查询和链接等轻量标识，运行时再取内容；Claude Code 的 `CLAUDE.md` 预加载加 glob/grep 按需读取，就是混合策略。

> 原文：Rather than pre-processing all relevant data up front, agents built with the “just in time” approach maintain lightweight identifiers (file paths, stored queries, web links, etc.) and use these references to dynamically load data into context at runtime using tools.
>
> Claude Code is an agent that employs this hybrid model: CLAUDE.md files are naively dropped into context up front, while primitives like glob and grep allow it to navigate its environment and retrieve files just-in-time, effectively bypassing the issues of stale indexing and complex syntax trees.
>
> 翻译：采用 just-in-time 方式的 agent 不会预先处理所有相关数据，而是维护轻量标识（文件路径、存储的查询、网页链接等），在运行时用工具把这些引用对应的数据动态加载进上下文。Claude Code 采用的就是这种混合模式：CLAUDE.md 在开始时直接放进上下文，而 glob、grep 等原语让它按需浏览环境、检索文件，从而绕开索引过期和复杂语法树的问题。
>
> 来源：[Effective context engineering for AI agents — Anthropic](https://www.anthropic.com/research/effective-context-engineering-for-ai-agents)

- 代码索引和 RAG 有价值，但不要把它当成“把 top-k 文档全塞进去”。更稳的做法是：先检索定位，再读具体窗口，再让 AI 复述它读到了什么。

# 明确边界：什么不要读、不要改

- 在提示词里写非目标，和写目标一样重要。“只改 A 和 B，不要动 C”比“帮我优化这个项目”有效得多。
- 明确不要读的目录：`vendor/`、`third_party/`、`generated/`、构建产物、大日志、数据集、快照。它们占上下文，却不提供决策信息。
- 明确不要改的文件：生成的代码、锁文件、迁移脚本、CI 配置、密钥和证书。需要改时单独开任务。
- 如果 AI 认为必须扩大范围，让它先说明原因、列出要读或要改的文件，等人确认。
- 用工具的 ignore 或 permission 配置做硬约束。Cursor 有 `.cursorignore`，Claude Code 可以在设置里配置 deny 规则；`gitignore` 不是 AI 的 ignore。
- 密钥、token、`.env`、客户数据不要进上下文。日志要先脱敏，再让 AI 分析。

# 长内容落盘

- 日志、trace、dump、数据集、压测结果，先写到文件，再让 AI 用命令读片段。
- 不要让 AI 把 10MB 日志读进上下文。给它文件路径、过滤命令和关注点，让它自己取。

```bash
./run.sh > /tmp/run.log 2>&1
rg -n "ERROR|timeout|panic" /tmp/run.log | head -50
```

- 让 AI 把分析结论写到 `notes/incident.md`，而不是在对话里反复贴原始日志。结论可以复用，原始日志不必常驻。
- 工具输出也要截断。测试失败时，先看失败用例和栈顶，不要一次贴完整输出。
- 大文件用 `head`、`tail`、`sed -n`、`awk`、`jq` 取窗口；需要全局统计时，让 AI 写脚本，输出聚合结果。

# 项目记忆

- `CLAUDE.md` 或 `AGENTS.md` 是项目的常驻记忆。放构建、测试、lint 命令，目录结构，代码约定，常见坑，明确不做的内容。
- 它应该短到一页以内。每个会话都会读，过期内容就是负上下文。
- AI 在同一个地方犯错两次，就把纠正写进项目记忆。这是 Anthropic 在 AI-native SDLC 里推荐的规则。

> 原文：A working rule helps here. When Claude makes a mistake twice, the correction goes into CLAUDE.md.
>
> Keep it under a page, because Claude reads all of it at the start of a session and anything stale is taking up context for no benefit.
>
> 翻译：这里有一条可用的规则：当 Claude 在同一个地方犯第二次错时，就把纠正写进 CLAUDE.md。把它控制在一页以内，因为 Claude 会在会话开始时读完整个文件，任何过时内容都会白白占用上下文。
>
> 来源：[The AI-native SDLC playbook — Claude](https://claude.com/resources/articles/the-ai-native-sdlc-playbook)

- 项目事实放项目记忆，单次任务指令放提示词，可复用流程放 skill。三者不要混。
- 一个可用的骨架：

```markdown
# 项目

## 命令
- build: cmake --build build
- test: ctest --test-dir build --output-on-failure

## 结构
- src/api：HTTP 入口
- src/core：领域逻辑
- src/adapters：外部依赖

## 约定
- 公共 API 不改签名
- 错误用 Result，不抛异常

## 不要动
- generated/、vendor/、锁文件

## AI 常错
- 不要升级依赖版本
```

- 项目记忆要版本化，跟代码一起 review。它变了，说明项目约定变了。

# 流程固化

- 一次任务的指令是提示词，一类任务的流程是 skill。skill 里写清楚 description、输入、步骤、产物和退出条件。
- description 决定什么时候加载。写得太泛，技能会被滥用；写得太窄，该触发时不触发。不同工具的加载机制不同，但共同点是描述先参与匹配，正文按需加载。
- skill 可以引用模板、脚本和参考文档，不必把全部内容塞进正文。渐进披露比一次性加载所有资料更省上下文。
- 复杂任务拆成阶段：计划、执行、审查。计划阶段只产出规格和步骤，执行阶段在隔离上下文里改代码，审查阶段对照验收条件检查。
- 子会话适合探索和实现：它有独立上下文，可以把大量搜索和试错留在里面，只回传摘要。代价是交接信息要写清楚，否则子会话会重复问。

# 压缩与交接

- 上下文接近上限时，做一次压缩：保留目标、已做决策、改动文件、测试状态、未解决问题和下一步；丢掉重复的工具输出和已经解决的讨论。

> 原文：The model preserves architectural decisions, unresolved bugs, and implementation details while discarding redundant tool outputs or messages.
>
> 翻译：模型会保留架构决策、未解决的 bug 和实现细节，丢弃冗余的工具输出或消息。
>
> 来源：[Effective context engineering for AI agents — Anthropic](https://www.anthropic.com/research/effective-context-engineering-for-ai-agents)

- 压缩是有损的。不要只留一句“已完成”，要留证据：哪个测试通过、哪个文件改了什么、还有什么风险。
- 用结构化笔记做外部记忆。`NOTES.md` 或 `HANDOFF.md` 记录里程碑、决策、失败尝试和下一步，比靠对话历史可靠。
- 子 agent 结束时，要求它返回结构化摘要：改了什么、验证了什么、没验证什么、有什么风险。主会话只保留摘要。

> 原文：Each subagent might explore extensively, using tens of thousands of tokens or more, but returns only a condensed, distilled summary of its work (often 1,000-2,000 tokens).
>
> 翻译：每个子 agent 可能大量探索，消耗数万甚至更多 token，但只返回一份压缩、提炼过的工作摘要（通常是 1,000 到 2,000 token）。
>
> 来源：[Effective context engineering for AI agents — Anthropic](https://www.anthropic.com/research/effective-context-engineering-for-ai-agents)

- 新会话从交接文档开始，不要重新贴一遍历史。交接文档写得好，换模型、换工具、换人都能接上。

# 提示词模板

```text
目标：
<一句话说明要做什么，以及为什么要做>

相关文件：
- src/order/service.cpp:120-180
- include/order/service.h
- tests/order/service_test.cpp

约束：
- 不改公共 API
- 不引入新依赖
- 不读 vendor/、generated/

非目标：
- 不重构 payment 模块
- 不处理历史数据迁移

验收：
- 新增单测覆盖超时和重试
- 现有测试全部通过
- p99 不超过 50ms

验证命令：
- cmake --build build
- ctest --test-dir build --output-on-failure

输出：
- 先给计划：要读的文件、要改的文件、步骤、风险
- 我确认后再改代码
```

- 这个模板的重点不是格式，而是把“目标、边界、验收、验证”写清楚。只写“帮我改一下”会把决策成本推给模型。
- 让 AI 先复述目标和假设，再开始。它复述错了，说明上下文没给对。
- 给它停止条件：不确定时先问，不要猜；需要扩大范围时先说明。
- 需要风格示例时给一组多样、典型的例子，不要堆一长串边界规则。Anthropic 的建议也是给多样、典型的例子，而不是把所有 edge case 都写进提示词。

> 原文：Instead, we recommend working to curate a set of diverse, canonical examples that effectively portray the expected behavior of the agent.
>
> 翻译：相反，我们建议整理一组多样、典型的例子，让它们有效呈现 agent 的期望行为。
>
> 来源：[Effective context engineering for AI agents — Anthropic](https://www.anthropic.com/research/effective-context-engineering-for-ai-agents)

# 验证与防跑偏

- 测试是可执行的规格。先写失败测试，再让 AI 修到通过；修的时候不允许改测试。

> 原文：For bug fixes, write the failing test first. Ask Claude to reproduce the bug as a test, run it, and confirm it fails for the reason you expect. Commit that test. Only then ask Claude to make it pass without editing the test, with the test-file hook from the final step enforcing the restriction.
>
> 翻译：修 bug 时先写失败测试：让 Claude 把 bug 复现成测试，运行并确认它因预期原因失败，提交这个测试；然后才让 Claude 在不改测试的前提下修到通过，并用测试文件 hook 强制执行这个限制。
>
> 来源：[The AI-native SDLC playbook — Claude](https://claude.com/resources/articles/the-ai-native-sdlc-playbook)

- 构建、lint、类型检查、单测、集成测试，至少有一组能在本地一键跑。
- 要求证据：命令、输出、文件与行号。不要接受“已经完成”这种结论。
- 关键改动用另一个子 agent 或另一个模型交叉审查，专门找反例和遗漏。
- 人负责最终验收：需求是否符合、风险是否可接受、关键代码和敏感信息是否复核。

# 一个可执行的上手流程

1. 读 README、构建脚本、测试入口，跑一遍测试。
2. 让 AI 产出仓库地图和问题清单，不改代码。
3. 选一个窄任务，写目标、相关文件、非目标、验收和验证命令。
4. 让 AI 先给计划，人确认后再改。
5. 小步实现，每步跑测试；失败先定位，不要连续盲改。
6. 看 diff 和证据，必要时让另一个子 agent 审查。
7. 更新项目记忆和交接文档，压缩上下文。
8. 进入下一个任务，必要时开新会话。

# 常见误区

- 把整个仓库贴进提示词。上下文被占满，模型还是不知道重点。
- 让 AI “先把所有代码读一遍”。读得越多，注意力越分散，而且大部分代码和当前任务无关。
- 不写非目标。AI 容易顺带重构、升级依赖，最终 diff 失控。
- 一个长会话做到底。上下文腐烂（context rot）之后，先前的约束会被稀释，模型开始忘事。
- 只靠对话记忆。换会话、换工具、上下文压缩后，决策就丢了。
- 让 AI 自己说“测试通过”。没有命令输出和日志，这句话没有证据价值。
- 修 bug 时允许 AI 改测试。测试被改弱，后续的验证就失效了。
- 把密钥、客户数据、完整日志贴进上下文。既浪费 token，也有泄露风险。

# 参考

- [Effective context engineering for AI agents — Anthropic](https://www.anthropic.com/research/effective-context-engineering-for-ai-agents)
- [The AI-native SDLC playbook — Claude](https://claude.com/resources/articles/the-ai-native-sdlc-playbook)
- [Claude Code: Memory](https://code.claude.com/docs/en/memory)
- [Claude Code: Skills](https://code.claude.com/docs/en/skills)
- [Claude Code: Subagents](https://code.claude.com/docs/en/sub-agents)
- [Claude Code: Best practices](https://code.claude.com/docs/en/best-practices)
- [Context rot — Chroma research](https://research.trychroma.com/context-rot)
