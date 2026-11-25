---
title: Linux上程序跑满100% CPU却不崩溃的排查办法
date: 2026-11-25 12:00:00
updated: 2026-11-25 12:00:00
tags: "你知道吗"
categories: "只属于你的小妙招 <br> 看似有用实则没用"
cover: /images/画廊/pixiv/149709766_p0_master1200.webp
excerpt: 一次面试里被问到的 CPU 100% 排查题，从 top 到 perf、gdb、strace 的完整路径
mermaid: false
---

- 某次面试被问到：一个 C++ 程序在 Linux 上跑着，CPU 占了 100%，但进程没有崩溃，可能是什么原因，怎么排查，能用哪些工具。
- 当时把 top、gdb、strace、perf 都提了一遍，但没有讲清楚先看什么、怎么从“哪个进程”收敛到“哪一行代码”。这里按实际排查顺序重写一份。
- 约定：程序是 Linux 用户态 C++。

# 太长不看 ？

- 先确认 100% 是哪个进程、哪个线程、哪个核，再确认 CPU 时间花在用户态、内核态、IO 等待还是被虚拟化偷走。
- 用户态用 perf 采样加 gdb 栈；系统调用用 strace 或 perf trace；锁竞争和调度看 /proc 与 bpftrace。
- 常见根因是死循环、忙等、事件循环空转、重试风暴、锁自旋、线程或进程数量失控，以及外部负载。
- tombstone 是 native 崩溃后的现场，CPU 100% 但不崩溃时不会产生；Linux 上对应的是 core dump 和实时栈。

# 先把 100% 定义清楚

- top 里的 %CPU 是任务占用的 CPU 时间比例，不是“整机跑了多少”。在 SMP 机器上，如果不开线程模式，多线程进程的 %CPU 可以超过 100%。
- 单核 100% 和多核 100% 是两件事。一个线程死循环能让一核跑满；在八核机器上，八个线程各跑满一核，进程的 %CPU 可以到 800%。
- top 里按 `H` 打开线程视图后，显示的是 LWP，也就是内核线程 ID（TID），不是 pthread_t。pthread_t 是线程库的句柄，两者不能直接对照；perf、gdb 和 /proc 里的线程都用 TID。
- CPU 100% 和内存越界是两类现象。越界通常直接触发 SIGSEGV，程序会崩；本题强调不崩溃，排查重点在循环、自旋和事件空转。
- 容器里的 100% 可能只是把 cgroup 的 cpu.max 配额用满了，宿主机整体并不忙。
- 虚拟机的 st（steal）是 hypervisor 拿走的时间，进程并没有真正跑；st 高的时候，先怀疑宿主超卖。
- “没有崩溃”排除了几类情况：没有收到致命信号，没有生成 core，没有被 OOM killer 杀掉。剩下的通常是纯用户态循环，或者内核态的自旋和系统调用风暴。

# 第一步：定位到进程和线程

- 先看整机：`top` 或 `htop`，按 CPU 排序，记下 PID、%CPU、%MEM、STAT。
- 只看一个进程可以用 `top -p PID`，避免被其他进程干扰。
- 再看线程：`top -H -p PID`，或者在 top 里按 `H`。多线程程序里，通常只有一两个线程是热的。
- `ps -T -p PID` 和 `ps -L -p PID -o pid,tid,pcpu,stat,wchan:24,comm` 都能看到线程；`ps -T` 输出里的 SPID 就是 TID。
- `pidstat -t -p PID 1` 按秒刷新线程级数据，适合观察波动。
- `/proc/PID/status` 里有 Threads 和 VmRSS，`ls /proc/PID/task/` 能直接列出所有 TID，适合快速确认线程数。
- `/proc/PID/stat` 里的 utime 和 stime 是进程累计的用户态和内核态时间，单位是 clock tick，通常要除以 `sysconf(_SC_CLK_TCK)` 换成秒；同文件的 num_threads 是线程数，rss 是常驻页数。
- 每个线程在 `/proc/PID/task/TID/stat` 下也有一份同样的数据。
- `/proc/PID/schedstat` 的三个数分别是运行时间、在运行队列里等待的时间、时间片次数。运行时间高说明真的在算，等待时间高说明在排队。

