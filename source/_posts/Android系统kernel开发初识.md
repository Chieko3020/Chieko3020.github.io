---
title: Android 系统 kernel 开发初识
date: 2026-11-15 08:20:00
updated: 2026-11-15 08:20:00
tags: "你知道吗"
categories: "只属于你的小妙招 <br> 看似有用实则没用"
cover: /images/画廊/pixiv/151083042_p0_master1200.webp
excerpt: 从 Android 系统岗的内核出发，梳理内核子系统、源码树、最小实践
mermaid: false
---

# 写在前面

这篇目标不是把内核讲全，而是搭一张能走的地图：知道内核里有什么、Android 在 Linux 上改了什么、从哪里开始动手、遇到问题用什么工具。定位是“初识”，每个子系统讲机制与入口，不逐行分析源码。

## 读者与前置

读者假设：

- 有 Android 应用或 Framework 开发经验，知道 Activity、Binder、AudioFlinger 这些名字。
- 会 C，能看懂结构体、指针、宏。
- 用过 Linux 命令行，知道 `dmesg`、`ps`、`top`。

不需要事先读过内核相关书籍，也不需要买开发板。文章会区分“能在 QEMU 跑”和“需要真板”的部分。

## Android 内核是什么

Android 用的不是另一套内核，而是 Linux。准确说：

- 基于某个 Linux 长期支持版本（LTS）。
- 叠加 Android 特有的补丁与驱动，比如 Binder、ashmem、低内存 killer、调度与功耗调优。
- 这套内核叫 ACK（Android Common Kernel）。

GKI（Generic Kernel Image）是 Android 8 之后的结构调整：

- 把内核核心做成统一镜像，减少设备碎片化。
- 厂商驱动以模块形式加载，通过 KMI（Kernel Module Interface）与核心交互。
- 核心镜像由 Google 维护，厂商模块可以独立更新。

以 6.1 为例，Android 14 的 GKI 分支叫 `android14-6.1`。RK 的 BSP 常见 5.10，机制与 6.1 大同小异，差异多在驱动与部分子系统接口。

所以“Android 与 Linux 内核的差异”这个说法不严谨。Android 内核就是 Linux，差异是“Android 定制相对上游 Linux 的定制点”。文章里每章末尾的“Android 差异”小节，讲的就是这些定制点。

## 为什么叫“初识”

内核很大，入门最怕两件事：

- 一上来读源码，卡在某个函数里出不来。
- 只看概念，不动手，遇到问题还是不会。

这篇的做法是折中：

- 每个子系统先讲“它解决什么问题、核心数据结构是什么、入口函数在哪”。
- 能给最小可跑示例的，给示例与验证命令。
- 不能在本机跑的，明确说明需要什么环境。

不追求一次讲透，追求知道下一步该看什么。

## 验证边界

写作过程中，代码与环境分三类：

- QEMU 可跑：helloworld 模块、字符设备、`/proc` 接口。用 ARM64 虚拟机加载模块，贴真实 `dmesg` 输出。
- 需要真板：platform driver、设备树里的自定义设备、I2C/SPI 外设。QEMU 的 `virt` 机器没有这些设备，probe 不会触发。
- 只读机制：Binder、ashmem、音频 HAL 等 Android 特有模块。跑完整 AOSP 成本高，入门阶段理解机制与调用链即可。

目前自己的服务器环境是 x86_64、2 核 2GB 内存，编译完整 ARM64 内核不现实。所以文章里的“可跑”指模块级验证，不是完整系统构建。

## 学习路径

四段：

1. 机制：进程与调度、内存、中断与并发、驱动模型。先理解“为什么”，不急着看代码。
2. 源码：每个子系统追一个入口，比如 `schedule()`、`__alloc_pages()`、`do_softirq()`、`platform_driver_register()`。
3. 驱动：从 helloworld 模块到字符设备、platform driver、input 设备，逐步加功能。
4. 调试：`dmesg`、`ftrace`、`perf`、`pstore`、逻辑分析仪。能定位问题，比会写驱动更重要。

四段不是严格串行，可以交叉。比如写驱动时遇到 probe 不触发，就回到设备树与驱动模型补机制。

## 章节地图

| 章 | 内容 | 能带走什么 |
|---|---|---|
| 2 | ACK 与上游 Linux | 知道 Android 内核的版本与定制关系 |
| 3 | 内核地图与学习路径 | 知道子系统边界与学习顺序 |
| 4 | 构建与最小模块 | 能在 QEMU 编译并加载模块 |
| 5 | 进程与调度 | 理解 task_struct、CFS、上下文切换 |
| 6 | 内存管理 | 理解 buddy、slab、页表、回收 |
| 7 | 中断与并发 | 理解上下半部、锁、RCU |
| 8 | 驱动模型与设备树 | 理解 bus/driver/device、probe、DTS |
| 9 | 字符设备与 input | 能写最小字符设备与 input 驱动 |
| 10 | BSP 实战 | 知道一块 RK3568 板子上有什么 |
| 11 | 调试工具 | 能用 ftrace/perf/pstore 定位问题 |
| 12 | 从应用到内核 | 把音频、Binder、触摸链路串起来 |
| 13 | 共享内核案例 | 理解容器化场景下的全局资源问题 |

## 约定

- 版本：以 Linux 6.1 为主，涉及 5.10 差异处注明。
- 代码：尽量给最小可编译片段，标注来源路径；不能跑的会说明。
- 命令：默认在 ARM64 QEMU 或目标板上执行，路径以实际系统为准。
- 引用：每章末尾给官方文档或源码链接。

## 预期收获

读完并动手之后，应该能做到：

- 看懂一块板子的 DTS，知道驱动怎么匹配、probe 在哪。
- 写一个字符设备或 input 驱动，能加载、能上报事件。
- 用 `dmesg`、`ftrace`、`perf` 定位“驱动没起来”“中断没触发”“性能异常”三类问题。

## 子系统地图

| 子系统 | 负责什么 | 入门关注点 |
|---|---|---|
| 进程调度 | 谁在什么时候跑、跑多久 | task_struct、CFS、上下文切换 |
| 内存管理 | 物理页、虚拟地址、分配与回收 | buddy、slab、页表、缺页 |
| 中断与并发 | 硬件事件、同步原语 | 上下半部、spinlock、mutex、RCU |
| 设备模型 | 总线、驱动、设备的匹配 | platform、device tree、probe |
| 文件系统 | VFS、具体文件系统、页缓存 | inode、dentry、page cache |
| 网络 | 协议栈、网卡驱动 | socket、skb、NAPI |
| 电源管理 | 休眠、唤醒、运行时电源 | runtime PM、suspend |
| 时钟与定时 | 时钟源、定时器、高精度定时 | clocksource、hrtimer |

驱动与 BSP 相关的是调度、内存、中断、设备模型四块，先把这四块吃透。

## 源码树

| 目录 | 内容 |
|---|---|
| `arch/arm64` | ARM64 架构相关：启动、页表、异常向量、设备树 |
| `kernel/` | 调度、时间、锁、模块、trace |
| `mm/` | 内存管理：buddy、slab、页表、回收 |
| `fs/` | VFS 与具体文件系统 |
| `drivers/` | 各类驱动：字符、块、网络、I2C、SPI、input、thermal |
| `include/` | 内核头文件，接口声明 |
| `Documentation/` | 官方文档，含设备树、驱动模型、调试 |
| `scripts/` | 构建、检查、设备树编译脚本 |

读源码建议从接口入手：`include/` 里的结构体和函数声明说明一个子系统对外暴露什么，`drivers/` 或 `mm/` 里是实现。

## 读源码的方法

- 先追一个入口，不扩散。比如调度看 `schedule()`，内存看 `__alloc_pages()`，中断看 `do_softirq()`，驱动看 `platform_driver_register()`。
- 画调用链。每追一层记一行，遇到分支先记下来，不展开。
- 看数据结构。结构体字段往往比函数更能说明设计，比如 `task_struct` 的 `mm`、`active_mm`、`se`。
- 对照文档。`Documentation/` 里的说明比博客可靠。
- 用工具验证。`ftrace` 能打印调用关系，`perf` 能看热点，`printk` 能看状态。

## 常见误区

- 一上来读调度器源码：没有机制基础，读三行就迷路。
- 只看视频不动手：驱动加载失败一次，比看十个视频学得多。
- 背 API：API 会变，机制与调试方法不会。
- 只跑 QEMU 不上板：QEMU 验证不了真实外设，板级问题必须上板。

## 怎么用这篇文章

- 先读第 1、2 章，建立“Android 内核是 Linux 加定制”的认知。
- 第 3、4 章动手：在 QEMU 或 WSL 把最小模块跑起来。
- 第 5 到 7 章读机制，每章配一个观察实验（`/proc`、`ftrace`）。
- 第 8 到 10 章写驱动、改 DTS，能上板就上板，不能上板就看 BSP 代码。
- 第 11 到 13 章练调试与串联，把已有的 Framework/音频经验接上。

读的时候不必一次读完。每章末尾的“参考”是延伸入口，遇到问题再查。

## 学习资源

| 类型 | 资源 | 说明 |
|---|---|---|
| 书 | 《Linux Kernel Development》 | 机制入门，偏概念 |
| 书 | 《深入理解 Linux 内核》 | 更细，版本较老 |
| 书 | 《Linux 设备驱动开发》 | 驱动入门，API 较老，看思路 |
| 文档 | kernel.org 的 `Documentation/` | 官方，最可靠 |
| 文档 | LWN.net | 子系统深度文章 |
| 社区 | kernelnewbies | 入门教程、邮件列表 |
| 课程 | Linux Foundation LFD103 | 开发流程与第一个补丁 |
| 源码 | elixir.bootlin.com | 在线交叉引用 |

书与文档的版本要对上。LDD3 基于 2.6，代码不能直接跑，机制仍有参考价值。读代码以目标内核版本为准。

## 用户态与内核态的边界

内核开发要先分清“这段代码跑在哪”：

| 维度 | 用户态 | 内核态 |
|---|---|---|
| 权限 | 受限，不能直接访问硬件 | 最高，可访问全部资源 |
| 地址空间 | 自己的虚拟地址 | 内核地址空间 + 当前进程 |
| 崩溃影响 | 进程退出 | 可能 panic/重启 |
| 可用 API | libc、系统调用 | 内核 API，不能调 libc |
| 睡眠 | 可以 | 中断上下文不行 |

写驱动时常见的错误，是把用户态的思维带进内核：

- 用 `printf`（内核用 `printk`/`pr_info`）。
- 直接解引用用户指针（要用 `copy_from_user`）。
- 在中断上下文睡眠（不能 `mutex_lock`）。
- 用大局部数组（内核栈只有 16KB）。

这些边界的背后是“内核没有进程隔离、没有异常兜底”。用户态出错只死一个进程，内核态出错可能整机重启。

## 内核版本号怎么读

版本号形如 `6.1.75-android14-11-gabc1234`：

- `6.1.75`：上游主版本、次版本、修订号。
- `android14-11`：Android 分支与本地版本。
- `gabc1234`：git 提交短哈希。

`vermagic` 由版本、配置、编译器等信息组成，模块加载时比对。版本号不同、配置不同，模块都可能加载失败。

`uname -r` 看运行内核版本，`/lib/modules/$(uname -r)` 看对应模块与 headers。

## 内核的五大职责

| 职责 | 内核做什么 | 用户态接口 |
|---|---|---|
| 进程管理 | 创建、调度、销毁 | fork/clone/exec/wait |
| 内存管理 | 分配、映射、回收 | brk/mmap/munmap |
| 文件系统 | 路径解析、读写、缓存 | open/read/write/stat |
| 网络 | 协议栈、套接字 | socket/bind/send/recv |
| 设备驱动 | 硬件访问、中断 | open/ioctl/read/write |

Framework 与 HAL 最终都落到这五类接口上。理解它们，才能把“上层现象”映射到“内核机制”。

## 适合谁读，不适合谁读

适合：

- 有应用或 Framework 经验，想补内核这一层。
- 准备面试，需要能讲清启动、驱动、调度、内存。
- 刚接触 BSP，需要知道从哪看起。

不适合：

- 想要逐行分析某个子系统源码的人。
- 需要完整 AOSP 构建教程的人。
- 没有任何 C 与 Linux 基础的人。

这篇文章是地图与起点，不是百科全书。

## 前置知识与自测

开始前，用几个问题自测：

- 能解释进程与线程的区别吗？
- 知道虚拟地址与物理地址的差别吗？
- 写过 C 的结构体与指针吗？
- 用过 `dmesg`、`ps`、`strace` 吗？
- 知道系统调用是怎么进入内核的吗？

答不上来不必停，先补基础。内核不是靠背 API 学会的，靠“机制 + 动手 + 排查”三件事。

## 几个常见误解

- “Android 内核是另一套内核”：不是，是 Linux 加定制。
- “Framework 就是内核”：不是，Framework 在用户态，通过系统调用与内核交互。
- “内核开发只写驱动”：还包括调试、性能、稳定性、功耗、OTA 适配。
- “QEMU 能跑就等于能上板”：真实外设、时序、电源、SELinux 都需要实板验证。

把这几条分清，能少走很多弯路。

# ACK 与上游 Linux

## 两个版本号

Android 设备上跑的内核，版本号通常长这样：

- `6.1.75-android14-11-g...`：上游 6.1.75，Android 14 的 ACK 分支，后面是本地提交。
- `5.10.198-android12-9-...`：RK BSP 常见的组合。

拆开看是两件事：

- 上游 Linux 的版本（LTS）。
- Android 的补丁与分支（ACK）。

## 上游 LTS

Linux 内核每几个月发一个主版本，其中一部分被标记为 LTS（Long Term Support），维护数年。6.1 是 2022 年底发布的 LTS，支持周期被延长到 2027 年底左右。

LTS 的意义：

- 稳定，适合产品。
- 有长期的安全与 bug 修复。
- 芯片厂商的 BSP 通常基于某个 LTS。

上游的代码结构、子系统边界、API 是理解 Android 内核的基础。Android 的改动是在这个基础上叠加的。

## ACK

ACK（Android Common Kernel）是 Google 维护的 Android 通用内核：

- 基于某个上游 LTS。
- 叠加 Android 特有的补丁与驱动。
- 按 Android 版本与内核版本命名，比如 `android14-6.1`。

Android 补丁大致分几类：

| 类别 | 例子 | 作用 |
|---|---|---|
| IPC | Binder 驱动 | 跨进程通信 |
| 内存 | ashmem、低内存 killer、memfd | 共享内存与回收 |
| 调度 | 调度调优、uclamp、EAS 相关 | 性能与功耗 |
| 电源 | wakeup source、suspend 调优 | 休眠唤醒 |
| 图形 | DMA-BUF、ION 的替代 | 显示与相机 |
| 安全 | SELinux、dm-verity、KASAN 配置 | 访问控制与完整性 |

这些补丁有的最终进入上游，有的长期只在 ACK 里。读 Android 内核代码时，遇到不认识的驱动或钩子，先确认它是不是 Android 特有的。

## GKI 与 KMI

GKI（Generic Kernel Image）解决“同一份内核核心适配多台设备”的问题：

- 核心镜像统一，由 Google 维护。
- 厂商驱动以模块（`.ko`）形式加载。
- 核心与模块之间通过 KMI（Kernel Module Interface）约定接口。

KMI 是一组稳定的符号与结构布局。厂商模块只能使用 KMI 暴露的接口，不能直接依赖核心内部函数。这样核心升级时，模块不用重编。

代价是：

- 厂商不能随便改核心。
- 模块要按 KMI 版本编译与签名。
- 一些深度定制要绕道 vendor hook 或 upstream 提案。

Android 8 引入 Treble，把 system 与 vendor 分区解耦；GKI 是 Treble 在内核层的延伸。

## 分支生命周期

ACK 分支有自己的生命周期：

- 跟随上游 LTS 合并安全补丁。
- KMI 有代际，代际内保持兼容。
- 到达 EOL 后停止维护，设备要么升级内核，要么由厂商自行维护。

对开发者意味着：

- 选型时看 LTS 剩余支持时间。
- 升级内核时看 KMI 代际是否兼容。
- 长期产品要预留维护成本。

## Android 差异

与上游 Linux 相比，Android 的定制集中在：

| 方向 | 上游做法 | Android 定制 |
|---|---|---|
| IPC | 无 Binder | Binder 驱动与协议 |
| 共享内存 | memfd、shmem | ashmem（旧）、memfd（新） |
| 内存回收 | LRU、OOM killer | LMK、lmkd 用户态协作 |
| 图形缓冲 | DMA-BUF | DMA-BUF heaps、ION 迁移 |
| 调度 | CFS/EEVDF | EAS、uclamp、RT 音频线程 |
| 安全 | SELinux 可选 | SELinux 强制、dm-verity |

这些差异不是“另一套内核”，是在同一套内核上的产品化改动。理解上游机制，才能看懂改动的目的。

## GKI 2.0 与模块签名

GKI 2.0 的结构：

- 一个统一的内核镜像，跑在所有支持 GKI 的设备上。
- 厂商驱动以模块形式存在，放在 vendor 分区。
- 模块与内核之间通过 KMI 约定接口。

模块签名流程：

1. 厂商用私钥给模块签名。
2. 设备的内核里内置对应公钥。
3. 加载时内核校验签名，不通过则拒绝。

```bash
# 示意：生成密钥并签名
openssl genrsa -out sign.key 2048
openssl rsa -in sign.key -pubout -out sign.pub
# 用 avbtool 或内核脚本签名模块
```

签名保证“只有授权模块能进内核”，代价是密钥管理与版本兼容。

KMI 有代际：同一代际内模块可以跨小版本加载，跨代际要重编。Android 14 的 6.1 分支有自己的 KMI 版本，厂商模块按这个版本构建。

## vendor hook

Android 在核心代码里预留钩子：

```c
// 示意：核心代码里的 hook 调用
trace_android_vh_xxx(args...);
```

厂商模块可以注册回调，在不改核心的情况下插入逻辑。常见用途：

- 调度调优（按场景调整优先级）。
- 内存回收策略（LMK 相关）。
- 电源与唤醒（限制后台唤醒）。

读代码时遇到 `android_vh_*`、`trace_android_vh_*`，说明这里是 Android 定制点。钩子让核心保持统一，但增加了阅读难度。

## 版本差异

| 方向 | 5.10 | 6.1 | 6.6+ |
|---|---|---|---|
| 调度器 | CFS | CFS | 逐步 EEVDF |
| GKI | GKI 1.0/2.0 | GKI 2.0 | GKI 2.0 |
| 模块签名 | 支持 | 支持 | 支持 |
| vendor hook | 有 | 有 | 有 |
| 内核配置 | 分散 | 更集中 | 更集中 |

RK BSP 常见 5.10，Android 14 常见 6.1。写驱动时注意 API 差异，比如 `class_create` 的返回值、`probe` 的类型、`copy_from_user` 的封装。

## Android 定制的源码分布

| 路径 | 内容 |
|---|---|
| `drivers/android/` | Binder、ashmem 等 |
| `drivers/dma-buf/` | DMA-BUF heaps |
| `mm/` | LMK 接口、内存调优 |
| `kernel/sched/` | EAS、uclamp、调度调优 |
| `security/selinux/` | 强制访问控制 |
| `fs/` | 部分 Android 文件系统适配 |

读 Android 内核时，先在标准子系统里找到对应机制，再看这些目录里加了什么。

## 排查案例：升级后模块加载失败

现象：OTA 升级后，厂商模块 `insmod` 报“invalid module format”。

原因：

- 模块按旧 KMI 版本编译，新内核的 KMI 代际变了。
- 模块签名用的密钥不在新内核里。
- 内核配置变化导致 `vermagic` 不匹配。

排查：

```bash
# 看内核版本与模块版本
uname -r
modinfo mydriver.ko | grep vermagic
# 看内核日志
dmesg | grep -i module
```

处理：按新 KMI 重编模块、重新签名；确认内核公钥已更新。

## Android 版本与内核分支

常见组合（具体以设备为准）：

| Android | 常见内核 | ACK 分支 |
|---|---|---|
| 12 | 5.10 / 5.4 | android12-5.10 |
| 13 | 5.15 / 5.10 | android13-5.15、android13-5.10 |
| 14 | 6.1 | android14-6.1 |
| 15 | 6.6 | android15-6.6 |

RK BSP 常见 5.10，Android 14 常见 6.1。选分支时看 Android 版本、芯片支持、LTS 周期。

同一个 Android 版本可能有多个内核分支，取决于芯片与产品定位。低端设备可能用更老的 LTS，高端设备用更新的。

## 实验：看宿主内核的配置

```bash
uname -r
ls /boot/config-$(uname -r)
zcat /proc/config.gz | grep -E "CONFIG_MODULES|CONFIG_KALLSYMS"  # 若开启
```

从配置能看出：

- 是否支持模块（`CONFIG_MODULES`）。
- 是否开启符号表（`CONFIG_KALLSYMS`）。
- 是否开启调试（`CONFIG_DEBUG_INFO`）。
- 是否有 GKI/KMI 相关选项。

对比 Android 设备的配置，能看到厂商加了什么。

## Android 内核的常见配置

| 配置 | 作用 |
|---|---|
| `CONFIG_ANDROID_BINDER_IPC` | Binder 驱动 |
| `CONFIG_ANDROID_BINDERFS` | binderfs 多实例 |
| `CONFIG_ASHMEM` | 旧共享内存（逐步被 memfd 取代） |
| `CONFIG_MODULES` | 模块支持 |
| `CONFIG_MODULE_SIG` | 模块签名 |
| `CONFIG_KALLSYMS` | 符号表，崩溃分析用 |
| `CONFIG_DEBUG_INFO` | 调试信息，vmlinux |
| `CONFIG_KASAN` | 越界检测（调试） |

看设备配置：

```bash
zcat /proc/config.gz | grep -E "CONFIG_ANDROID_BINDER|CONFIG_MODULE_SIG"
```

没有 `/proc/config.gz` 时，看 `/boot/config-$(uname -r)` 或厂商源码的 defconfig。

## 厂商 BSP 与 ACK 的差异

| 方向 | ACK | 厂商 BSP |
|---|---|---|
| 驱动 | 上游 + Android 补丁 | 大量未上游驱动 |
| 设备树 | 通用 | 板级私有节点 |
| 配置 | 通用 defconfig | 产品 fragment |
| 升级 | Google 维护 | 厂商维护，滞后 |

用 ACK 学机制，用 BSP 学板级适配。两者对照，能看出哪些是标准接口、哪些是私有扩展。

## Android 内核的文档与社区

| 资源 | 用途 |
|---|---|
| source.android.com | 官方架构与构建文档 |
| android.googlesource.com | ACK 源码 |
| LWN.net | 子系统深度文章 |
| lore.kernel.org | 邮件列表归档 |
| elixir.bootlin.com | 源码交叉引用 |

Android 的定制点大多能在官方文档找到说明，剩余部分看源码与提交记录。

## 启动相关分区

| 分区 | 内容 |
|---|---|
| `boot` | GKI 内核 + 通用 ramdisk |
| `vendor_boot` | 厂商 ramdisk、dtb |
| `dtbo` | 设备树 overlay |
| `vbmeta` | 校验元数据 |
| `super` | 动态分区，装 system/vendor/product |

分区布局随 Android 版本变化，刷机前先确认设备的分区表与 slot。

## 参考

