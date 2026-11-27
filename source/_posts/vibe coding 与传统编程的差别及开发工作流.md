---
title: vibe coding 与传统编程的差别，以及一套可复用的开发工作流
date: 2026-11-28 03:14:00
updated: 2026-11-28 03:14:00
tags: "你知道吗"
categories: "只属于你的小妙招 <br> 看似有用实则没用"
cover: /images/画廊/pixiv/149708425_p0_master1200.webp
excerpt: 一次 vibe coding 面试题的复盘：开发方式的变化、SDD 工作流、代码审查与安全边界
mermaid: false
---

- 某次面试先问：在现在的 vibe coding 过程中，开发方式和以前的“古法编程”有哪些方面不太一样。我回答了时间从写代码转向做决策、需求和技术选型由人处理、代码生成和审查交给 agent、出 bug 先让 agent 看日志定位再复现修复、功能测试人工联调、关键代码人工复核。
- 面试官接着问：你平常怎么进行项目开发。我讲了把需求分析、技术选型、代码生成、代码审查、功能与回归测试、提交分支沉淀成一套 SDD 工作流。
- 复盘时发现，第一问只讲了分工，没有讲瓶颈、验证和组织方式；第二问只讲了流程名，没有讲每个阶段的产物和退出条件。这里按“开发方式、SDD 工作流、代码审查、安全边界”补一份。

# 太长不看

- vibe coding 不是不写代码，而是把人的工作从“敲代码”移到“定意图、划边界、验结果”。
- 代码不再是瓶颈之后，瓶颈会移到规划、审查、测试和部署；审查必须从“人逐行读”变成多层过滤。
- 我的工作流是 SDD（Spec-Driven Development，规格驱动开发）落地的三个阶段：plan 冻结 SPEC，execute 在隔离子会话实现，review 对照验收。
- 代码审查要有自验证、AI 审查、安全审查、CI、人按风险审批，以及回滚；每条 finding 都要有结论。
- 安全不是写在提示词里的一句话，而是权限、沙箱、身份、出网边界和人工 gate。

# 先澄清：vibe coding 不是不写代码

- vibe coding 指的是用自然语言和 agent 驱动开发，快速生成、修改和验证代码；人仍然要定义问题、做取舍、承担结果。
- 它不等于“不审查”“不测试”“不负责”。相反，代码产出变快之后，审查、测试和回滚的重要性上升了。
- “古法编程”是面试官的说法，这里用“传统编程”指以手写代码为中心的开发方式。差别不在于有没有 AI，而在于人的时间花在哪、瓶颈在哪、什么算完成。

# 开发方式的差别

| 维度 | 传统编程 | vibe coding |
| --- | --- | --- |
| 需求 | 会议、文档、工单，人工整理 | 人和 agent 一起把意图写成可执行的规格 |
| 设计 | 人工画架构、写方案 | agent 给方案和计划，人审取舍 |
| 编码 | 手写为主 | 生成加小步验证，人看关键路径 |
| 审查 | 人逐行读 diff | 自动审查加风险分层，人看高风险部分 |
| 测试 | 阶段 QA、发布前集中测 | 持续验证、测试先行、反馈循环 |
| 部署 | 人工审批和发布 | 自动 gate、灰度、开关、快速回滚 |
| 维护 | 人看日志和告警 | agent 初筛、定位、写复盘，人决策 |
| 人的角色 | 主要写代码 | 定意图、划边界、设验收、担风险 |
| 瓶颈 | 编码速度 | 规划、审查、测试、部署 |
| 度量 | 代码量、故事点 | 交付周期、变更失败率、人工审查时间 |

- 这张表最容易被忽略的是“瓶颈”和“度量”。如果编码快了十倍，但审查还是人逐行看，那整体速度不会变，只是队列从开发移到了 review。
- 另一个变化是“完成”的定义。传统编程里，代码写完、测试通过、合并，通常就算完成；vibe coding 里还要回答：验证证据是什么、回滚方案是什么、谁对结果负责。

# 代码不再是瓶颈

- Anthropic 的 AI-native SDLC playbook 把这个变化说得很直接：代码不再是瓶颈，瓶颈移到 build 两侧的 plan、review/test 和 deploy。传统 SDLC 的审批、交接和治理是按“人写代码”设计的，代码产出变快后，这些环节反而成了限制。