```bash
# 找到吃 CPU 的进程
top -b -n1 -o %CPU | head -20
top -p <pid>

# 看进程内哪个线程在跑
top -H -p <pid>
ps -T -p <pid>
ps -L -p <pid> -o pid,tid,pcpu,stat,wchan:24,comm
pidstat -t -p <pid> 1

# 直接读内核记账
cat /proc/<pid>/status
ls /proc/<pid>/task/
cat /proc/<pid>/stat
cat /proc/<pid>/task/<tid>/stat
cat /proc/<pid>/schedstat
```

# 第二步：分清 CPU 时间的去向

top 的汇总行把 CPU 时间拆成几类，每一类对应的排查方向不同。

| 字段 | 含义 | 偏高时先看什么 |
| --- | --- | --- |
| us | 未调整优先级的用户态时间 | 业务代码计算、死循环、序列化、加解密 |
| sy | 内核态时间 | 系统调用次数、锁、内存分配、网络收发 |
| ni | 调整过优先级的用户态时间 | 低优先级后台任务是否抢占 |
| id | 空闲 | 空闲高但进程 100%，说明只占了一个核 |
| wa | 等待 IO 完成 | 磁盘、网络、NFS；这部分不是进程在算 |
| hi | 硬件中断 | 网卡、磁盘中断是否集中在一个核 |
| si | 软件中断 | 网络小包、定时器、RCU 回调 |
| st | 被 hypervisor 偷走的时间 | 宿主机是否超卖 |

- `vmstat 1` 看 us、sy、id、wa、st 的整体变化，同时看 r（运行队列）和 cs（上下文切换）。
- `mpstat -P ALL 1` 看每个核的分布，确认是单核打满还是所有核都忙。
- `pidstat -u -p PID 1` 看进程的 us/sy 比例。
- 如果 sy 明显高于 us，优先查系统调用；如果 wa 高，程序多半在等 IO，不能算 CPU 忙；如果 st 高，问题不在程序里。
- 容器里读 `/proc/PID/cgroup` 找到 cgroup 路径，再看 `cpu.stat` 的 usage_usec、nr_periods、nr_throttled、throttled_usec，以及 `cpu.max` 的配额。nr_throttled 持续增长说明进程被限流，而不是没有任务可跑。

```bash
vmstat 1
mpstat -P ALL 1
pidstat -u -p <pid> 1

cat /proc/<pid>/cgroup
cat /sys/fs/cgroup/<cgroup>/cpu.stat
cat /sys/fs/cgroup/<cgroup>/cpu.max
```

# 第三步：拿用户态现场

## perf 采样

- `perf top -p PID` 直接看实时热点函数，适合先判断“热在哪个模块”。
- `perf record -F 99 -g -p PID -- sleep 30` 采 30 秒，再 `perf report --stdio` 看调用链。
- `-g` 打开调用图。perf-record(1) 说用户态默认用帧指针（fp）展开；如果编译时省略了帧指针（-O2 常见），栈会是断的，这时改用 `--call-graph dwarf`，或者用 `-fno-omit-frame-pointer` 重新编译。
- `perf stat -p PID -- sleep 5` 看 IPC、cache-miss、分支预测失败、上下文切换。IPC 很低而 CPU 很忙，可能是内存访问或锁竞争。
- 权限方面，普通用户受 `kernel.perf_event_paranoid` 限制；要采别的进程或全系统，通常需要 root 或 CAP_PERFMON。
- 火焰图：`perf script` 输出后接 FlameGraph 的 `stackcollapse-perf.pl` 和 `flamegraph.pl`，得到 SVG。

```bash
perf top -p <pid>
perf record -F 99 -g -p <pid> -- sleep 30
perf report --stdio
perf stat -p <pid> -- sleep 5

perf script > out.perf
stackcollapse-perf.pl out.perf > out.folded
flamegraph.pl out.folded > out.svg
```

## gdb 和线程栈