- [Android Common Kernel](https://source.android.com/docs/core/architecture/kernel/android-common)
- [Generic boot partition](https://source.android.com/docs/core/architecture/partitions/generic-boot)
- [Linux 6.1 LTS 支持周期](https://www.phoronix.com/news/Linux-6.1-LTS-Extended-5-Years)

## ACK 分支怎么选

| 约束 | 选择 |
|---|---|
| 芯片厂商只支持 5.10 | 跟厂商走，机制按 5.10 看 |
| 需要长周期维护 | 选 LTS 剩余时间长的分支 |
| 需要 GKI | 选对应 Android 版本的 `androidXX-Y.Z` |
| 需要新特性 | 选更高版本，但驱动要移植 |

选分支先看芯片支持，再看 Android 版本，最后看维护周期。三者冲突时，以能拿到完整 BSP 为准。

## 模块签名失败怎么排查

```bash
dmesg | grep -iE "module|signature|verification"
```

常见输出：

- `module verification failed: signature and/or required key missing`：模块未签名或公钥不在内核。
- `Loading of unsigned module is rejected`：强制签名开启，直接拒绝。

处理：

- 用设备内核的公钥对应的私钥重签。
- 调试版本可关闭强制签名（`CONFIG_MODULE_SIG_FORCE`）。
- 确认模块与内核版本、KMI 一致。

签名是信任链的一环，不是“加个文件”就能过。

## GKI 与 Treble 的关系

Treble 把 system 与 vendor 分区解耦，让系统升级不依赖厂商。GKI 是这一思路在内核层的延伸：

- 核心理由 Google 维护，系统升级可以复用。
- 厂商驱动放 vendor 分区，按 KMI 适配。
- 系统与内核的接口（HAL、KMI）要稳定。

三者一起，才能做到“升级系统不动厂商驱动”。

## LTS 与安全补丁节奏

LTS 分支定期合入稳定补丁，通常每几周一个小版本。Android 的 ACK 会在 LTS 基础上再加安全补丁，节奏与 Android 安全公告对齐。

产品维护要关注：LTS 剩余支持时间、ACK 分支是否还接收补丁、芯片厂商是否跟进。三者任一断掉，设备就进入“自己维护”状态。

## 小结

Android 内核的版本关系可以记成一句话：上游 LTS 是地基，ACK 是定制，GKI 是交付方式。三者对上，驱动与模块才能稳定工作。

# 构建与最小模块

## AOSP 内核与分区

Android 的启动镜像不是单一文件。以 GKI 为例：

| 分区/文件 | 内容 | 谁生成 |
|---|---|---|
| `boot.img` | GKI 内核 + 通用 ramdisk | AOSP 构建 |
| `vendor_boot.img` | 厂商 ramdisk、部分 dtb | 厂商构建 |
| `dtbo.img` | 设备树 overlay | 厂商构建 |
| `vbmeta.img` | 校验元数据 | 签名工具 |

`boot.img` 的格式包含内核、ramdisk、命令行、头部校验。Bootloader 读 `boot.img`，加载内核与 ramdisk，再把控制权交给内核。厂商的板级差异放在 `vendor_boot` 与 `dtbo`，这样 GKI 内核可以跨设备复用。

## 获取与配置

源码来源有两类：

- Android Common Kernel：`android.googlesource.com/kernel/common`，按分支取，例如 `android14-6.1`。
- 厂商 BSP：芯片厂商提供的完整内核树，包含未上游的驱动。

配置的入口是 `defconfig`：

```bash
# 以 ARM64 为例，生成 .config
make ARCH=arm64 vendor/xxx_defconfig

# 需要增删配置时进菜单
make ARCH=arm64 menuconfig

# 合并多个配置片段，适合产品差异
scripts/kconfig/merge_config.sh .config fragment.config
```

`defconfig` 只保存非默认项，`menuconfig` 改完会写回 `.config`。产品差异建议用配置片段叠加，不要直接改厂商的 `defconfig`，否则升级时冲突。

## 编译产物

```bash
# 编译内核与设备树
make ARCH=arm64 CROSS_COMPILE=aarch64-linux-gnu- -j$(nproc) Image dtbs modules

# 产物
# arch/arm64/boot/Image        内核镜像
# arch/arm64/boot/dts/...      dtb
# 各驱动目录下的 .ko            模块
```

`Image` 是未压缩内核，`Image.gz` 是压缩版，bootloader 是否支持压缩取决于平台。模块要与内核版本、配置完全一致，否则加载会报版本不匹配。

## QEMU 验证

没有实板时，QEMU 可以验证“内核能不能启动、模块能不能加载”。

准备：

```bash
# Debian/Ubuntu 主机
sudo apt install qemu-system-arm gcc-aarch64-linux-gnu

# 下载 Alpine ARM64 的 virt 镜像（以官网最新为准）
# 启动示例
qemu-system-aarch64 \
  -M virt -cpu cortex-a57 -m 1024 \
  -kernel <镜像自带内核或自编内核> \
  -append "console=ttyAMA0 root=/dev/vda rw" \
  -drive file=<alpine-virt.img>,format=raw,if=virtio \
  -nographic
```

进入虚拟机后，装编译依赖：

```bash
apk add gcc make linux-headers
```

QEMU 验证不了真实外设，但能验证启动链、驱动模型、模块加载、`dmesg`、`ftrace` 这些通用机制。板级驱动最终还是要上实板。

## 最小模块

一个能跑的最小模块：

```c
// helloworld.c：最小内核模块，QEMU 上验证过 insmod/rmmod
#include <linux/init.h>
#include <linux/module.h>
#include <linux/kernel.h>

static int __init hello_init(void)
{
    pr_info("hello: loaded\n");   // 走 printk，dmesg 可见
    return 0;
}

static void __exit hello_exit(void)
{
    pr_info("hello: unloaded\n");
}

module_init(hello_init);
module_exit(hello_exit);

MODULE_LICENSE("GPL");
MODULE_AUTHOR("example");
MODULE_DESCRIPTION("minimal hello module");
```

配套 Makefile：

```make
# 内核模块构建，KDIR 指向已配置好的内核源码或 headers
obj-m += helloworld.o
KDIR ?= /lib/modules/$(shell uname -r)/build

all:
	$(MAKE) -C $(KDIR) M=$(PWD) modules

clean:
	$(MAKE) -C $(KDIR) M=$(PWD) clean
```

验证：

```bash
# 编译后在 QEMU 或目标板加载
sudo insmod helloworld.ko
dmesg | tail -5          # 应看到 hello: loaded
sudo rmmod helloworld
dmesg | tail -5          # 应看到 hello: unloaded
```

这个模块说明三件事：内核代码没有 `main`，入口由 `module_init` 注册；打印用 `pr_info`，输出到内核日志；卸载要能清理自己申请的资源，否则 `rmmod` 会失败或留下泄漏。

## 模块版本与签名

模块加载时，内核会检查：

- 模块的 `vermagic` 与内核版本、配置是否匹配。
- 模块签名是否有效（开启模块签名校验时）。

所以“在 A 内核上编的模块，拿到 B 内核上加载”通常会失败。GKI 设备上，模块还要按 KMI 版本编译与签名。

## 参考

- [Generic boot partition](https://source.android.com/docs/core/architecture/partitions/generic-boot)
- [Android Common Kernel](https://source.android.com/docs/core/architecture/kernel/android-common)

## Kbuild 与 Makefile

内核模块的构建由 Kbuild 管理：

```make
# 单文件模块
obj-m += helloworld.o

# 多文件模块
obj-m += mydriver.o
mydriver-objs := main.o hw.o
```

`obj-m` 表示编成模块，`obj-y` 表示编进内核。模块名与源文件名的对应关系由 Kbuild 推导。

模块参数：

```c
static int debug_level = 0;
module_param(debug_level, int, 0644);
MODULE_PARM_DESC(debug_level, "debug level, 0-3");

// 加载时指定
// insmod mydriver.ko debug_level=2
```

参数适合调试与现场配置，不适合频繁变化的状态。

## 一个 /proc 接口

驱动常通过 `/proc` 或 `/sys` 暴露状态：

```c
#include <linux/module.h>
#include <linux/proc_fs.h>
#include <linux/seq_file.h>

static int my_count;   // 示例状态

static int my_show(struct seq_file *m, void *v)
{
    seq_printf(m, "count=%d\n", my_count);
    return 0;
}

static int my_open(struct inode *inode, struct file *file)
{
    return single_open(file, my_show, NULL);
}

static const struct proc_ops my_proc_ops = {
    .proc_open = my_open,
    .proc_read = seq_read,
    .proc_lseek = seq_lseek,
    .proc_release = single_release,
};

static int __init my_init(void)
{
    proc_create("mydriver", 0444, NULL, &my_proc_ops);
    return 0;
}

static void __exit my_exit(void)
{
    remove_proc_entry("mydriver", NULL);
}

module_init(my_init);
module_exit(my_exit);
MODULE_LICENSE("GPL");
```

用户态 `cat /proc/mydriver` 就能看到状态。`seq_file` 适合输出多行、需要遍历的数据。

## 卸载时的清理

模块卸载要按申请的反序释放：

- 删除 `/proc`、`/sys` 节点。
- 注销字符设备、input 设备。
- 释放中断、内存、时钟。
- 注销驱动。

`rmmod` 失败常见原因：设备还在被打开、引用计数不为零、资源没释放。用 `lsmod` 看引用计数，用 `dmesg` 看卸载路径的报错。

## 版本差异

| API | 5.10 | 6.1 |
|---|---|---|
| `class_create` | 返回 `struct class *` | 返回指针，参数有变化 |
| `proc_ops` | 已引入 | 使用 `proc_ops` |
| `probe` | `int (*)(struct platform_device *)` | 同 |
| `copy_from_user` | 标准 | 标准 |

写跨版本驱动时，用宏或条件编译隔离差异，不要把版本判断散落在业务逻辑里。

## 构建与模块的源码路径

| 路径 | 内容 |
|---|---|
| `Makefile` / `Kbuild` | 顶层构建规则 |
| `scripts/kconfig/` | 配置系统 |
| `kernel/module/` | 模块加载、签名、vermagic |
| `init/main.c` | 内核启动入口 |
| `arch/arm64/Makefile` | ARM64 构建规则 |

## 排查案例：模块 vermagic 不匹配

现象：`insmod` 报“version magic ... should be ...”。

原因：模块与内核的版本、配置不一致。常见于：

- 在 A 内核源码上编的模块，拿到 B 内核加载。
- 配置里 `CONFIG_MODVERSIONS` 或本地版本号不同。
- 交叉编译器版本不同导致 `vermagic` 变化。

处理：

- 用目标内核的源码与配置重编。
- 确认 `include/config/kernel.release` 与目标一致。
- 需要时用 `modprobe --force` 只作调试，不要用于生产。

## 模块的生命周期与引用计数

模块加载后，内核维护引用计数：

- `try_module_get` 增加引用，`module_put` 减少。
- 引用不为零时，`rmmod` 会失败（`Module in use`）。
- 设备打开、文件操作、注册的回调都可能持有引用。

```c
// 打开设备时持有模块引用
if (!try_module_get(THIS_MODULE))
    return -ENODEV;
```

排查 `rmmod` 失败：

```bash
lsmod | grep mydriver      # 看 Used by
cat /proc/modules | grep mydriver
```

处理：关闭占用设备的进程，注销回调，确保引用归零。

## 模块依赖

模块可以导出符号给其他模块：

```c
EXPORT_SYMBOL_GPL(my_function);
```

依赖模块要先加载，符号才能解析。`modprobe` 会按依赖顺序加载，`insmod` 不会。

`Module.symvers` 记录导出符号与 CRC，编译依赖模块时需要它。缺少时会出现“unknown symbol”。

## 工具链选择

内核编译常用两类工具链：

- GCC：`aarch64-linux-gnu-gcc`，通用，发行版仓库直接装。
- Clang/LLVM：Android 内核常用，AOSP 的 prebuilts 提供。

差异：

| 方向 | GCC | Clang |
|---|---|---|
| 安装 | apt 直接装 | 需要 LLVM 或 AOSP prebuilts |
| Android 支持 | 可用 | 官方主推 |
| 特性 | 成熟 | 部分新特性更早 |
| 兼容 | 广泛 | 需要版本匹配 |

Android 的 GKI 构建通常用 Clang。自己编模块时，编译器要与目标内核一致，否则 `vermagic` 可能对不上。

## 实验：模块参数与 /proc

写一个带参数的模块：

```c
static int level = 1;
module_param(level, int, 0644);
MODULE_PARM_DESC(level, "log level");

static int __init demo_init(void)
{
    pr_info("demo: level=%d\n", level);
    return 0;
}
```

加载并验证：

```bash
insmod demo.ko level=3
dmesg | tail -2
cat /sys/module/demo/parameters/level
```

参数可以现场调整（如果权限是 0644），适合调试与灰度。

## printk 等级与调试开关

```c
pr_err("error\n");      // KERN_ERR
pr_warn("warn\n");      // KERN_WARNING
pr_info("info\n");      // KERN_INFO
pr_debug("debug\n");    // 需要动态调试或 DEBUG 宏
dev_dbg(dev, "debug\n"); // 设备相关
```

`pr_fmt` 可以给日志加前缀：

```c
#define pr_fmt(fmt) "mydriver: " fmt
```

动态调试：

```bash
echo 'file mydriver.c +p' > /sys/kernel/debug/dynamic_debug/control
```

日志等级控制输出到 console 的内容，`dmesg` 仍保留全部。

## 本地编译与交叉编译

- 编译宿主 x86 内核：直接用 `gcc`，不需要交叉编译器。
- 编译 ARM64 内核：用 `aarch64-linux-gnu-gcc` 或 Clang。
- 编模块：`make -C <内核源码> M=<模块目录> modules`，KDIR 指向目标内核。

本地验证模块最快的方式，是编一个与宿主内核版本一致的模块；跨架构验证必须用交叉编译器加 QEMU/实板。

## 模块编译的常见错误

| 错误 | 原因 | 处理 |
|---|---|---|
| `implicit declaration of ...` | 缺头文件 | 补 `#include` |
| `unknown type name 'xxx'` | API 版本不匹配 | 对照目标内核头文件 |
| `Skipping BTF generation` | 没有 vmlinux | 不影响加载 |
| `invalid module format` | vermagic 不匹配 | 用目标内核 headers 重编 |
| `Unknown symbol` | 依赖模块未加载 | 先加载依赖或 `modprobe` |

编译通过只是第一步，加载时还要过版本与签名两关。

## 模块签名与加载验证

签名后的模块加载时，内核会：

1. 校验模块的 `vermagic`。
2. 校验签名（开启强制签名时）。
3. 解析依赖与符号。
4. 调用模块的 `init`。

验证：

```bash
modprobe mydriver
lsmod | grep mydriver
dmesg | tail
```

失败时看 `dmesg` 的 `module:` 前缀日志，能区分“版本不匹配”“签名失败”“符号缺失”。

## 模块版本匹配的实验

```bash
# 看内核版本与模块 vermagic
uname -r
modinfo helloworld.ko | grep vermagic
# 看内核配置
grep -E "CONFIG_MODVERSIONS|CONFIG_MODULE_SIG" /boot/config-$(uname -r)
```

`vermagic` 包含内核版本、SMP、抢占模型、模块版本化等信息。任何一项不一致，加载都会被拒绝。

实验：改一个配置项重编内核，再用旧模块加载，观察报错。这个过程能理解“模块为什么绑定内核”。

## 符号导出与 CRC

模块依赖另一个模块的函数时，被依赖方要导出：

```c
EXPORT_SYMBOL_GPL(my_function);
```

编译依赖模块需要 `Module.symvers`，它记录符号与 CRC。缺少时：

```text
WARNING: "my_function" undefined!
```

处理：先编译被依赖模块，把 `Module.symvers` 放到依赖模块目录，再编译。

## Kbuild 的清理与依赖

```bash
make clean      # 删生成文件，保留配置
make mrproper   # 删配置与生成文件
make modules_install
```

`clean` 后重编依赖会重新生成，适合排查“改了头文件没重编”的问题。`mrproper` 会删 `.config`，慎用。

## 交叉编译的环境变量

```bash
export ARCH=arm64
export CROSS_COMPILE=aarch64-linux-gnu-
make defconfig
make -j$(nproc) Image dtbs modules
```

`ARCH` 决定架构目录，`CROSS_COMPILE` 是工具链前缀。忘记设置会用宿主编译器，编出来的镜像架构不对。

## 模块目录的组织

一个驱动目录通常包含：

```text
mydriver/
├── Kconfig          # 配置项
├── Makefile         # obj-m / obj-y
├── main.c           # 驱动实现
├── hw.c             # 硬件相关
└── mydriver.h       # 内部头文件
```

`Kconfig` 决定是否编译，`Makefile` 决定编成模块还是内置。加新驱动时，两处都要改，否则菜单里看不到。

## 编译时间与并行度

```bash
time make -j8 Image dtbs modules
```

首次全量编译最慢，增量编译只重编改动文件。并行度不是越高越好，受内存限制。

嵌入式开发常把 `-j` 设为核心数加一，服务器上可以用 `nproc` 自动取。

# 编译 Android 内核并启动

很多 Android 内核教程从“编译并刷机”开始。这一章把流程拆开：环境、源码、配置、编译、打包、启动、刷机。

## 环境

推荐 Ubuntu 22.04/24.04 或 WSL2。需要的基础包：

```bash
sudo apt update
sudo apt install -y build-essential bc bison flex libssl-dev libelf-dev \
  dwarves cpio rsync kmod git python3 \
  gcc-aarch64-linux-gnu binutils-aarch64-linux-gnu
```

如果编译 ARM64 内核，交叉编译器是 `aarch64-linux-gnu-`。编译宿主 x86 内核则不需要交叉编译器。

内存与磁盘：

- 编译 ARM64 内核，`-j` 并行下内存占用可能到 2–4GB。
- 源码加产物大约 5–10GB，预留 15GB 比较稳。

## 获取源码

两个来源：

- Android Common Kernel：`https://android.googlesource.com/kernel/common`，按分支取，例如 `android14-6.1`。
- 厂商 BSP：芯片厂商提供，包含未上游的驱动与板级配置。

```bash
# 以 ACK 为例
git clone https://android.googlesource.com/kernel/common -b android14-6.1
cd common
```

厂商 BSP 通常有多个分支，对应不同 Android 版本与内核版本。选错分支，驱动与 HAL 可能对不上。

## 配置

配置从 `defconfig` 开始：

```bash
# 以 ARM64 为例
make ARCH=arm64 CROSS_COMPILE=aarch64-linux-gnu- vendor/xxx_defconfig
```

产品差异用配置片段叠加：

```bash
scripts/kconfig/merge_config.sh .config fragment.config
```

需要交互调整时：

```bash
make ARCH=arm64 menuconfig
```

GKI 设备还要注意：

- 核心配置由 GKI 提供，厂商只改模块相关配置。
- 模块配置要与 KMI 版本匹配。

## 编译

```bash
make ARCH=arm64 CROSS_COMPILE=aarch64-linux-gnu- -j$(nproc) Image dtbs modules
```

产物：

| 产物 | 路径 | 用途 |
|---|---|---|
| `Image` | `arch/arm64/boot/Image` | 未压缩内核 |
| `Image.gz` | `arch/arm64/boot/Image.gz` | 压缩内核 |
| `dtb` | `arch/arm64/boot/dts/...` | 设备树二进制 |
| `.ko` | 各驱动目录 | 内核模块 |

编译时间取决于机器：16 线程、8GB 内存的 WSL，首次全量编译通常十几分钟到半小时。

## 打包启动镜像

Android 的启动镜像不是“内核文件直接改名”。常见组成：

- `boot.img`：内核 + ramdisk + 命令行 + 头部校验。
- `vendor_boot.img`：厂商 ramdisk、部分 dtb。
- `dtbo.img`：设备树 overlay。
- `vbmeta.img`：校验元数据。

打包工具：

```bash
# 传统 boot.img
mkbootimg --kernel Image --ramdisk ramdisk.img --cmdline "console=ttyMSM0" \
  --header_version 3 -o boot.img

# 带 AVB 的设备还要生成 vbmeta
avbtool make_vbmeta_image --output vbmeta.img --key testkey.pem --algorithm SHA256_RSA2048
```

不同 Android 版本的 header 版本不同，参数要以设备与 AOSP 文档为准。

## QEMU 启动

没有真板时，QEMU 可以验证“内核能不能起来”：

```bash
qemu-system-aarch64 \
  -M virt -cpu cortex-a57 -m 1024 \
  -kernel arch/arm64/boot/Image \
  -append "console=ttyAMA0 root=/dev/vda rw" \
  -drive file=rootfs.img,format=raw,if=virtio \
  -nographic
```

`rootfs.img` 可以是 Alpine、Debian 或自己用 busybox 做的 initramfs。QEMU 的 `virt` 机器没有真实外设，验证的是启动链、驱动模型、模块加载、日志与调试。

## 真机刷机

真机流程大致是：

```bash
adb reboot bootloader
fastboot flash boot boot.img
fastboot flash vendor_boot vendor_boot.img
fastboot flash dtbo dtbo.img
fastboot reboot
```

风险：

- 刷错分区或镜像不匹配，可能无法开机。
- 解锁 bootloader 会关闭验证，有安全风险。
- A/B 设备要确认当前 slot 与回滚方式。
- dm-verity/AVB 校验失败会拒绝启动。

没有把握时，先在 QEMU 验证，再在可恢复的设备上操作。

## 模块

模块编译：

```bash
make ARCH=arm64 CROSS_COMPILE=aarch64-linux-gnu- M=drivers/mydriver modules
```

加载前确认：

- 模块的 `vermagic` 与目标内核版本、配置一致。
- 依赖模块已加载。
- 开启签名校验时，模块要签名。

GKI 设备的模块还要按 KMI 版本编译与签名，不能随便替换核心。

## 常见错误

| 现象 | 原因 | 处理 |
|---|---|---|
| 编译报缺少头文件 | 依赖包没装 | 按报错装 `libssl-dev`、`libelf-dev` 等 |
| `scripts/extract-cert` 失败 | OpenSSL 版本或证书配置 | 检查 `CONFIG_SYSTEM_TRUSTED_KEYS` |
| 内存不足被杀 | `-j` 太大 | 降低并行数 |
| `Image` 过大 | 配置开了太多调试 | 关调试选项，检查压缩 |
| 启动卡住 | 命令行、rootfs、dtb 不匹配 | 看串口日志，确认 `console` 与 `root` |
| 模块加载失败 | 版本或签名不匹配 | 用目标内核的 headers 重编 |

## 验证边界

- QEMU：可验证启动、模块、日志；验证不了真实外设。
- 真机：可验证外设与性能；有变砖风险，需要可恢复设备。
- 服务器内存有限时，只做模块级编译；完整内核放到内存足够的机器或 WSL。

## 参考

- [Android Common Kernel](https://source.android.com/docs/core/architecture/kernel/android-common)
- [Generic boot partition](https://source.android.com/docs/core/architecture/partitions/generic-boot)
- [Building the kernel](https://docs.kernel.org/process/building.html)

## 编译日志与资源

编译时看到的日志大致是：

```text
  CC      kernel/sched/core.o
  LD      vmlinux
  OBJCOPY arch/arm64/boot/Image
  DTC     arch/arm64/boot/dts/rockchip/xxx.dtb
  MODPOST Module.symvers
  CC [M]  drivers/mydriver/main.o
  LD [M]  drivers/mydriver/mydriver.ko
```

资源消耗取决于配置与并行度：

- 全量 ARM64 内核，8GB 内存、16 线程，首次编译通常十几分钟到半小时。
- 只编模块，几秒到几十秒。
- `-j` 太大容易内存不足，太小则慢。

## WSL 的配置

如果在本机 WSL 编译，可以在 `%UserProfile%\.wslconfig` 调整：

```ini
[wsl2]
memory=8GB
processors=8
swap=2GB
```

源码放在 WSL 的 Linux 文件系统（如 `~/src`）比放在 `/mnt/c` 或 `/mnt/e` 快很多，后者跨文件系统开销大。

## 启动后的验证清单

- `uname -a`：确认内核版本与编译时间。
- `dmesg | head`：确认启动日志没有 panic/oops。
- `cat /proc/version`：确认编译器与版本。
- `lsmod`：确认模块加载。
- `cat /proc/devices`：确认字符设备注册。
- `cat /proc/interrupts`：确认中断注册。

## 编译实测（WSL）

环境：

- WSL2 Ubuntu 24.04，`.wslconfig` 分配 8GB 内存、8 处理器。
- 交叉编译器 `aarch64-linux-gnu-gcc` 13.3.0。
- 源码 Linux 6.1.119（tarball 129MB，解压后 1.5GB）。

命令：

```bash
make ARCH=arm64 CROSS_COMPILE=aarch64-linux-gnu- defconfig
make ARCH=arm64 CROSS_COMPILE=aarch64-linux-gnu- -j8 Image dtbs modules
```

结果：

```text
arch/arm64/boot/Image   37M
```

从 defconfig 到 Image 与 modules 完成，8 线程下约四分钟。这个时间取决于 CPU、磁盘与配置，不作为标准。

## 编译实测：QEMU 启动

用自编内核启动 QEMU（Alpine rootfs，无 initrd）：

```text
[    0.000000] Linux version 6.1.119 ...
[    0.864239] EXT4-fs (vda): mounted filesystem with ordered data mode
[    0.864981] VFS: Mounted root (ext4 filesystem) on device 254:0
Welcome to Alpine Linux 3.20
Kernel 6.1.119 on an aarch64 (/dev/ttyAMA0)
```

自编 defconfig 内核内置了 virtio 与 ext4，不需要 initramfs 就能挂载磁盘根文件系统。这是与发行版内核的一个区别：发行版内核常把驱动做成模块，依赖 initramfs 加载。

启动过程中还有两处输出需要注意：

- `can't run '/sbin/openrc'`：minirootfs 的 init 配置与内核命令行不完全匹配，系统仍继续启动到登录界面。
- `ALSA device list: No soundcards found`：QEMU virt 没有声卡，音频驱动不会 probe，这是正常现象。

## 编译实测：模块

示例模块用同一份内核源码交叉编译：

```bash
make ARCH=arm64 CROSS_COMPILE=aarch64-linux-gnu- \
  M=~/kernel-qemu/examples modules
```

产物是 ARM64 的 `.ko`，与自编内核版本一致，可以在 QEMU 里 `insmod`。

编模块时遇到一个版本差异：`class_create` 在 6.1 是宏，需要 `(THIS_MODULE, name)` 两个参数；6.8 起改为单参数。示例代码用 `LINUX_VERSION_CODE` 做条件编译，两个版本都能编过。

```c
#if LINUX_VERSION_CODE >= KERNEL_VERSION(6, 4, 0)
    demo_class = class_create("chardev_demo");
#else
    demo_class = class_create(THIS_MODULE, "chardev_demo");
#endif
```

这类差异在跨版本写驱动时很常见，宏与函数原型变化比内核 API 稳定得多。


## 编译实测：在自编内核里加载模块

把四个示例模块放进 rootfs，在 QEMU 里依次加载：

```text
(none):~# uname -r
6.1.119
(none):~# insmod /root/examples/platform_demo.ko
demo-pdev demo-pdev: probe: mem=[mem 0x10000000-0x10000fff] irq=42
(none):~# insmod /root/examples/chardev_demo.ko
(none):~# cat /dev/chardev_demo
demo_value=7
(none):~# insmod /root/examples/proc_demo.ko
(none):~# cat /proc/demo_proc
read_count=1
(none):~# cat /proc/demo_proc
read_count=2
(none):~# insmod /root/examples/inputsim_demo.ko
(none):~# grep demo-input /proc/bus/input/devices
N: Name="demo-input"
S: Sysfs=/devices/virtual/input/input1
```

四个模块都加载成功，`rmmod` 时按反序卸载，`remove`、`release`、`unregistered` 都正常打印。

两点注意：

- `/proc` 没挂载时，`proc_create` 与 input 设备都正常，但看不到状态。手动 `mount -t proc proc /proc` 后再验证。
- 模块版本必须与内核一致。示例模块用同一份 6.1.119 源码交叉编译，所以能加载；换成发行版内核的模块会报 vermagic 不匹配。

## 编译章的源码路径

| 路径 | 内容 |
|---|---|
| `arch/arm64/Makefile` | ARM64 镜像构建 |
| `scripts/mkcompile_h` | 生成 `compile.h` 与版本字符串 |
| `scripts/link-vmlinux.sh` | 链接 vmlinux |
| `arch/arm64/boot/Makefile` | Image 生成 |
| `scripts/dtc/` | 设备树编译 |

## 排查案例：编译时 OOM

现象：`make -j16` 跑到一半，进程被 OOM killer 杀掉，报 `gcc: fatal error: Killed signal terminated program cc1`。

原因：并行度太高，内存不够。

处理：

- 降低 `-j`，比如 8 或 4。
- 关闭不必要的调试配置，减少编译单元。
- 增加 swap 或换内存更大的机器。

```bash
# 看剩余内存
free -h
# 降低并行度重试
make ARCH=arm64 CROSS_COMPILE=aarch64-linux-gnu- -j4 Image dtbs
```

## boot.img 的头部与 AVB

`boot.img` 的头部记录内核、ramdisk 的偏移与大小、命令行、版本。不同 header 版本字段不同：

- v0：老格式，内核与 ramdisk 地址固定。
- v2：支持 dtb。
- v3/v4：支持 vendor_boot、boot signature。

AVB（Android Verified Boot）在 `vbmeta` 里存各分区的哈希与签名：

- bootloader 校验 `vbmeta` 的签名。
- 再用 `vbmeta` 里的哈希校验 `boot`、`system` 等分区。
- 任何一块被改，校验失败，设备可能拒绝启动。

```bash
# 查看 vbmeta 信息
avbtool info_image --image vbmeta.img
# 查看分区描述
avbtool info_image --image boot.img
```

A/B 设备有两个 slot，`boot_a`/`boot_b`。切换 slot 由 bootloader 控制，失败可回滚。改 boot.img 时要确认当前 slot 与回滚方式。

## 设备树与 dtbo

`dtbo.img` 是设备树 overlay 的集合，bootloader 按设备选择并叠加到基础 dtb 上。板级差异可以放在 dtbo，不必改主 dtb。

```bash
# 查看 dtbo 内容
mkdtimg dump dtbo.img
```

overlay 的 `fragment` 指定目标节点与属性，写错会导致节点不生效。

## 实验：QEMU 启动输出

QEMU 启动 ARM64 时，串口会输出：

```text
[    0.000000] Booting Linux on physical CPU 0x0000000000
[    0.000000] Linux version 6.6.x ...
[    0.000000] Memory: ...
[    0.000000] ...
```

关键看三件事：

- 内核版本与命令行。
- 内存与 CPU 识别。
- 驱动 probe 是否报错。

如果卡在 “Booting Linux”，可能是内核与机器不匹配、串口参数不对、rootfs 找不到。

## 实验环境的两种搭法

QEMU 验证模块有两种方式：

| 方式 | 做法 | 优点 | 缺点 |
|---|---|---|---|
| ISO/安装镜像 | 启动安装镜像，进入 live 环境 | 简单，工具全 | 需要 UEFI 固件，安装介质依赖多 |
| 磁盘根文件系统 | 解压 minirootfs 到 ext4 镜像，内核直接挂载 | 启动快，环境可控 | 需要自己准备镜像与串口登录 |

磁盘方式的步骤：

1. 下载 Alpine minirootfs。
2. `dd` 创建 ext4 镜像，挂载后解压 rootfs。
3. 配置 apk 源与串口 getty。
4. QEMU 用 `-kernel`、`-drive` 启动，`root=/dev/vda`。

这种方式适合反复实验：镜像保留，装一次工具，后面直接编译模块。

## 启动失败怎么排查

按阶段看串口日志：

1. Bootloader 阶段：卡住说明镜像、签名、存储有问题。
2. 内核解压/启动：卡在 “Booting Linux” 说明命令行、串口、dtb 不对。
3. 挂载 rootfs：`VFS: Unable to mount root fs` 说明 root 参数、驱动、镜像不对。
4. init 启动：卡在 init 说明 rc、分区、权限问题。
5. 服务启动：zygote/system_server 崩，看 logcat 与 tombstone。

每一阶段都有独立的检查项，不要跨阶段猜。

## 实验：QEMU 里跑模块的完整步骤

准备：

1. 内核：`vmlinuz-virt` + `initramfs-virt`（Alpine netboot）。
2. 根文件系统：minirootfs 解压到 ext4 镜像。
3. QEMU 命令行：

```bash
qemu-system-aarch64 -M virt -cpu cortex-a57 -m 768 -nographic \
  -kernel vmlinuz-virt -initrd initramfs-virt \
  -append "root=/dev/vda console=ttyAMA0 rw" \
  -drive file=rootfs.img,format=raw,if=virtio -nic user
```

启动后：

```bash
# 登录 root，配网
ip link set eth0 up
udhcpc -i eth0
# 安装编译工具
apk update
apk add gcc make linux-headers
# 编译并加载
cd /root/hello
make -C /lib/modules/$(uname -r)/build M=$PWD modules
insmod helloworld.ko
dmesg | tail
```

注意：

- 没有 initrd 时，内核可能缺 virtio 驱动，挂载 rootfs 失败。
- rootfs 镜像被 QEMU 占用时，重复启动会报 `Failed to get "write" lock`，要先杀掉旧进程。
- `linux-headers` 的路径与内核版本要对应，`/lib/modules/$(uname -r)/build` 不存在时手动建软链。

## 实测记录：模块编译

在服务器（内核 6.8.0-90-generic）上用宿主 headers 编译最小模块：

```text
$ make -C /lib/modules/$(uname -r)/build M=$PWD modules
  CC [M]  ~/Dev/kernel-qemu/helloworld.o
  MODPOST ~/Dev/kernel-qemu/Module.symvers
  CC [M]  ~/Dev/kernel-qemu/helloworld.mod.o
  LD [M]  ~/Dev/kernel-qemu/helloworld.ko
  BTF [M] ~/Dev/kernel-qemu/helloworld.ko
Skipping BTF generation ... due to unavailability of vmlinux
```

`modinfo`：

```text
filename:       .../helloworld.ko
description:    minimal hello module
author:         example
license:        GPL
depends:
```

`BTF` 跳过是因为没有 `vmlinux`，不影响加载。模块版本与宿主内核一致，才能加载。

## 实测记录：QEMU 启动

用 Alpine netboot 内核与 initramfs 启动：

```text
[    0.000000] Linux version 6.6.134-0-virt (Alpine 13.2.1)
[    3.154799] virtio_blk virtio1: 1/0/0 default/read/poll queues
[    3.167846] virtio_blk virtio1: [vda] 3145728 512-byte logical blocks (1.61 GB/1.50 GiB)
```

内核启动、virtio 识别正常。但 initramfs 里没有 ext4 模块，挂载 ext4 rootfs 失败：

```text
mount: mounting /dev/vda on /sysroot failed: Invalid argument
initramfs emergency recovery shell launched
```

这是环境限制，不是模块代码问题。解决办法：

- 用包含 ext4 模块的 initramfs，或自编内核。
- 用发行版 cloud image，而不是 netboot initramfs。
- 模块加载验证放 WSL 完整内核或实板。

## 实测记录：加载与 dmesg

在宿主内核上加载模块，得到了真实输出：

```text
[436895.564529] helloworld: loading out-of-tree module taints kernel.
[436895.565482] helloworld: module verification failed: signature and/or required key missing - tainting kernel
[436895.566648] hello: loaded
[436895.615921] hello: unloaded
```

两条信息值得注意：

- `taints kernel`：树外模块会污染内核，调试时看 `taint` 标记能判断问题是否来自第三方模块。
- `module verification failed ... missing`：未签名模块加载成功，但内核被标记。开启强制签名时，会直接拒绝加载。

`rmmod` 后 `hello: unloaded` 正常打印，说明入口与出口都执行了。模块级验证到此完成；QEMU 内 `insmod` 受 rootfs 限制，留给 WSL 与实板。

## 编译环境的实测差异

- 服务器：2 核、约 2GB 内存，编模块几秒，编完整内核内存不足。
- WSL：16 线程、可调 8GB 内存，编完整 ARM64 内核可行，首次十几分钟。
- 宿主内核 headers：`/lib/modules/$(uname -r)/build`，编模块最省事。

编模块与编内核是两种验证：前者验证代码能编译、能加载；后者验证启动与驱动。两者都要做，但顺序上先模块后内核。

# QEMU 与实验环境

文章里的代码要在哪跑？没有开发板时，QEMU 是最方便的实验室。这一章把环境搭起来，后面的模块、字符设备、proc 接口都能在这里验证。

## QEMU 是什么

QEMU 是一个模拟器：

- 它能模拟一整台机器：CPU、内存、串口、磁盘、网卡。
- 不依赖真实硬件，同一份镜像可以在 x86 主机上跑 ARM64 系统。
- 有两种加速方式：TCG（纯软件翻译，慢但通用）与 KVM（硬件虚拟化，快但要求同架构）。

对内核学习来说，QEMU 的价值是“可重复”：改一行代码，重编、启动、看日志，不会把板子刷坏。

## 与真机的差异

| 维度 | QEMU | 真机 |
|---|---|---|
| CPU | 模拟，指令级兼容 | 真实 SoC |
| 外设 | 固定模型（virt） | 板级外设 |
| 设备树 | 由 QEMU 生成或传入 | 厂商 DTS |
| 性能 | TCG 慢，KVM 接近原生 | 原生 |
| 风险 | 崩了重开 | 可能变砖 |

QEMU 能验证启动、驱动模型、模块加载、proc/sys、调试工具；验证不了真实外设的时序、电源、引脚。

## 安装

```bash
sudo apt update
sudo apt install -y qemu-system-arm gcc-aarch64-linux-gnu
```

`qemu-system-aarch64` 是 ARM64 的机器模拟器。`gcc-aarch64-linux-gnu` 用于交叉编译，只编模块时也需要目标内核的 headers。

## 三种启动方式

| 方式 | 组成 | 适用 |
|---|---|---|
| ISO 安装镜像 | 内核 + initrd + squashfs | 体验发行版 |
| 磁盘根文件系统 | 内核 + ext4 镜像 | 反复实验、装工具 |
| initramfs | 内核 + cpio | 最小系统、救援 |

文章用第二种：把 Alpine 的 minirootfs 解压到 ext4 镜像，内核直接挂载，能装编译工具、能保存改动。

## 手把手：搭一个 ARM64 实验环境

以下命令在 `~/kernel-qemu` 目录执行。

### 1. 准备目录与镜像

```bash
mkdir -p ~/kernel-qemu
cd ~/kernel-qemu

# 1.5GB 磁盘镜像
dd if=/dev/zero of=rootfs.img bs=1M count=1536
mkfs.ext4 -F rootfs.img
```

### 2. 解压 rootfs

```bash
# 下载 Alpine minirootfs（版本以官网为准）
curl -LO https://dl-cdn.alpinelinux.org/alpine/v3.20/releases/aarch64/alpine-minirootfs-3.20.3-aarch64.tar.gz

mkdir -p mnt
sudo mount -o loop rootfs.img mnt
sudo tar xzf alpine-minirootfs-3.20.3-aarch64.tar.gz -C mnt
```

### 3. 配置软件源与串口登录

```bash
# 国内可用清华镜像
printf 'https://mirrors.tuna.tsinghua.edu.cn/alpine/v3.20/main\nhttps://mirrors.tuna.tsinghua.edu.cn/alpine/v3.20/community\n' | sudo tee mnt/etc/apk/repositories

# 串口 getty，否则 QEMU 里看不到登录提示
echo 'ttyAMA0::respawn:/sbin/getty -L ttyAMA0 115200 vt100' | sudo tee -a mnt/etc/inittab

sudo umount mnt
```

### 4. 准备内核

```bash
# Alpine netboot 内核与 initramfs
curl -LO https://dl-cdn.alpinelinux.org/alpine/v3.20/releases/aarch64/netboot/vmlinuz-virt
curl -LO https://dl-cdn.alpinelinux.org/alpine/v3.20/releases/aarch64/netboot/initramfs-virt
```

### 5. 启动

```bash
qemu-system-aarch64 -M virt -cpu cortex-a57 -m 768 -nographic \
  -kernel vmlinuz-virt -initrd initramfs-virt \
  -append "root=/dev/vda console=ttyAMA0 rw" \
  -drive file=rootfs.img,format=raw,if=virtio \
  -nic user
```

参数说明：

| 参数 | 作用 |
|---|---|
| `-M virt` | 通用虚拟机器 |
| `-cpu cortex-a57` | 模拟 CPU 型号 |
| `-m 768` | 内存 768MB |
| `-nographic` | 串口重定向到终端 |
| `-kernel` / `-initrd` | 内核与 initramfs |
| `-append` | 内核命令行，`root` 指定根分区 |
| `-drive if=virtio` | 虚拟磁盘，内核里是 `/dev/vda` |
| `-nic user` | 用户态网络，自带 NAT |

### 6. 登录与联网

```bash
# 登录 root（无密码）
ip link set eth0 up
udhcpc -i eth0
```

### 7. 安装编译工具

```bash
apk update
apk add gcc make linux-headers
```

### 8. 编译并加载模块

把模块源码放进镜像（用 base64 或 9p 共享），然后：

```bash
cd /root/hello
make -C /lib/modules/$(uname -r)/build M=$PWD modules
insmod helloworld.ko
dmesg | tail
rmmod helloworld
```

预期输出：

```text
hello: loaded
hello: unloaded
```


## 串口登录的两种做法

手工调试用 getty：

```text
ttyAMA0::respawn:/sbin/getty -L ttyAMA0 115200 vt100
```

需要给 root 设密码（或允许空密码）。自动化脚本用直接 shell：

```text
ttyAMA0::respawn:/bin/sh -l
```

启动后直接进入 root shell，不用处理登录交互。代价是绕过认证，只适合本地实验镜像。

两种做法都要求串口控制台是 `ttyAMA0`，否则 QEMU 的 `-nographic` 看不到输出。


## 最小根文件系统的挂载

minirootfs 的 init 依赖 openrc。如果启动日志出现 `can't run '/sbin/openrc'`，系统可能仍进入 shell，但 `/proc`、`/sys` 没挂载，表现为：

- `/proc/version`、`/proc/meminfo` 不存在。
- 驱动加载成功，但 `/proc/bus/input/devices` 看不到设备。
- `proc_create` 注册成功，`/proc/demo_proc` 却打不开。

手动挂载：

```bash
mount -t proc proc /proc
mount -t sysfs sys /sys
mount -t devtmpfs dev /dev
```

挂载后再看设备与状态，才能区分“驱动没工作”和“文件系统没挂”。

## 常见问题

| 现象 | 原因 | 处理 |
|---|---|---|
| 卡在 “Booting Linux” | 内核与机器不匹配、命令行错 | 换内核、检查 `console` |
| `Unable to mount root fs` | 根设备或驱动不对 | 确认 `root=`、virtio、文件系统类型 |
| `Failed to get "write" lock` | 镜像被另一个 QEMU 占用 | 杀掉旧进程 |
| 串口无登录提示 | inittab 没有 ttyAMA0 | 补 getty 行 |
| 缺 ext4 模块 | initramfs 精简 | 换内核或补模块 |

## 用 WSL 编完整内核

服务器内存有限时，只编模块；完整 ARM64 内核可以放 WSL：

```ini
# %UserProfile%\.wslconfig
[wsl2]
memory=8GB
processors=8
```

源码放 WSL 的 Linux 文件系统，不要放 `/mnt/c`，跨文件系统编译很慢。编完整内核后，可以替换 QEMU 的 `-kernel`，验证 DTS、驱动 probe、启动链。

## 与文章代码的对应

| 文章内容 | 在哪验证 |
|---|---|
| 最小模块、字符设备、proc 接口 | QEMU 或宿主内核 |
| platform driver、DTS | 完整内核 + QEMU（virt 无外设时只验证 probe 逻辑） |
| 中断、调度、内存观测 | QEMU 或宿主内核 |
| 真实外设、触摸、显示 | 实板 |

QEMU 不是万能的，但能把“看懂”变成“跑过”。


## QEMU 的内部结构

QEMU 由几部分组成：

- CPU 模拟：TCG 把客户机指令翻译成宿主指令块，缓存后执行；KVM 则把客户机指令直接交给硬件虚拟化。
- 内存：客户机物理内存由宿主分配，页表由 QEMU 维护。
- 设备模型：QEMU 用软件实现设备，`virt` 机器提供 virtio-blk、virtio-net、pl011 串口、gpio-keys 等。
- 机器类型：`-M virt` 是一套固定的虚拟硬件布局，包括内存映射、中断控制器、PCI 总线。

`virt` 机器的设备是固定的，不会因为 DTS 里写了什么就出现新硬件。这就是“QEMU 验证不了真实外设”的根本原因。

## 启动流程

QEMU 的启动方式有三种：

| 方式 | 引导顺序 | 适用 |
|---|---|---|
| 固件引导 | `-bios`/UEFI 加载 bootloader，再加载内核 | 完整系统 |
| 直接内核 | `-kernel` 直接加载内核 | 内核实验 |
| 磁盘引导 | 固件读磁盘 MBR/ESP | 发行版镜像 |

文章用第二种：跳过 bootloader，直接让 QEMU 加载 `Image`，减少变量。

## 参数详解

| 参数 | 作用 | 常用值 |
|---|---|---|
| `-M` | 机器类型 | `virt` |
| `-cpu` | CPU 型号 | `cortex-a57`、`max` |
| `-smp` | CPU 数量 | `1`、`2` |
| `-m` | 内存 | `512`、`768`、`1024` |
| `-kernel` | 内核镜像 | `Image` |
| `-initrd` | initramfs | `initramfs-virt` |
| `-append` | 内核命令行 | `console=ttyAMA0 root=/dev/vda` |
| `-drive` | 磁盘 | `file=rootfs.img,format=raw,if=virtio` |
| `-nic` | 网络 | `user` |
| `-nographic` | 串口到终端 | 无参数 |
| `-accel` | 加速 | `kvm` 或 `tcg` |

`-nographic` 等价于把串口重定向到标准输入输出，并禁用图形界面。没有它，串口输出看不到。

## 磁盘镜像

| 格式 | 特点 | 适用 |
|---|---|---|
| raw | 简单，性能好，占用等于大小 | 实验镜像 |
| qcow2 | 支持快照、稀疏、压缩 | 多镜像、快照 |

```bash
# raw 镜像扩容
qemu-img resize rootfs.img 2G
# 查看镜像信息
qemu-img info rootfs.img
```

扩容后还要在客户机里扩分区与文件系统，否则只是块设备变大。

## 性能与调试

- `-accel kvm`：同架构时用硬件加速，性能接近原生；ARM64 客户机在 x86 宿主上只能用 TCG。
- `-smp 2`：多核，内核会看到两个 CPU，适合验证并发与调度。
- `-d in_asm,exec`：打印执行的指令块，调试启动问题时用，输出很大。
- `-D qemu.log`：把调试日志写到文件。
- `-monitor stdio`：进入 QEMU monitor，可以查寄存器、内存、设备。

TCG 下单核启动几分钟很常见，不要因为慢就以为卡死。

## WSL 实践要点

- `.wslconfig` 分配内存与 CPU，编内核前先确认。
- 源码与镜像放 WSL 的 Linux 文件系统，不要放 `/mnt/c`，跨文件系统 IO 慢。
- WSL 里的 `qemu-system-aarch64` 与宿主同架构（x86），跑 ARM64 客户机是 TCG。
- 串口交互可以用 `pexpect` 自动化，适合批量验证。


## 网络与文件传输

`-nic user` 提供用户态网络：

- 客户机 IP 通常是 `10.0.2.15`，网关 `10.0.2.2`，DNS `10.0.2.3`。
- 宿主端口转发：`-nic user,hostfwd=tcp::2222-:22`，把客户机 22 映射到宿主 2222。
- 客户机访问外网走 NAT，不需要额外配置。

文件传进客户机有三种方式：

| 方式 | 配置 | 特点 |
|---|---|---|
| 9p 共享 | `-virtfs local,path=...,mount_tag=host0` | 直接挂载宿主目录 |
| 网络传输 | `scp`、`wget` | 需要网络与 ssh |
| 镜像挂载 | 宿主挂载 ext4 镜像，拷文件 | 简单，需停机 |

9p 需要内核开启 `CONFIG_NET_9P` 与 `CONFIG_9P_FS`。客户机里：

```bash
mount -t 9p -o trans=virtio host0 /mnt
```

9p 的性能一般，适合传小文件；大文件用镜像挂载更稳。

## 启动故障排查

| 现象 | 先查 | 再查 |
|---|---|---|
| 串口无输出 | `console=` 参数、`-nographic` | 机器类型、内核架构 |
| 卡在 Booting | 内核与机器不匹配 | 命令行、dtb |
| 挂载 rootfs 失败 | `root=`、`if=virtio` | 文件系统驱动、镜像格式 |
| 磁盘被锁 | 旧 QEMU 进程 | `pkill qemu-system-aarch64` |
| 网络不通 | `-nic user`、guest IP | `udhcpc`、DNS |
| 登录失败 | 串口 getty、root 密码 | shadow、inittab |

排查顺序是“先让内核出日志，再让根文件系统挂上，最后才是登录”。卡在前一步，不要跳到后一步猜。


## 机器类型与设备

QEMU 用 `-M` 选择机器类型，常见的有：

| 机器 | 用途 | 特点 |
|---|---|---|
| `virt` | ARM/ARM64 通用 | 自动生成设备树，virtio 设备 |
| `q35` | x86 现代平台 | PCIe、SATA |
| `pc` | x86 传统平台 | 兼容老系统 |
| `raspi3b` 等 | 树莓派模拟 | 外设模型有限 |

做内核实验选 `virt`：设备树由 QEMU 生成，内核命令行简单，virtio 设备齐全。

显示可以用 `-vga none -display none` 关闭，只留串口；需要图形时换 `-device virtio-gpu` 加 VNC。关闭图形能减少变量，启动问题更容易定位。


## 加速与 CPU 特性

`-accel tcg,thread=multi` 让 TCG 多线程翻译，多核客户机启动更快；默认单线程，单核客户机差别不大。`-cpu max` 打开更多指令特性，适合跑新内核；`-cpu cortex-a57` 更接近常见 ARM64 板子。

`-smp 2` 启动双核客户机，能验证并发、调度、IPI 与锁竞争；单核适合先排除并发变量。


## QEMU 的局限

QEMU 能验证机制，验证不了物理世界：

- 时序：真实外设的建立/保持时间、时钟抖动，QEMU 用软件模拟，不可信。
- 电源：上电顺序、电压、休眠电流，QEMU 没有。
- 性能：TCG 的指令级模拟与真实 CPU 差距大，性能数字不能直接外推。
- 外设：virt 只有固定设备，板级外设需要真实硬件。

把 QEMU 当“逻辑验证器”，把实板当“物理验证器”，两者不能互相替代。

# 进程与调度

## 进程描述符

每个进程（线程）对应一个 `task_struct`。字段很多，入门先记几个：

```c
// include/linux/sched.h（字段名以 6.1 为准，不同版本略有差异）
struct task_struct {
    volatile long __state;        // 运行状态：TASK_RUNNING / INTERRUPTIBLE / UNINTERRUPTIBLE ...
    pid_t pid;                    // 内核视角的线程 ID
    pid_t tgid;                   // 线程组 ID，用户态 getpid() 返回它
    struct mm_struct *mm;         // 用户地址空间；内核线程为 NULL
    struct mm_struct *active_mm;  // 借用的地址空间，内核线程用
    struct sched_entity se;       // 调度实体，CFS 用它算虚拟运行时间
    // ...
};
```

内核栈是每个任务独立的一块内存，ARM64 通常是 16KB。栈上不能放太大的局部变量，驱动里的大缓冲要动态分配。

内核线程没有用户地址空间，`mm` 为空，借用上一个任务的 `active_mm`。这也是为什么在内核线程里不能直接访问用户指针。

## 进程创建

用户态的 `fork`、`clone`、`pthread_create` 最终都走 `clone` 系统调用，内核里对应 `copy_process`。复制的内容包括：

- `task_struct` 与内核栈。
- 页表（写时复制，物理页暂不复制）。
- 文件描述符表、文件系统信息。
- 信号处理、命名空间、cgroup 归属。

`fork` 返回两次：父进程得到子 PID，子进程得到 0。写时复制让父子共享物理页，任一方写入触发缺页，复制出新页。

`exec` 替换地址空间，保留 PID、文件描述符（除 `CLOEXEC`）、进程组，重置信号处理。

## 上下文切换

切换由 `switch_to` 完成：

- 保存当前任务的 callee-saved 寄存器与栈指针。
- 切换内核栈。
- 恢复下一个任务的寄存器。

切换发生在调度点：

- 系统调用返回用户态。
- 中断返回。
- 显式 `schedule()`。
- 可抢占内核的抢占点。

`need_resched` 标记“该调度了”，调度点检查它。`CONFIG_PREEMPT` 让内核态也能被抢占，降低调度延迟；`CONFIG_PREEMPT_NONE` 只在返回用户态时调度，吞吐更好。

## CFS

6.1 的默认调度器是 CFS（完全公平调度器），6.6 起逐步换成 EEVDF。入门先理解 CFS 的两个量：

- 权重：由 nice 值映射，nice 越小权重越大。
- 虚拟运行时间 `vruntime`：实际运行时间按权重缩放后的值。

```text
vruntime += 实际运行时间 × (NICE_0_LOAD / weight)
```

权重越大，`vruntime` 增长越慢，越容易被再次选中。CFS 用红黑树按 `vruntime` 排序，每次取最左节点。

一个调度周期内，每个任务按权重分到时间片：

```text
时间片 = sched_latency × weight_i / Σweight
```

任务太多时用 `min_granularity` 保底，避免切换过频。nice 每差 1 级，权重约乘 1.25，CPU 占比差约 10%。

## 实时调度类

实时任务用 `SCHED_FIFO`、`SCHED_RR`、`SCHED_DEADLINE`，优先级高于普通任务：

| 类 | 行为 |
|---|---|
| SCHED_FIFO | 同优先级先到先跑，直到阻塞或被更高优先级抢占 |
| SCHED_RR | 同优先级时间片轮转 |
| SCHED_DEADLINE | 按 runtime/deadline/period 预留带宽，EDF 调度 |

为了防止实时任务饿死普通任务，内核用 `sched_rt_runtime_us` 限制每个周期实时任务能占的比例。默认 95%，留 5% 给普通任务。

## 观测

```bash
ps -eLo pid,tid,cls,rtprio,ni,pri,stat,comm   # 看线程、调度类、优先级
cat /proc/sched_debug                          # 每 CPU 的运行队列、vruntime
perf sched record -- sleep 1                   # 采样调度事件
perf sched latency                             # 看调度延迟
```

驱动里判断“当前能不能睡眠”，看 `in_interrupt()`、`in_atomic()`、`preempt_count()`。这些判断比背规则可靠。

## 参考

- [CFS 调度器文档](https://docs.kernel.org/scheduler/sched-design-CFS.html)
- [EEVDF 调度器文档](https://docs.kernel.org/scheduler/sched-eevdf.html)

## 调用链：从 fork 到调度

用户态调用 `fork()`，内核里大致这样走：

```c
// kernel/fork.c（简化）
SYSCALL_DEFINE0(fork)
{
    return kernel_clone(&(struct kernel_clone_args){ ... });
}

pid_t kernel_clone(struct kernel_clone_args *args)
{
    struct task_struct *p = copy_process(args);   // 复制 task_struct、页表、fd 等
    wake_up_new_task(p);                          // 放入运行队列
    return p->pid;
}
```

`copy_process` 里做几件关键事：

- `dup_task_struct`：复制 task_struct 与内核栈。
- `copy_mm`：复制页表，物理页标只读（写时复制）。
- `copy_files`：复制文件描述符表。
- `alloc_pid`：分配 PID。

调度入口是 `schedule()`，核心在 `__schedule()`：

```c
// kernel/sched/core.c（简化）
static void __schedule(void)
{
    struct task_struct *prev = current, *next;
    next = pick_next_task(rq, prev, ...);   // 选下一个任务
    if (next != prev)
        context_switch(rq, prev, next);     // 切换地址空间与寄存器
}
```

`pick_next_task` 按调度类优先级选择：停机、 deadline、实时、公平、idle。普通任务走 CFS。

## CFS 的红黑树

CFS 把可运行任务挂在红黑树上，键是 `vruntime`，每次取最左节点：

```c
// kernel/sched/fair.c（简化）
static struct task_struct *pick_next_task_fair(struct rq *rq)
{
    struct sched_entity *se = pick_next_entity(cfs_rq);  // 取 vruntime 最小的实体
    return task_of(se);
}
```

入队与出队：

- `enqueue_entity`：按 `vruntime` 插入红黑树。
- `dequeue_entity`：从树上移除。
- 新任务或唤醒任务会做 `place_entity`，把 `vruntime` 拉到合理位置，避免长期占便宜或饿死。

nice 与权重来自一张表：

```c
// kernel/sched/core.c（节选）
const int sched_prio_to_weight[40] = {
 /* -20 */     88761,     71755,     56483,     46273,     36291,
 /* -15 */     29154,     23254,     18705,     14949,     11916,
 /* -10 */      9548,      7620,      6100,      4904,      3906,
 /*  -5 */      3121,      2501,      1991,      1586,      1277,
 /*   0 */      1024,       820,       656,       526,       423,
 /*   5 */       335,       272,       215,       172,       137,
 /*  10 */       110,        87,        70,        56,        45,
 /*  15 */        36,        29,        23,        18,        15,
};
```

nice 0 是 1024，nice 1 是 820，比例约 1.25。

## 排查案例：音频线程被抢占

现象：录音偶发卡顿，缓冲区欠载。

排查：

```bash
# 看音频线程的调度类与优先级
ps -eLo pid,tid,cls,rtprio,ni,pri,psr,comm | grep -i audio

# 看运行队列与 vruntime
cat /proc/sched_debug | head -50

# 采样调度延迟
perf sched record -- sleep 3
perf sched latency
```

常见原因：

- 音频线程是普通 CFS 任务，被高优先级任务抢占。
- 线程没有绑核，跨核迁移带来缓存失效。
- 缓冲区太小，调度抖动直接变成欠载。

处理：

- 把关键线程设为 `SCHED_FIFO` 或提高优先级（需要权限）。
- 绑核，减少迁移。
- 增大缓冲，吸收调度抖动。

## 观测输出

`/proc/sched_debug` 里能看到每个 CPU 的运行队列、`nr_running`、`curr`、`vruntime`。`perf sched latency` 会列出每个任务的等待时间、调度延迟、运行时间。这些数据比“感觉卡”更能定位问题。

## task_struct 的关键字段

| 字段 | 含义 | 备注 |
|---|---|---|
| `__state` | 运行状态 | RUNNING/INTERRUPTIBLE/UNINTERRUPTIBLE |
| `pid` / `tgid` | 线程 ID / 线程组 ID | `getpid()` 返回 tgid |
| `mm` / `active_mm` | 地址空间 / 借用地址空间 | 内核线程 mm 为空 |
| `fs` | 根目录与当前目录 | `chroot`、`chdir` 影响 |
| `files` | 文件描述符表 | 多线程共享 |
| `sighand` / `signal` | 信号处理 / 信号状态 | 线程组共享 sighand |
| `se` | 调度实体 | CFS 用 |
| `prio` / `static_prio` | 动态/静态优先级 | nice 映射 |
| `policy` | 调度策略 | FIFO/RR/DEADLINE/CFS |
| `cpus_ptr` / `cpus_mask` | CPU 亲和性 | 绑核用 |
| `rt_priority` | 实时优先级 | 0-99 |

这些字段是排查“线程为什么不被调度”“为什么跨核迁移”的入口。

## 实验：观察调度

```bash
# 看进程的调度策略与优先级
chrt -p <pid>
# 看线程的 CPU 亲和性
taskset -pc <pid>
# 看运行队列
cat /proc/sched_debug | grep -E "cpu#|nr_running|curr"
```

预期现象：

- 普通任务的 `policy` 是 `SCHED_OTHER`，`prio` 在 120 附近。
- 实时任务的 `policy` 是 `SCHED_FIFO`/`SCHED_RR`，`rt_priority` 非零。
- `cpus_mask` 显示允许的 CPU 集合。

## 常见问题

| 现象 | 可能原因 | 排查 |
|---|---|---|
| 线程卡住不跑 | 优先级低、被抢占 | `chrt -p`、`sched_debug` |
| 频繁迁移 | 未绑核 | `taskset -pc` |
| 实时任务卡死系统 | RT 占用过高 | `sched_rt_runtime_us` |
| 唤醒延迟大 | 调度延迟、CPU 忙 | `perf sched latency` |

## 版本差异：CFS 到 EEVDF

6.6 起，调度器逐步从 CFS 转向 EEVDF：

- CFS 只按 `vruntime` 选最小。
- EEVDF 引入虚拟截止时间与 eligibility，延迟敏感任务可以更早被选。
- 任务有“滞后”概念，长时间没跑会被补偿。

对驱动开发的影响：

- 普通任务的调度行为变化不大。
- 实时性与延迟敏感场景要重新测。
- 依赖具体调度参数（`sched_latency` 等）的调优要复核。

## 排查案例：实时线程饿死普通线程

现象：一个实时音频线程跑起来后，系统卡顿，shell 响应慢。

排查：

```bash
ps -eLo pid,tid,cls,rtprio,pri,pcpu,comm --sort=-pcpu | head
cat /proc/sys/kernel/sched_rt_runtime_us
cat /proc/sys/kernel/sched_rt_period_us
```

如果实时线程的 CPU 占用接近 100%，且 `sched_rt_runtime_us` 设置过大，普通任务会被饿死。

处理：

- 降低实时线程优先级或 CPU 占用。
- 调整 `sched_rt_runtime_us`，给普通任务留出时间。
- 把实时线程绑核，避免占满所有 CPU。

这个案例的教训是：实时性不是越高越好，要留余量。

## 逐函数：唤醒与切换

`wake_up_new_task` 把新任务放入运行队列：

```c
// kernel/sched/core.c（简化）
void wake_up_new_task(struct task_struct *p)
{
    // 选择 CPU
    // 入队
    // 检查是否需要抢占当前任务
}
```

`context_switch` 分两步：

```c
// kernel/sched/core.c（简化）
static __always_inline struct rq *
context_switch(struct rq *rq, struct task_struct *prev, struct task_struct *next)
{
    switch_mm_irqs_off(prev->active_mm, next->mm, next);  // 换页表
    switch_to(prev, next, prev);                          // 换寄存器与栈
    return finish_task_switch(prev);
}
```

`finish_task_switch` 做收尾：减少上一个任务的引用、处理 `prev_state`、唤醒等待的进程。读这里能理解“任务切走后什么时候真正释放”。

## 版本差异：5.10 到 6.1

- slab 逐渐被 slub 取代，调试接口变化。
- 6.1 引入 folio，页管理结构有调整，驱动一般无感。
- 内存回收的 LRU 与水位逻辑基本稳定，参数位置有变化。
- Android 侧，LMK 从内核内移到用户态 lmkd，内核只提供接口。

## 调度特性开关

```bash
ls /sys/kernel/debug/sched/
cat /sys/kernel/debug/sched/features
```

`features` 里能看到 CFS 的可调特性（如 `NEXT_BUDDY`、`WAKEUP_PREEMPTION`）。这些开关用于调优与实验，生产环境不要随意改。

调度调优的常见方向：

- 调整 `sched_latency`、`min_granularity`。
- 调整 `sched_rt_runtime_us`。
- 用 cgroup 权重分配 CPU。
- 用 uclamp 提示频率。

调之前先测基线，调之后复测，避免“感觉快了”。

## 实验：测量调度延迟

```bash
# 需要 rt-tests 包
cyclictest -t1 -p80 -n -i10000 -l1000
# 内核侧
perf sched record -- sleep 5
perf sched latency
```

`cyclictest` 测的是“唤醒到实际运行”的延迟，实时性场景常用。`perf sched latency` 看每个任务的调度延迟分布。

延迟大的常见原因：CPU 忙、关抢占、中断关闭、优先级低。

## Android 侧的调度处理

Android 在调度上做了几件事：

- uclamp：任务可以提示最小/最大频率，影响调度与频率选择。
- EAS：按能效选择 CPU，省电优先。
- 音频线程：提优先级、绑核、限制 RT 占用。

排查音频卡顿，除了看缓冲区，还要看线程的 `policy`、`prio`、`cpus_mask`，以及是否被 uclamp 限制。

## 调度类与优先级

调度类按优先级从高到低：

| 类 | 策略 | 优先级范围 | 用途 |
|---|---|---|---|
| stop | - | 最高 | 停机、迁移 |
| deadline | SCHED_DEADLINE | 按带宽 | 硬实时 |
| realtime | SCHED_FIFO/RR | 1-99 | 软实时 |
| fair | SCHED_OTHER/BATCH/IDLE | nice -20..19 | 普通任务 |
| idle | SCHED_IDLE | 最低 | 空闲任务 |

普通任务的 `prio` 在 100-139，实时任务在 0-99。改优先级用 `nice`、`chrt`、`sched_setscheduler`。

## RT 线程与音频

音频线程常被设为 `SCHED_FIFO`，并绑到固定核：

```bash
chrt -f -p 80 <pid>
taskset -pc 2 <pid>
```

代价：

- RT 线程占满 CPU 会饿死普通任务，受 `sched_rt_runtime_us` 限制。
- 绑核后负载不均，单核温度可能升高。
- 优先级设置过高的线程一旦死循环，系统很难恢复。

所以 RT 调优要配合监控与限流。


## 中断亲和性与实时

中断可以绑定到固定 CPU，减少迁移：`echo 2 > /proc/irq/<n>/smp_affinity`。音频、显示这类实时中断常绑核，代价是单核负载与温度升高。绑核后要复测延迟，不能只看平均值。


## /proc/interrupts 的读法

`/proc/interrupts` 每行是“中断号: 各 CPU 计数 类型 控制器 设备”。计数增长说明设备在工作，增长异常快说明可能有中断风暴。


## softirq 计数

`/proc/softirqs` 按 CPU 列出 NET_RX、TIMER、TASKLET 等计数。网络或定时器异常时，先看这里。


## 关中断的代价

`local_irq_disable` 期间中断被推迟，时间越长，丢失与延迟越大。实时场景用 `irqsoff` 量出来，再决定是否拆临界区。

# 内存管理

内存管理分两层：物理页怎么分配，虚拟地址怎么映射。

## 物理页与 zone

物理内存按页管理，一页通常 4KB。内核用 `struct page` 描述每一页，把物理内存划成 zone：

| zone | 用途 |
|---|---|
| ZONE_DMA | 老设备能访问的低地址 |
| ZONE_DMA32 | 32 位设备能访问的地址 |
| ZONE_NORMAL | 普通内存 |
| ZONE_HIGHMEM | 32 位系统的高端内存（ARM64 一般没有） |

NUMA 系统还会按节点划分，每个节点有自己的 zone 与空闲链表。驱动里申请内存时，`GFP_*` 标志决定从哪个 zone 取、能不能睡眠。

## buddy

buddy 分配器把空闲页按 2 的幂分组，每组的阶数叫 order：

- order 0 是 1 页，order 1 是 2 页，order 10 是 1024 页。
- 分配 order n 时，从 n 阶向上找，找到更大的块就对半分裂，另一半放回低阶链表。
- 释放时检查伙伴块是否空闲，空闲就合并，递归向上。

```c
// mm/page_alloc.c：分配 2^order 个连续页
struct page *__alloc_pages(gfp_t gfp, unsigned int order, int preferred_nid,
                           nodemask_t *nodemask);
```

buddy 的优点是分配释放快，缺点是外部碎片：总空闲页够，但凑不出连续的大块。内核用迁移类型、内存压缩、CMA 缓解。

迁移类型把页按“可移动/不可移动/可回收”分链，避免不可移动页打散内存。压缩（compaction）把可移动页迁走，把空闲页聚成连续块。

## slab 与 slub

内核里大量小对象（`task_struct`、`inode`、`dentry`）如果每次都申请整页，浪费严重。slab 分配器为每种对象建一个缓存：

- 预分配若干页，切成等大对象。
- 分配时从空闲链表取，释放时放回。
- 每个 CPU 有本地缓存，减少锁竞争。
- 着色让不同 slab 的对象错开缓存行，降低缓存冲突。

现代内核默认用 slub，元数据放在 `struct page` 里，结构比传统 slab 简单。

| 分配方式 | 物理连续 | 大小限制 | 适用 |
|---|---|---|---|
| `kmalloc` | 是 | 几 MB 以内 | 小对象、DMA |
| `vmalloc` | 否 | 较大 | 大块、不需要 DMA |
| `kmem_cache_alloc` | 是 | 自定义对象 | 高频固定大小对象 |

```c
// 自定义对象缓存
struct my_obj *obj = kmem_cache_alloc(my_cache, GFP_KERNEL);
kmem_cache_free(my_cache, obj);
```

`GFP_KERNEL` 可能睡眠，只能进程上下文用；中断上下文用 `GFP_ATOMIC`。

## 虚拟地址与页表

用户进程看到的是虚拟地址，通过多级页表翻译成物理地址。ARM64 常见 4 级页表，页大小 4KB，也支持 16KB、64KB 和大页。

- `mm_struct` 描述一个进程的地址空间。
- `vm_area_struct` 描述一段虚拟地址区间（代码、数据、栈、mmap 区）。
- 页表项记录物理页帧号与权限位。

TLB 缓存虚拟页到物理页的映射。进程切换换页表时，TLB 需要失效；PCID/ASID 可以给 TLB 项打标签，减少失效范围。

访问的页没有映射，或者权限不符，触发缺页异常：

- minor fault：页已经在内存（页缓存或已分配的匿名页），只缺页表映射。
- major fault：页不在内存，需要读磁盘或 swap，开销大。

写时复制也走缺页：父子进程共享只读页，任一方写入触发保护缺页，复制新页再改成可写。

## 回收与水位

内存不足时，内核按 LRU 回收页：

- 文件页可以直接丢弃或回写。
- 匿名页要换到 swap 才能回收。

回收由 `kswapd` 后台线程或分配路径上的直接回收完成。每个 zone 有三个水位：

| 水位 | 行为 |
|---|---|
| high | 高于它，kswapd 休眠 |
| low | 低于它，唤醒 kswapd |
| min | 低于它，分配路径直接回收 |

回收失败触发 OOM killer，按分数选进程杀掉。容器里还有 cgroup 级的内存限制与 OOM。

## 观测

```bash
cat /proc/meminfo        # 总览
cat /proc/buddyinfo      # 各阶空闲块
slabtop                  # slab 缓存占用
vmstat 1                 # 缺页、回收、swap
cat /proc/zoneinfo       # 每个 zone 的水位与统计
```

## 参考

- [Memory Management](https://docs.kernel.org/mm/index.html)
- [DMA-BUF](https://docs.kernel.org/driver-api/dma-buf.html)

## buddy 的观测

```bash
cat /proc/buddyinfo
```

输出形如：

```text
Node 0, zone   Normal  1234  567  89  12  3  1  0  0  0  0  0
```

每列是 order 0 到 10 的空闲块数量。分配不到大块时，高 order 的计数会降到 0，说明外部碎片严重。

## slab 的观测

```bash
slabtop
```

输出会列出缓存名、对象数、对象大小、总占用。常见缓存：

| 缓存 | 对象 |
|---|---|
| `task_struct` | 进程描述符 |
| `inode_cache` | inode |
| `dentry` | 目录项 |
| `kmalloc-*` | 不同大小的 kmalloc 块 |

slab 的内部碎片来自“对象大小与页大小不整除”。比如对象 96 字节，一页 4KB 只能放 42 个，剩 64 字节浪费。

## 缺页处理

缺页异常进入 `do_page_fault`，再走 `handle_mm_fault`：

```c
// mm/memory.c（简化）
vm_fault_t handle_mm_fault(struct vm_area_struct *vma, unsigned long address,
                           unsigned int flags, struct pt_regs *regs)
{
    // 找到 vma，分配页表，处理匿名页/文件页/写时复制
}
```

分几种情况：

- 匿名页第一次访问：分配零页或新页。
- 文件页：从页缓存取，没有则读磁盘。
- 写时复制：复制新页，改页表权限。
- 栈扩展：扩展 vma 后分配页。

## 回收与 OOM

内存不足时，`kswapd` 被唤醒，扫描 LRU 链表：

- 文件页：干净页直接丢弃，脏页回写后丢弃。
- 匿名页：写入 swap，再释放。

回收失败触发 OOM，`dmesg` 里能看到类似输出：

```text
Out of memory: Killed process 1234 (app) total-vm:..., anon-rss:..., file-rss:...
oom_reaper: reaped process 1234 (app)
```

Android 上还有 lmkd 按进程 adj 杀进程，日志在 logcat 的 `lowmemorykiller` 标签。两者的区别：内核 OOM 是最后手段，lmkd 是常规回收。

## 内存泄漏排查

现象：进程 RSS 持续增长，几天后被 OOM。

排查：

```bash
# 看进程内存分布
cat /proc/<pid>/status | grep -E "VmRSS|VmSize"
cat /proc/<pid>/smaps_rollup
# 看内核 slab 是否异常
slabtop -s c
# 看是否频繁分配大块
perf record -g -p <pid> -- sleep 10
```

常见原因：用户态缓存无上限、内核对象未释放、DMA 缓冲未回收。内核侧用 kmemleak（如果开启）或 tracepoint 观察分配。

## mm_struct 与 vma

| 结构 | 作用 | 关键字段 |
|---|---|---|
| `mm_struct` | 一个进程的地址空间 | `pgd`、`mmap`、`mm_users`、`mm_count` |
| `vm_area_struct` | 一段虚拟地址区间 | `vm_start`、`vm_end`、`vm_flags`、`vm_ops` |
| `struct page` | 一个物理页 | `flags`、`mapping`、`index`、`_refcount` |

`vm_flags` 常见值：

- `VM_READ`/`VM_WRITE`/`VM_EXEC`：权限。
- `VM_SHARED`：共享映射。
- `VM_IO`：设备映射。
- `VM_DONTEXPAND`：禁止扩展。

## 页表项的关键位

| 位 | 含义 |
|---|---|
| Present | 页在内存 |
| R/W | 可写 |
| U/S | 用户/内核可访问 |
| Accessed | 被访问过 |
| Dirty | 被写过 |
| NX | 不可执行 |

缺页处理会检查这些位，决定是分配、复制还是报错。

## 实验：观察内存

```bash
cat /proc/meminfo | head -10
cat /proc/buddyinfo
cat /proc/<pid>/smaps_rollup
cat /proc/<pid>/maps | head
```

预期现象：

- `MemAvailable` 比 `MemFree` 更能反映可用内存。
- `buddyinfo` 高 order 为 0 时，大块分配可能失败。
- `smaps_rollup` 的 `Pss` 比 `Rss` 更适合多进程共享场景。

## 常见问题

| 现象 | 可能原因 | 排查 |
|---|---|---|
| 分配大块失败 | 外部碎片 | `buddyinfo`、compaction |
| 内存持续增长 | 泄漏 | `smaps_rollup`、kmemleak |
| 频繁 swap | 内存不足 | `vmstat`、`meminfo` |
| OOM 杀进程 | 回收失败 | `dmesg` 的 OOM 记录、lmkd |

## 版本差异：slab 到 slub

- 传统 slab：每个缓存有管理结构，支持多种调试。
- slub：元数据放 `struct page`，默认实现，调试选项少但开销低。

对驱动的影响：

- `kmem_cache_create` 接口基本一致。
- 调试时 `slub_debug` 的用法与 `slabinfo` 不同。
- 性能特征不同，缓存敏感场景要实测。

## 排查案例：DMA 分配失败

现象：相机或显示驱动报“failed to allocate contiguous memory”，`dmesg` 里出现 alloc 失败。

排查：

```bash
cat /proc/buddyinfo
cat /proc/meminfo | grep -iE "Cma|MemFree"
dmesg | grep -iE "cma|alloc|contiguous"
```

常见原因：

- CMA 预留太小，大块分配失败。
- 内存碎片严重，高 order 空闲块为 0。
- 分配标志不对，用了 `GFP_KERNEL` 但在原子上下文。

处理：

- 增大 CMA 预留（DTS 的 `reserved-memory`）。
- 触发 compaction，或重启释放碎片。
- 改分配方式（分散 gather、DMA-BUF）。

## 逐函数：分配与缺页

`get_page_from_freelist` 是快速路径：

- 遍历 zone，检查水位。
- 从 buddy 取页，必要时分裂。
- 更新统计。

`do_anonymous_page` 处理匿名页缺页：

```c
// mm/memory.c（简化）
static vm_fault_t do_anonymous_page(struct vm_fault *vmf)
{
    // 分配零页或新页
    // 建立页表映射
    // 设置权限
}
```

`shrink_node` 是回收主函数：

- 扫描 LRU，分离可回收页。
- 回写脏页、换出匿名页。
- 更新水位，决定是否继续。

读这三段能理解“分配为什么慢”“缺页为什么多”“回收为什么卡”。

## 版本差异：中断与实时

- threaded IRQ 的接口稳定，`IRQF_ONESHOT` 等标志有增加。
- 6.12 起 PREEMPT_RT 的部分能力进入主线，实时内核的边界在变化。
- 中断控制器的层级域（irq domain）在新平台上更常见，DTS 的中断映射由它处理。

## 水位怎么算

水位不是固定值，按 zone 大小与 `min_free_kbytes` 计算：

- `min` 由 `min_free_kbytes` 推算。
- `low` 与 `high` 按比例放大。
- `watermark_scale_factor` 可以调整比例。

```bash
cat /proc/sys/vm/min_free_kbytes
cat /proc/sys/vm/watermark_scale_factor
cat /proc/zoneinfo | grep -E "min|low|high"
```

水位太低，回收不及时，容易 OOM；水位太高，可用内存少，容易浪费。调参要结合设备内存与负载。

## memory cgroup

cgroup v2 的内存控制：

```bash
mkdir /sys/fs/cgroup/demo
echo 512M > /sys/fs/cgroup/demo/memory.max
echo <pid> > /sys/fs/cgroup/demo/cgroup.procs
cat /sys/fs/cgroup/demo/memory.current
cat /sys/fs/cgroup/demo/memory.events
```

`memory.events` 里：

- `high`：超过软限制的次数。
- `max`：超过硬限制的次数。
- `oom`：触发 OOM 的次数。

Android 用 cgroup 管理应用内存，理解它能解释“为什么后台应用被杀”。

## 实验：制造内存压力

```bash
# 申请 512MB，观察回收
stress-ng --vm 1 --vm-bytes 512M --timeout 30s
# 同时观察
watch -n1 'grep -E "MemAvailable|MemFree" /proc/meminfo'
cat /proc/vmstat | grep -E "pgscan|pgsteal|compact"
```

预期：`MemAvailable` 下降，`pgscan/pgsteal` 增长，严重时触发 OOM。这个实验能看清“分配、回收、OOM”的先后顺序。

## Android 侧的内存处理

- lmkd：用户态按进程 adj 杀进程，替代内核 OOM 作为常规手段。
- PSS：统计共享页的分摊，比 RSS 更接近真实占用。
- memfd：替代 ashmem 的共享内存方式。
- DMA-BUF heaps：图形/相机缓冲的统一分配。

应用被杀、相机打不开，很多时候是 lmkd 或 DMA-BUF 分配失败，不一定是内核 bug。

## 页表级别与 TLB

ARM64 常见 4 级页表，页大小 4KB：

- PGD、PUD、PMD、PTE 四级。
- 大页：2MB（PMD）、1GB（PUD）。
- 5 级页表用于超大地址空间。

TLB 缓存映射，进程切换或页表修改后要失效。多核系统用 IPI 做 TLB shootdown，代价与 CPU 数相关。大页能减少 TLB 缺失，但增加内存碎片。

## 用户态分配与内核分配

| 接口 | 用途 | 特点 |
|---|---|---|
| `malloc` | 用户态堆 | 由 libc 管理 |
| `kmalloc` | 内核小对象 | 物理连续 |
| `vmalloc` | 内核大块 | 虚拟连续，物理可不连续 |
| `kmem_cache_alloc` | 固定大小对象 | 复用，减少碎片 |

内核里不能调 `malloc`，也不能直接用 `kmalloc` 处理用户指针，要配合 `copy_from_user`。


## of 节点打印

驱动里打印设备树节点，确认匹配到了正确的节点：

```c
dev_info(dev, "of_node=%pOF\n", dev->of_node);
```

`%pOF` 会输出节点路径，比直接打印指针有用。


## RK 烧录工具

RK 的 `upgrade_tool` 或 `rkdeveloptool` 可以进入 maskrom 烧录。烧录前确认分区表与镜像匹配，电源稳定。

# 中断与并发

驱动的一半工作在处理中断，另一半在处理并发。

## 中断处理流程

硬件中断到来时，CPU 根据异常向量跳到内核的中断入口，保存现场，找到对应的 `irq_desc`，调用注册的 handler。

中断处理分上半部与下半部：

- 上半部只做必须立刻做的事：清中断标志、读状态、保存数据、标记下半部。
- 耗时处理放到下半部。

原因是中断处理期间本地中断被关闭，处理越久，丢中断与延迟越大。

## 四种下半部机制

| 机制 | 上下文 | 能否睡眠 | 并发性 | 适用 |
|---|---|---|---|---|
| softirq | 软中断 | 否 | 多 CPU 可并行 | 网络收发等高频场景 |
| tasklet | 软中断 | 否 | 同一 tasklet 串行 | 驱动的小延迟任务 |
| workqueue | 内核线程 | 是 | 可并行 | 需要睡眠、阻塞的操作 |
| threaded IRQ | 内核线程 | 是 | 每 IRQ 一线程 | 慢设备、需要睡眠的中断 |

softirq 在硬中断返回 `irq_exit()` 时执行；执行超时或反复被打断，唤醒 `ksoftirqd` 在进程上下文继续，避免饿死用户态。

`local_bh_disable()` 可以禁止下半部，临界区里不要睡眠。

## 中断上下文的限制

- 不能睡眠/阻塞：不能 `schedule`、`mutex_lock`、`msleep`、`GFP_KERNEL` 分配。
- 不能访问用户空间：没有用户上下文，`current->mm` 可能为空。
- 只能用 spinlock，且要 `spin_lock_irqsave` 关本地中断。
- 内核栈很小（16KB 量级），不能深递归、大局部数组。
- 要快速返回，不能长时间占 CPU。

## 同步原语

| 原语 | 能否睡眠 | 适用 |
|---|---|---|
| spinlock | 否 | 中断上下文、极短临界区 |
| mutex | 是 | 进程上下文、可能阻塞的临界区 |
| 信号量 | 是 | 计数型资源 |
| rwlock | 否 | 读多写少（短临界区） |
| RCU | 否（读侧） | 读多写少、链表遍历 |
| 原子操作 | 否 | 计数器、标志位 |

在中断上下文拿 spinlock，要用 `spin_lock_irqsave` 关本地中断：

```c
unsigned long flags;
spin_lock_irqsave(&dev->lock, flags);
// 临界区：不能睡眠
spin_unlock_irqrestore(&dev->lock, flags);
```

不关中断的话，中断处理程序抢同一把锁会死锁。

RCU 适合读多写少的场景：读侧不加锁，写侧复制更新并等待宽限期。代价是内存回收延迟，写多时性能下降。

## 抢占模型

内核配置决定哪些位置可以抢占：

| 配置 | 行为 |
|---|---|
| PREEMPT_NONE | 只在返回用户态与显式调度点调度 |
| PREEMPT_VOLUNTARY | 在显式 `cond_resched()` 点调度 |
| PREEMPT | 内核态大部分位置可抢占 |
| PREEMPT_RT | 实时补丁，中断线程化、自旋锁可睡眠 |

音频、工业控制这类场景会关注 PREEMPT_RT，但 Android 主线通常不用完整 RT，而是对关键线程提优先级、绑核。

## 观测

```bash
cat /proc/interrupts          # 每个中断的计数与 CPU 分布
cat /proc/softirqs            # 软中断统计
echo function_graph > /sys/kernel/debug/tracing/current_tracer   # ftrace
```

中断计数只增不减、CPU 占用高，通常是设备一直拉中断或 handler 没清标志。

## 参考

- [Linux Interrupts](https://docs.kernel.org/core-api/genericirq.html)
- [RCU](https://docs.kernel.org/RCU/index.html)

## 中断描述符与注册

内核用 `irq_desc` 描述一条中断线，用 `irqaction` 描述注册的 handler：

```c
// include/linux/interrupt.h（简化）
struct irqaction {
    irq_handler_t handler;      // 上半部
    irq_handler_t thread_fn;    // 线程化下半部
    void *dev_id;
    unsigned int flags;
    const char *name;
};
```

注册接口：

```c
int request_irq(unsigned int irq, irq_handler_t handler,
                unsigned long flags, const char *name, void *dev);
int request_threaded_irq(unsigned int irq, irq_handler_t handler,
                         irq_handler_t thread_fn, unsigned long flags,
                         const char *name, void *dev);
```

共享中断要带 `IRQF_SHARED`，handler 判断是不是自己的中断，不是返回 `IRQ_NONE`。

## softirq 的执行

硬中断处理完，`irq_exit()` 检查是否有待处理的 softirq：

```c
// kernel/softirq.c（简化）
void irq_exit(void)
{
    // ...
    if (local_softirq_pending())
        do_softirq();
}
```

`do_softirq` 会执行当前 CPU 上挂起的 softirq。如果执行时间过长或反复被打断，唤醒 `ksoftirqd/N` 在进程上下文继续，避免用户态饿死。

`local_bh_disable()` 增加抢占计数，禁止下半部；临界区里不能睡眠。

## 锁的实现差异

- spinlock：忙等，临界区极短，不能睡眠。
- mutex：睡眠等待，内部有 owner、等待队列；可被调试（lockdep）。
- rt_mutex：优先级继承，防止优先级反转。
- RCU：读侧无锁，写侧复制更新，等宽限期后释放旧数据。

选择原则：

| 场景 | 选择 |
|---|---|
| 中断上下文 | spinlock（irqsave） |
| 进程上下文、可能阻塞 | mutex |
| 读多写少、链表遍历 | RCU |
| 计数器、标志 | atomic |

## 中断风暴的排查

现象：CPU 占用高，`/proc/interrupts` 某个中断计数暴涨。

```bash
# 看中断计数变化
watch -n1 'cat /proc/interrupts'

# 看 irq 时间占比
perf top -e irq:irq_handler_entry

# 抓 ftrace 看中断处理
echo 1 > /sys/kernel/debug/tracing/events/irq/enable
```

常见原因：

- 设备一直拉中断线，handler 没清标志。
- 中断触发类型配错（电平触发但没清）。
- 共享中断里某个 handler 总是返回 `IRQ_HANDLED`，实际不是它的中断。

处理：修驱动清标志、改触发类型、用 `IRQF_ONESHOT` 或线程化中断。

## 关中断时长的观测

`irqsoff` tracer 能测关中断的最长时长：

```bash
cd /sys/kernel/debug/tracing
echo irqsoff > current_tracer
echo 1 > tracing_on
# 触发业务
cat trace
```

如果关中断时间过长，实时性会变差。音频、工业控制场景要重点关注。

## 中断描述符的关键字段

| 结构 | 作用 | 关键字段 |
|---|---|---|
| `irq_desc` | 一条中断线 | `irq_data`、`action`、`status` |
| `irqaction` | 一个 handler | `handler`、`thread_fn`、`flags`、`dev_id` |
| `irq_chip` | 中断控制器操作 | `mask`、`unmask`、`ack`、`eoi` |

注册流程大致是：

1. `request_irq` / `request_threaded_irq`。
2. `__setup_irq` 检查冲突、分配描述符。
3. 把 `irqaction` 挂到 `irq_desc`。
4. 使能中断线。

共享中断会挂多个 `irqaction`，逐个调用，直到有人返回 `IRQ_HANDLED`。

## 实验：观察中断

```bash
watch -n1 'cat /proc/interrupts | head -20'
cat /proc/softirqs
# 看某个中断的事件
echo 1 > /sys/kernel/debug/tracing/events/irq/irq_handler_entry/enable
cat /sys/kernel/debug/tracing/trace_pipe
```

预期现象：

- 中断计数持续增长，说明设备在工作。
- 某个中断增长异常快，可能是中断风暴。
- softirq 的 NET_RX/TIMER 计数增长，说明网络/定时器活跃。

## 常见问题

| 现象 | 可能原因 | 排查 |
|---|---|---|
| 中断不触发 | 引脚复用、触发类型、设备未使能 | `/proc/interrupts`、示波器 |
| 中断风暴 | 没清标志、电平触发 | `perf top`、ftrace |
| 关中断过长 | 临界区太大 | `irqsoff` tracer |
| 死锁 | 中断上下文拿了睡眠锁 | lockdep、`dmesg` 的 BUG |

## 版本差异：threaded IRQ

`request_threaded_irq` 在 2.6.30 左右引入，之后逐渐完善：

- 早期只支持简单线程化。
- 后来支持 `IRQF_ONESHOT`、primary/secondary handler。
- 现代内核里，慢设备（I2C/SPI/触摸）普遍用线程化中断。

对驱动的影响：能睡眠的处理放线程，别在上半部做耗时操作。

## 排查案例：触摸中断风暴

现象：设备发热、CPU 占用高，`/proc/interrupts` 里触摸中断计数暴涨。

排查：

```bash
watch -n1 'grep -i touch /proc/interrupts'
perf top -e irq:irq_handler_entry
dmesg | grep -iE "touch|irq"
```

常见原因：

- 驱动没清中断标志，设备一直拉中断线。
- 触发类型配错（电平触发但没清）。
- 共享中断里 handler 总是返回 `IRQ_HANDLED`。

处理：修驱动清标志、改触发类型、用线程化中断。

## 逐函数：注册与线程化

`__setup_irq` 是注册的核心：

- 检查中断是否已被占用、是否允许共享。
- 分配/复用 `irq_desc`。
- 挂 `irqaction`，设置触发类型。
- 使能中断。

```c
// kernel/irq/manage.c（简化）
static int __setup_irq(unsigned int irq, struct irq_desc *desc,
                       struct irqaction *new)
{
    // 冲突检查、共享检查
    // 挂 action
    // 使能
}
```

线程化中断的 `irq_thread` 在进程上下文运行 `thread_fn`，可以睡眠。上半部返回 `IRQ_WAKE_THREAD` 时唤醒它。

RCU 的读侧：

```c
rcu_read_lock();
p = rcu_dereference(ptr);
// 使用 p
rcu_read_unlock();
```

读侧不加锁，写侧要等宽限期才能释放旧对象。

## 版本差异：设备模型

- `of_*` 接口稳定，新增 `device_link` 管理依赖。
- 设备树 schema 校验更严格，`make dtbs_check` 能发现属性错误。
- GKI 之后，厂商驱动以模块为主，probe 的依赖管理更重要。

## 中断亲和性

多核系统里，中断可以绑定到指定 CPU：

```bash
cat /proc/irq/<n>/smp_affinity
echo 2 > /proc/irq/<n>/smp_affinity   # 绑到 CPU1
```

驱动里可以用 `irq_set_affinity_hint` 给建议。绑核能减少缓存迁移，但可能造成单核过热或负载不均。

网络多队列用 RSS/RPS 分散中断，音视频这类实时中断常绑到固定核，减少抖动。

## 实验：测量关中断时长

```bash
cd /sys/kernel/debug/tracing
echo 0 > tracing_on
echo irqsoff > current_tracer
echo 1 > tracing_on
# 跑一段业务
sleep 5
echo 0 > tracing_on
cat trace | head -30
```

输出会显示最长关中断的函数与耗时。音频/工业控制场景，关中断超过几百微秒就可能影响实时性。

## Android 侧的中断与实时性

- 音频/显示线程对延迟敏感，Android 会调优先级与绑核。
- wakeup source 统计唤醒来源，限制后台唤醒。
- 多数设备不用完整 PREEMPT_RT，而是靠调度与中断调优。

排查实时性问题，先看关中断时长、线程优先级、CPU 占用，再看是否需要 RT 补丁。

## spinlock 与 mutex 的实现

spinlock 在单核上通常是空操作加抢占计数，多核用原子指令：

- 早期 ticket lock，保证公平。
- 现在多用 qspinlock，减少缓存行争用。

mutex 有 owner、wait_list，竞争时睡眠，唤醒后重新竞争。`mutex_lock` 不能在中断上下文调用。

选择锁时先问“这段代码能不能睡眠”，再问“临界区多长”，最后才看性能。

## 线程化中断的适用场景

- 处理需要睡眠（I2C/SPI 读写、regulator 操作）。
- 处理耗时较长，不适合放在上半部。
- 需要与其他线程同步。

代价是上下文切换与延迟。高频、极短的中断（如定时器）仍用上半部加 softirq，不要一律线程化。

## 中断上下文的状态判断

驱动里用 `in_interrupt()`、`in_atomic()`、`irqs_disabled()` 判断当前上下文，比背规则可靠。判断错，轻则警告，重则死锁。

# 驱动模型与设备树

内核的驱动不是“写一个函数等人调用”，而是注册到总线，等设备和驱动匹配后由内核调用。

## 三者关系

| 对象 | 代表 | 注册方式 |
|---|---|---|
| bus | 总线类型，如 platform、i2c、spi、usb | 内核内置或驱动注册 |
| device | 一个具体的硬件实例 | 设备树解析、总线枚举、手动注册 |
| driver | 驱动程序，包含 probe/remove 与匹配表 | `platform_driver_register` 等 |

设备或驱动任一注册时，总线会尝试匹配。匹配成功调用驱动的 `probe`，失败则等下一次。

## platform driver

platform 总线用于“不挂在真实总线上的设备”，比如 SoC 内部的 GPIO 控制器、时钟控制器、按键。

```c
// 简化示例：platform driver 的骨架
#include <linux/module.h>
#include <linux/platform_device.h>
#include <linux/of.h>

static int my_probe(struct platform_device *pdev)
{
    struct resource *res;
    void __iomem *base;
    int irq;

    res = platform_get_resource(pdev, IORESOURCE_MEM, 0);
    base = devm_ioremap_resource(&pdev->dev, res);   // 自动释放
    if (IS_ERR(base))
        return PTR_ERR(base);

    irq = platform_get_irq(pdev, 0);
    if (irq < 0)
        return irq;

    dev_info(&pdev->dev, "probe: base=%p irq=%d\n", base, irq);
    return 0;
}

static int my_remove(struct platform_device *pdev)
{
    return 0;
}

static const struct of_device_id my_of_match[] = {
    { .compatible = "vendor,my-device" },   // 与 DTS 的 compatible 对应
    { }
};
MODULE_DEVICE_TABLE(of, my_of_match);

static struct platform_driver my_driver = {
    .probe  = my_probe,
    .remove = my_remove,
    .driver = {
        .name = "my-device",
        .of_match_table = my_of_match,
    },
};
module_platform_driver(my_driver);

MODULE_LICENSE("GPL");
```

`devm_` 前缀的资源由内核在驱动卸载或 probe 失败时自动释放，驱动里少写很多错误处理。

## probe 的时机

- 设备树在启动早期被解析，platform device 被创建。
- 驱动注册时，总线遍历设备，用 `of_match_table` 比较 `compatible`。
- 匹配成功调用 `probe`，失败等设备注册时再试。
- 依赖的时钟、电源还没准备好时，`probe` 返回 `-EPROBE_DEFER`，内核稍后重试。

`-EPROBE_DEFER` 是排查“驱动没起来”的常见线索：`dmesg` 里会看到 deferred probe 的记录，说明不是匹配失败，而是依赖未就绪。

## 设备树

设备树用节点描述硬件。一个 I2C 触摸屏的节点：

```dts
// 板级 dts 片段：I2C 控制器下挂触摸节点
&i2c3 {
    status = "okay";
    clock-frequency = <400000>;

    touch@5d {
        compatible = "vendor,touch";     // 驱动匹配用
        reg = <0x5d>;                    // I2C 从地址
        interrupt-parent = <&gpio1>;
        interrupts = <12 IRQ_TYPE_EDGE_FALLING>;
        reset-gpios = <&gpio1 13 GPIO_ACTIVE_LOW>;
        vdd-supply = <&vcc_3v0>;
        status = "okay";
    };
};
```

属性含义：

| 属性 | 含义 |
|---|---|
| `compatible` | 驱动匹配字符串，格式通常是 `厂商,型号` |
| `reg` | 寄存器地址或总线地址 |
| `interrupts` | 中断号与触发类型 |
| `gpios` | GPIO 引用，带极性 |
| `clocks`、`supply` | 时钟与电源引用 |
| `status` | 是否启用 |

DTS 由 `dtc` 编译成 DTB，bootloader 把 DTB 地址传给内核，内核展开成 `device_node`，驱动通过 `of_*` 接口读取。运行时可以在 `/proc/device-tree` 看到节点。

## 资源获取

| 资源 | 接口 |
|---|---|
| 寄存器 | `platform_get_resource` + `devm_ioremap_resource` |
| 中断 | `platform_get_irq` |
| GPIO | `devm_gpiod_get` |
| 时钟 | `devm_clk_get` |
| 电源 | `devm_regulator_get` |
| 自定义属性 | `of_property_read_u32` 等 |

`devm_` 版本会在设备卸载时自动释放，优先使用。

## 参考

- [Driver Model](https://docs.kernel.org/driver-api/driver-model/index.html)
- [Linux and the Devicetree](https://docs.kernel.org/devicetree/usage-model.html)

## 匹配流程

设备与驱动的匹配由总线完成，platform 总线的核心路径：

```c
// drivers/base/platform.c（简化）
static int platform_match(struct device *dev, struct device_driver *drv)
{
    struct platform_device *pdev = to_platform_device(dev);
    struct platform_driver *pdrv = to_platform_driver(drv);
    // 1. 设备树 compatible 匹配
    // 2. ACPI 匹配
    // 3. id_table 匹配
    // 4. 名字匹配
}
```

匹配成功后，`really_probe` 调用驱动的 `probe`。失败会记录原因，返回 `-EPROBE_DEFER` 则进入延迟队列。

## DTS 的编译与查看

DTS 由 `dtc` 编译：

```bash
# dts 转 dtb
dtc -I dts -O dtb -o board.dtb board.dts

# dtb 反编译，排查实际生效的节点
dtc -I dtb -O dts -o board.dts board.dtb
```

运行时查看内核展开的设备树：

```bash
ls /proc/device-tree/
cat /proc/device-tree/model
cat /proc/device-tree/soc/i2c@.../touch@5d/compatible
```

驱动里读属性：

```c
u32 value;
if (of_property_read_u32(np, "vendor,delay-ms", &value))
    value = 10;   // 默认值
```

## EPROBE_DEFER 的排查

`dmesg` 里出现：

```text
platform ...: deferred probe pending
```

说明驱动匹配上了，但依赖的资源还没准备好，常见原因：

- 时钟、regulator、GPIO 控制器还没注册。
- 依赖的驱动在更后面初始化。
- 设备树引用写错，找不到 phandle。

处理：

- 确认依赖节点的 `status` 是 `okay`。
- 调整初始化顺序，或使用 `-EPROBE_DEFER` 让内核重试。
- 看 `dmesg` 里依赖驱动的 probe 是否失败。

## vendor hook

Android 在核心代码里预留钩子，允许厂商模块插桩：

```c
// 示意：厂商可以在核心路径上注册回调
trace_android_vh_xxx(args...);
```

读 Android 内核时，遇到 `android_vh_*`、`trace_android_vh_*` 就是这类钩子。它们让厂商不改核心也能加逻辑，代价是核心代码里多了很多条件调用。

## platform 的关键字段

| 结构 | 字段 | 作用 |
|---|---|---|
| `platform_device` | `name`、`id`、`resource`、`dev.of_node` | 描述设备 |
| `platform_driver` | `probe`、`remove`、`driver.of_match_table` | 描述驱动 |
| `resource` | `start`、`end`、`flags` | 寄存器/内存/中断资源 |
| `device_node` | `name`、`properties`、`parent` | 设备树节点 |

`dev.of_node` 指向设备树节点，驱动用它读属性。没有设备树时，`of_node` 为空，驱动要能处理这种情况。

## DTS 常用属性

| 属性 | 用途 | 示例 |
|---|---|---|
| `compatible` | 匹配驱动 | `"vendor,touch"` |
| `reg` | 地址/长度 | `<0x5d>` |
| `interrupts` | 中断号与类型 | `<12 IRQ_TYPE_EDGE_FALLING>` |
| `clocks` | 时钟引用 | `<&cru CLK_I2C3>` |
| `clock-names` | 时钟名 | `"i2c"` |
| `pinctrl-0` | 引脚复用 | `<&i2c3m0_xfer>` |
| `status` | 是否启用 | `"okay"` / `"disabled"` |

## 实验：一个 platform driver

步骤：

1. 写驱动，定义 `of_match_table`。
2. 在 DTS 里加一个节点，`compatible` 与驱动一致。
3. 编译模块，加载。
4. 看 `dmesg` 是否打印 probe 信息。

预期：

```text
my-device my-device: probe: base=... irq=...
```

如果没打印，先确认节点 `status` 是 `okay`，再看 `compatible` 是否一致，最后看是否 `-EPROBE_DEFER`。

## 常见问题

| 现象 | 可能原因 | 排查 |
|---|---|---|
| probe 不触发 | compatible 不匹配、节点未启用 | `/proc/device-tree`、`dmesg` |
| probe 返回 -EPROBE_DEFER | 依赖未就绪 | 看依赖驱动日志 |
| 资源获取失败 | reg/中断号配错 | 对比原理图与 DTS |
| 引脚冲突 | pinctrl 被占用 | 查 pinctrl 节点 |

## 版本差异：设备树与 ACPI

- 设备树是 ARM/嵌入式主流，x86 多用 ACPI。
- 上游支持两者共存，驱动可同时提供 `of_match_table` 与 `acpi_match_table`。
- Android 设备基本只用设备树。

写驱动时，`of_match_table` 是必须的；ACPI 支持可选。

## 排查案例：probe 不触发

现象：模块加载成功，`dmesg` 没有 probe 日志。

排查顺序：

1. `compatible` 是否一致：驱动的 `of_match_table` 与 DTS 节点字符串必须完全相同。
2. 节点是否启用：`status = "okay"`。
3. 设备树是否生效：`/proc/device-tree` 里有没有节点。
4. 驱动是否注册：`ls /sys/bus/platform/drivers/`。
5. 是否 `-EPROBE_DEFER`：`dmesg | grep deferred`。

常见原因：

- DTS 拼写错误或节点被覆盖。
- 驱动编成了模块但没加载。
- 依赖的时钟/电源驱动没起来。

## 逐函数：匹配与探测

`platform_match` 依次尝试设备树、ACPI、id_table、名字匹配。设备树匹配调 `of_driver_match_device`，比较 `compatible` 列表。

`really_probe` 的步骤：

1. 绑定设备与驱动的 `dev->driver`。
2. 准备电源域、pinctrl。
3. 调用 `probe`。
4. 失败则解绑、清理、记录原因。

`of_property_read_u32` 读设备树属性：

```c
u32 delay;
if (of_property_read_u32(dev->of_node, "vendor,delay-ms", &delay))
    delay = 10;
```

读这些函数能理解“probe 失败为什么不重试”“`-EPROBE_DEFER` 怎么进入延迟队列”。

## 版本差异：字符设备与 input

- `file_operations` 稳定，`proc_ops` 取代旧的 `file_operations` 用于 proc。
- input 多点触摸协议（MT）稳定，Type B 是主流。
- 新平台用 AIDL HAL 对接 input/传感器，内核侧仍是 input 子系统。

## pinctrl、clock 与 regulator

驱动 probe 时常要拿三类资源：

- pinctrl：引脚复用与电气配置。
- clock：时钟频率与开关。
- regulator：电源域与电压。

```c
struct pinctrl *p = devm_pinctrl_get(dev);
struct clk *clk = devm_clk_get(dev, "i2c");
struct regulator *vdd = devm_regulator_get(dev, "vdd");
```

DTS 里对应 `pinctrl-0`、`clocks`、`vdd-supply`。资源没准备好时，probe 返回 `-EPROBE_DEFER`，等依赖注册后再试。

## 设备树 overlay

overlay 用来在不改主 dtb 的情况下追加/修改节点：

```dts
/dts-v1/;
/plugin/;

&{/soc/i2c@fe5d0000} {
    status = "okay";
    touch@5d {
        compatible = "vendor,touch";
        reg = <0x5d>;
    };
};
```

编译成 dtbo，bootloader 按设备选择并叠加。overlay 里的 `fragment` 指定目标路径，路径写错节点不生效。

调试 overlay：

```bash
dtc -I dtb -O dts -o out.dts dtbo.img   # 反编译查看
```

Android 的 `dtbo.img` 可能包含多个 overlay，bootloader 按 board id 选择。

## 实验：设备树 schema 校验

```bash
make ARCH=arm64 dtbs_check
```

`dtbs_check` 用 YAML schema 校验 DTS 属性，能发现：

- 必填属性缺失。
- 属性类型错误。
- `compatible` 不在绑定文档里。

校验通过不代表硬件能用，但能排除一批低级错误。

## 设备树绑定文档

每个 `compatible` 应该能在 `Documentation/devicetree/bindings/` 找到对应的 YAML：

```bash
ls Documentation/devicetree/bindings/ | head
grep -r "vendor,touch" Documentation/devicetree/bindings/ 2>/dev/null
```

绑定文档规定了必填属性、类型、示例。`make dtbs_check` 按它校验 DTS。没有绑定文档的私有节点，厂商自己维护。

## 设备树与驱动的调试

```bash
# 打印设备树节点
ls /proc/device-tree/
cat /proc/device-tree/model
# 驱动里打印匹配的节点
dev_info(dev, "of_node=%pOF\n", dev->of_node);
```

常见 DTS 错误：

- `compatible` 拼写不一致。
- `reg` 地址与原理图不符。
- 中断号或触发类型错。
- `status` 仍是 `disabled`。
- 引脚复用冲突。

调试时先用 `/proc/device-tree` 确认节点存在，再看 `dmesg` 的 probe 日志。

## platform 与 i2c/spi 的区别

| 总线 | 设备注册方式 | 驱动匹配 | 典型设备 |
|---|---|---|---|
| platform | 设备树节点、手动注册 | `compatible` | SoC 内部控制器 |
| i2c | 控制器枚举或设备树 | `of_match_table` + 地址 | 触摸、传感器 |
| spi | 控制器枚举或设备树 | `of_match_table` + 片选 | 屏幕、Flash |

i2c/spi 驱动拿到的是 `i2c_client`/`spi_device`，里面带地址与控制器信息；platform 驱动拿到 `platform_device`，资源来自 `reg`/`interrupts`。

## 设备树节点的命名

节点名格式是 `名称@单元地址`：

```dts
i2c@fe5d0000 {
    touch@5d {
        reg = <0x5d>;
    };
};
```

`@` 后的地址要与 `reg` 对应。名字重复或地址错，内核解析会告警，驱动也可能匹配不上。

## 设备树与 ACPI 共存

x86 平台常用 ACPI 描述硬件，ARM 嵌入式用设备树。上游驱动可以同时提供两种匹配表，Android 设备基本只用设备树。

读驱动时看到 `acpi_match_table`，说明它支持 x86；Android 上 `of_match_table` 才是主路径。

## 设备树属性的类型

DTS 属性有类型，写错会被 dtc 或 schema 拒绝：

- 字符串：`"vendor,touch"`。
- 32 位整数：`<0x5d>` 或 `<&gpio1 13 GPIO_ACTIVE_LOW>`。
- 字节数组：`[00 11 22]`。
- 空属性：`status;`。

`reg` 是地址与长度，`interrupts` 是中断号与类型。类型不对，驱动读出来是错的。

## 匹配表与模块别名

`of_match_table` 的 `compatible` 会生成模块别名，udev/ueventd 可以按别名自动加载模块：

```c
MODULE_DEVICE_TABLE(of, my_of_match);
```

没有 `MODULE_DEVICE_TABLE`，模块可能不会被自动加载，只能手动 `insmod`。


## 完整示例：platform driver

下面这个模块手动注册一个 `platform_device`，驱动匹配后打印资源。不依赖设备树，能在 QEMU 或宿主内核直接跑。

```c
// examples/platform_demo.c：手动注册 platform_device
#include <linux/init.h>
#include <linux/module.h>
#include <linux/platform_device.h>
#include <linux/ioport.h>

static struct resource demo_res[] = {
    DEFINE_RES_MEM(0x10000000, 0x1000),
    DEFINE_RES_IRQ(42),
};

static int demo_probe(struct platform_device *pdev)
{
    struct resource *mem = platform_get_resource(pdev, IORESOURCE_MEM, 0);
    int irq = platform_get_irq(pdev, 0);
    dev_info(&pdev->dev, "probe: mem=%pR irq=%d\n", mem, irq);
    return 0;
}

static int demo_remove(struct platform_device *pdev)
{
    dev_info(&pdev->dev, "remove\n");
    return 0;
}

static struct platform_driver demo_driver = {
    .probe = demo_probe,
    .remove = demo_remove,
    .driver = { .name = "demo-pdev" },
};

static struct platform_device *demo_pdev;

static int __init demo_init(void)
{
    demo_pdev = platform_device_register_simple("demo-pdev", -1,
                                                demo_res, ARRAY_SIZE(demo_res));
    if (IS_ERR(demo_pdev))
        return PTR_ERR(demo_pdev);
    return platform_driver_register(&demo_driver);
}

static void __exit demo_exit(void)
{
    platform_driver_unregister(&demo_driver);
    platform_device_unregister(demo_pdev);
}

module_init(demo_init);
module_exit(demo_exit);
MODULE_LICENSE("GPL");
```

加载后的真实输出：

```text
demo-pdev demo-pdev: probe: mem=[mem 0x10000000-0x10000fff] irq=42
```

`platform_device_register_simple` 先注册设备，`platform_driver_register` 再注册驱动，总线匹配后调用 `probe`。没有设备树时，设备与驱动靠 `name` 匹配；有设备树时，靠 `compatible`。


## RK 串口调试

RK 板子的串口通常是 `ttyS2` 或 `ttyFIQ0`，波特率 1500000。串口线接对、流控关闭，才能看到 bootloader 与内核日志。串口不通时，先量电平，再看引脚复用。


## ftrace 的目录结构

`/sys/kernel/debug/tracing` 下有 `available_tracers`、`set_ftrace_filter`、`events/`、`trace`、`trace_pipe`。先看可用 tracer，再选过滤条件。


## mmap 的用途

`mmap` 把文件或设备内存映射进进程地址空间，省一次拷贝。驱动实现 `mmap` 时要用 `remap_pfn_range` 或 `vm_insert_page`，注意缓存属性。


## Binder 的阻塞

Binder 同步调用会阻塞客户端线程，服务端线程池满时排队。看 `binder_calls_stats` 与线程状态，能区分“服务端慢”与“客户端等”。

# 字符设备与 input

驱动对上层暴露的形态有很多种：字符设备、块设备、网络设备、input 设备、LED、hwmon。

## 字符设备

字符设备通过 `/dev/xxx` 访问，核心是 `file_operations`：

```c
// 简化示例：字符设备骨架
#include <linux/module.h>
#include <linux/cdev.h>
#include <linux/fs.h>
#include <linux/uaccess.h>
#include <linux/string.h>

static ssize_t my_read(struct file *f, char __user *buf, size_t len, loff_t *off)
{
    const char *msg = "hello from kernel\n";
    size_t n = min(len, strlen(msg));
    if (copy_to_user(buf, msg, n))     // 不能直接解引用用户指针
        return -EFAULT;
    return n;
}

static const struct file_operations my_fops = {
    .owner = THIS_MODULE,
    .read  = my_read,
};

static struct cdev my_cdev;
static dev_t my_dev;

static int __init my_init(void)
{
    if (alloc_chrdev_region(&my_dev, 0, 1, "mydev"))
        return -ENODEV;
    cdev_init(&my_cdev, &my_fops);
    if (cdev_add(&my_cdev, my_dev, 1))
        return -ENODEV;
    return 0;
}

static void __exit my_exit(void)
{
    cdev_del(&my_cdev);
    unregister_chrdev_region(my_dev, 1);
}

module_init(my_init);
module_exit(my_exit);
MODULE_LICENSE("GPL");
```

用户态传进来的指针不能直接读写，必须用 `copy_to_user`/`copy_from_user`。这是字符设备驱动最常见的错误来源。

## input 子系统

按键、触摸、鼠标、键盘都归 input 子系统。驱动只需要申请一个 `input_dev`，设置能力位，注册，然后上报事件：

```c
// 简化示例：input 设备骨架
#include <linux/module.h>
#include <linux/input.h>

static struct input_dev *my_input;

static int __init my_input_init(void)
{
    my_input = input_allocate_device();
    if (!my_input)
        return -ENOMEM;
    my_input->name = "my-touch";
    set_bit(EV_ABS, my_input->evbit);
    set_bit(ABS_MT_POSITION_X, my_input->absbit);
    set_bit(ABS_MT_POSITION_Y, my_input->absbit);
    input_set_abs_params(my_input, ABS_MT_POSITION_X, 0, 1024, 0, 0);
    input_set_abs_params(my_input, ABS_MT_POSITION_Y, 0, 600, 0, 0);
    input_register_device(my_input);
    return 0;
}

static void __exit my_input_exit(void)
{
    input_unregister_device(my_input);
}

module_init(my_input_init);
module_exit(my_input_exit);
MODULE_LICENSE("GPL");

static void report_touch(int x, int y)
{
    input_report_abs(my_input, ABS_MT_POSITION_X, x);
    input_report_abs(my_input, ABS_MT_POSITION_Y, y);
    input_mt_sync(my_input);        // 多点触摸的帧同步
    input_sync(my_input);           // 本次事件结束
}
```

上报之后，事件进入 input 核心，用户态通过 `/dev/input/eventX` 读取。Android 的 `InputReader` 就在这一层读事件。

## 一条触摸链路

| 层 | 组件 | 关键动作 |
|---|---|---|
| 硬件 | 触摸 IC | 检测、中断 |
| 内核 | I2C 驱动、input | 读坐标、上报事件 |
| Native | InputReader | 读 `/dev/input`、加工 |
| Framework | InputDispatcher、WMS | 分发、窗口命中 |
| App | View | 处理触摸事件 |

触摸不灵可能是中断没配、坐标没校准、InputReader 没起来，或者窗口被遮挡。按层排查比换屏快。

## 权限与 SELinux

设备节点创建后要设置权限与标签：

- `ueventd.rc` 或 udev 规则设置 `/dev/xxx` 的属主与权限。
- SELinux 的 `file_contexts` 给节点打标签，`hal_xxx.te` 给访问域放行。

没有这两步，驱动能跑，但上层进程打不开节点。

## 参考

- [Input subsystem](https://docs.kernel.org/input/input_kapi.html)
- [Character devices](https://docs.kernel.org/driver-api/driver-model/device.html)

## 字符设备的完整注册

一个可用的字符设备不只 `cdev_add`，还要创建设备节点：

```c
// 接上文：my_dev、my_cdev、my_class 已定义；需要 device.h 与 version.h
static int __init my_init(void)
{
    int ret;
    ret = alloc_chrdev_region(&my_dev, 0, 1, "mydev");
    if (ret)
        return ret;

    cdev_init(&my_cdev, &my_fops);
    ret = cdev_add(&my_cdev, my_dev, 1);
    if (ret)
        goto err_cdev;

#if LINUX_VERSION_CODE >= KERNEL_VERSION(6, 4, 0)
    my_class = class_create("mydev");
#else
    my_class = class_create(THIS_MODULE, "mydev");
#endif
    device_create(my_class, NULL, my_dev, NULL, "mydev");
    return 0;

err_cdev:
    unregister_chrdev_region(my_dev, 1);
    return ret;
}
```

`class_create` 与 `device_create` 让 udev/ueventd 自动创建 `/dev/mydev`。不创建节点时，用户态打不开设备。

## file_operations 的常用方法

| 方法 | 作用 |
|---|---|
| `open` | 打开设备，初始化私有数据 |
| `release` | 关闭设备，释放资源 |
| `read` / `write` | 读写数据 |
| `ioctl` | 设备控制命令 |
| `mmap` | 映射设备内存 |
| `poll` | 支持 select/poll/epoll |

`ioctl` 的命令码用 `_IO`/`_IOR`/`_IOW` 宏生成，避免与其它设备冲突。

## input 事件类型

| 类型 | 含义 |
|---|---|
| `EV_SYN` | 事件分隔，`input_sync` 产生 |
| `EV_KEY` | 按键 |
| `EV_ABS` | 绝对坐标（触摸） |
| `EV_REL` | 相对位移（鼠标） |
| `EV_MSC` | 杂项事件 |

用户态用 `getevent` 看事件：

```bash
getevent -l /dev/input/event2
# 输出示例
# EV_ABS       ABS_MT_POSITION_X    0000012c
# EV_ABS       ABS_MT_POSITION_Y    000000f0
# EV_SYN       SYN_REPORT           00000000
```

没有事件，说明驱动没上报或设备没打开；有事件但坐标不对，说明校准或分辨率配错。

## 权限问题

设备节点存在但打不开，先看权限与 SELinux：

```bash
ls -lZ /dev/mydev
# crw-rw---- 1 system system u:object_r:mydev_device:s0 /dev/mydev
```

- 属主/权限不对：改 `ueventd.rc` 或 udev 规则。
- SELinux 拒绝：`dmesg | grep avc` 看拒绝记录，补 `file_contexts` 与域策略。
- 进程不在允许的域：改 `sepolicy` 或调整服务定义。

## 结构体与接口

| 结构 | 关键字段 | 作用 |
|---|---|---|
| `cdev` | `ops`、`dev`、`count` | 字符设备 |
| `file_operations` | `open`、`read`、`write`、`ioctl`、`release` | 设备操作 |
| `input_dev` | `name`、`evbit`、`absbit`、`keybit` | input 设备能力 |
| `input_event` | `type`、`code`、`value` | 事件 |

## 实验：字符设备

步骤：

1. 注册设备号，初始化 `cdev`。
2. 实现 `read`，用 `copy_to_user` 返回字符串。
3. 创建设备节点。
4. 加载模块，`cat /dev/mydev`。

预期：

```bash
cat /dev/mydev
# hello from kernel
```

如果打不开，看 `/dev` 节点是否存在、权限是否够、SELinux 是否拒绝。

## 实验：input 设备

步骤：

1. 申请 `input_dev`，设置 `EV_KEY` 与按键码。
2. 注册设备。
3. 定时上报按键事件。
4. 用 `getevent` 观察。

预期：

```text
/dev/input/eventX: EV_KEY KEY_A DOWN
```

没有事件，检查 `input_sync` 是否调用、设备是否注册成功。

## 常见问题

| 现象 | 可能原因 | 排查 |
|---|---|---|
| 打不开设备 | 节点未创建、权限、SELinux | `ls -lZ`、`avc denied` |
| read 返回 EFAULT | 直接解引用用户指针 | 改 `copy_to_user` |
| input 无事件 | 没调用 `input_sync`、能力位没设 | `getevent`、`evtest` |
| rmmod 失败 | 设备被占用 | `lsmod` 引用计数 |

## 版本差异：proc 与 sysfs

- `/proc` 是历史接口，适合调试与状态。
- `/sys` 是设备模型接口，适合属性与电源管理。
- 新驱动优先用 `/sys`，`/proc` 只用于调试。

Android 上 SELinux 会限制 `/proc` 访问，驱动暴露接口时要考虑标签与权限。

## 排查案例：设备节点打不开

现象：`open("/dev/mydev")` 返回 `EACCES` 或 `ENOENT`。

排查：

```bash
ls -lZ /dev/mydev
id
dmesg | grep avc
```

常见原因：

- 节点不存在：`class_create`/`device_create` 没调用，或 ueventd 规则没配。
- 权限不对：属主/组与访问进程不匹配。
- SELinux 拒绝：`avc: denied`，需要补标签或域策略。

处理：改 `ueventd.rc` 或 udev 规则，补 `file_contexts` 与 `hal_*` 域策略。

## 逐函数：字符设备与 input

`cdev_add` 把 `cdev` 挂到设备号：

```c
// fs/char_dev.c（简化）
int cdev_add(struct cdev *p, dev_t dev, unsigned count)
{
    // 建立设备号到 cdev 的映射
    // 加入 cdev 链表
}
```

`input_event` 把事件写入 input 核心的缓冲，`input_sync` 标记一批事件结束。用户态 `read` 从 `/dev/input/eventX` 取。

`copy_to_user` 做地址检查与拷贝，失败返回未拷贝字节数：

```c
if (copy_to_user(buf, data, len))
    return -EFAULT;
```

读这些函数能理解“事件为什么丢”“用户指针为什么不能直接解引用”。

## 版本差异：RK BSP

- RK BSP 的 DTS 组织随内核版本变化，节点名与属性可能不同。
- 5.10 与 6.1 的显示、音频驱动差异较大，移植时以厂商补丁为准。
- 上游化程度不同，部分驱动只在厂商树里。

## 实验：写一个最小 ioctl

```c
// 需要 linux/ioctl.h、linux/uaccess.h
#define MY_IOC_GET _IOR('M', 1, int)
#define MY_IOC_SET _IOW('M', 2, int)

static long my_ioctl(struct file *f, unsigned int cmd, unsigned long arg)
{
    int val;
    switch (cmd) {
    case MY_IOC_GET:
        val = my_value;
        if (copy_to_user((int __user *)arg, &val, sizeof(val)))
            return -EFAULT;
        break;
    case MY_IOC_SET:
        if (copy_from_user(&val, (int __user *)arg, sizeof(val)))
            return -EFAULT;
        my_value = val;
        break;
    default:
        return -ENOTTY;
    }
    return 0;
}
```

用户态：

```c
int v = 42;
ioctl(fd, MY_IOC_SET, &v);
ioctl(fd, MY_IOC_GET, &v);
```

命令码用宏生成，避免与其它驱动冲突。

## sysfs 属性

sysfs 适合暴露设备状态与配置：

```c
// 需要 linux/device.h；DEVICE_ATTR_RW 在 device.h 中定义
static ssize_t value_show(struct device *dev, struct device_attribute *attr, char *buf)
{
    return sysfs_emit(buf, "%d\n", my_value);
}

static ssize_t value_store(struct device *dev, struct device_attribute *attr,
                           const char *buf, size_t len)
{
    int val;
    if (kstrtoint(buf, 10, &val))
        return -EINVAL;
    my_value = val;
    return len;
}

static DEVICE_ATTR_RW(value);
```

注册后用户态：

```bash
cat /sys/class/mydev/mydev/value
echo 42 > /sys/class/mydev/mydev/value
```

sysfs 属性有权限位，SELinux 还会限制访问。

## 实验：input 事件的完整验证

```bash
# 列出输入设备
cat /proc/bus/input/devices
# 监听事件
getevent -lt /dev/input/eventX
# 上报测试
evtest /dev/input/eventX
```

`getevent` 看原始事件，`evtest` 能看设备能力位与事件流。两者都看不到事件时，问题在驱动或中断；能看到事件但坐标错，问题在校准。

## 多点触摸的两种协议

| 协议 | 特点 | 上报方式 |
|---|---|---|
| Type A | 无 slot，靠顺序区分手指 | 每帧重报所有触点 |
| Type B | 有 slot 与 tracking id | 只报变化 |

Type B 的典型序列：

```c
input_mt_slot(dev, slot);
input_mt_report_slot_state(dev, MT_TOOL_FINGER, true);
input_report_abs(dev, ABS_MT_POSITION_X, x);
input_report_abs(dev, ABS_MT_POSITION_Y, y);
input_sync(dev);
```

slot 与 tracking id 不稳定，会导致多点触摸跳点、粘滞。Android 的 InputReader 依赖这些信息做手势。

## input 子系统的结构

| 层 | 作用 |
|---|---|
| input core | 事件分发、设备管理 |
| input device | 驱动注册的设备 |
| input handler | 用户态接口（evdev、joydev） |

驱动上报事件到 input core，core 分发给 handler，handler 通过 `/dev/input/eventX` 暴露给用户态。Android 的 InputReader 读的就是 evdev。

## RK 的电源管理

RK 平台的电源管理涉及：

- 电源域（power domain）：显示、GPU、视频编解码各自可关。
- 时钟门控：不用的模块关时钟。
- 运行时 PM：设备空闲时 suspend。
- 系统休眠：suspend to RAM。

调试功耗问题，先看 `dmesg` 的 runtime PM 日志、`/sys/kernel/debug/pm_genpd`、各设备的 `power/runtime_status`。

## 输入设备的常见问题

| 现象 | 可能原因 | 排查 |
|---|---|---|
| 坐标偏移 | 分辨率/校准参数错 | 对比 `getevent` 与屏幕坐标 |
| 多点跳点 | slot/tracking id 不稳 | 看 `ABS_MT_TRACKING_ID` |
| 触摸延迟 | 中断线程化、事件缓冲小 | ftrace、`getevent -lt` |
| 丢事件 | evdev 缓冲满、上报太慢 | 看 `SYN_DROPPED` |

```bash
getevent -lt /dev/input/eventX | head -30
```

`SYN_DROPPED` 表示用户态读得太慢，内核丢了事件。增大缓冲或加快消费能缓解。

## 事件缓冲与丢事件

evdev 每个设备有环形缓冲，默认较小。用户态处理慢时：

- 缓冲满，内核丢弃事件并标记 `SYN_DROPPED`。
- 用户态下一次读到 `SYN_DROPPED`，需要重新同步状态。

调试输入问题时，先确认“事件有没有到用户态”，再看“上层怎么处理”。

## 触摸校准与坐标系

触摸屏上报的是原始坐标，需要映射到屏幕坐标：

- 分辨率：`ABS_MT_POSITION_X/Y` 的最大值要与屏幕一致。
- 方向：横竖屏切换时坐标轴可能互换。
- 校准：部分设备需要校准参数，存在 `idc` 文件或驱动参数里。

坐标不对时，先看 `getevent` 的原始值，再对比屏幕分辨率，最后查方向与校准。

## 字符设备的并发

多个进程同时打开同一设备时：

- `open` 可能被并发调用，私有数据要按文件实例分配。
- `read`/`write` 可能并发，共享状态要加锁。
- `release` 要处理“最后一个关闭”的清理。

```c
static int my_open(struct inode *inode, struct file *file)
{
    file->private_data = kzalloc(sizeof(struct my_priv), GFP_KERNEL);
    return 0;
}
```

把状态放在 `file->private_data`，而不是全局变量，能减少竞争。

## ioctl 的并发

`ioctl` 可能并发调用，设备状态要加锁：

- 用 `mutex` 保护配置。
- 用 spinlock 保护中断共享的数据。
- 命令码用 `_IO`/`_IOR`/`_IOW` 生成，避免冲突。

不要用全局变量保存每个文件的状态，放到 `file->private_data`。

## input 设备的自动加载

input 设备注册后，内核通过 uevent 通知用户态。Android 的 ueventd 根据 `ueventd.rc` 创建节点、设置权限，InputReader 再打开设备。

节点没创建或权限不对，InputReader 就看不到新设备。排查时先看 uevent 与节点，再看上层服务。

## 输入设备的名字与 ID

`input_dev->name` 会出现在 `/proc/bus/input/devices`，是排查时的第一手信息。`id.vendor/product/version` 用于区分型号。

名字重复不影响功能，但排查时容易混淆。给设备起能区分硬件的名字。

## input 事件的时间戳

input 事件可以带时间戳，用于计算延迟与手势速度。驱动在 `input_event` 前设置时间，或由内核统一打点。

上层如果发现时间戳跳变，检查驱动是否用了错误的时间源。


## 完整示例：字符设备

```c
// examples/chardev_demo.c：read/ioctl + 自动创建设备节点
#include <linux/init.h>
#include <linux/module.h>
#include <linux/cdev.h>
#include <linux/fs.h>
#include <linux/uaccess.h>
#include <linux/device.h>

static dev_t demo_dev;
static struct cdev demo_cdev;
static struct class *demo_class;
static int demo_value = 7;

static ssize_t demo_read(struct file *f, char __user *buf, size_t len, loff_t *off)
{
    char msg[32];
    int n = scnprintf(msg, sizeof(msg), "demo_value=%d\n", demo_value);
    if (*off >= n)
        return 0;
    if (copy_to_user(buf + *off, msg + *off, n - *off))
        return -EFAULT;
    *off = n;
    return n;
}

static long demo_ioctl(struct file *f, unsigned int cmd, unsigned long arg)
{
    if (cmd == 0)
        return demo_value;
    return -ENOTTY;
}

static int demo_open(struct inode *inode, struct file *file)
{
    pr_info("chardev: open\n");
    return 0;
}

static int demo_release(struct inode *inode, struct file *file)
{
    pr_info("chardev: release\n");
    return 0;
}

static const struct file_operations demo_fops = {
    .owner = THIS_MODULE,
    .open = demo_open,
    .read = demo_read,
    .unlocked_ioctl = demo_ioctl,
    .release = demo_release,
};

static int __init demo_init(void)
{
    int ret = alloc_chrdev_region(&demo_dev, 0, 1, "chardev_demo");
    if (ret)
        return ret;
    cdev_init(&demo_cdev, &demo_fops);
    ret = cdev_add(&demo_cdev, demo_dev, 1);
    if (ret)
        goto err_cdev;
    demo_class = class_create("chardev_demo");
    if (IS_ERR(demo_class)) {
        ret = PTR_ERR(demo_class);
        goto err_class;
    }
    device_create(demo_class, NULL, demo_dev, NULL, "chardev_demo");
    return 0;
err_class:
    cdev_del(&demo_cdev);
err_cdev:
    unregister_chrdev_region(demo_dev, 1);
    return ret;
}

static void __exit demo_exit(void)
{
    device_destroy(demo_class, demo_dev);
    class_destroy(demo_class);
    cdev_del(&demo_cdev);
    unregister_chrdev_region(demo_dev, 1);
}

module_init(demo_init);
module_exit(demo_exit);
MODULE_LICENSE("GPL");
```

加载与验证：

```bash
sudo insmod chardev_demo.ko
ls -l /dev/chardev_demo          # crw------- 1 root root 241, 0 ...
sudo cat /dev/chardev_demo       # demo_value=7
sudo rmmod chardev_demo
```

`class_create` 与 `device_create` 让 ueventd/udev 自动创建节点；没有这一步，驱动能跑但用户态打不开设备。

## 完整示例：proc 接口

```c
// examples/proc_demo.c：/proc 接口，每次打开计数
#include <linux/init.h>
#include <linux/module.h>
#include <linux/proc_fs.h>
#include <linux/seq_file.h>

static int read_count;

static int demo_show(struct seq_file *m, void *v)
{
    seq_printf(m, "read_count=%d\n", read_count);
    return 0;
}

static int demo_open(struct inode *inode, struct file *file)
{
    read_count++;
    return single_open(file, demo_show, NULL);
}

static const struct proc_ops demo_proc_ops = {
    .proc_open = demo_open,
    .proc_read = seq_read,
    .proc_lseek = seq_lseek,
    .proc_release = single_release,
};

static int __init demo_init(void)
{
    proc_create("demo_proc", 0444, NULL, &demo_proc_ops);
    return 0;
}

static void __exit demo_exit(void)
{
    remove_proc_entry("demo_proc", NULL);
}

module_init(demo_init);
module_exit(demo_exit);
MODULE_LICENSE("GPL");
```

实测：

```bash
sudo insmod proc_demo.ko
cat /proc/demo_proc      # read_count=1
cat /proc/demo_proc      # read_count=2
sudo rmmod proc_demo
```

`seq_file` 适合输出多行、需要遍历的数据；`single_open` 适合一段输出。

## 完整示例：input 设备

```c
// examples/inputsim_demo.c：注册一个虚拟输入设备
#include <linux/init.h>
#include <linux/module.h>
#include <linux/input.h>

static struct input_dev *demo_input;

static int __init demo_init(void)
{
    demo_input = input_allocate_device();
    if (!demo_input)
        return -ENOMEM;
    demo_input->name = "demo-input";
    demo_input->id.vendor = 0x1234;
    demo_input->id.product = 0x5678;
    set_bit(EV_KEY, demo_input->evbit);
    set_bit(KEY_A, demo_input->keybit);
    input_register_device(demo_input);
    return 0;
}

static void __exit demo_exit(void)
{
    input_unregister_device(demo_input);
}

module_init(demo_init);
module_exit(demo_exit);
MODULE_LICENSE("GPL");
```

实测：

```bash
sudo insmod inputsim_demo.ko
grep -A3 "demo-input" /proc/bus/input/devices
# N: Name="demo-input"
# S: Sysfs=/devices/virtual/input/input5
sudo rmmod inputsim_demo
```

注册成功后，`/dev/input/eventX` 会出现对应节点，`getevent` 能打开。要上报事件，再调 `input_report_key`/`input_sync`。


## dmesg 等级过滤

`dmesg -l err,warn` 只看错误与警告，`dmesg -T` 显示墙钟时间。日志太多时先过滤，再定位。


## Binder 与 HAL 的边界

HAL 服务通过 Binder 暴露接口；进程内 HAL 不走 Binder，少一次跨进程，但隔离性差。两种方式的选择取决于产品对隔离与性能的要求。

# BSP 实战：RK3568

BSP 的工作大部分是“把厂商的板级配置改对”。

## 目录结构

以 Rockchip BSP 为例，关键目录：

| 路径 | 内容 |
|---|---|
| `kernel/arch/arm64/boot/dts/rockchip/` | SoC dtsi 与板级 dts |
| `kernel/drivers/` | 显示、音频、USB、PCIe、网络等驱动 |
| `vendor/rockchip/` | HAL、hardware 抽象、工具 |
| `device/rockchip/` | 产品配置、init rc、overlay |

SoC 的公共部分放在 `rk3568.dtsi`，板级差异放在 `rk3568-xxx.dts`。改板子通常改板级 dts，不动 dtsi。

## 板级 DTS 的组织

一个板级 dts 大致做这些事：

- `#include "rk3568.dtsi"` 引入 SoC 公共定义。
- 使能或禁用控制器（`status = "okay"`）。
- 配置引脚复用（pinctrl）。
- 挂接外设节点（触摸、传感器、背光）。
- 定义 regulator 与时钟。

```dts
// 板级 dts 片段：使能 I2C3 并挂触摸
&i2c3 {
    status = "okay";
    clock-frequency = <400000>;
    pinctrl-names = "default";
    pinctrl-0 = <&i2c3m0_xfer>;

    touch@5d {
        compatible = "vendor,touch";
        reg = <0x5d>;
        interrupt-parent = <&gpio1>;
        interrupts = <12 IRQ_TYPE_EDGE_FALLING>;
        reset-gpios = <&gpio1 13 GPIO_ACTIVE_LOW>;
    };
};
```

改 DTS 的常见错误：

- 控制器没使能（`status` 还是 `disabled`）。
- 引脚复用冲突，两个外设抢同一组引脚。
- 中断号或触发类型写错。
- regulator 没配，外设不上电。

## 常见外设

| 外设 | 内核侧 | 上层 |
|---|---|---|
| 显示 | VOP、DSI/EDP、背光 PWM | SurfaceFlinger、DisplayManager |
| 触摸 | I2C 驱动、input 子系统 | InputReader、WMS |
| 串口 | 8250 驱动、DTS 节点 | 应用或系统服务 |
| 风扇/温控 | thermal zone、PWM 风扇 | ThermalService |
| 摄像头 | MIPI CSI、V4L2 | Camera HAL |

## 显示链路

显示是 BSP 里最复杂的一块：

- VOP（Video Output Processor）负责图层合成与输出。
- DSI/EDP 是显示接口，panel 有自己的初始化序列。
- 背光由 PWM 或 regulator 控制。
- 时序参数（porch、clock）写错会黑屏或花屏。

排查显示问题，先分背光与显示通路：背光亮但无图，问题在 panel 或 VOP；背光不亮，问题在背光电路或 PWM。

## 触摸链路

触摸的典型链路：

1. DTS 配 I2C 地址、中断、复位 GPIO。
2. 驱动 probe，读芯片 ID，注册 input 设备。
3. 中断触发，读坐标，`input_report_abs` 上报。
4. InputReader 读 `/dev/input/eventX`。
5. WMS 做窗口命中，App 收到事件。

触摸不工作时，按这个顺序查：供电、复位、I2C 通信、中断、probe、input 事件、上层。

## 串口

串口由 8250 驱动与 DTS 节点配置：

```dts
&uart2 {
    status = "okay";
    pinctrl-names = "default";
    pinctrl-0 = <&uart2m0_xfer>;
};
```

用户态通过 `/dev/ttyS2` 访问。串口问题常见于引脚复用、波特率、流控配置。

## 温控与风扇

温控链路：

- DTS 的 `thermal-zones` 定义 sensor 与 trip point。
- thermal 驱动读温度，governor 调 cooling device。
- cooling device 可以是 cpufreq、风扇、充电限流。
- thermal HAL 上报 Framework 的 ThermalService。

风扇常用 PWM 控制，启停温度写在 DTS 或驱动参数里。工规设备还要考虑低温启动与加热。

## 调试顺序

板子不工作时，按从底向上的顺序缩小范围：

1. 供电：电压、上电时序、复位电平。
2. 时钟：晶振、PLL、总线时钟。
3. 总线：I2C 地址扫描、SPI 波形、USB 枚举。
4. probe：`dmesg` 里看驱动有没有匹配、报什么错。
5. 子系统：input 有没有设备、显示有没有 framebuffer。
6. 上层：HAL 服务、Framework 服务、应用。

这个顺序的价值是每一步都能独立验证，不会在多层之间来回猜。

## 参考

- [Linux and the Devicetree](https://docs.kernel.org/devicetree/usage-model.html)
- [Thermal](https://docs.kernel.org/driver-api/thermal/index.html)

## 显示排查

```bash
dmesg | grep -iE "vop|dsi|edp|panel|backlight"
ls /sys/class/backlight/
cat /sys/class/backlight/*/brightness
```

先分背光与显示通路：

- 背光不亮：查 PWM、regulator、背光使能 GPIO。
- 背光亮但无图：查 panel 初始化、DSI 时序、VOP 输出。
- 花屏：查时序、时钟、带宽、内存对齐。

## 触摸排查

```bash
# I2C 地址扫描
i2cdetect -y 3

# 看 input 事件
getevent -l /dev/input/event2

# 看驱动 probe 日志
dmesg | grep -iE "touch|gt9|ft5"

# 看中断计数
cat /proc/interrupts | grep -i touch
```

常见原因：

- DTS 的 I2C 地址与硬件不一致。
- 中断 GPIO 配错或冲突。
- 复位时序不对，芯片没起来。
- 驱动 probe 成功但没注册 input 设备。

## 温控

```bash
cat /sys/class/thermal/thermal_zone*/type
cat /sys/class/thermal/thermal_zone*/temp
cat /sys/class/thermal/cooling_device*/type
```

温度单位通常是毫摄氏度。trip point 与 cooling device 的绑定在 DTS 的 `thermal-zones` 里。

## 一个 I2C 触摸 probe 失败的案例

现象：`dmesg` 里触摸驱动 probe 返回 `-ENODEV`，`i2cdetect` 扫不到地址。

排查：

1. 供电：万用表量 VDD、VDDIO，确认上电时序。
2. 复位：量 reset GPIO，确认复位脉冲。
3. I2C：`i2cdetect -y <bus>` 扫地址；扫不到说明通信没通。
4. 引脚复用：确认 I2C 的 SCL/SDA 没有被其它外设占用。
5. DTS：确认 `reg` 地址、`interrupts`、`reset-gpios` 与原理图一致。

根因可能是复位 GPIO 配错，芯片一直处于复位状态；也可能是 I2C 上拉电阻缺失。软件侧先用 `i2cdetect` 确认通信，再看驱动日志。

## RK BSP 的关键文件

| 文件/目录 | 作用 |
|---|---|
| `rk3568.dtsi` | SoC 公共定义 |
| `rk3568-xxx.dts` | 板级差异 |
| `rk3568-pinctrl.dtsi` | 引脚复用 |
| `drivers/gpu/drm/rockchip` | 显示驱动 |
| `drivers/i2c/busses` | I2C 控制器 |
| `drivers/thermal/rockchip_thermal.c` | 温控 |
| `vendor/rockchip/hardware` | HAL 与硬件抽象 |

## 实验：改 DTS 加一个节点

步骤：

1. 在板级 dts 里使能 I2C 控制器。
2. 加一个设备节点，填 `compatible`、`reg`、中断。
3. 编译 dtb，替换到启动镜像或 QEMU。
4. 启动后看 `/proc/device-tree` 是否有节点。

预期：

```bash
ls /proc/device-tree/i2c@.../touch@5d/
# compatible  name  reg  ...
```

节点不存在，说明 dtb 没生效或节点被覆盖。

## 常见问题

| 现象 | 可能原因 | 排查 |
|---|---|---|
| 节点不存在 | dtb 没更新、`status` disabled | 反编译 dtb、看启动日志 |
| 驱动不 probe | compatible 不一致 | 对比驱动与 DTS |
| 引脚无输出 | pinctrl 配错 | 查 pinctrl 与原理图 |
| 显示黑屏 | panel 时序、背光、VOP | `dmesg`、示波器 |

## 版本差异：RK BSP 与上游

RK 的 BSP 有很多私有驱动与节点：

- 私有 compatible，比如 `rockchip,xxx`。
- 私有 pinctrl 与时钟节点。
- 部分驱动未上游，升级内核时要移植。

读 BSP 代码时，先确认接口是否标准，再看私有部分。

## 排查案例：背光不亮

现象：系统启动、有显示输出，但屏幕黑。

排查：

```bash
ls /sys/class/backlight/
cat /sys/class/backlight/*/brightness
cat /sys/class/backlight/*/max_brightness
dmesg | grep -iE "backlight|pwm"
```

分三种情况：

- 背光设备不存在：PWM 或背光驱动没注册，查 DTS 与驱动。
- 亮度为 0：上层设置问题，查 Settings/DisplayManager。
- 亮度非 0 但不亮：查 PWM 输出、使能 GPIO、升压电路。

硬件侧用示波器看 PWM 波形与使能电平，软件侧看驱动日志与 sysfs。

## 逐函数：显示与温控

RK 显示驱动的绑定入口是 `rockchip_drm_bind`，DSI 驱动绑定在 `dw_mipi_dsi_bind`。panel 驱动通过 `drm_panel` 注册，初始化序列在 `prepare`/`enable` 里。

温控的核心是 `thermal_zone_device_register`：

- 注册 sensor 与 trip point。
- governor 周期性读温度。
- 触发 cooling device。

读这些函数能理解“panel 什么时候初始化”“风扇什么时候转”。

## 版本差异：调试接口

- ftrace 从 debugfs 迁到 tracefs，挂载点变化。
- perf 的符号解析依赖 vmlinux 与 build-id。
- pstore 的后端从 ramoops 扩展到 EFI、TPM，配置方式不同。

## 实验：看启动耗时

```bash
# 启动后看内核时间戳
dmesg | head -20
# 看 init 阶段
logcat -b events | grep boot_progress
# 看每个服务的启动时间
dmesg | grep -E "init: starting|init: service"
```

启动优化先分段测量：Bootloader、Kernel、init、zygote、system_server、Launcher。没有分段数据，改配置只能靠猜。

## RK 的启动流程

RK3568 的启动大致是：

1. BootROM 从存储加载 miniloader/SPL。
2. miniloader 初始化 DDR，加载 U-Boot。
3. U-Boot 加载 kernel、dtb、ramdisk。
4. 内核启动，挂载 system/vendor。
5. init 解析 rc，启动服务。
6. zygote/system_server/Launcher。

调试启动问题，串口日志是关键：BootROM 之后的每个阶段都有输出，卡在哪一段能快速定位。

## 实验：温控策略验证

```bash
# 看当前温度与 trip point
for z in /sys/class/thermal/thermal_zone*; do echo "$z: $(cat $z/type) $(cat $z/temp)"; done
# 看 cooling device 状态
cat /sys/class/thermal/cooling_device*/cur_state
```

触发高温（跑负载）后，观察 `cur_state` 是否变化、风扇是否启动。温控不生效常见于 trip point 没配、cooling device 没绑定。

## 显示接口的选择

| 接口 | 特点 | 适用 |
|---|---|---|
| MIPI DSI | 带宽高、引脚少 | 手机、平板 |
| eDP | 带宽高、支持长距离 | 一体机、笔记本 |
| LVDS | 老接口、抗干扰 | 工控、老屏 |
| HDMI | 标准接口 | 外接显示 |

选择看分辨率、刷新率、带宽、pin 数、成本。RK3568 常见 DSI 与 eDP，panel 时序要按规格书写。

## RK 的音频链路

RK3568 的音频链路大致是：

- I2S/SAI 控制器输出 PCM。
- codec（或 HDMI 音频）负责数模转换。
- 时钟由 `clocks`/`assigned-clocks` 配置，采样率要匹配。
- DTS 里的 `simple-audio-card` 或厂商私有绑定描述链路。

没有声音时，先看 `dmesg` 的 I2S/codec probe 日志，再看 `/proc/asound/cards` 与 `aplay -l`。

## RK 板级调试经验

- 串口：bootloader 与内核日志都走串口，是 bring-up 的第一手信息。
- adb：系统起来后用 `adb logcat`、`adb shell dmesg`。
- fastboot：刷 boot/vendor_boot/dtbo，确认 slot 与分区名。
- 烧录工具：RK 的 maskrom 模式能救砖，前提是能进 maskrom。

调试顺序：串口看启动、adb 看系统、fastboot 刷镜像、maskrom 救砖。

## RK 的 pinctrl 配置

```dts
&pinctrl {
    i2c3 {
        i2c3m0_xfer: i2c3m0-xfer {
            rockchip,pins = <3 RK_PA0 1 &pcfg_pull_none>,
                            <3 RK_PA1 1 &pcfg_pull_none>;
        };
    };
};
```

引脚复用写错，I2C 就没有波形。排查时先看 pinctrl 节点是否被引用，再看引脚是否被其它外设占用。

## maskrom 与烧录

RK 芯片进入 maskrom 模式后，烧录工具可以直接写存储，是救砖的最后手段。进入方式通常是短接或按键组合，具体看板子手册。

烧录前确认：

- 镜像与板子型号匹配。
- 分区表与分区名正确。
- 电源稳定，避免烧录中断。

## DTS 的编译与替换

```bash
make ARCH=arm64 dtbs
# 产物在 arch/arm64/boot/dts/rockchip/
```

替换 dtb 到 boot.img 或 vendor_boot，或单独刷 dtbo。改 DTS 后要确认启动日志里加载的是新 dtb，否则改动不生效。

## RK 的分区表

RK 的 `parameter.txt` 定义分区偏移与大小：

```text
CMDLINE: mtdparts=rk29xxnand:0x00002000@0x00004000(uboot),...
```

分区名要与刷机脚本、fstab 对应。改分区表风险高，先备份原表。

## RK 上的 adb 与 logcat

系统起来后，`adb devices` 能看到设备，`adb shell` 进入容器。`logcat` 抓 Java 日志，`dmesg` 抓内核日志。

连不上 adb 时，先确认 USB gadget 或网络 adb 配置，再看内核日志里的 USB 枚举。


## Binder 一次拷贝的验证

用 `strace` 观察 `ioctl` 的 `BINDER_WRITE_READ`，能看到事务数据；再用 `perf` 看 `binder_transaction` 的耗时，能确认拷贝与调度的开销。


## 内核日志的缓冲

`dmesg` 读的是环形缓冲，长时间运行后早期日志会被覆盖。重要问题要尽早 `dmesg > file` 保存。

# 调试工具

内核调试靠工具，不靠猜。

## 日志

```bash
dmesg -w                     # 实时看内核日志
dmesg -l err,warn            # 只看错误与警告
cat /proc/kmsg               # 直接读内核日志（需要权限）
```

`printk` 有等级，`pr_info`、`pr_err`、`dev_dbg` 各有对应等级。`dev_dbg` 需要开动态调试：

```bash
echo 'file my_driver.c +p' > /sys/kernel/debug/dynamic_debug/control
```

## ftrace

ftrace 是内核自带的跟踪器，适合看函数调用与延迟：

```bash
cd /sys/kernel/debug/tracing
echo function_graph > current_tracer
echo my_probe > set_ftrace_filter
echo 1 > tracing_on
cat trace
```

常用 tracer：

| tracer | 用途 |
|---|---|
| function | 看函数调用 |
| function_graph | 看调用关系与耗时 |
| irqsoff | 看关中断时长 |
| wakeup | 看唤醒延迟 |
| sched_switch | 看任务切换 |

ftrace 的开销比 perf 小，适合线上定位。

## perf

perf 做采样与性能分析：

```bash
perf top                          # 实时热点
perf record -g -- sleep 5         # 采样调用栈
perf report                       # 查看报告
perf sched latency                # 调度延迟
perf stat -e cache-misses         # 缓存未命中
```

内核需要开 `CONFIG_PERF_EVENTS`。火焰图可以用 `perf script` 导出后生成。

## 崩溃与 pstore

内核崩溃后，日志可能来不及写磁盘。`pstore`/`ramoops` 把日志保存在预留内存里，重启后读取：

```bash
ls /sys/fs/pstore/
cat /sys/fs/pstore/console-ramoops-0
```

panic、oops、watchdog 的栈回溯都能在这里找到。拿到地址后用 `addr2line` 还原行号，需要对应的 `vmlinux`。

## 硬件工具

I2C/SPI 不工作时，软件日志只能告诉你“传输失败”，逻辑分析仪能告诉你“波形长什么样”。电源、时钟、复位信号用示波器看。这两类工具在 BSP bring-up 阶段比软件调试更直接。

## 排查方法

| 现象 | 先看 | 再看 |
|---|---|---|
| 驱动没起来 | `dmesg` 的 probe 日志 | 设备树、compatible、依赖 |
| 中断没触发 | `/proc/interrupts` | 引脚复用、触发类型、硬件 |
| 性能异常 | `perf top` | `ftrace`、调度、锁 |
| 死机/重启 | `pstore` | panic/oops 栈、watchdog |
| 内存不足 | `/proc/meminfo` | lmkd、cgroup、泄漏 |

## 参考

- [ftrace](https://docs.kernel.org/trace/ftrace.html)
- [perf](https://docs.kernel.org/tools/perf.html)

## ftrace 的完整示例

```bash
cd /sys/kernel/debug/tracing
echo 0 > tracing_on
echo function_graph > current_tracer
echo my_probe > set_ftrace_filter
echo 1 > tracing_on
# 触发一次 probe
cat trace | head -30
```

输出大致是：

```text
# tracer: function_graph
 0)               |  my_probe() {
 0)   0.512 us    |    devm_ioremap_resource();
 0)   0.203 us    |    platform_get_irq();
 0)   1.024 us    |  }
```

ftrace 能看出“谁调用了谁、每步多久”，比单纯 `printk` 更完整。

## perf 火焰图

```bash
perf record -F 99 -g -- sleep 10
perf script > out.perf
# 生成火焰图需要 FlameGraph 脚本
stackcollapse-perf.pl out.perf > out.folded
flamegraph.pl out.folded > flame.svg
```

火焰图的宽度是 CPU 占比，平顶的函数是热点。内核态与用户态可以分开看，定位是系统调用、驱动还是应用逻辑。

## pstore 配置

pstore 依赖预留内存与后端（ramoops、EFI）。DTS 里常见：

```dts
reserved-memory {
    #address-cells = <1>;
    #size-cells = <1>;

    ramoops: ramoops@3f000000 {
        compatible = "ramoops";
        reg = <0x3f000000 0x100000>;
        record-size = <0x10000>;
        console-size = <0x40000>;
        ftrace-size = <0x10000>;
    };
};
```

配置生效后：

```bash
ls /sys/fs/pstore/
cat /sys/fs/pstore/console-ramoops-0
```

## panic 分析

内核 oops 输出里通常有：

- 触发地址与调用栈。
- 寄存器与栈内容。
- `Code:` 后面的指令字节。

拿到地址后用：

```bash
addr2line -e vmlinux -f -i 0xffffffff81234567
```

`vmlinux` 要与崩溃内核完全一致（同版本、同配置），否则行号对不上。

## Android 侧工具

- tombstone：`/data/tombstones/tombstone_XX`，含 signal、backtrace、map。
- debuggerd：抓 native 栈，`debuggerd -b <pid>`。
- perfetto：抓系统 trace，命令与配置见官方文档。
- logcat：crash buffer 里能看到 Java 崩溃与 ANR。

内核日志与 Android 日志要对齐时间，才能判断是内核先出问题，还是应用先崩。

## 调试工具对比

| 工具 | 开销 | 能看什么 | 适用 |
|---|---|---|---|
| `printk`/`dmesg` | 低 | 状态、错误 | 日常 |
| `ftrace` | 中 | 函数调用、延迟、中断 | 路径与延迟 |
| `perf` | 低-中 | 热点、调用栈、调度 | 性能 |
| `kgdb` | 高 | 单步、断点、变量 | 深度调试 |
| `pstore` | 无 | 崩溃前日志 | 重启/panic |
| 逻辑分析仪 | 无 | 总线波形 | 硬件 bring-up |

选择原则：先低成本工具缩小范围，再上高成本工具。

## 实验：用 ftrace 抓 probe

```bash
cd /sys/kernel/debug/tracing
echo 0 > tracing_on
echo function_graph > current_tracer
echo my_probe > set_ftrace_filter
echo 1 > tracing_on
# 触发设备 probe（重新绑定或重启）
echo my-device > /sys/bus/platform/drivers/my-driver/bind
cat trace
```

预期能看到 `my_probe` 以及它调用的 `devm_ioremap_resource`、`platform_get_irq` 等函数与耗时。

## 常见问题

| 现象 | 排查 |
|---|---|
| ftrace 无输出 | tracer 没设、filter 不匹配、tracing_on 为 0 |
| perf 符号缺失 | 缺 vmlinux 或 `-g` 没开 |
| pstore 为空 | ramoops 没配、预留内存不对 |
| panic 行号对不上 | vmlinux 与崩溃内核不一致 |

```bash
# 看事件列表
ls /sys/kernel/debug/tracing/events/
# 开启某个事件
echo 1 > /sys/kernel/debug/tracing/events/sched/sched_switch/enable
```

`tracefs` 通常挂在 `/sys/kernel/debug/tracing`。新内核也支持单独挂载 `tracefs`。

## 版本差异：tracefs

- 早期 ftrace 都在 debugfs 下。
- 4.1 起引入 tracefs，可以单独挂载。
- 现代内核推荐挂 `tracefs`，权限与生命周期更清晰。

## 排查案例：系统卡死但日志正常

现象：system_server 或应用无响应，`dmesg` 没有 panic，logcat 显示 ANR。

排查：

```bash
# 看内核栈与阻塞点
cat /proc/<pid>/stack
cat /proc/<pid>/wchan
# 看调度延迟
perf sched latency
# 看 D 状态进程
ps -eLo pid,stat,wchan,comm | awk '$2 ~ /D/'
```

常见原因：

- 进程卡在 IO（eMMC/文件系统）。
- 内核锁竞争（mutex/spinlock）。
- 内存回收导致长时间阻塞。

内核栈能看出“卡在哪个函数”，比只看 Java 栈更接近根因。

## 逐函数：ftrace 与 perf

`function` tracer 在每个函数入口调用 `ftrace_caller`，把返回地址写入环形缓冲。`function_graph` 额外在返回时记录耗时。

perf 通过 `perf_event_open` 注册事件，内核采样并写环形缓冲，用户态读取分析。

读这两条路径能理解“为什么 ftrace 开销小”“为什么 perf 需要符号表”。

## 版本差异：Android 侧

- 音频 HAL 从 HIDL 迁到 AIDL，Framework 调用方式变化。
- Binder 驱动的用户态接口稳定，AIDL 生成代码变化。
- 系统调用表随架构与版本增减，不要硬编码编号。

## 实验：lockdep 与 KASAN

lockdep 检测锁顺序问题：

```bash
# 开启后跑业务，看 dmesg 是否报 possible circular locking
cat /proc/lockdep_stats
```

KASAN 检测越界与 UAF：

```bash
# 内核开启 CONFIG_KASAN 后，越界访问会打印报告
dmesg | grep -i kasan
```

这些工具开销大，只用于调试版本，不要带到生产。

## perfetto 的基本用法

perfetto 能同时抓内核与 Android 事件：

```bash
# 抓 10 秒 trace
perfetto -c - --txt -o trace.pb <<'EOF'
buffers: { size_kb: 65536 }
data_sources: { config { name: "linux.ftrace" ftrace_config { ftrace_events: "sched/sched_switch" } } }
duration_ms: 10000
EOF
```

抓完用 Perfetto UI 打开，能看 CPU 调度、Binder、SurfaceFlinger、应用线程。相比单独 ftrace，它更适合系统级问题。

## 实验：用 perf 找热点

```bash
perf record -F 99 -g -- sleep 5
perf report --stdio | head -40
```

报告按符号排序，能看到内核与用户态的热点。内核符号缺失时，确认 `vmlinux` 与 `kallsyms` 可用。

## 调试接口的安全限制

生产系统会限制调试接口：

- `kernel.kptr_restrict`：限制 `/proc/kallsyms` 的地址。
- `kernel.dmesg_restrict`：限制普通用户读 `dmesg`。
- SELinux：限制 `debugfs`、`tracefs` 访问。

```bash
cat /proc/sys/kernel/kptr_restrict
cat /proc/sys/kernel/dmesg_restrict
```

调试版本可以放宽，生产版本要收紧。写文档时也要注意不要泄露地址与密钥。

## ftrace 的事件过滤

```bash
# 只抓某个进程的事件
echo 1234 > set_event_pid
# 只抓某个函数的调用
echo 'my_probe' > set_ftrace_filter
# 过滤事件字段
echo 'common_pid == 1234' > events/sched/sched_switch/filter
```

过滤能显著减少输出量，让 trace 更容易读。

## Binder 与 HAL

HAL 服务通过 Binder 暴露接口：

- HIDL/AIDL 接口生成 Stub 与 Proxy。
- 客户端拿 Proxy，调用经 Binder 到服务端。
- 服务端在独立进程，崩溃不影响 Framework。

进程内 HAL 不走 Binder，直接构造对象，少一次跨进程，但隔离性差。

## 调试技巧

- 先复现，不能复现的问题只能观察。
- 先缩小范围，再猜原因。
- 每改一处，只改一个变量，记录结果。
- 相信证据，不相信“感觉”。
- 不确定时回滚，保留可工作的版本。
- 基础检查（供电、时钟、复位、引脚）永远先做。

内核问题往往不是“某个函数写错”，而是“某层前提不成立”。把前提逐条验证，比盯着代码看更快。

## 日志采集与崩溃转储

- `pstore`/`ramoops`：把 panic 前的日志存到预留内存，重启后读取。
- `kdump`/`kexec`：崩溃时启动第二个内核抓内存转储（服务器常用，嵌入式少）。
- 串口：最可靠，panic 时也能输出。
- `logcat` 的 crash buffer：抓 Java 崩溃与 ANR。

```bash
ls /sys/fs/pstore/
cat /sys/fs/pstore/console-ramoops-0
```

采集策略：平时保留最近几次崩溃日志，出问题时先备份，再重启复现。

## trace_pipe 与符号解析

```bash
cat /sys/kernel/debug/tracing/trace_pipe
```

`trace_pipe` 是流式读取，适合边跑边看。`trace` 是缓冲快照。

perf 的符号解析依赖：

- `vmlinux`（内核调试信息）。
- `/proc/kallsyms`（运行内核符号）。
- 用户态二进制的符号表。

符号缺失时，报告里只有地址。补上调试信息再分析。

## logcat 的 crash buffer

```bash
adb logcat -b crash -d
adb logcat -b events -d | grep -iE "am_crash|am_anr"
```

crash buffer 记录 Java 崩溃与 native 崩溃的摘要；完整栈在 tombstone 或 dropbox。内核 panic 与 Java 崩溃要分开看，时间对齐后再判断因果。

## perf 的采样频率

```bash
perf record -F 99 -g -- sleep 5
```

`-F` 是每秒采样次数。太高开销大，太低漏热点。常用 99 或 999。

采样频率影响的是“看到多少样本”，不改变程序行为。分析时先看热点函数，再看调用栈，最后看源码。

## ftrace 的 PID 过滤

```bash
# 只跟踪某个进程
echo 1234 > /sys/kernel/debug/tracing/set_ftrace_pid
# 清空
echo > /sys/kernel/debug/tracing/set_ftrace_pid
```

PID 过滤能过滤掉无关进程的调用，适合分析单个应用或服务的系统调用路径。

## ftrace 的显示选项

```bash
cat /sys/kernel/debug/tracing/trace_options
echo sym-offset > /sys/kernel/debug/tracing/trace_options
```

常用选项：`timestamp`（时间戳）、`sym-offset`（符号加偏移）、`irq-info`（中断信息）、`latency-format`（延迟格式）。

选项影响可读性，不影响采集内容。

## 调试符号与 build-id

内核镜像的 build-id 用来匹配崩溃栈与源码：

```bash
readelf -n vmlinux | grep -i build
```

崩溃日志里的地址需要对应版本的 `vmlinux` 与 `System.map`。版本、配置、编译器任一不同，行号都可能错位。

保存调试产物：每次发版留一份 `vmlinux` 与 `System.map`，按 build-id 归档。没有它们，线上崩溃只能看汇编。

## debugfs 的挂载

debugfs 不在 `/proc` 或 `/sys`，需要单独挂载：

```bash
mount -t debugfs none /sys/kernel/debug
```

ftrace、dynamic_debug、sched 的调优项都在这里。Android 上 SELinux 会限制访问，调试版本才开放。

## 日志时间戳

`dmesg` 默认显示内核启动后的秒数，`dmesg -T` 转成墙钟时间。排查跨进程问题时，用墙钟时间与 `logcat`、`perfetto` 对齐，才能判断先后顺序。

时钟没同步时，先对时再做因果分析。


## 触摸事件的坐标

InputReader 拿到的坐标要经过窗口变换才到 View 坐标。触摸偏移时，先看 `getevent` 的原始值，再看变换参数。

# 从应用到内核的串联

前面几块是分开讲的，实际系统里它们是连起来的。三条链路可以帮你把已有经验和内核接上。

## 音频链路

| 层 | 组件 | 关键动作 |
|---|---|---|
| App | AudioRecord | 申请缓冲区、开始录音 |
| Framework | AudioService | 权限、焦点、参数 |
| Native | AudioFlinger、AudioPolicyService | 建流、路由、混音 |
| HAL | audio HAL | 打开输入流、读写 PCM |
| 内核 | 音频驱动、DMA | 搬运数据、中断通知 |

应用调用 `AudioRecord.startRecording()` 后，数据从驱动经 HAL、AudioFlinger 送到应用缓冲区。任何一层出问题，现象都可能是“没声音”或“卡顿”，所以要按层对账。

音频驱动关注的是 period、DMA 对齐、时钟与欠载。HAL 关注的是采样率、声道、缓冲区。Framework 关注的是路由、焦点、重采样。三者对不上，就会出现时长异常、变速、爆音。

## Binder 链路

| 层 | 组件 | 关键动作 |
|---|---|---|
| App | Binder Proxy | 调用系统服务 |
| 内核 | `/dev/binder` | 一次拷贝、路由、线程唤醒 |
| 服务端 | Binder Stub | 处理请求、返回结果 |

Binder 驱动是内核里少数“为 Android 定制”的部分。理解它，能解释为什么系统服务调用会阻塞、为什么线程池会满。

一次同步调用的大致过程：

1. 客户端把参数写入 `Parcel`。
2. `BpBinder` 通过 `ioctl` 发 `BC_TRANSACTION`。
3. 驱动把事务挂到服务端线程，服务端收到 `BR_TRANSACTION`。
4. `BBinder` 调 `onTransact`，按 code 分发。
5. 结果写回，发 `BC_REPLY`，客户端收到 `BR_REPLY`。

“一次拷贝”指发送方把数据从用户态拷到内核缓冲区一次；接收方通过 mmap 直接读内核缓冲区，不再拷。不是零拷贝，但比传统 IPC 少一次。

## 触摸链路

| 层 | 组件 | 关键动作 |
|---|---|---|
| 硬件 | 触摸 IC | 检测、中断 |
| 内核 | I2C 驱动、input | 读坐标、上报事件 |
| Native | InputReader | 读 `/dev/input`、加工 |
| Framework | InputDispatcher、WMS | 分发、窗口命中 |
| App | View | 处理触摸事件 |

这条链路能解释很多现场问题：触摸不灵可能是中断没配、坐标没校准、InputReader 没起来，或者窗口被遮挡。按层排查比换屏快。

## 系统调用路径

应用通过系统调用进入内核。以 x86-64 为例：

1. 系统调用号放 `rax`，参数放 `rdi/rsi/rdx/r10/r8/r9`。
2. 执行 `syscall`，CPU 把返回地址存 `rcx`、标志存 `r11`，跳到 `MSR_LSTAR` 指定的入口。
3. 内核保存寄存器，切换到内核栈，按 `rax` 查 `sys_call_table`。
4. 返回时结果放 `rax`，`sysretq` 恢复 `rcx/r11`。

ARM64 用 `svc` 指令，系统调用号在 `x8`，参数在 `x0` 到 `x5`，从 EL0 陷入 EL1。

两个优化：

- vDSO：把 `gettimeofday`、`clock_gettime` 这类只读操作映射到用户态，不陷入内核。
- KPTI：用户页表不映射内核，防 Meltdown；代价是每次陷入/返回切页表，增加开销。

## mmap 与零拷贝

`mmap` 把文件或匿名内存映射进进程地址空间，访问触发缺页，内核建立页表映射。`read` 则是把数据从页缓存拷到用户缓冲区。

零拷贝的几种做法：

- `sendfile`：内核直接把文件页送到 socket，减少用户态拷贝。
- `splice`：在内核缓冲之间移动页引用。
- `mmap`：用户直接读写页缓存，省一次拷贝。

代价与边界：`mmap` 要处理缺页与文件截断（SIGBUS），`sendfile` 不支持所有场景，`splice` 需要管道。

## 小结

做过 Framework 或 HAL 的人，转内核的优势是知道“上层要什么”：

- 知道 AudioRecord 需要怎样的时间戳和缓冲，写音频驱动时会注意 period、DMA 对齐。
- 知道 InputReader 期望怎样的事件序列，写触摸驱动时会注意 `input_sync` 的时机。
- 知道 HAL 接口的约束，写驱动时会预留控制通道。

劣势是容易把“上层能跑”当成“底层没问题”。补内核这一层，就是把“能跑”变成“知道为什么能跑”。

## 参考

- [System calls](https://docs.kernel.org/process/syscall.html)
- [Binder](https://source.android.com/docs/core/architecture/hidl/binder-ipc)

## 音频调用链

应用调用 `AudioRecord.startRecording()` 后，native 侧大致这样走：

```cpp
// frameworks/av/media/libaudioclient/AudioRecord.cpp（简化）
status_t AudioRecord::start(AudioSystem::sync_event_t event, int triggerSession)
{
    // 通过 Binder 调 AudioFlinger，创建 record track 与 RecordThread
    return mAudioRecord->start(event, triggerSession);
}
```

AudioFlinger 侧创建 RecordThread，线程循环里从 HAL 读：

```cpp
// frameworks/av/services/audioflinger/Threads.cpp（简化）
bool AudioFlinger::RecordThread::threadLoop()
{
    // read() 从 HAL 的输入流取 PCM
    // 经 RecordBufferConverter 重采样后写入共享缓冲
}
```

HAL 的 `read` 最终落到驱动或虚拟设备。应用从共享缓冲取数据，不需要关心下面是真实麦克风还是虚拟设备。

## Binder 调用的代码

客户端：

```cpp
// frameworks/native/libs/binder/IPCThreadState.cpp（简化）
status_t IPCThreadState::transact(int32_t handle, uint32_t code,
                                  const Parcel &data, Parcel *reply, uint32_t flags)
{
    // 写 BC_TRANSACTION 到驱动
    // 等 BR_REPLY
}
```

服务端：

```cpp
// frameworks/native/libs/binder/Binder.cpp（简化）
status_t BBinder::transact(uint32_t code, const Parcel &data, Parcel *reply, uint32_t flags)
{
    return onTransact(code, data, reply, flags);   // 分发到具体实现
}
```

驱动负责把事务从客户端线程送到服务端线程，并处理一次拷贝。

## 系统调用的代码

用户态 `write` 最终执行 `syscall` 指令。内核入口按架构不同：

```c
// arch/x86/entry/entry_64.S（简化）
SYM_CODE_START(entry_SYSCALL_64)
    swapgs
    movq %rsp, PER_CPU_VAR(cpu_tss_rw + TSS_sp2)
    SWITCH_TO_KERNEL_CR3
    // 保存寄存器，调用 do_syscall_64
SYM_CODE_END(entry_SYSCALL_64)
```

ARM64 用 `svc`，入口在 `arch/arm64/kernel/entry.S`。

## vDSO 的验证

```bash
# 看进程映射里有没有 vdso
cat /proc/self/maps | grep vdso
# 看动态库依赖
ldd /bin/ls
```

`gettimeofday`、`clock_gettime` 这类调用在很多情况下走 vDSO，不产生系统调用。用 `strace` 观察，能看到有些调用没有对应的 `syscall` 记录。

## 音频的数据结构

| 结构 | 作用 |
|---|---|
| `audio_track_cblk_t` | 应用与 AudioFlinger 共享的控制块 |
| `RecordTrack` | AudioFlinger 侧的录音轨道 |
| `RecordThread` | 录音线程，从 HAL 读数据 |
| `RecordBufferConverter` | 采样率/声道转换 |

控制块里有读写指针、帧计数、状态标志。应用与 AudioFlinger 通过共享内存交换 PCM，用 futex 或 eventfd 通知。

## Binder 的数据结构

| 结构 | 作用 |
|---|---|
| `binder_proc` | 打开驱动的进程 |
| `binder_thread` | 进程内的 Binder 线程 |
| `binder_node` | 服务端对象 |
| `binder_ref` | 客户端引用 |
| `binder_transaction_data` | 一次事务的数据 |

`binder_transaction_data` 里有目标 handle、code、数据缓冲区、偏移数组。驱动按 handle 找到目标进程，把事务挂到目标线程。

## 实验：strace 看系统调用

```bash
strace -f -e trace=write,openat,ioctl -o trace.txt ./app
grep -E "write|ioctl" trace.txt | head
```

预期能看到 `write` 的文件描述符、缓冲区地址、字节数；Binder 调用会表现为 `ioctl`。这能帮你确认“应用到底调了什么”。

## 常见问题

| 现象 | 可能原因 |
|---|---|
| 录音无声 | 路由错、焦点被抢、HAL 未开流 |
| Binder 调用阻塞 | 服务端线程池满、死锁 |
| 系统调用频繁 | 缓冲太小、循环调用 |
| 数据拷贝多 | 未用共享内存/零拷贝 |

## 版本差异：音频 HAL

- legacy：`audio.primary.<board>.so`，同进程。
- HIDL：`android.hardware.audio@x.x`，独立进程。
- AIDL：`android.hardware.audio.core`，新平台默认。

Framework 的调用方式随 HAL 版本变化，但“打开流、读写、设置参数”的模型一致。

## 排查案例：录音无声

现象：应用录音没有数据，或数据全零。

排查：

```bash
dumpsys audio | head -40
dumpsys media.audio_policy | grep -iE "input|device"
dumpsys media.audio_flinger | grep -iE "record|track|thread"
```

常见原因：

- 路由选错：录音源没有选中虚拟麦或真实麦。
- 焦点被抢：其它应用占用麦克风。
- 权限不足：`RECORD_AUDIO` 没授予。
- HAL 没开流：`openInputStream` 失败。
- 数据没写入：代理侧或虚拟设备没数据。

按“应用权限、路由、HAL、数据源”顺序排查。

## 逐函数：Binder 事务

`binder_transaction` 的核心步骤：

1. 根据 handle 找到目标 `binder_node` 与目标进程。
2. 从目标进程的缓冲区分配空间。
3. `copy_from_user` 把数据拷到内核缓冲区。
4. 把事务挂到目标线程的 todo 队列。
5. 唤醒目标线程。

目标线程 `binder_thread_read` 取出事务，返回 `BR_TRANSACTION`。

读这段能理解“一次拷贝”“线程池满”“事务阻塞”。

## 版本差异：容器与内核

- binderfs 在 4.14 左右引入，旧内核没有。
- cgroup v2 在 4.5 引入，Android 逐渐迁移。
- 容器运行时与内核版本的兼容性要一起看。

## 实验：AudioTrack 播放链路

播放与录音对称：

1. 应用 `AudioTrack.write` 写共享缓冲。
2. AudioFlinger 的 MixerThread 取数据、混音。
3. HAL 的 `IStreamOut::write` 送到设备。
4. 驱动通过 DMA 播放。

```bash
dumpsys media.audio_flinger | grep -iE "track|mixer|thread"
```

如果播放卡顿，先看 underrun 计数、缓冲区水位、线程优先级。

## 音频时间戳

`AudioRecord`/`AudioTrack` 可以获取时间戳：

```java
AudioTimestamp ts = new AudioTimestamp();
audioRecord.getTimestamp(ts, AudioTimestamp.TIMEBASE_MONOTONIC);
```

时间戳把“帧位置”映射到“本地时间”，用于音画同步。虚拟设备要保证时间戳连续，否则上层会算出错误的时长或速度。

排查时长问题，先看时间戳是否单调、是否与帧数匹配。

## 实验：对齐音频与内核时间

```bash
# 应用侧时间戳
dumpsys media.audio_flinger | grep -i timestamp
# 内核音频驱动日志
dmesg | grep -iE "audio|i2s|dma"
```

音频卡顿时，比较应用拿到的帧时间戳与内核 DMA 位置，能判断是驱动欠载还是上层缓冲问题。

## Binder 线程池

每个进程的 Binder 线程池有上限：

- 默认最大 15 个线程（设备相关）。
- 线程不够时，新请求排队，客户端阻塞。
- 线程太多会占内存与调度开销。

```bash
dumpsys binder_calls_stats
```

排查“Binder 调用卡住”，先看服务端线程是否都在忙、是否有死锁、是否有耗时操作占着线程。

## 音频与 Binder 的关系

音频链路里有两类跨进程：

- 应用与 AudioFlinger：Binder 传控制，共享内存传 PCM。
- AudioFlinger 与 HAL：AIDL/HIDL 传控制，PCM 走共享缓冲或 socket。

所以“音频卡顿”可能来自 Binder 阻塞（控制调用），也可能来自缓冲欠载（数据面）。排查要分开看。

## 系统调用的开销

一次系统调用涉及模式切换、寄存器保存、查表。频繁小调用可以用批量接口或 vDSO 优化。测开销用 `perf stat -e syscalls:sys_enter_*`。

# 共享内核：一次全容器故障的排查

Android 容器化部署时，多台云手机共享同一个 Linux 内核。这不是 Android 原生设计的场景，很多内核资源是按单设备假设的：

- Binder 驱动的物理页池、全局锁、Context Manager 只有一份。
- 一个容器的 Binder 泄漏或高负载，可能影响同一宿主机上的其他容器。
- 容器隔离靠命名空间与 cgroup，内核里的全局对象并不隔离。

实习期间遇到过一次全容器无法开机：多个原本正常的容器同时起不来。排查按“共享层到容器层”的顺序：

1. 确认范围：所有容器、同一宿主机、还是某个镜像。
2. 宿主机内核日志：`dmesg` 找 panic、oops、watchdog、OOM、驱动报错。
3. 容器内日志：`logcat` 的 crash buffer、`tombstone` 的 native 栈、`last_kmsg`/`pstore` 的上次崩溃现场。
4. Binder 状态：`dumpsys binder_calls_stats`、binderfs/debugfs，看线程与缓冲区是否异常。
5. 资源与调度：`/proc/interrupts`、`/proc/meminfo`、`perfetto` 采样、`getprop` 看属性。

最后做了修复，容器恢复，但根因没有完全定位。这个结论要如实保留：修复了现象，不等于找到了根因。

另有一次主动压测：单台虚机开数十个容器，用测试应用制造 Binder 高负载，观察线程池与内存映射区，结论是没有出现容器或虚机崩溃。压测与故障是两件事，前者验证方案在设定压力下的稳定性，后者回答某次异常为什么发生。

从这个场景能带出几个内核关注点：

| 关注点 | 为什么重要 |
|---|---|
| 全局资源 | Binder、页池、锁是共享的，单容器异常会外溢 |
| 日志分层 | 宿主机 dmesg 与容器 logcat 要分开看，再对齐时间 |
| 崩溃现场 | pstore/ramoops 能保存重启前的内核日志 |
| 隔离手段 | binderfs 多实例、cgroup 限额、SELinux |
| 结论边界 | 修复不等于根因，压测通过不等于全场景安全 |

## 隔离手段

- binderfs：每个容器挂载独立的 binder 设备实例，隔离 Context Manager 与缓冲区。
- cgroup：限制每个容器的内存、CPU、IO，防止单容器拖垮宿主机。
- SELinux：限制容器内进程能访问的内核资源。
- 命名空间：隔离 PID、网络、挂载点，但内核全局对象仍共享。

共享内核的隔离是“约束 + 监控”，不是天然安全。设计时要假设单个容器会出问题，提前准备限流、隔离与恢复。

## 参考

- [Android Binder](https://source.android.com/docs/core/architecture/hidl/binder-ipc)
- [cgroup v2](https://docs.kernel.org/admin-guide/cgroup-v2.html)

## 容器化的隔离层次

| 资源 | 机制 | 隔离强度 |
|---|---|---|
| 进程 | PID namespace | 强，看不到宿主进程 |
| 网络 | network namespace + veth | 强，独立协议栈 |
| 挂载 | mount namespace + overlayfs | 强，独立根文件系统 |
| CPU | cgroup cpuset/cpu.max | 中，共享物理核 |
| 内存 | cgroup memory.max | 中，共享物理内存 |
| Binder | binderfs 实例 | 中，可隔离也可共享 |
| 内核对象 | 无 | 弱，全局共享 |

隔离强度从命名空间到内核对象逐级下降。设计容器方案，要清楚哪些资源是强隔离、哪些是共享。

## 故障恢复流程

单容器：

1. 重启容器。
2. 重建镜像或恢复快照。
3. 迁移到其它宿主机。

宿主机：

1. 重启容器运行时。
2. 回滚内核或驱动。
3. 恢复数据卷。

全容器故障：

1. 确认范围，保留现场（`dmesg`、`pstore`、容器日志）。
2. 回滚最近变更（内核、镜像、配置）。
3. 恢复服务，再复盘根因。

恢复流程要提前演练，不能等故障时临时想。

## Binder 压测方法

- 写一对测试应用，客户端循环调用服务端。
- 逐步增加容器数与并发，观察 Binder 线程池、缓冲区、延迟。
- 同时采集宿主机 `dmesg`、容器 `logcat`、中台状态。
- 记录拐点与失败模式，不只记“没崩”。

压测结论只对“设定压力与场景”有效。换硬件、换内核、换负载，结论要重测。

## 监控指标

| 指标 | 采集方式 | 阈值建议 |
|---|---|---|
| Binder 线程数 | `dumpsys binder_calls_stats` | 接近上限告警 |
| Binder 缓冲区 | binderfs/debugfs | 持续增长告警 |
| 内存水位 | `/proc/meminfo`、cgroup | 低于 low 告警 |
| 中断计数 | `/proc/interrupts` | 异常增长告警 |
| 调度延迟 | `perf sched` | 超过业务阈值告警 |
| 容器 OOM | `memory.events` | 出现即告警 |

监控要长期采样，故障瞬间的数据往往不完整。

## 与真机对比的取舍

| 维度 | 真机 | 云手机容器 |
|---|---|---|
| 成本 | 高 | 低，密度高 |
| 隔离 | 物理隔离 | 共享内核，弱隔离 |
| 兼容 | 标准 Android | 定制音频/显示链路 |
| 调试 | 串口、adb | 中台、容器日志 |
| 升级 | OTA | 宿主机统一升级 |

容器化用隔离性换成本与密度。能接受哪些风险，要在方案阶段定清楚。

## Binder 的全局结构

共享内核下，Binder 驱动的全局对象只有一份：

| 结构 | 作用 | 共享风险 |
|---|---|---|
| `binder_proc` | 每个打开 `/dev/binder` 的进程 | 多容器共用一个驱动实例 |
| `binder_node` | 服务端对象 | 节点引用跨容器可能混乱 |
| `binder_ref` | 客户端引用 | 引用计数错误会泄漏 |
| `binder_buffer` | 内核缓冲区 | 物理页池全局共享 |
| `binder_thread` | 服务端线程 | 线程池上限全局生效 |

容器共享内核时，一个容器的 Binder 泄漏会消耗全局页池，影响其他容器。

## binderfs 隔离

binderfs 允许每个容器挂载独立的 Binder 设备实例：

```bash
mount -t binder binder /dev/binderfs
# 新实例
mkdir /dev/binderfs/mycontainer
# 容器内使用 /dev/binderfs/mycontainer/binder
```

这样 Context Manager、节点、缓冲区按实例隔离，减少跨容器干扰。代价是配置复杂，需要容器运行时支持。

## cgroup 限制

cgroup v2 可以限制容器的内存、CPU、IO：

```bash
# 创建 cgroup
mkdir /sys/fs/cgroup/mycontainer
# 限制内存
echo 2G > /sys/fs/cgroup/mycontainer/memory.max
# 把进程加入
echo <pid> > /sys/fs/cgroup/mycontainer/cgroup.procs
```

限制能防止单容器拖垮宿主机，但不能隔离内核全局对象。内存到上限时触发 cgroup OOM，而不是整机 OOM。

## 排查命令

```bash
# 宿主机内核日志
dmesg -T | tail -100
# 容器内崩溃日志
adb logcat -b crash -d
# Binder 状态
dumpsys binder_calls_stats
# 内存与 cgroup
cat /proc/meminfo
cat /sys/fs/cgroup/mycontainer/memory.current
# 中断与调度
cat /proc/interrupts
perf top
```

排查顺序是“先范围、再内核、再容器、再 Binder、再资源”。共享层的异常会同时影响所有容器，先看宿主机往往更快。

## 压测方法

压测要可复现：

- 固定容器数量、镜像、负载类型。
- 用测试应用制造 Binder 调用、内存分配、IO。
- 记录基线：CPU、内存、Binder 线程数、延迟。
- 逐步加压，观察拐点。
- 结束后恢复环境，避免影响其他人。

压测结论只对“设定压力与场景”有效，不能外推成“任何情况都安全”。

## 容器内核配置示例

binderfs：

```bash
mkdir -p /dev/binderfs
mount -t binder binder /dev/binderfs
mkdir /dev/binderfs/container-a
ls /dev/binderfs/container-a/
# binder  binder-control  features
```

cgroup v2 限制：

```bash
mkdir /sys/fs/cgroup/container-a
echo 2G > /sys/fs/cgroup/container-a/memory.max
echo 200000 > /sys/fs/cgroup/container-a/cpu.max   # 2 核
echo <pid> > /sys/fs/cgroup/container-a/cgroup.procs
```

## 实验：观察 cgroup 内存

```bash
cat /sys/fs/cgroup/container-a/memory.current
cat /sys/fs/cgroup/container-a/memory.max
cat /sys/fs/cgroup/container-a/memory.events
```

预期：接近上限时 `memory.events` 的 `high`/`max` 计数增长，可能触发 cgroup OOM。

## 常见问题

| 现象 | 可能原因 | 排查 |
|---|---|---|
| 容器全部无法启动 | 宿主机内核异常、Binder 全局资源耗尽 | `dmesg`、Binder 状态 |
| 单容器 OOM 影响他人 | 未设 cgroup 限额 | `memory.max`、`memory.events` |
| Binder 跨容器干扰 | 未用 binderfs 隔离 | 挂载实例、Context Manager |
| 升级内核后容器异常 | KMI/驱动不兼容 | 版本、模块签名、日志 |

## 版本差异：binderfs

- 早期只有 `/dev/binder` 一个实例。
- 4.14 左右引入 binderfs，可以动态创建多个 Binder 设备。
- 容器场景用 binderfs 做隔离。

读 Binder 驱动时，先看 `binder_mmap` 与 `binder_transaction`，再看 `binderfs` 的挂载与实例管理。

## 排查案例：容器启动后全部无响应

现象：宿主机正常，多个容器同时卡住或无响应。

排查：

```bash
# 宿主机
dmesg -T | tail -100
cat /proc/meminfo
cat /proc/buddyinfo
# Binder 状态
dumpsys binder_calls_stats
# 容器内
adb logcat -b crash -d
```

常见原因：

- 共享内核的全局资源耗尽（Binder 页池、内存）。
- 宿主机内核异常（驱动、watchdog）。
- cgroup 限额触发，容器内进程被限制。
- 存储或网络故障。

先确认影响范围，再按“宿主机内核、Binder、资源、容器内”顺序排查。

## 逐函数：共享内核的全局对象

`binder_proc` 在 `binder_open` 时创建，挂到全局 `binder_procs` 链表。每个容器打开一次 `/dev/binder`，就多一个 `binder_proc`，但底层 `binder_device` 与页池是共享的。

`binderfs` 的引入让每个挂载实例有独立的 `binder_device`，从而隔离 Context Manager 与缓冲区。

读这部分能理解“为什么容器之间会互相影响”“binderfs 解决了什么”。

## 容器内核升级

共享内核的环境，升级内核影响所有容器：

- 先在小范围宿主机验证。
- 确认 Binder、cgroup、binderfs 兼容。
- 准备回滚：旧内核、旧镜像、数据备份。
- 升级后跑压测与业务回归。

容器运行时与内核版本有兼容矩阵，升级前查文档，不要直接上生产。


## 容器化与内核参数

共享内核时，部分内核参数是全局的：

- `vm.swappiness`、`vm.min_free_kbytes`：影响所有容器。
- `kernel.pid_max`、`fs.file-max`：全局上限。
- `net.core.somaxconn`：网络队列。

容器不能随意改全局参数，需要宿主统一管理。设计容器化方案时，把内核参数当作共享资源看待。

## 共享内核的监控指标

| 指标 | 来源 | 用途 |
|---|---|---|
| Binder 线程数 | `dumpsys binder_calls_stats` | 线程池是否满 |
| Binder 缓冲区 | `binderfs`/debugfs | 是否接近上限 |
| 内存水位 | `/proc/meminfo`、cgroup | 是否接近 OOM |
| 中断计数 | `/proc/interrupts` | 中断风暴 |
| 调度延迟 | `perf sched` | 实时性 |
| 容器 OOM | `memory.events` | 限额是否触发 |

监控要长期采样，不能只看故障瞬间。


## 共享内核的经验总结

- 共享内核的隔离靠约束与监控，不靠天然安全。
- 出问题先确认范围，再看宿主机内核，再看容器内。
- 修复现象不等于定位根因，结论要留边界。
- 压测验证的是设定压力下的稳定性，不能外推。
- 容器化方案设计时，把内核全局资源当作共享资源管理。

# 参考

- [Android Common Kernel](https://source.android.com/docs/core/architecture/kernel/android-common)
- [Generic boot partition](https://source.android.com/docs/core/architecture/partitions/generic-boot)
- [HAL overview](https://source.android.com/docs/core/architecture/hal)
- [Linux kernel documentation](https://docs.kernel.org/)
- [Linux and the Devicetree](https://docs.kernel.org/devicetree/usage-model.html)
- [CFS](https://docs.kernel.org/scheduler/sched-design-CFS.html)
- [EEVDF](https://docs.kernel.org/scheduler/sched-eevdf.html)
- [ftrace](https://docs.kernel.org/trace/ftrace.html)
- [perf](https://docs.kernel.org/tools/perf.html)