> 原文：The bottleneck moves to the steps to the left and right of the build phase. This is mainly plan, review/test, and deploy, which still run at human speed.
>
> 翻译：瓶颈转移到了 build 阶段左右两侧的步骤，主要是 plan、review/test 和 deploy，它们仍然按人的速度运行。
>
> 来源：[The AI-native SDLC playbook — Claude](https://claude.com/resources/articles/the-ai-native-sdlc-playbook)

- 它把生命周期拆成六个阶段：Plan、Design、Build、Test、Deploy、Maintain，并强调每个阶段都要提交一个下一阶段可读的产物：`intent.md`、`spec.md`、`plan.md`、diff 和测试、PR 和 review findings、incident 记录。产物链就是审计链。

> 原文：Every stage commits an artifact the next stage can read. Together, the intent, the spec, the plan, the diff and the review findings are the audit trail.
>
> 翻译：每个阶段都会提交一个下一阶段可以读取的产物。intent、spec、plan、diff 和 review findings 共同构成审计链。
>
> 来源：[The AI-native SDLC playbook — Claude](https://claude.com/resources/articles/the-ai-native-sdlc-playbook)

- 这个观点对面试很有用：不要只说“AI 帮我写代码”，要说“编码提速之后，我把流程改成以规格、计划和验收为中心，否则瓶颈会转移”。
- 代码量增加还会带来治理问题。审查容量、测试容量、部署容量都要跟着变，否则要么队列堆积，要么代码在审查不足的情况下上线。

# 我的 SDD 工作流

- SDD 通常指 Spec-Driven Development，也就是规格驱动开发，不是简单的“需求驱动开发”。核心是先冻结一份可验收的规格，再让执行和审查围绕这份规格进行。
- 我把它拆成三个阶段，每个阶段有明确的输入、产物和退出条件。

## plan：把模糊需求变成可执行规格

- 先问有没有参考文档：PRD、技术方案、竞品分析、历史 issue。有文档就带着文档质询，没有就直接质询需求。
- 质询的重点是边界：做什么、不做什么、用户故事、验收条件、技术约束、非功能需求。反复问到没有未解决的决策分支。
- 产出 `SPEC.md`，末尾带 `SPEC READY` 块。它让执行阶段不用再问“到底要做什么、做到什么程度、能不能提交”。

```text
SPEC READY

- Status: ready for implementation
- Source: docs/SPEC.md
- Repository: /path/to/repo
- Baseline: main@<commit>
- Test seam: tests/order/service_test.cpp
- Non-goals: 不改支付模块，不做历史数据迁移
- External authority: 允许改代码和跑测试，不允许 push 和 deploy
- Next route: dw-execute
```

- 大型需求可以再拆工单，把 SPEC 切成更小的执行单元；小需求不拆也可以，关键是验收条件可测。

## execute：在隔离上下文里实现

- 读取 `SPEC.md`，确认 `SPEC READY` 完整，提取完成标准、仓库、基线、测试 seam 和权限边界。
- 用隔离子会话执行。子会话有独立上下文和完整工具链，可以读代码、跑测试、提问；主会话保留决策和讨论。
- 子会话完成后回传执行回执，至少包含：完成了什么、验收条件逐条是否通过、改了哪些文件、跑了哪些验证、审查发现了什么、还有什么风险、有没有外部副作用。
- 提交放在独立分支或 worktree 里，一个任务一个分支；review 通过后再合并，敏感路径由人批准。
- 隔离的好处是长任务不占主会话上下文；代价是交接信息要写清楚，否则子会话会重复问。

## review：对照规格验收

- 读取 `SPEC.md` 和回执，逐条检查验收条件：找到代码证据，验证行为，标记通过、失败、不适用。
- 执行阶段跑单测和构建，review 阶段跑回归、集成和必要的性能测试；UI 变更看截图或录屏。
- 再跑代码审查：项目约定、安全、性能、测试覆盖、不必要的复杂性。
- 输出评审报告，按 P0、P1、P2 分级，给出合并建议：通过、要求修改、阻塞。
- AI 汇报完成不等于完成；验收看命令输出、测试结果和 diff 证据。
- 大型 PR 可以开多个子会话并行审查，再做圆桌汇总；每个子会话独立上下文，避免互相污染。

| 产物 | 谁写 | 谁读 | 证明什么 |
| --- | --- | --- | --- |
| SPEC.md | 规划阶段 | 执行、审查 | 要做什么、不做什么、怎么验收 |
| RECEIPT.md | 执行阶段 | 审查 | 做了什么、验证了什么、还剩什么 |
| REVIEW | 审查阶段 | 合并决策 | 是否满足规格、风险是否可接受 |

- 这套流程的价值不是“看起来专业”，而是把“感觉差不多了”换成可检查的产物。没有 SPEC，执行阶段会反复返工；没有回执，审查阶段只能靠猜；没有退出条件，流程会停在模糊状态。
- 技能本身不是万能的。它依赖模型能力，也需要维护；流程变了、工具变了，技能要跟着改。它不能替代测试和人工验收。

# 代码审查怎么补

- 只靠“人生成、人审查”撑不住代码量。Anthropic 的 Claude Code 团队把审查做成多层：提交前自验证、每个 PR 的 AI 审查、安全审查、CI、人按风险审批、合并队列和回滚。
- Code Review 会派一组 agent 并行找 bug，再让另一组 agent 验证 finding，过滤误报，按严重级别输出。

> 原文：When a PR is opened, Code Review dispatches a team of agents. The agents look for bugs in parallel, verify bugs to filter out false positives, and rank bugs by severity.
>
> 翻译：PR 打开后，Code Review 会派出一组 agent。它们并行查找 bug，验证 bug 以过滤误报，并按严重程度排序。
>
> 来源：[Code Review for Claude Code — Claude](https://claude.com/resources/articles/code-review)

- findings 会标成 Important、Nit 或 Pre-existing；每条 finding 都要么修复，要么在 thread 里说明理由，不能静默忽略。

> 原文：Every finding has to be answered. You either fix it or resolve the thread with a reason.
>
> 翻译：每条 finding 都必须有回应：要么修复，要么在 thread 里说明理由。
>
> 来源：[How the Claude Code team does code review](https://claude.dev/blog/solving-code-review-at-anthropic/)

- 审查策略放在 `REVIEW.md` 和 `CLAUDE.md`。`CLAUDE.md` 放项目级规则，`REVIEW.md` 放审查专用规则，比如什么算 Important、最多报几条 Nit、跳过哪些生成文件、哪些路径必须检查。
- 这里有一个容易踩的细节：Code Review 服务同时读 `CLAUDE.md` 和 `REVIEW.md`，本地的 `/code-review` 命令只读 `CLAUDE.md`，不读 `REVIEW.md`。想让两边都生效的规则，要放在 `CLAUDE.md`。

> 原文：The service reads both CLAUDE.md and REVIEW.md. The /code-review command, which you run inside a Claude Code session on your own machine, reads your CLAUDE.md files and not REVIEW.md.
>
> 翻译：Code Review 服务会同时读取 CLAUDE.md 和 REVIEW.md；而你在本机 Claude Code 会话里运行的 /code-review 命令只读 CLAUDE.md，不读 REVIEW.md。
>
> 来源：[Customize Code Review — Claude Code Docs](https://code.claude.com/docs/en/code-review-customize)

- 审查要有收敛机制。重复报同一个问题、无限轮次，会拖垮作者。Anthropic 的做法包括：轮次上限、只复审新增 diff、按 bug 类别提示、不重复已发布的 finding。

> 原文：A round cap. After three rounds, the reviewer asks the author to step back and reconsider the approach.
>
> Diff-only re-review after the first few passes.
>
> No repeats of findings already posted.
>
> 翻译：设置轮次上限：三轮之后，审查者让作者停下来重新考虑方案；前几轮之后只复审新增 diff；不重复已发布的 finding。
>
> 来源：[How the Claude Code team does code review](https://claude.dev/blog/solving-code-review-at-anthropic/)

- 审查要度量。看人工审批次数、评论数、等待时间，也看 revert 和 incident；只看“审了多少 PR”没有意义。

| 审查层 | 看什么 | 谁负责 |
| --- | --- | --- |
| 提交前自验证 | 构建、测试、截图、行为验证 | 执行者 |
| AI 审查 | 逻辑、边界、回归、规格符合度 | 审查 agent |
| 安全审查 | 注入、鉴权、PII、依赖和供应链 | 安全规则或安全 agent |
| CI | lint、类型、单测、集成、构建 | 流水线 |
| 人工审批 | 意图、风险、架构、敏感路径 | 人，按风险分级 |
| 合并与回滚 | 合并队列、开关、灰度、回滚 | 平台和人 |

- 人工审批主要由变更风险决定；可信作者可以走更轻的路径，但 agent 的批准不能替代人。文档、文案、flag 后的低风险增量，可以在自动检查通过后走轻量路径；普通产品改动要一个人；鉴权、计费、CI、迁移、发布流程这类高风险路径要两个人。

> 原文（表格整理）：Low: Docs, copy, internal-only features, additive changes behind a flag — None required once automated review and security checks are green.
>
> Medium: Ordinary product changes, and changes to sensitive areas such as caching, the auto-updater, or system prompts — One person.
>
> High: The highest-risk code, plus a small set of paths that always need two people — Two people.
>
> 翻译：低风险：文档、文案、内部功能、flag 后的增量；自动审查和安全检查通过后不需要人工批准。中风险：普通产品改动，以及缓存、自动更新、系统提示等敏感区域；一个人。高风险：最高风险代码，以及始终需要两个人的少量路径；两个人。
>
> 来源：[How the Claude Code team does code review](https://claude.dev/blog/solving-code-review-at-anthropic/)

- agent 的批准不能算人的批准。谁发起变更，谁对结果负责；审批只覆盖它看过的那个 commit，新 commit 进来要重新确认。

> 原文：The change sets the tier, not the author.
>
> An agent's approval never counts as a person's, either.
>
> An approval covers one specific commit.
>
> 翻译：风险等级由变更本身决定，而不是由作者决定。agent 的批准也永远不能算作人的批准。一次批准只覆盖一个特定的 commit。
>
> 来源：[How the Claude Code team does code review](https://claude.dev/blog/solving-code-review-at-anthropic/)

# 安全边界

- vibe coding 的安全问题不是“模型会不会写漏洞”，而是 agent 有了执行权之后，影响面被放大。Anthropic 的安全文章把威胁分成三类：被提示注入的 agent 引入恶意变更、供应链和依赖投毒、以及更高频的常规应用漏洞。

> 原文：The threats we’re designing against are specific: a compromised or prompt-injected agent introducing a malicious change; supply-chain and dependency poisoning that an agent ingests as trusted input; and the more familiar classes of application vulnerability now arriving at higher volume.
>
> 翻译：我们要设计的威胁很具体：被攻陷或被提示注入的 agent 引入恶意变更；agent 把供应链和依赖投毒当作可信输入吃进去；以及以更高频率出现的常规应用漏洞。
>
> 来源：[How Anthropic secures its AI-native software development lifecycle](https://claude.com/resources/articles/how-anthropic-secures-its-ai-native-software-development-lifecycle)

- 对应的控制是：安全左移，把规则写进 `CLAUDE.md` 和 skill，让代码生成时就遵守；在 PR 阶段做确定性和 agentic 审查；在生产前保留人工 gate。

> 原文：those guidelines are encoded in CLAUDE.md files and references to org-wide skills so the code follows these best practices the minute it's generated.
>
> 翻译：这些规范被编码进 CLAUDE.md 文件和 org-wide skills 的引用里，让代码在生成的那一刻就遵循这些最佳实践。
>
> 来源：[How Anthropic secures its AI-native software development lifecycle](https://claude.com/resources/articles/how-anthropic-secures-its-ai-native-software-development-lifecycle)

- 边界要用硬控制，不要只写在提示词里。远程开发机、出网白名单、最小权限身份、单用途 agent、密钥不进上下文、敏感路径人工审批，都是边界。

> 原文：Moving our coding to remote VMs was a relatively painless shift and gave us increased control and visibility compared to laptops alone. Agent traffic on these VMs is egress-allowlisted.
>
> Give every agent a single-purpose identity with the minimum permissions for its job.
>
> 翻译：把编码迁到远程 VM 后，相比只用笔记本，我们获得了更多控制和可见性；这些 VM 上的 agent 流量走出网白名单。给每个 agent 一个单用途身份，只授予完成工作所需的最小权限。
>
> 来源：[How Anthropic secures its AI-native software development lifecycle](https://claude.com/resources/articles/how-anthropic-secures-its-ai-native-software-development-lifecycle)

- agent 之间的通信也要设边界。一个能读日志的 agent 不应该顺带拥有 push 权限；一个能写代码的 agent 不应该自己批准自己的 PR。Anthropic 的安全文章里提到过 incident response agent 试图让另一个 agent 推修复的案例，最终被人审 gate 拦住。

> 原文：Following a model upgrade, the incident response agent reached out over Slack to another Claude instance on its own initiative. It asked the agent, which could write code, to push the fix. This was caught at a human review gate as designed, but this experience taught us to draw the boundary around access and actions, not around a model’s instructions or what we believe a model can do.
>
> 翻译：一次模型升级后，incident response agent 主动在 Slack 上联系了另一个 Claude 实例，让那个能写代码的 agent 推送修复。这个动作按设计被人审 gate 拦住了；这次经历也让我们把边界画在访问权限和动作上，而不是画在模型指令或我们以为模型能做什么上。
>
> 来源：[How Anthropic secures its AI-native software development lifecycle](https://claude.com/resources/articles/how-anthropic-secures-its-ai-native-software-development-lifecycle)

- 小团队不一定有完整的平台，但可以先做几件事：密钥放环境变量或密钥管理；agent 默认只读，写操作要确认；高风险路径强制人工 review；上线用开关和回滚；审查和操作留日志。

# 小团队落地版

- 先在一个仓库试点，不要一次改全公司流程。
- 写一份短的 `CLAUDE.md` 或 `AGENTS.md`：构建、测试、lint、目录结构、约定、常见坑、不要动的路径。AI 在同一个地方错两次，就补进去。
- 用计划模式或 SPEC 先冻结任务：目标、非目标、验收、验证命令。先让 AI 给计划，人确认后再改。
- 先补测试和构建反馈，再谈自动合并。没有验证流程，自动化只会放大错误。
- 写一份 `REVIEW.md`：什么算 Important、最多几条 Nit、跳过生成文件、敏感路径必须检查。
- PR 要小。小 PR 更容易 review、回滚和定位；大 PR 的 finding 再多，也可能看不过来。
- 风险分层从简：低风险走自动检查，中风险一个人，高风险两个人；先严格，再按证据放宽。
- 上线用 feature flag、灰度和回滚。审查不可能抓住所有问题，快速发现和快速回滚是兜底防线。
- 度量看交付周期、首次 CI 通过率、revert 率、incident 率、人工审查时间；不要只看生成了多少行代码。

# 面试口径

- 两分钟版可以分三层：
  - 分工变了：人做需求、取舍、验收和风险判断；AI 做生成、初筛、审查和日志分析。
  - 瓶颈变了：编码提速后，规划、审查、测试、部署成为瓶颈；所以要规格先行、验证流程、审查分层。
  - 我的做法：SDD 三阶段，plan 冻结 SPEC，execute 隔离子会话实现并回传证据，review 对照验收和代码审查；高风险路径人工 gate，低风险路径自动化。
- 如果只答“AI 写代码、人审查”，会显得停留在工具层；补上产物、验收、审查分层、安全和回滚，才像一套工程流程。
- 被追问“AI 写的代码你敢上线吗”时，回答：敢不敢不取决于谁写的，取决于有没有测试、审查、灰度和回滚；关键路径人来批，低风险路径用自动化，但责任仍然在人。

# 参考

- [The AI-native SDLC playbook — Claude](https://claude.com/resources/articles/the-ai-native-sdlc-playbook)
- [How the Claude Code team does code review](https://claude.dev/blog/solving-code-review-at-anthropic/)
- [Customize Code Review — Claude Code Docs](https://code.claude.com/docs/en/code-review-customize)
- [How Anthropic secures its AI-native software development lifecycle](https://claude.com/resources/articles/how-anthropic-secures-its-ai-native-software-development-lifecycle)
- [Code Review for Claude Code — Claude](https://claude.com/resources/articles/code-review)
- [Effective context engineering for AI agents — Anthropic](https://www.anthropic.com/research/effective-context-engineering-for-ai-agents)
- [vibe coding 中的 skill 与 prompt](https://chieko3020.xyz/2026/11/14/03-AI%E5%B7%A5%E5%85%B7%E4%B8%8E%E5%B7%A5%E4%BD%9C%E6%B5%81/)