- 不想交互时，用 batch 一次打完所有线程：`gdb -p PID -batch -ex 'set pagination off' -ex 'thread apply all bt'`。
- 线上优先 perf：它采样而不是停住进程；gdb attach 会暂停，适合需要看局部变量、或者 perf 权限或符号不可用时。
- 需要反复采样时，进入交互式 gdb。`gdb -p PID` 是附加到进程；`gdb attach PID` 不是 shell 命令，`attach` 是 gdb 内部的命令，进入 gdb 后再执行 `attach PID`。
- `info threads` 列出所有线程。最左边的编号是 gdb 的线程编号，紧跟着的才是系统 TID；`thread <编号>` 用的是 gdb 编号，不是 TID。
- 切到热点线程后连续执行几次 `bt` 或 `bt full`。栈顶固定在同一处，偏向死循环或自旋；栈在推进、函数不断变化，偏向真实计算。
- `bt full` 会打印局部变量，但 -O2 下常见 `<optimized out>`。perf 采样对局部变量不敏感，但内联和缺帧指针同样会影响调用链；想看局部变量则更依赖 `-g` 和优化等级。
- attach 期间进程会暂停，CPU 占用掉到 0 是正常的；排查完执行 `detach`，再 `quit`。不要用 `kill`，否则进程会直接退出。
- `gcore PID` 把现场保留成 core，之后慢慢分析；`eu-stack -p PID` 和 `pstack PID` 也能直接打栈。gcore 随 gdb 提供，eu-stack 来自 elfutils，pstack 是 gdb 的包装脚本，部分发行版需要额外安装。
- 看栈时抓几个特征：同一个函数反复出现在栈顶，通常是死循环；栈里出现 `__lll_lock_wait`、`futex`，是锁等待或锁竞争；栈里是 `epoll_wait`、`accept`、`read`，说明在系统调用附近打转。
- attach 需要 ptrace 权限。在常见的 `ptrace_scope=1` 下，普通用户通常只能 attach 自己的子进程。
- gdb、perf、strace 不要同时挂在同一个进程上，互相干扰，也会改变时序；一次只用一个工具。
- 没有符号时栈里只有地址，排查前要保留带 `-g` 的二进制和 debug symbol。

```bash
# 非交互，一次打完
gdb -p <pid> -batch \
    -ex 'set pagination off' \
    -ex 'thread apply all bt'

# 交互式，反复看栈
gdb -p <pid>
(gdb) set pagination off
(gdb) info threads
(gdb) thread 3
(gdb) bt
(gdb) bt full
(gdb) detach
(gdb) quit

gcore <pid>
eu-stack -p <pid>
pstack <pid>
```

## 内核栈和调度信息

- `/proc/PID/wchan` 显示线程睡眠在内核的哪个函数；正在运行的线程可能显示 0。
- `/proc/PID/task/TID/stack` 是内核栈，需要 root，也要内核打开栈回溯支持。
- `/proc/PID/status` 里的 voluntary_ctxt_switches 和 nonvoluntary_ctxt_switches 能看出主动睡眠和被抢占的次数。两个数都很高时，锁竞争或调度频繁的可能性更大。

# 第四步：看系统调用和内核路径

- `strace -c -p PID` 统计每个系统调用的次数、时间和错误，先看谁在刷屏。
- `strace -f -tt -T -p PID` 跟踪子线程和子进程，带时间戳和单次耗时。
- `perf trace -p PID` 是 strace 思路的 perf 版本，开销通常更低。
- `ltrace -c -p PID` 看库函数调用，适合怀疑某个库内部重试或轮询的场景。
- `bpftrace` 可以在不停进程的情况下采样用户栈：

```bash
bpftrace -e 'profile:hz:99 /pid == 1234/ { @[ustack] = count(); }'
```

- strace 的读法：CPU 满但几乎看不到 syscall，基本是纯用户态循环；如果 epoll_wait、accept、read 反复返回，查事件触发和 fd 状态。`strace -c` 的次数要和请求量对照，不能只看绝对值。
- 系统调用层面的典型空转有几类：
  - `accept` 返回 EMFILE 后没有退避，监听 fd 一直可读，循环立刻再次 accept。
  - `epoll_wait` 因为 EPOLLHUP 或 EPOLLERR 立即返回，fd 没有关闭，事件一直就绪。
  - 非阻塞 `read` 返回 EAGAIN 后没有等待，直接回到循环。
  - `nanosleep` 被信号打断后立即重试，定时器精度设得过高。
  - 日志或监控每处理一条请求就同步写一次，sys 时间被写调用吃掉。

```cpp
// 错误示例：ET 模式只读一次，且没有处理 EPOLLHUP/EPOLLERR
for (;;) {
    int n = epoll_wait(epfd, events, 64, -1);
    for (int i = 0; i < n; ++i) {
        if (events[i].events & EPOLLIN) {
            char buf[4096];
            read(events[i].data.fd, buf, sizeof(buf)); // 没有循环读到 EAGAIN
        }
        // EPOLLHUP 和 EPOLLERR 没有处理，fd 也没有关闭
    }
}
```

- ET 模式下必须循环读到 EAGAIN；对端关闭后，fd 上的挂断事件会持续上报，不关闭就会一直空转。

# 第五步：常见根因对照

| 现象 | 现场特征 | 常见根因 | 处理方向 |
| --- | --- | --- | --- |
| 单线程 100%，栈顶固定 | 同一函数反复采样到 | 死循环、状态机没有出口、重试没有退避 | 加日志和断言，检查循环条件与退出路径 |
| 死递归或深递归 | 栈里大量重复帧 | 递归没有终止条件、嵌套解析没有深度上限 | 加深度上限，改迭代 |
| 停止标志未同步 | 循环读普通 bool，栈顶在循环 | 数据竞争，编译器把读提升到寄存器 | 用 std::atomic 或 mutex/condition_variable |
| 消息或定时器风暴 | 回调反复执行，epoll_wait/read/write 高频 | 队列无背压、定时器重叠 | 限流、合并定时器、背压 |
| 多线程 100%，栈在 futex | `__lll_lock_wait`、`futex` | 锁竞争、临界区过大、自旋锁 | 缩小临界区，分片锁，读写分离 |
| CPU 高但吞吐不涨 | epoll_wait 立即返回 | EPOLLHUP/ERR、fd 泄漏、ET 未读完 | 处理错误事件，关闭 fd，读到 EAGAIN |
| 大量 accept 失败 | EMFILE、ENFILE | 文件描述符耗尽 | 提高 limit，预留 fd，失败后退避 |
| 定时器线程忙 | nanosleep 高频 | 定时精度过高、超时重试 | 合并定时器，时间轮，指数退避 |
| sy 高 | 系统调用次数暴涨 | 日志、序列化、小包 IO | 批量写，缓冲，减少调用 |
| si 高 | 软中断集中 | 网络小包、单队列网卡 | 多队列，RSS（Receive Side Scaling），批处理 |
| 线程数持续上涨 | num_threads 增长 | 每请求一线程、线程池无上限 | 固定池，队列，背压 |
| 整机都忙 | 其他进程也高 | 监控 agent、cron 重叠、备份、挖矿 | 看 top 的其他进程，查定时任务 |
| 数字对不上 | 容器或虚拟机 | cgroup 配额、steal、Irix/Solaris 模式 | 换算口径，查宿主 |

- 这张表只能给方向，最终还是要落到栈和系统调用上。采样到同一行代码后，再回到源码检查循环条件和错误处理。
- 死循环不一定是 `while (true)`：`for` 条件恒真、状态机没有出口、回调重入、事件循环空转都可能。
- 死递归不是永久不崩：栈还在增长时进程看起来只是 CPU 高，继续跑最终会触发栈溢出；观察时间短不代表安全。
- 共享停止标志是最容易写错的一类。普通 bool 被多个线程读写属于数据竞争，编译器可能把读提升到寄存器，循环看不到修改；`volatile` 不是同步手段，应该用 `std::atomic<bool>`，或者用 mutex/condition_variable 等待。

```cpp
// 错误：普通 bool 被多个线程读写，属于数据竞争
bool stop = false;

void worker() {
    while (!stop) {
        // 空转
    }
}

// 修复：改用原子变量；volatile 不提供同步
std::atomic<bool> stop_atomic{false};
```

- pthread_mutex 抢不到时会进入 futex 等待，通常不再占 CPU；spinlock 会一直自旋。std::mutex 在进入 futex 前可能短暂自旋，不能简单说完全不占 CPU。持续 100% 且栈在 futex 或原子变量自旋，才更像锁竞争。

# 第六步：修复和验证

- 先做可复现的最小输入。死循环往往依赖某个边界条件，能稳定复现再改。
- 在循环入口加计数日志或埋点，观察迭代速度；日志要限速，避免把 CPU 问题变成 IO 问题。
- 修完用同一份压测对比：`perf stat` 的 cycles、instructions、IPC、context-switches，`pidstat` 的 CPU 曲线，`strace -c` 的调用次数。
- 观察要覆盖长时间运行，短时间不涨不代表没问题；定时器、重连、缓存淘汰这些问题经常在几小时后才出现。
- 监控上至少放进程 CPU、线程 CPU、系统调用速率、运行队列长度、cgroup throttling 五项。只放一个进程 CPU，无法区分用户态、内核态和限流。

# 容器和虚拟化

- 容器里的 `/proc` 默认反映宿主视角，`top` 看到的核数和 load 不一定是容器配额。装了 lxcfs 才会按容器视图显示。
- cgroup v2 的 `cpu.max` 是配额，`cpu.stat` 里的 nr_throttled 和 throttled_usec 是限流次数和时长。进程被限流时，CPU 可能停在配额附近，看起来像 100%。
- `systemd-cgtop`、`docker stats` 可以从 cgroup 维度看，不必进容器。
- 虚拟机的 st 高，说明宿主把 CPU 时间拿走了；这种 100% 不是程序能修的，要找宿主或云平台侧。

# Android 上的对应工具

- `adb shell top -H -p PID` 看线程级 CPU。
- `adb shell dumpsys cpuinfo` 看各进程的 CPU 占比。
- `adb shell debuggerd -b PID` 打印目标进程所有线程的栈，不要求进程已经崩溃。
- tombstone 是 native crash 的现场文件，由 debuggerd 或 crash_dump 在崩溃时写到 `/data/tombstones/`，内容包括所有线程的栈、内存映射和打开的文件描述符。CPU 100% 但没有崩溃时不会产生 tombstone。
- `simpleperf record -p PID --duration 10 -g` 采样，`simpleperf report -g` 看调用图；Android Studio 的 CPU Profiler 对 native 采样也是基于它。
- Perfetto 或 atrace 用来看系统级调度、锁和 IO，不只看单个进程。
- 如果 strace 或 lldb 正 attach 在进程上，crash dumper 可能无法再 attach，tombstone 可能不生成。排查崩溃和排查 CPU 不要同时挂多个调试器。

# 工具速查

| 目的 | 命令 | 备注 |
| --- | --- | --- |
| 找进程 | `top -b -n1 -o %CPU` | 先看全局 |
| 只看一个进程 | `top -p PID` | 排除其他进程干扰 |
| 找线程 | `top -H -p PID` | 或 ps -L |
| 线程列表 | `ps -T -p PID` | SPID 就是 TID |
| 线程级采样 | `pidstat -t -p PID 1` | sysstat 包 |
| 每核分布 | `mpstat -P ALL 1` | 区分单核和多核 |
| 实时热点 | `perf top -p PID` | 需要符号和权限 |
| 采样调用链 | `perf record -F 99 -g -p PID -- sleep 30` | 帧指针缺失时用 dwarf |
| 线程栈 | `gdb -p PID -batch -ex 'thread apply all bt'` | attach 会短暂停顿 |
| 交互式栈 | `gdb -p PID`，再执行 `info threads`、`bt` | 反复采样看栈是否变化 |
| 保留现场 | `gcore PID` | 生成 core |
| 系统调用统计 | `strace -c -p PID` | 开销较大 |
| 系统调用明细 | `strace -f -tt -T -p PID` | 看单次耗时 |
| 低开销跟踪 | `perf trace -p PID` | perf 版本 |
| 内核栈 | `cat /proc/PID/task/TID/stack` | 需要 root |
| 调度统计 | `cat /proc/PID/schedstat` | 运行和等待时间 |
| 用户栈采样 | `bpftrace -e 'profile:hz:99 /pid == PID/ { @[ustack] = count(); }'` | 需要权限和符号 |

# 参考

- [top(1) — Linux manual page](https://man7.org/linux/man-pages/man1/top.1.html)
- [proc_pid_stat(5) — Linux manual page](https://man7.org/linux/man-pages/man5/proc_pid_stat.5.html)
- [proc_pid_status(5) — Linux manual page](https://man7.org/linux/man-pages/man5/proc_pid_status.5.html)
- [GDB User Manual](https://sourceware.org/gdb/current/onlinedocs/gdb.html/)
- [perf-record(1) — Linux manual page](https://man7.org/linux/man-pages/man1/perf-record.1.html)
- [perf-security — Linux kernel documentation](https://docs.kernel.org/admin-guide/perf-security.html)
- [Yama — Linux kernel documentation](https://docs.kernel.org/admin-guide/LSM/Yama.html)
- [strace(1) — Linux manual page](https://man7.org/linux/man-pages/man1/strace.1.html)
- [epoll(7) — Linux manual page](https://man7.org/linux/man-pages/man7/epoll.7.html)
- [Control Group v2 — Linux kernel documentation](https://docs.kernel.org/admin-guide/cgroup-v2.html)
- [Debug native Android platform code — Android Open Source Project](https://source.android.com/docs/core/tests/debug)
- [Simpleperf — Android NDK](https://developer.android.com/ndk/guides/simpleperf)
- [FlameGraph — Brendan Gregg](https://github.com/brendangregg/FlameGraph)
