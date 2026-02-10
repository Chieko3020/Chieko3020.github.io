---
title: Redis部分源码解析
date: 2026-01-21 13:16:21
tags: "你知道吗"
categories: "只属于你的小妙招 <br> 看似有用实则没用"
---

# Redis = Ready + Start——如何开始

- 阅读源码绝非易事，整个目录包含上百个代码文件，每个文件动辄上千行代码，如果没有比较好的阅读方法和学习技巧容易无从下手
- 阅读源码前应当先对全局的源码结构有所了解，先忽略功能的实现细节，对整体有个初步的认识
  - 而不是刚上来就盯着某个文件看，被各种定义声明，函数调用跳转，复杂实现逻辑的代码淹没
  - 这就像是刚到一个新城市,上来应该先看地图而不是一头扎进某条巷子里，容易迷路
- 阅读源码时先梳理出代码的主线逻辑，再详细学习分支细节，依照代码结构和功能分块，可以不必对某个实现完全通透，在细节中迷路时暂时先跳过，对关键的代码文件中的运行逻辑清楚即可，后续再阅读相关细节内容
  - 比如真在巷子里迷路了，这时候应该返回主干道，而不是接着乱转
  - 又或者说跟着各种函数调用逻辑看某处细节，在代码中跳转还各种看不懂，应该暂时先放下看下一步的逻辑
    - 因为函数嵌套调用过多过深的结果——栈溢出，电脑有OS兜底但是人脑没有，OS会出手kill进程做熔断，对于人来说总不能真“烧脑”
- 阅读源码能带来什么：学习Redis中某些优秀的设计，学习编写C代码或者某个项目的编码规范，加深理解Redis的实现原理能够为排查问题提升性能时提供解决思路

## Redis-5.0.8 主要结构

- Redis 源码从功能上大致分为以下模块：
  - 数据结构：数据结构内存优化，高性能数据结构设计
  - 高并发网络通信：事件驱动框架，IO复用
  - 内存管理：惰性删除，置换算法与优化
  - 线程模型：线程通信，异步线程任务
  - 主从复制：数据同步，网络容错
  - 切片集群：谣言协议，数据分布
  - 日志记录

- Redis 源码从目录结构上看大致分为以下部分：
  - deps: 主要包含了Redis依赖的第三方代码库，独立于Redis服务器开发演进的代码，还有lua脚本
    - C的Redis客户端hiredis
    - 内存分配器jemalloc
    - 用于替代readline的linenoise
    - lua脚本

  - src：最重要的部分，包含Redis具体功能模块的代码文件
    - modules示例代码
    - **数据结构**：sds/adlist/ziplist/quicklist/intset/zipmap/dict/hyperloglog/stream等
      - 主要还是字符串，哈希表，列表，集合
    - 键值对CRUD接口：db.c
    - **内存管理**：内存分配zmalloc,内存回收expire/lazyfree，置换算法evict
    - **网络通信**：服务器主控server,事件驱动ae/ae_epoll/ae_evport/ae_kqueue/ae_select, TCP通信anet，客户端设计networking
      - 主要关注事件驱动与TCP通信
    - 高可用：两大日志aof/rdb和对应的checkout支持redis-check-aof/rdb，主从replication/sentinel，集群cluster
    - 其他辅助功能：操作延迟监控latency，慢执行分析slowlog，性能评估redis-benchmark

  - test：TCL单元测试与模块测试
    - unit单元测试
    - cluster集群测试
    - sentinel哨兵测试
    - integration主从测试
    - asserts/helpers/modules/support测试支撑

  - utils：辅助工具
    - create-cluster创建集群工具
    - hashtable重哈希演示
    - hyperloglog误差率演示
    - lru算法演示
  - 配置文件 redis.conf & sentinel.conf
- 这里只对数据结构，内存管理，网络通信三大模块相关的部分源码分析

# Redis 的数据结构

## 设计理念

- Redis 是内存数据库，所以，高效使用内存对 Redis 的实现来说非常重要。Redis 主要是通过两大方面的技术来提升内存使用效率的：
  - 1. 数据结构的优化设计与使用
  - 2. 内存数据按一定规则淘汰
- 其中，数据结构的设计和使用必须是内存友好的，也就是效率高的；而内存淘汰则是用置换算法
- 对于实现数据结构来说，如果想要节省内存，一是使用连续的内存空间，避免内存碎片开销；二是针对不同长度的数据，采用不同大小的元数据，以避免使用统一大小的元数据，造成内存空间的浪费。
- 在数据访问方面，使用共享对象其实可以避免重复创建冗余的数据，从而也可以有效地节省内存空间。不过，共享对象主要适用于只读场景，如果一个字符串被反复地修改，就无法被多个请求共享访问了。

## 基本数据对象

- redisObject 结构体是在 server.h 文件中定义的，主要功能是用来保存键值对中的值。这个结构一共定义了 4 个元数据和一个指针，一共**占16字节**：
  - type、encoding 和 lru 三个变量后面都有一个冒号，并紧跟着一个数值，表示该元数据占用的比特数。这种定义方法可以用来有效地节省内存开销。
  - 也就是我们所说的**位域**:
    - C 语言的位域（bit-field）是一种特殊的结构体成员，允许我们按位对成员进行定义，指定其占用的位数。
    - 定义位域时，可以指定成员的位域宽度，即成员所占用的位数。
    - 一个位域存储在同一个字节中，如一个字节所剩空间不够存放另一位域时，则会从下一单元起存放该位域。也可以占位有意使某位域从下一单元开始
    - 位域的宽度不能超过其数据类型的大小，因为位域必须适应所使用的整数类型。
    - 位域的数据类型可以是 int、unsigned int、signed int 等整数类型，也可以是枚举类型。
    - 位域可以单独使用，也可以与其他成员一起组成结构体。
    - 位域的访问是通过点运算符（.）来实现的，与普通的结构体成员访问方式相同。

```c
// server.h 第 615-623 行
typedef struct redisObject {
    unsigned type:4; //redisObject的数据类型，4个bits
    unsigned encoding:4; //redisObject的编码类型，4个bits
    unsigned lru:LRU_BITS;  //redisObject的LRU时间，LRU_BITS宏定义默认为24个bits
    int refcount; //redisObject的引用计数，4个字节
    void *ptr; //全局键值对数据库中指向值的指针，8个字节
} robj;

```

## sds

- sds是redis的基本数据结构之一，用于存储字符串和整型数据，能够兼容C的标准字符串处理函数，还能解决C的字符串的二进制读取问题，同时也利用合理的结构体设计与内存对齐优化来最大限度地节省内存空间占用
- 对于 Redis 来说，键值对中的键是字符串，值有时也是字符串。例如，执行下列命令时, 这些都是字符串：

```sh
SET user:id:100 {“name”: “zhangsan”, “gender”: “M”,“city”:"beijing"}
```

- 此外，Redis 实例和客户端交互的命令和数据，也都是用字符串表示的。
- 既然字符串这么重要，redis在实现它的时候就得从三个方面下手：
  - 1. 字符串的常见操作，比如C库的strcpy,strlen,strcmp,memcpy这些拷贝，长度，比较，这种基本的字符串操作
  - 2. 二进制读取问题，C的字符串一直有个不好的地方，使用 `\0` 作为字符串结尾标志，如果字符串内容有这个，读取会被截断
  - 3. 能够实现动态分配内存（比如扩容操作）的同时节省内存占用

### C字符串不可以直接用吗？

- C字符串实现实际上是连续空间的字符数组，并且用`\0`来结束
  - 比如strlen就是通过边遍历边计数直到`\0`实现的
- 这在存储某些内容包含`\0`的字符串（比如二进制数据）会出现问题，也就是所谓的二进制安全问题
- 如果字符串的内容本身就有`\0`，那么读取或处理时会被截断:

```c
#include <stdio.h>
#include <string.h>

int main()
{
    char *a = "redis\0";
    char b[] = {'r', 'e', '\0','d', 'i', 's', '\0'}; 
    // redis re
    // 5 2
    printf("%s %s\n", a, b);
    printf("%zu %zu\n", strlen(a), strlen(b));
    return 0;
}

```

- 还有一个问题，操作字符串时的复杂度（遍历和扩容）比较高
  - 比如strlen需要遍历获取长度，要是没有`\0`还会引发未定义行为
  - 比如strcat需要遍历两个字符串，而且目标串需要足够的剩余空间来容纳源串
- 综上 ，C的字符串设计不满足Redis的高性能要求

### sds 设计

- 首先，redis是c写的，设计属于redis自己的字符串时如果能发挥c的优势（比如能够复用c库函数）自然能省下很多功夫，所以底层也是使用**字符数组**
  - 1. SDS 结构里包含了一个**字符数组 buf[]**，用来保存实际数据。
  - 2. SDS 结构里还包含了三个元数据，可以叫它们**SDS头部**，分别是：
    - 字符数组现有长度 len
    - 分配给字符数组的空间长度 alloc，不包括`\0`
    - SDS 类型 flags
  - 其中，len 和 alloc 能够很方便地获取字符串的长度和可用空间（aviliable = alloc - len），这样就不用去遍历获取长度
  - Redis 给 len 和 alloc 这两个元数据定义了多种数据类型，进而可以用来表示**不同类型的 SDS**。
- 大致的定义是这样的：

```c
struct sds_header {
    uint len;         // 实际使用长度
    uint alloc;       // 分配的空间大小
    unsigned char flags; // 类型标记
};

```

#### flags 与 sds 类型

- 如果只使用 len, alloc, buf，似乎已经能实现一个效率比原生字符串好的自定义字符串了，那么考虑以下问题：
  - 以上定义的sds头部，暂时不考虑 flags, len 和 alloc 都是uint类型，它们一共占用8字节。假设存储的字符串只有4字节，在这个设计中字符串的头部占用的空间比字符串本身还大，显然不够好
    - 一种方案是不使用uint，具体类型具体分析，比如小点的字符串使用1字节来存储len和alloc，这样就是2字节，大点的就用uint
    - 但是该怎么区分存储的字符串是小型的还是大型的呢，而且假设存储的字符串是1字节，头部占用2字节，问题还是没解决
- 为了进一步优化，redis引入了5种不同类型的sds分别存储不同大小的字符串：
  - 1. redis 使用 1字节的 flags 表示类型，其中**低3位表示长度**，因为要表示5个类型需要3 bit。高5位则是预留位。
  - 2. redis 确实是使用不同大小的数据类型来存储 len 和 alloc 的，一共划分为五种，_下划线后面的数字表示该类型的sds中，len占用的位数
    - 比如sdshdr8表示len占用8位，那么该类型最大存储2^8也就是256字节；宏定义的整数表示类型的编号，只要3 bit就能表示这5种类型：
  - 3. sds使用`__attribute__ ((__packed__))`：内存对齐机制会对结构体进行padding，使用这个宏来修饰，内存对齐的对齐边界就是1字节了，也就是不做对齐，不会加入padding填充字节，进一步节省空间
  - 4. 另外，**sds指针指向sds结构体中的buf数组**，而不是平常那样指向sds结构体头部，实际操作中会根据具体类型加上hdrlen
    - 比如sdshdr8的头部占用len+alloc+flag=17字节，那么hdrlen是17，sds的值就是在内存分配函数返回的**指针sh加上hdrlen指针偏移量**。

```c
// sds.h 第 76-80 行
#define SDS_TYPE_5  0
#define SDS_TYPE_8  1
#define SDS_TYPE_16 2
#define SDS_TYPE_32 3
#define SDS_TYPE_64 4

```

- sds的具体定义如下：

```c
// sds.h 第 43-68 行
typedef char *sds;
struct __attribute__ ((__packed__)) sdshdr5 {
    unsigned char flags;  // 3 bit存类型，5 bit存长度
    char buf[];
};

struct __attribute__ ((__packed__)) sdshdr8 {
    uint8_t len;         // 实际使用长度
    uint8_t alloc;       // 分配的空间大小
    unsigned char flags; // 类型标记
    char buf[];
};
// sdshdr16, sdshdr32, sdshdr64 类似

```

#### sdshdr5 与 嵌入式字符串

##### 被弃用的sdshdr5

- sdshdr5 明确**不再使用**，这里说一下它和其他四个的区别：
  - sdshdr5 **没有len 和 alloc**, 该类型用来存储32字节内的字符串，它**使用flags的高5位来表示len**。
    - 没有给它定义alloc是因为这种类型存储的字符串够小了，不必要进行内存预分配，如果需要扩容会向上升级类型。
- 剩下更大的类型，由于大于32字节的字符串，5 bit已经不够表示了，所以另外使用不同大小的uint来存储len和alloc。此时flags的低3位表示类型，高5位就留空。
- sdshdr5在Redis中的使用被弃用的原因主要是因为其在处理长度小于32位的字符串时的性能问题。sdshdr5的结构设计使得在字符串长度小于32位时，无法有效利用内存，导致在**动态扩容时需要重新分配内存**并进行数据复制迁移，这会显著影响性能。
- 此外，sdshdr5的结构在处理字符串长度时也存在一些限制，例如在sdshdr5类型中，字符串长度的高五位字段仅用于存储字符串长度，而低三位用于存储类型，这使得sdshdr5在处理字符串时不够灵活。因此，Redis选择了使用sdshdr8来存储长度小于32位的字符串，以提高性能和灵活性

##### sdshdr5的替代品

- sdshdr5的替代方案：Redis在存储小于32字节的键值对的时候，**键使用sdshdr5，值使用嵌入式字符串，并且它的类型是sdshdr8**。关于这点稍后说明。
- 嵌入式字符串：在创建一个字符串时，Redis 会调用 createStringObject 函数，来创建相应的 redisObject，而这个 redisObject 中的 ptr 指向 SDS 数据结构。createStringObject 函数会根据要创建的字符串的长度，决定具体调用哪个函数来完成创建：

```c
// object.c 第 118-124 行
#define OBJ_ENCODING_EMBSTR_SIZE_LIMIT 44
robj *createStringObject(const char *ptr, size_t len) {
    //创建嵌入式字符串，字符串长度小于等于44字节
    if (len <= OBJ_ENCODING_EMBSTR_SIZE_LIMIT)
        return createEmbeddedStringObject(ptr,len);
    //创建普通字符串，字符串长度大于44字节
    else
        return createRawStringObject(ptr,len);
}

```

- 对于普通字符串，createRawStringObject函数会调用createObject函数。
- createObject 函数主要是用来创建 Redis 的数据对象的。因为 Redis 的数据对象有很多类型，比如 String、List、Hash 等，所以在 createObject 函数的两个参数中，有一个就是用来表示所要创建的数据对象类型，而另一个是指向数据对象的指针。
- createStringObject向其传递 OBJ_STRING 类型和创建sds方法sdsnewlen返回的sds指针，而createObject函数为redisObject的ptr传入sds指针，以及设置其他值。这意味着创建普通字符串的时候，需要先申请一次redisObject内存，再申请一次sds内存，而我们知道在堆上申请的内存不一定连续，这样不仅增加**内存分配次数**，还会有**内存碎片**
- 为了解决这个问题，Redis 提出了嵌入式字符串。

##### 嵌入式字符串 与 sdshdr5类型的key

- Redis在字符串的创建中使用层级编码策略，对于**小于44字节的字符串**，使用嵌入式字符串。
- createEmbeddedStringObject 函数逻辑：
  - 1. createEmbeddedStringObject 函数传入指向字符串的指针以及它的长度，会分配一块连续的内存空间，这块内存空间的大小等于 redisObject 结构体的大小、SDS 结构头 sdshdr8 的大小和字符串大小的**总和**，并且再加上 1 字节 `\0`。
  - 2. 创建 SDS 结构的指针 sh，并把 sh 指向这块连续空间中 **SDS 结构头部**所在的位置，而不是像普通字符串一样指向sds结构体中的buf数组
  - 3. 把 redisObject 中的成员，指针 ptr，**指向 SDS 结构中的buf字符数组**。
  - 4. 复制字符串内容到ptr指向的buf数组，并添加`\0`
- 为什么是44字节：首先，经过createEmbeddedStringObject创建的嵌入式字符串由redisObject头部+sdshdr8头部(len+alloc+flag)+buf数组+`\0`组成，而redisObject 占16字节，sds头部占3字节，末尾结束符1字节，这样就是20；而Redis在进行内存分配时不使用C原生的malloc，而是使用jemalloc内存池并将其方法封装为zmalloc函数，而内存池的**最小分配单位是64字节**，那么为了满足这个要求，buf数组存储的字符串大小自然就是64 - 20 = 44了。
- 键类型为sdshdr5的小型字符串：Redis在存储小于32字节的键值对的时候，**键使用sdshdr5，值使用嵌入式字符串，并且它的类型是sdshdr8**。嵌入式字符串类型的值字符串已经说明，对于键类型：
  - 实际上键和值字符串创建的时候都是redisObject类型的嵌入式字符串，但在调用dictAdd函数添加到哈希表之前的行为不同
  - 对于键字符串，db.c在调用db.add方法时会复制一次给sds类型，使用sdsdup函数并传入指向的字符串，该函数调用sdsnewlen函数根据长度创建一个新字符串，内部**对于小于32字节且不为空的字符串使用sdshdr5**, 对于小于32字节但为空的字符串提升为sdshdr8。
  - 对于值字符串，没有这样的类型转换
  - 最终调用dictAdd时，键的robj底层是sdshdr5,而值的robj底层是sdshdr8
    - 可以使用gdb调试打印对应的二进制值并查看flags低3位类型
- 综上，对于键字符串来说有两条约束分界线，小于32字节的键使用sdshdr5, 32和44之间的键使用嵌入式字符串，更大的就走普通sds；对于值字符串来说就只有小于44字节的嵌入式字符串和大于44的普通sds的区别了

### sds 方法

- 这里分析sds的创建，释放，扩容策，拼接，复制，覆盖，扩容填充零几个函数。

#### 创建sds

- 使用sdsnewlen函数来创建sds。它的实现是这样的：
  - 1. 传入初始化sds字符串的值init，以及它的长度
  - 2. 根据长度选择类型，长度 < 32 字节且非空使用sdshdr5, 长度 < 32 字节但为空使用sdshdr8
  - 3. 调用s_malloc分配内存,大小是头部长度+字符串长度+1，因为还有个`\0`
    - s_malloc 宏定义值zmalloc，后者是内存池jemalloc的内存分配方法的封装
  - 4. 根据头部长度更改sds指针，指向buf数组
  - 5. 设置好len和alloc
  - 6. 调用c函数memcpy拷贝init到sds，并且加上`\0`,最后返回sds

```c
// sds.c 第 89-145 行
sds   sdsnewlen(const void *init, size_t initlen) {
    void *sh;
    sds s;
    // 根据长度选择类型
    char type = sdsReqType(initlen);
    /* Empty strings are usually created in order to append. Use type 8
     * since type 5 is not good at this. */
    // 如果长度为0，则使用sdshdr8
    if (type == SDS_TYPE_5 && initlen == 0) type = SDS_TYPE_8;
    int hdrlen = sdsHdrSize(type);
    unsigned char *fp; /* flags pointer. */
    // 分配空间 hrelen结构体的大小
    sh = s_malloc(hdrlen+initlen+1);
    if (init==SDS_NOINIT)
        init = NULL;
    else if (!init)
        // 初始化sh
        memset(sh, 0, hdrlen+initlen+1);
    if (sh == NULL) return NULL;
    s = (char*)sh+hdrlen;
    fp = ((unsigned char*)s)-1;
    switch(type) {
        case SDS_TYPE_5: {
            *fp = type | (initlen << SDS_TYPE_BITS);
            break;
        }
        case SDS_TYPE_8: {
            SDS_HDR_VAR(8,s);
            sh->len = initlen;
            sh->alloc = initlen;
            *fp = type;
            break;
        }
        case SDS_TYPE_16: {
            SDS_HDR_VAR(16,s);
            sh->len = initlen;
            sh->alloc = initlen;
            *fp = type;
            break;
        }
        case SDS_TYPE_32: {
            SDS_HDR_VAR(32,s);
            sh->len = initlen;
            sh->alloc = initlen;
            *fp = type;
            break;
        }
        case SDS_TYPE_64: {
            SDS_HDR_VAR(64,s);
            sh->len = initlen;
            sh->alloc = initlen;
            *fp = type;
            break;
        }
    }
    // 如果initlen不为0且init不为空，则复制init到s
    if (initlen && init)
        memcpy(s, init, initlen);
    s[initlen] = '\0';
    return s;
}

```

#### 释放

- 使用sdsfree函数释放一个sds,它的实现是这样的：
  - 1. 先对传入的sds做判空
  - 2. 然后指针使用下标-1定位到flags获取到长度
  - 3. 再用s进行指针与整数减法，减去长度偏移（初始化的反操作），定位到sds结构体头部
  - 4. 使用s_free释放sds
    - s_free 宏定义值zfree，后者是内存池jemalloc的内存释放方法的封装

```c
// sds.c 第 165-168 行
void sdsfree(sds s) {
    if (s == NULL) return;
    s_free((char*)s-sdsHdrSize(s[-1]));  // 关键：减去头部大小，释放整个分配块
}

```

#### 扩容

- 使用sdsMakeRoomFor对sds进行扩容，它的实现是这样的：
  - 1. 先获取当前可用空间判断是否需要扩容
  - 2. 如果需要，新长度小于1MB的2倍扩容，大于1MB的线性扩容增加1MB
  - 3. 再判断扩容后的新类型，如果不需要提升就原地扩容，需要则重新分配内存
  - 4. 最后更改 len 和 alloc
- 2倍扩容的好处：均摊复杂度为O(1)，n次操作，总分配次数为O(logn)

```c
// sds.c 第 204-249 行
sds sdsMakeRoomFor(sds s, size_t addlen) {
    void *sh, *newsh;
    size_t avail = sdsavail(s);
    size_t len, newlen;
    char type, oldtype = s[-1] & SDS_TYPE_MASK;
    int hdrlen;

    /* Return ASAP if there is enough space left. */
    // 判断是否需要扩容
    if (avail >= addlen) return s;

    len = sdslen(s);
    sh = (char*)s-sdsHdrSize(oldtype);
    newlen = (len+addlen);
    // 小于1MB 2倍 大于1MB 线性增加1MB
    if (newlen < SDS_MAX_PREALLOC)
        newlen *= 2;
    else
        newlen += SDS_MAX_PREALLOC;

    type = sdsReqType(newlen);

    /* Don't use type 5: the user is appending to the string and type 5 is
     * not able to remember empty space, so sdsMakeRoomFor() must be called
     * at every appending operation. */
    // 如果类型为sdshdr5，则升级为sdshdr8
    if (type == SDS_TYPE_5) type = SDS_TYPE_8;
    // 没有升级 原地s_realloc
    hdrlen = sdsHdrSize(type);
    if (oldtype==type) {
        newsh = s_realloc(sh, hdrlen+newlen+1);
        if (newsh == NULL) return NULL;
        s = (char*)newsh+hdrlen;
    } else {
        // 升级 重新分配空间 复制数据 释放旧空间 设置新空间 设置类型
        /* Since the header size changes, need to move the string forward,
         * and can't use realloc */
        newsh = s_malloc(hdrlen+newlen+1);
        if (newsh == NULL) return NULL;
        memcpy((char*)newsh+hdrlen, s, len+1);
        s_free(sh);
        s = (char*)newsh+hdrlen;
        s[-1] = type;
        sdssetlen(s, len);
    }
    sdssetalloc(s, newlen);
    return s;
}

```

#### 拼接

- 使用sdscatlen函数对sds进行拼接/追加，它的实现是这样的：
  - 1. 调用 sdsMakeRoomFor 检查是否需要扩容
  - 2. 复制并追加数据以及`\0`

```c
// sds.c 第 397-407 行
sds sdscatlen(sds s, const void *t, size_t len) {
    size_t curlen = sdslen(s);
    
    s = sdsMakeRoomFor(s, len);      // 1. 扩容
    if (s == NULL) return NULL;
    
    memcpy(s+curlen, t, len);        // 2. 复制数据到末尾
    sdssetlen(s, curlen+len);        // 3. 更新长度
    s[curlen+len] = '\0';            // 4. 添加\0
    return s;
}

```

#### 复制

- 使用sdsdup来**根据传入sds的长度**创建新字符串并返回，它的实现是这样的：
  - 直接调用sdslen计算参数的字符串长度给sdsnewlen，返回它创建的sds指针

```c
// sds.c 第 160-162 行
// 直接根据长度创建新串返回
sds sdsdup(const sds s) {
    return sdsnewlen(s, sdslen(s));
}
```

#### 覆盖

- 使用sdscpylen()将新字符串串t的内容覆盖到sds，它的实现是这样的：
  - 1. 先检查是否需要扩容
  - 2. 调用memcpy将新串的内容写到s中

```c
// sds.c 第 426-435 行
sds sdscpylen(sds s, const char *t, size_t len) {
    /* 如果分配空间不足，扩容 */
    if (sdsalloc(s) < len) {
        s = sdsMakeRoomFor(s, len-sdslen(s));
        if (s == NULL) return NULL;
    }
    
    memcpy(s, t, len);           // 覆盖原数据
    s[len] = '\0';
    sdssetlen(s, len);           // 直接设置新长度
    return s;
}

```

#### 扩容填充

- 使用sdsgrowzero对sds进行扩容并在新空间填满数字零，它的实现是这样的：
  - 1. 检查扩容的容量是否合法，比原来的小拒绝缩容
  - 2. 调用sdsMakeRoomFor进行扩容
  - 3. 调用c库memset在新空间填充数字零
- sdsgrowzero()调用sdsMakeRoomFor扩容，在此之上对空闲空间使用字符0填充

```c
// sds.c 第 379-390 行
sds sdsgrowzero(sds s, size_t len) {
    size_t curlen = sdslen(s);
    
    if (len <= curlen) return s;  // 不缩小
    
    s = sdsMakeRoomFor(s, len-curlen);
    if (s == NULL) return NULL;
    
    memset(s+curlen, 0, len-curlen+1);  // 零填充
    sdssetlen(s, len);
    return s;
}

```

## dict

- 我们知道，Redis 是个键值对数据库，既然使用键值对作为数据存储方式肯定离不开哈希表。Hash 表既是键值对中的一种值类型，同时，Redis 也使用一个全局 Hash 表来保存所有的键值对，从而既满足应用存取 Hash 结构数据需求，又能提供快速查询功能。
- 而哈希表的典型特征：
  - 1. 能够存储大量数据
  - 2. 能够O(1)访存数据
- 针对以上特征，很容易地想到数组与索引法。Redis 使用数组作为哈希表底层数据结构来存储hash项，并且把他们封装在dict结构体中。
- 而设计哈希表应该解决以下问题：
  - 1. 随数据量增加造成的哈希冲突：在用 Hash 函数把键映射到 Hash 表空间时，不可避免地会出现不同的键被映射到数组的同一个位置上。如果同一个位置只能保存一个键值对，就会导致 Hash 表保存的数据非常有限，这就是我们常说的哈希冲突
  - 2. 随数据量增加的哈希扩容的rehash 操作开销。rehash指的是对原有键值对重新计算哈希值并索引到一个扩容后的新哈希表，在大量数据需要迁移的情况下容易成为性能瓶颈

### dict 设计

- Redis 使用数组作为哈希表底层数据结构来存储hash项，并且把他们封装在dict结构体中,使用**链式哈希**来解决哈希冲突，使用**渐进式重哈希**来解决重哈希计算开销。
- 在 dict.h 文件中，Hash 表被定义为一个二维数组（dictEntry **table），这个数组的每个元素（也就是哈希桶）是一个指向哈希节点（dictEntry）的指针。而哈希节点之间彼此通过指针配合头插法连接，形成一个单链表。

```c
// dict.h 第 47-82 行
/* 单个哈希表 */
typedef struct dictht {
    dictEntry **table;      // 哈希表数组（指针数组）
    unsigned long size;     // 表大小（总bucket数）
    unsigned long sizemask; // size-1，用于快速取模：hasdidx = hash % size <=> hash & sizemask, 并且size是2的幂次
    unsigned long used;     // 已使用的entry数
} dictht;
/* 哈希节点 */
typedef struct dictEntry {
    void *key;           // 键指针
    union {
        void *val;       // 值指针
        uint64_t u64;    // 或者是64位无符号整数
        int64_t s64;     // 或者是64位有符号整数
        double d;        // 或者是浮点数
    } v;
    struct dictEntry *next;  // 链表指针，用于处理碰撞
} dictEntry;
/* 完整的字典（包含两个哈希表） */
typedef struct dict {
    dictType *type;         // 类型定义（函数指针）
    void *privdata;         // 私有数据
    dictht ht[2];           // 两个哈希表！（用于渐进式rehash）
    long rehashidx;         // rehash进度索引，-1表示未进行rehash
    unsigned long iterators; // 正在进行的迭代器数量
} dict;
/* 哈希表类型（函数指针集合） */
typedef struct dictType {
    uint64_t (*hashFunction)(const void *key);        // 哈希函数
    void *(*keyDup)(void *privdata, const void *key); // key复制
    void *(*valDup)(void *privdata, const void *obj); // val复制
    int (*keyCompare)(void *privdata, const void *key1, const void *key2); // key比较
    void (*keyDestructor)(void *privdata, void *key); // key析构
    void (*valDestructor)(void *privdata, void *obj); // val析构
} dictType;

```

- 在哈希表dictht中，整个结构体一共32字节：
  - 1. table是指向实际存储哈希项的二维数组的指针
  - 2. size表示哈希表的总大小
  - 3. used表示当前哈希表存储的条目数量
  - 4. sizemask是一个掩码，其值是size-1
    - sizemask: 由于在Redis中，哈希表的大小始终是2的整数幂（这是由扩容机制决定的），在这个情况下，要对哈希值取模的操作 hash % size = hash_idx得到哈希索引，等价于位运算 hash & sizemask，能够优化计算哈希索引的速度，其实就是利用了计算机的取余操作优化

- 在哈希表项（哈希节点）dictEntry中，存储着键值对：
  - 1. key是指向键的指针
  - 2. 值v则是个**联合体**，能够在不同场景下进行存储空间优化：
    - 我们知道，如果也使用指针来指向值v的话，不论原始值占多少字节，用上了指针就意味着在64位机上一定占8字节
    - 如果存储的值刚好是8字节大小，比如有符号/无符号的整数/浮点数，那么直接在v存储它的值即可，节省了一个指针
    - 要实现这一点，使用union联合体，因为union的所有成员共用一个空间，占用空间是最大成员的大小，在这里所有成员都是8字节；而且union能够满足**多次赋值能够覆盖先前的值和类型**
  - 另外还有一个next指针，用于在哈希冲突时使用链式寻址法解决冲突，通过头插法形成单链表

- 在外层的字典dict中，结构体占96字节:
  - 1. type是一个指向dictType类型的指针：
    - 因为在redis中字典应用的场景很多（它甚至用在主从存储master-replica节点），不同场景有不同的操作函数，所以redis定义了dictType结构体来存储这些操作对应的函数指针，并用一个指针指向它；
  - 2. privdata则是配合type函数结构体指针使用的私有数据；
  - 3. ht是哈希表结构体类型的数组，因为重哈希需要复制元素到新空间，所以定义两个哈希表，ht[0]存储而ht[1]复制，在重哈希结束后交换指针值；
  - 4. rehashidx则是标记重哈希进度，如果值为-1表示没在重哈希，否则表示当前重哈希计算在原哈希表的进度索引
  - 5. iterators字段用来记录当前运行的迭代器数量，因为有迭代器绑定字典的时候是不能进行重哈希操作的

### dict 方法

- 这里分析dict的创建，添加，查找，重写，删除，扩容，重哈希几个函数。

#### 创建

- 使用dictCreate来创建并初始化一个dict，它的实现是这样的：
  - 1. 调用zmalloc申请一片内存空间
    - 关于zmalloc/zrealloc/zfree函数都是jemalloc内存池的内存管理方法的封装
  - 2. 调用dictInie函数
    - 1. 该函数调用_dictReset函数将两个哈希表，将table二维数组设置为NULL，其他初始化为零
      - 这也就意味着初始化的时候**不会为哈希表分配内存**
    - 2. 然后对dict结构体的其他成员进行初始化

```c
// dict.c 第 111-134 行
dict *dictCreate(dictType *type, void *privDataPtr) {
    dict *d = zmalloc(sizeof(*d));
    _dictInit(d, type, privDataPtr);
    return d;
}

int _dictInit(dict *d, dictType *type, void *privDataPtr) {
    _dictReset(&d->ht[0]);
    _dictReset(&d->ht[1]);
    d->type = type;
    d->privdata = privDataPtr;
    d->rehashidx = -1;      // 标记未进行rehash
    d->iterators = 0;
    return DICT_OK;
}

static void _dictReset(dictht *ht) {
    ht->table = NULL;
    ht->size = 0;
    ht->sizemask = 0;
    ht->used = 0;
}

```

#### 添加

- 使用dictAdd()函数来添加键值对，它的实现是这样的：
  - dictAdd()会调用dictAddRaw()并返回新的节点，然后判断该节点是否分配成功，如果成功了那么对该节点调用dictSetVal设置它的val值。
  - dictAddRaw逻辑如下：
    - 1. 先检查当前字典是否处于重哈希，是的话就执行一次重哈希操作来进行一次数据迁移，这样能加快重哈希的同时保证插入位置的有效性
      - Redis 在dict许多增删改查操作中都穿插了单步重哈希，关于这一点需要理解**渐进式重哈希的分治思想**
    - 2. 然后申请一个新节点并按头插法插入到当前使用的哈希表，如果处于重哈希插入新表ht[1]，否则插入旧表ht[0]
    - 3. 最后设置新节点的键
- 这里额外说明，Redis添加键值对前会使用dictFind检查键是否存在，是则调用db.c的dbOverwrite()函数修改键值对，不是才会调用db.c的dbAdd添加键值对。而dbAdd方法会调用dictAdd函数

```c
// dict.c 第 265-308 行
int dictAdd(dict *d, void *key, void *val) {
    dictEntry *entry = dictAddRaw(d, key, NULL);
    if (!entry) return DICT_ERR;
    dictSetVal(d, entry, val);  // 设置value
    return DICT_OK;
}

dictEntry *dictAddRaw(dict *d, void *key, dictEntry **existing) {
    long index;
    dictEntry *entry;
    dictht *ht;

    if (dictIsRehashing(d)) _dictRehashStep(d);  // 1. 正进行rehash则递进一步

    /* 获取key应该插入的位置，如果key已存在返回-1 */
    if ((index = _dictKeyIndex(d, key, dictHashKey(d, key), existing)) == -1)
        return NULL;

    /* 选择插入表（如果正rehash则插入新表ht[1]，否则插入ht[0]） */
    ht = dictIsRehashing(d) ? &d->ht[1] : &d->ht[0];
    
    /* 分配entry并插入到链表头（新元素在前） */
    entry = zmalloc(sizeof(*entry));
    entry->next = ht->table[index];   // 链式插入：新元素指向原链表头
    ht->table[index] = entry;         // 新元素成为链表头
    ht->used++;

    /* 设置key */
    dictSetKey(d, entry, key);
    return entry;
}

```

#### 查找

- 使用dictFind根据传入的键来查找对应的值，它的实现是这样的：
  - 1. 首先对两个表**都要判空**，因为还不知道当前dict是只有旧表用ht[0]存储，还是正在重哈希两个都有数据
  - 2. 然后计算哈希值，先在ht[0]中查找索引，查找时需要遍历索引对应的链表
  - 3. 查找过程中利用逻辑或短路，如果两个键指向同一内存那么成功，如果不那再去比较二者的值，省去了一次比较操作
  - 4. 如果ht[0]没找到，判断当前重哈希状态，是的话就接着找ht[1]，否则返回

```c
// dict.c 第 476-500 行（简化版）
dictEntry *dictFind(dict *d, const void *key) {
    dictEntry *he;
    uint64_t h, idx, table;

    if (d->ht[0].used + d->ht[1].used == 0) return NULL;  // 空表快速返回
    
    if (dictIsRehashing(d)) _dictRehashStep(d);  // 正进行rehash则递进一步

    h = dictHashKey(d, key);  // 计算哈希值

    /* 可能需要同时查找两个表（旧表和新表） */
    for (table = 0; table <= 1; table++) {
        idx = h & d->ht[table].sizemask;  // hash & sizemask 快速取模
        he = d->ht[table].table[idx];
        
        while (he) {
            /* key相等或比较相等 */
            if (key == he->key || dictCompareKeys(d, key, he->key))
                return he;
            he = he->next;  // 遍历链表
        }
        
        if (!dictIsRehashing(d)) return NULL;  // 未进行rehash则不需查新表
    }
    return NULL;
}

```

#### 重写

- 使用dictReplace()函数对一个键值对的值进行替换，它的实现是这样的：
  - 1. 先调用dictAddRaw()试着直接插入，如果成功说明不需要重写
  - 2. 否则根据该函数内部调用的_dictKeyIndex方法设置的**existing**也就是旧值，先更新值，再依据保存的旧值释放它的空间

```c
// dict.c 第 325-347 行
int dictReplace(dict *d, void *key, void *val)
{
    dictEntry *entry, *existing, auxentry;

    entry = dictAddRaw(d,key,&existing); // 检查是否插入成功
    if (entry) {
        dictSetVal(d, entry, val);
        return 1;
    }

    auxentry = *existing;   // 插入失败则替换旧值
    dictSetVal(d, existing, val);
    dictFreeVal(d, &auxentry);  // 释放旧值
    return 0;
}

```

#### 删除

- 使用dictDelete()方法根据键删除值，它的实现是这样的：
  - 该方法实际上调用dictGenericDelete方法
    - 1. 先对哈希表判空，再进行下一步查找，逻辑和dictFind类似
    - 2. 计算哈希值，在两张表中根据哈希值查找索引，查找时不仅记录遍历指针，还要**记录它的前驱节点以便删除**
    - 3. 查找成功后释放节点的键/值/节点结构体内存

```c
// dict.c 第 403-445 行
int dictDelete(dict *d, const void *key) {
    return dictGenericDelete(d, key, 0) ? DICT_OK : DICT_ERR;
}

static dictEntry *dictGenericDelete(dict *d, const void *key, int nofree) {
    uint64_t h, idx;
    dictEntry *he, *prevHe;
    int table;

    if (d->ht[0].used == 0 && d->ht[1].used == 0) return NULL;

    if (dictIsRehashing(d)) _dictRehashStep(d);
    h = dictHashKey(d, key);

    /* 可能需要在两个表中查找 */
    for (table = 0; table <= 1; table++) {
        idx = h & d->ht[table].sizemask;
        he = d->ht[table].table[idx];
        prevHe = NULL;
        
        while (he) {
            if (key == he->key || dictCompareKeys(d, key, he->key)) {
                /* 从链表中删除（更新前驱指针） */
                if (prevHe)
                    prevHe->next = he->next;  // 跳过he
                else
                    d->ht[table].table[idx] = he->next;  // he是链表头
                
                /* 释放内存（nofree=0时） */
                if (!nofree) {
                    dictFreeKey(d, he);
                    dictFreeVal(d, he);
                    zfree(he);
                }
                d->ht[table].used--;
                return he;
            }
            prevHe = he;
            he = he->next;
        }
        if (!dictIsRehashing(d)) break;
    }
    return NULL;
}

```

#### 扩容

- 使用dictExpand()进行哈希表扩容，使用_dictExpandIfNeeded()尝试扩容，它们的实现分别是这样的：
- 1. dictExpand()方法：
  - 1. 检查是否正在重哈希或者当前哈希表已存元素大于给定大小
  - 2. 用当前哈希表大小的2倍来初始化一个新的表，第一次则是4
    - 实际上执行_dictNextPower计算大小，如果超过哈希表最大极限值则返回极限值+1，否则计算出刚好大于给定size的最小2的整数幂
  - 3. 如果是第一次创建分配元素 这张表给ht[0] 否则交给ht[1]并准备重哈希

- 2. _dictExpandIfNeeded()方法：
  - 该方法规定在以下三种情况需要扩容：
    - 1. ht[0]的大小为 0
    - 2. ht[0]承载的元素个数已经超过了 ht[0]的大小，同时 Hash 表可以进行扩容 dict_can_resize
      - dict_can_resize 由updateDictResizePolicy决定，**当前没有执行rdb/aof时调用dictEnableResize允许扩容**，否则dictDisableResize将它设置为0
    - 3. ht[0]承载的元素个数，是 ht[0]的大小的 dict_force_resize_ratio 倍，其中，dict_force_resize_ratio 的默认值是 5
      - 换种说法就是 **used/size 负载因子 大于 dict_force_resize_ratio 扩容因子 = 5**
    - 简要地说，就是**分为首次分配，出现哈希冲突并且存在链表，链表长度过长急需扩容**，一共三种情况
  - 1. 先检查是否正在重哈希
  - 2. 然后检查是否首次分配
  - 3. 再进行扩容条件判断，传入dictExpand的参考扩容大小是当前哈希表元素的2倍
    - 实际上**分配的内存**如上所述是**哈希表大小的2倍** 而不是用哈希表当前存储元素的2倍，因为要求分配内存是大于size（这里是2倍used）的最小2的整数幂

```c
// dict.c 第 147-177 行和 135-146 行
int dictExpand(dict *d, unsigned long size) {
    if (dictIsRehashing(d) || d->ht[0].used > size)
        return DICT_ERR;

    dictht n;  /* 新哈希表 */
    unsigned long realsize = _dictNextPower(size);  // 扩大到2的幂次

    if (realsize == d->ht[0].size) return DICT_ERR;  // 大小未变化

    /* 初始化新表 */
    n.size = realsize;
    n.sizemask = realsize - 1;  // 2^n - 1
    n.table = zcalloc(realsize * sizeof(dictEntry*));
    n.used = 0;

    /* 第一次初始化？直接赋给ht[0] */
    if (d->ht[0].table == NULL) {
        d->ht[0] = n;
        return DICT_OK;
    }

    /* 否则准备进行渐进式rehash：新表放在ht[1]，设置rehashidx=0 */
    d->ht[1] = n;
    d->rehashidx = 0;  // 从第0个bucket开始rehash
    return DICT_OK;
}

static int _dictExpandIfNeeded(dict *d)
{
    // 如果扩容的过程正在发生rehash 则不扩容，直接返回，等到渐进性rehash结束。
    if (dictIsRehashing(d)) return DICT_OK;

    // 1.当ht[0]的size为0时，这个判断对应第一个key加入到全局键值对哈希表时，并且扩容的哈希表数组长度是4.
    if (d->ht[0].size == 0) return dictExpand(d, DICT_HT_INITIAL_SIZE);

    /*
     *  核心触发rehash的逻辑
     *  1.当used已经大于size了，也就是已经有链式哈希了，并且 dict_can_resize == 1
     *  2.后者当used已经大于size了，并且used/size的倍数大于5，这个used/size的值也叫做负载因子
     *  扩容的长度是 used * 2个数量，扩容的时候会采用 基于4的power * 2倍数来扩容，不会直接使用传递的值。
     */
    if (d->ht[0].used >= d->ht[0].size &&
        (dict_can_resize ||
         d->ht[0].used/d->ht[0].size > dict_force_resize_ratio)) //dict_force_resize_ratio 是5
    {
        return dictExpand(d, d->ht[0].used*2);
    }
    return DICT_OK;
}
static unsigned long _dictNextPower(unsigned long size)
{
    unsigned long i = DICT_HT_INITIAL_SIZE;

    if (size >= LONG_MAX) return LONG_MAX + 1LU;
    while(1) {
        if (i >= size)
            return i;
        i *= 2;
    }
}

```

#### 重哈希

- 使用dictrehash()函数进行渐进式重哈希：
  - 因为重哈希期间会阻塞整个表的操作直到完成，Redis选择分步完成，每次只进行一小部分的桶的重哈希
  - 重哈希应该考虑的三个问题：
    - 1. 何时需要重哈希：扩容和缩容，扩容时机由dictExpandIfNeed()决定并调用dictExpand扩容
      - 缩容则是在used不足size的10%时，将容量设置为一个正好容纳used节点数量的最小2的整数幂
    - 2. 重哈希扩容大小：实际上由_dictNextPower执行，具体还是在dictExpand中执行
    - 3. 如何分治重哈希：
      - 1. 将重哈希操作单步分散到插入/删除/查找/修改等操作中
        - 这也是为什么它们的代码中会有单步重哈希_dictRehashStep
      - 2. 除此之外空闲时也会调用dictRehashMilliseconds执行批量重哈希，
      - 3. 每执行一次重哈希就更新当前进度执行到ht[0]哪个桶,用rehashidx记录，下一次就从它记录的地方开始检查哈希表
      - 4. 如果检查的桶不是空的就需要对桶中的链表重哈希，每搬一个元素到新表就将旧表的元素数量减1
      - 5. 当旧表的元素数量为0的时候就可以交换ht[0]与ht[1]了

- dictRehash的实现是这样的：
  - 1. 先判断是否处于重哈希状态，调用dictIsRehashing检查rehashidx是否为-1标志
  - 2. 开始执行指定步数的重哈希操作，每一步都迁移一个旧表h[0]的桶到新表ht[1]，一个桶内有多个链表节点
  - 3. 迁移一个桶中的链表节点就相应地分别增减两个表的元素数量
  - 4. 每执行完一步重哈希就更新rehashidx的重哈希进度索引
    - 规定扫描桶时允许检查到空桶的数量为10倍步数大小，因为顺序检查时桶不一定有元素（可能已经迁移过了），如果花费太多时间在扫描空桶上会影响性能
  - 5. 当旧表的元素数量used为0时，重哈希结束
    - 1. 释放ht[0]的内存并将ht[1]的指针给ht[0]
    - 2. 然后调用_dictReset设置ht[1]为初始化状态
    - 3. 最后修改rehashidx为-1

```c
// dict.c 第 188-233 行（简化版）
int dictRehash(dict *d, int n) {
    int empty_visits = n * 10;  // 最多访问n*10个空bucket
    if (!dictIsRehashing(d)) return 0;

    while (n-- && d->ht[0].used != 0) {
        dictEntry *de, *nextde;

        /* 找到非空bucket */
        while (d->ht[0].table[d->rehashidx] == NULL) {
            d->rehashidx++;
            if (--empty_visits == 0) return 1;  // 防止长时间阻塞
        }

        /* 将bucket中所有entry移到新表 */
        de = d->ht[0].table[d->rehashidx];
        while (de) {
            nextde = de->next;
            uint64_t h = dictHashKey(d, de->key);
            dictEntry *entry = d->ht[1].table[h & d->ht[1].sizemask];
            
            /* 移到新表的链表头 */
            de->next = entry;
            d->ht[1].table[h & d->ht[1].sizemask] = de;
            
            d->ht[0].used--;
            d->ht[1].used++;
            de = nextde;
        }
        d->ht[0].table[d->rehashidx] = NULL;
        d->rehashidx++;
    }

    /* rehash完成？交换表，清理旧表 */
    if (d->ht[0].used == 0) {
        zfree(d->ht[0].table);
        d->ht[0] = d->ht[1];
        _dictReset(&d->ht[1]);
        d->rehashidx = -1;
        return 0;
    }
    return 1;  /* 还有更多数据需要移动 */
}
/* 在后台逐步rehash */
int dictRehashMilliseconds(dict *d, int ms) {
    long long start = timeInMilliseconds();
    int rehashes = 0;

    while (dictRehash(d, 100)) {
        rehashes++;
        if (timeInMilliseconds() - start > ms) break;
    }
    return rehashes;
}

/* 每次操作时都递进一步rehash */
static void _dictRehashStep(dict *d) {
    if (d->iterators == 0) dictRehash(d, 1);  // 无迭代器时才rehash
}

```

## skiplist

- 有序集合（Sorted Set）是 Redis 中一种重要的数据类型，它本身是集合类型，同时也可以支持集合中的元素带有权重，并按权重排序。
- Sorted Set 既能支持高效的范围查询，同时还能以 O(1) 复杂度获取元素权重值。
  - 这得益于它同时使用了跳表和哈希表两个数据结构，这种设计思想充分利用了 **跳表高效支持范围查询** （如 ZRANGEBYSCORE 操作），以及**哈希表高效支持单点查询**（如 ZSCORE 操作）的特征
- Sorted Set 的实现代码在t_zset.c文件中，包括 Sorted Set 的各种操作实现，同时 Sorted Set 相关的结构定义在server.h文件中。

```c
// server.h 第 827-830 行
typedef struct zset {
    dict *dict;
    zskiplist *zsl;
} zset;
```

- Sorted Set 设计应该考虑的问题：
  - 1. 跳表/哈希表中各自保存什么样的数据
  - 2. 跳表/哈希表如何保持数据一致

### skiplist 设计

- 跳表实际上是一个**多层有序链表**，层数越低节点数量越多，查找时从顶层向下查找元素，节点数量较多时可以跳过部分节点，不必遍历所有元素，本质上是空间换时间的思想
  - 1. 跳表结构体包含了跳表长度，跳表层数以及分别指向头节点和最后一个元素的指针
  - 2. 跳表和普通的链表一样有一个头节点
  - 3. 跳表的每个节点都有一个数组level表示当前节点的层数，其中头节点是64层；每个数组元素是个zskiplistLevel结构体，包含了指向下个节点的forward指针，最后一个节点指向NULL，以及该指针跳过节点的数量span，头节点是0
  - 4. 跳表的每个节点都有一个backward指针，指向当前节点的前一个元素,头节点和第一个节点指向NULL
  - 5. 跳表的每个节点都有一个sds类型的字符串ele，用来保存当前节点存储的元素,头节点则是NULL
  - 6. 跳表的每个节点都有一个score分数值，用来表示当前元素的权重,头节点是0

```c
// server.h 第 811-825 行和 t_zset.c 第 122-127 行
// 跳表节点
typedef struct zskiplistNode {
    sds ele; // 每一个节点的sds表示存储的元素
    double score; // 每一个节点对应的score分数值
    struct zskiplistNode *backward; //底层节点是一个双向链表，backward指针可以找到后续的节点
    struct zskiplistLevel { // 每个节点同时也包含了一个 level数组，表示每一层的索引
        struct zskiplistNode *forward; // 后的节点，高层的链表只有forward的下一个指向，没有backward节点
        unsigned long span; // 跨度，每一层跨多少个节点可以找到下一个节点，用于维护跳跃链表每一层的元素个数
    } level[];
} zskiplistNode;
// 跳表结构体
typedef struct zskiplist {
    struct zskiplistNode *header, *tail;
    unsigned long length;
    int level;
} zskiplist;
#define ZSKIPLIST_MAXLEVEL 64  //最大层数为64
#define ZSKIPLIST_P 0.25       //随机数的值为0.25
int zslRandomLevel(void) {
    //初始化层为1
    int level = 1;
    while ((random()&0xFFFF) < (ZSKIPLIST_P * 0xFFFF))
        level += 1;
    return (level<ZSKIPLIST_MAXLEVEL) ? level : ZSKIPLIST_MAXLEVEL;
}
```

### skiplist 方法

#### 创建

- 使用zslCreate创建跳表结构体，使用zslCreateNode创建跳表节点，使用zslRandomLevel为节点设置level高度
- 设置节点高度一种设计方法是，让每一层上的结点数约是下一层上结点数的一半,当跳表从最高层开始进行查找时，由于每一层结点数都约是下一层结点数的一半，这种查找过程就类似于二分查找，查找复杂度可以降低到 O(logN)
- 为了维持相邻两层上结点数的比例为 2:1，一旦有新的结点插入或是有结点被删除，那么插入或删除处的结点，及其后续结点的层数都需要进行调整，而这样就带来了额外的开销。为了避免上述问题，跳表在创建结点时，采用的是另一种设计方法，即**随机生成每个结点的层数**。此时，相邻两层链表上的结点数并不需要维持在严格的 2:1 关系。这样一来，当新插入一个结点时，只需要修改前后结点的指针，而其他结点的层数就不需要随之改变了，这就降低了插入操作的复杂度。

  - 1. zslCreate()是这样实现的：
    - 1. 为skiplist结构体分配内存空间
    - 2. 设置层高level为1，跳表长度length为0
    - 3. 创建头节点，并且将它的指针和level数组中的zskiplistLevel结构体设置初值为null
    - 4. 将header指向头节点，tail指向Null
  - 2. zslCreateNode()是这样实现的：
    - 1. 为跳表节点结构体，以及根据传入的level高度为数组分配空间
    - 2. 根据传入的其他参数为权重和元素值初始化
  - 3. zslRandomLevel()是这样实现的：
    - 1. 先设置要计算的高度初值为1
    - 2. 通过while循环，每次生成一个随机值，取这个值的**低16位**作为x，当x小于0.25倍的0xFFFF时，level的值加1；否则退出while循环
      - 如果随机数的值小于 ZSKIPLIST_P（指跳表结点增加层数的概率，值为 0.25），那么层数就增加 1 层。
      - 因为随机数取值到`[0,0.25)` 范围内的概率不超过 25%，所以这也就表明了，每增加一层的概率不超过 25%。
      - 每一节点的期望层高是(1-p)p^(n-1)的求和，当n趋于正无穷大时为1/(1-p)，p取0.25，则期望层高是1.33
    - 3. 最终返回level和ZSKIPLIST_MAXLEVEL两者中的最小值

```c
zskiplistNode *zslCreateNode(int level, double score, sds ele) {
    zskiplistNode *zn =
        zmalloc(sizeof(*zn)+level*sizeof(struct zskiplistLevel));
    zn->score = score;
    zn->ele = ele;
    return zn;
}
// 初始化zskiplist结构体
zskiplist *zslCreate(void) {
    int j;
    zskiplist *zsl;

    // 分配zsl的空间
    zsl = zmalloc(sizeof(*zsl));
    zsl->level = 1;
    zsl->length = 0;

    // 为头结点指向的level数组分配空间
    // header节点score是0 和 element是null
    zsl->header = zslCreateNode(ZSKIPLIST_MAXLEVEL,0,NULL);
    for (j = 0; j < ZSKIPLIST_MAXLEVEL; j++) {
        zsl->header->level[j].forward = NULL;
        zsl->header->level[j].span = 0;
    }
    zsl->header->backward = NULL;
    zsl->tail = NULL;
    return zsl;
}
int zslRandomLevel(void) {
    int level = 1; // 初始化层数为1
    // 生成一个随机数，如果生成的随机数小于 0.25 则level层数+1
    while ((random()&0xFFFF) < (ZSKIPLIST_P * 0xFFFF))
        level += 1;
    return (level<ZSKIPLIST_MAXLEVEL) ? level : ZSKIPLIST_MAXLEVEL;
}
```

#### 插入

- 当查询一个结点时，跳表会先从头结点的最高层开始，查找下一个结点。而由于跳表结点同时保存了元素和权重，所以跳表在比较结点时，相应地有两个判断条件：

- 使用zslInsert()插入新节点, 主要分为查找要插入的位置， 调整跳跃表高度， 插入节点，调整backward四个步骤，它的实现是这样的：
  - 1. 为了找到要更新的节点，我们需要以下两个长度为64的数组来辅助操作。
    - update[​]​：插入节点时，需要更新被插入节点每层的前一个节点。由于每层更新的节点不一样，所以将每层需要更新的节点记录在update[i]中。
    - rank[​]​：记录当前层从header节点到update[i]节点所经历的步长，在更新update[i]的span和设置新插入节点的span时用到。
  - 2. 从头节点x开始，由高到低查找插入位置，如果 score < 目标score，继续向前，如果 score == 目标score，比较字符串，字典序小的继续向前，否则，下降到下一层, 同时记录每个节点的前一个节点update和步长span
    - 当查找到的结点保存的元素权重，比要查找的权重小时，跳表就会继续访问该层上的下一个结点。
    - 当查找到的结点保存的元素权重，等于要查找的权重时，跳表会再检查该结点保存的 SDS 类型数据，是否比要查找的 SDS 数据小。如果结点数据小于要查找的数据时，跳表仍然会继续访问该层上的下一个结点。
    - 但是，当上述两个条件都不满足时，跳表就会用到当前查找到的结点的 level 数组了。跳表会使用当前结点 level 数组里的下一层指针，然后沿着下一层指针继续查找，这就相当于跳到了下一层接着查找。
  - 3. zslRandomLevel()生成新节点的高度
  - 4. zslCreateNode()创建新节点，修改每一层的forward指针和span长度为先前记录的update和rank,修改最底层的backward指针
  - 5. 增加跳表长度length并返回头节点

```c
zskiplistNode *zslInsert(zskiplist *zsl, double score, sds ele) {
    // update这个 listnode数组维护的是header层数
    zskiplistNode *update[ZSKIPLIST_MAXLEVEL], *x;
    unsigned int rank[ZSKIPLIST_MAXLEVEL];
    int i, level;

    serverAssert(!isnan(score));
    // 拿出来头结点，x指针指向header头节点
    x = zsl->header;
    // 1.寻找插入点的过程:从高层到底层开始寻找
    for (i = zsl->level-1; i >= 0; i--) {
        /* store rank that is crossed to reach the insert position */
        rank[i] = i == (zsl->level-1) ? 0 : rank[i+1];
        // 找插入点的过程:
        // 1.首先当前层的下一个节点 forward得有数据，没有的话说明是第一次插入(?)
        // 2.每一层都找到在forward链表上找第一个大于传入score的节点
        // 3.update数组记录每一层了每一层找到的第一个大于传入score节点的prev前一个节点
        // 4.目的是: 如果新插入的节点再底层链表中插入了，它会循环随机数的方式来决定是否晋升，要的话就可以用到这个前置节点了
        // 链表的插入需要前置节点
        while (x->level[i].forward &&
                (x->level[i].forward->score < score ||
                    (x->level[i].forward->score == score &&
                    sdscmp(x->level[i].forward->ele,ele) < 0)))
        {
            rank[i] += x->level[i].span;
            x = x->level[i].forward;
        }
        update[i] = x;
    }
    // 2.随机获得一个level的层数，里面用了一个while循环从 1开始 25%的几率得到level=level+1的执行，限制为64
    // 这个level决定了这个元素需要在多少层里维护链表
    level = zslRandomLevel();
    if (level > zsl->level) {
        // 如果新随机得到的层数比现在的zsl的还高，当然几率很低，从高出来的那一层开始，初始化每一层的指针指向zsl的header
        for (i = zsl->level; i < level; i++) {
            rank[i] = 0;
            // 每一层都指向header
            update[i] = zsl->header;
            // 计算span
            update[i]->level[i].span = zsl->length;
        }
        // 维护zsl的当前level值
        zsl->level = level;
    }

    // 创建一个 zslNode，此时这个x指向一个新的 zslNode节点，带有用户传入的element 和 score的element
    x = zslCreateNode(level,score,ele);
    // 开始遍历每一层，level就是这个新增节点x需要在多少层上维护
    for (i = 0; i < level; i++) {
        // 链表插入操作
        // x新节点的当前层的forward节点指向 update同层的foward节点
        x->level[i].forward = update[i]->level[i].forward;
        // update同层的forward节点指向 新节点
        update[i]->level[i].forward = x;

        /* update span covered by update[i] as x is inserted here */
        x->level[i].span = update[i]->level[i].span - (rank[0] - rank[i]);
        update[i]->level[i].span = (rank[0] - rank[i]) + 1;z
    }

    /* increment span for untouched levels */
    for (i = level; i < zsl->level; i++) {
        update[i]->level[i].span++;
    }

    // 维护x的backward指针，这里zset只在第一层维护了它 update[0]就是上面已经维护过的 第一层的前置位置
    x->backward = (update[0] == zsl->header) ? NULL : update[0];
    if (x->level[0].forward)
        x->level[0].forward->backward = x;
    else
        zsl->tail = x;
    zsl->length++;
    return x;
}
```

#### 删除节点

- 使用zslDelete()根据score和ele删除节点，同样需要先查找更新节点再更新相关值，它的实现是这样的：
  - 1. 使用与插入逻辑相同的比较规则，但没有rank数组来记录span
  - 2. 查找到节点后到level0调用zslDeleteNode()删除节点，如果没找到不会调用而是返回
    - 1. 遍历每一层，修改待删节点对应层数中的forward指针和span
    - 2. 再处理level0的backward指针，因为level0可以看作双向链表，这是双向链表的删除操作，需要更改前一个节点的后继指针
    - 3. 判断是否因为删除节点导致跳表少了一层，是的话需要修改跳表结构体的高度level
  - 调用zslFreeNode()释放节点的内存后返回
    - 该函数先后调用sdsfree和zfree释放元素和跳表节点

```c
int zslDelete(zskiplist *zsl, double score, sds ele, zskiplistNode **node) {
    zskiplistNode *update[ZSKIPLIST_MAXLEVEL], *x;
    int i;

    // 1.同样是找前置节点的过程，跟insert处是一模一样的，所以前置节点的指针都放在update数组里
    x = zsl->header;
    for (i = zsl->level-1; i >= 0; i--) {
        while (x->level[i].forward &&
                (x->level[i].forward->score < score ||
                    (x->level[i].forward->score == score &&
                     sdscmp(x->level[i].forward->ele,ele) < 0)))
        {
            x = x->level[i].forward;
        }
        update[i] = x;
    }
    // 取出第一层的待删节点，判断score element 与传入的是否相同
    x = x->level[0].forward;
    if (x && score == x->score && sdscmp(x->ele,ele) == 0) {
        // 执行真正的删除操作，这里传了update数组 每一层都要删
        zslDeleteNode(zsl, x, update);
        if (!node)
            zslFreeNode(x);
        else
            *node = x;
        return 1;
    }
    return 0; /* not found */
}
void zslDeleteNode(zskiplist *zsl, zskiplistNode *x, zskiplistNode **update) {
    int i;
    // 遍历每一层，判断如果每一层的待删节点都有x，执行链表删除操作
    for (i = 0; i < zsl->level; i++) {
        if (update[i]->level[i].forward == x) {
            update[i]->level[i].span += x->level[i].span - 1;
            // x的forward给update的forward，链表删除操作
            update[i]->level[i].forward = x->level[i].forward;
        } else {
            // 这一层没有x，只处理span的值
            update[i]->level[i].span -= 1;
        }
    }
    // 维护第一层的删完后x的下一个节点的backward指针，要指向x的backward
    if (x->level[0].forward) {
        x->level[0].forward->backward = x->backward;
    } else {
        zsl->tail = x->backward;
    }
    // 判断顶层是否因为删除而没了，没了要减level层数
    while(zsl->level > 1 && zsl->header->level[zsl->level-1].forward == NULL)
        zsl->level--;
    // zsl的元素数量length -1
    zsl->length--;
}
void zslFreeNode(zskiplistNode *node) {
    sdsfree(node->ele);
    zfree(node);
}
```

#### 更新

- 使用zslUpdateScore()更新节点分数,它的实现是这样的：
  - 1. 查找目标节点
  - 2. 判断是否可以原地更新，如果分数更改后节点的相对位置不变就不用删除插入
  - 3. 否则先删除原节点再插入新分数的节点

```c
zskiplistNode *zslUpdateScore(zskiplist *zsl, double curscore, sds ele, double newscore) {
    zskiplistNode *update[ZSKIPLIST_MAXLEVEL], *x;
    int i;
    
    // 1. 查找目标节点
    x = zsl->header;
    for (i = zsl->level-1; i >= 0; i--) {
        while (x->level[i].forward &&
                (x->level[i].forward->score < curscore ||
                 (x->level[i].forward->score == curscore &&
                  sdscmp(x->level[i].forward->ele, ele) < 0)))
        {
            x = x->level[i].forward;
        }
        update[i] = x;
    }
    
    x = x->level[0].forward;
    serverAssert(x && curscore == x->score && sdscmp(x->ele, ele) == 0);
    
    // 2. 判断是否可以原地更新（顺序不变）
    if ((x->backward == NULL || x->backward->score < newscore) &&
        (x->level[0].forward == NULL || x->level[0].forward->score > newscore))
    {
        x->score = newscore;
        return x;
    }
    
    // 3. 否则需要删除后重新插入
    zslDeleteNode(zsl, x, update);
    zskiplistNode *newnode = zslInsert(zsl, newscore, x->ele);
    x->ele = NULL;
    zslFreeNode(x);
    return newnode;
}
```

#### 删除跳表

- 使用zslFree删除跳表，它的实现是这样的：
  - 1. 先从头节点保存第一个节点的指针，再调用zfree释放跳表头节点
  - 2. 根据指针逐个对节点调用zslFreeNode()释放节点
  - 3. 最后释放跳表结构体

```c
void zslFree(zskiplist *zsl) {
    zskiplistNode *node = zsl->header->level[0].forward, *next;
    
    zfree(zsl->header);
    // 遍历底层链表释放所有节点
    while(node) {
        next = node->level[0].forward;
        zslFreeNode(node);
        node = next;
    }
    zfree(zsl);
}
```

#### 查找

- 使用zslGetRank()获取元素排名(在跳表中的第几个节点)， 使用zslGetElementByRank()根据排名获取元素：
  - 1. zslGetRank()的实现是这样的：
    - 1. 从最高层开始向下搜索，利用跳表的span累加经过的节点数rank
    - 2. 找到元素返回rank，否则返回0
  - 2. zslGetElementByRank()的实现是这样的：
    - 1. 和上一个函数类似，利用跳表的span累加经过的节点数traversed
     2. 如果traversed与指定的排名（位置）相等那么返回节点的ele，否则返回null

```c
unsigned long zslGetRank(zskiplist *zsl, double score, sds ele) {
    zskiplistNode *x;
    unsigned long rank = 0;  // 排名累加器，初始为0
    int i;
    
    x = zsl->header;  // 从头节点开始
    
    // 步骤1: 从最高层向下遍历（类似插入/删除的查找过程）
    for (i = zsl->level-1; i >= 0; i--) {
        // 步骤2: 在当前层向前移动，条件是：
        //   - 下一个节点的score < 目标score，或者
        //   - 下一个节点的score == 目标score 且 字符串值 <= 目标ele
        while (x->level[i].forward &&
            (x->level[i].forward->score < score ||
             (x->level[i].forward->score == score &&
              sdscmp(x->level[i].forward->ele, ele) <= 0)))
        {
            rank += x->level[i].span;  // 累加跨度
            x = x->level[i].forward;    // 向前移动
        }
        
        // 步骤3: 每层都检查是否找到目标元素
        // 注意：x->ele 对于header是NULL，所以需要先判断
        if (x->ele && sdscmp(x->ele, ele) == 0) {
            return rank;  // 找到了，返回排名
        }
    }
    return 0;  // 未找到，返回0
}
zskiplistNode* zslGetElementByRank(zskiplist *zsl, unsigned long rank) {
    zskiplistNode *x;
    unsigned long traversed = 0;  // 已遍历的节点数累加器
    int i;
    
    x = zsl->header;
    
    // 步骤1: 从最高层向下遍历
    for (i = zsl->level-1; i >= 0; i--) {
        // 步骤2: 在当前层向前移动，条件是：
        //   - 存在下一个节点，且
        //   - 累加当前span后不超过目标rank
        while (x->level[i].forward && 
               (traversed + x->level[i].span) <= rank)
        {
            traversed += x->level[i].span;  // 累加跨度
            x = x->level[i].forward;         // 向前移动
        }
        
        // 步骤3: 每层都检查是否到达目标排名
        if (traversed == rank) {
            return x;  // 找到了
        }
    }
    return NULL;  // 未找到
}
```

### Sort Set中的skiplist与ziplist

- 如前文所述，在Redis中，跳表主要应用于有序集合zset的底层实现（有序集合的另一种实现方式为压缩列表ziplist）,并且与dict配合使用​。
- Redis的配置文件中关于有序集合底层实现的两个配置:
  - 1. zset-max-ziplist-entries 128:zset采用压缩列表时，元素个数最大值。默认值为128。
  - 2. zset-max-ziplist-value 64:zset采用压缩列表时，每个元素的字符串长度最大值。默认值为64。
- zset添加元素的主要逻辑位于t_zset.c的zaddGenericCommand函数中，zset插入第一个元素时，会判断下面两种条件，**满足任一条件Redis就会采用跳跃表作为底层实现，否则采用压缩列表作为底层实现方式**。
  - 1. zset-max-ziplist-entries的值是否**等于0**
    - 一般情况下，不会将zset-max-ziplist-entries配置成0，元素的字符串长度也不会太长，所以在创建有序集合时，默认使用压缩列表的底层实现
  - 2. zset-max-ziplist-value**小于**要插入元素的字符串长度
- zset新插入元素时，会判断以下两种条件, 当**满足任一条件时，Redis便会将zset的底层实现由压缩列表转为跳跃表**
  - 1. zset中元素个数**大于**zset_max_ziplist_entries
  - 2. zset-max-ziplist-value**小于**要插入元素的字符串长度
- zset在转为跳跃表之后，即使元素被逐渐删除，也**不会重新转为压缩列表**

- zsetConvert()函数在创建zset时会相继调用 dictCreate 函数创建 zset 中的哈希表，以及调用 zslCreate 函数创建跳表，当往 Sorted Set 中插入数据时，zsetAdd 函数就会被调用，判定 Sorted Set 采用的是 ziplist 还是 skiplist 的编码方式，
- 接着对于使用skiplist的实现，zsetAdd 函数会先使用哈希表的 dictFind 函数，查找要插入的元素是否存在。
  - 如果不存在，就直接调用跳表元素插入函数 zslInsert 和哈希表元素插入函数 dictAdd，将新元素分别插入到跳表和哈希表中。
  - 已经存在，那么 zsetAdd 函数会判断是否要增加元素的权重值。

## ziplist

- 压缩列表ziplist本质上就是一个字节数组，是Redis为了节约内存而设计的一种线性数据结构，可以包含多个元素，每个元素可以是一个字节数组或一个整数。
- Redis的有序集合、哈希表和列表都直接或者间接使用了压缩列表。当有序集合或散列表的元素个数比较少，且元素都是短字符串时，Redis便使用压缩列表作为其底层数据存储结构。列表使用快速链表（quicklist）数据结构存储，而快速链表就是双向链表与压缩列表的组合。

### ziplist 设计

- Redis使用字节数组表示一个压缩列表，它一种**连续内存**存储的线性数据结构，可以包含多个元素，每个元素可以是字节数组或整数
  - ziplist 使用宏定义的核心原因是：它本质上是一个**动态变长的字节数组**，而不是固定大小的结构体。
- ziplist 整体布局如下，其中：
  - 1. zlbytes：压缩列表的字节长度，占4个字节，因此压缩列表最多有232-1个字节。
  - 2. zltail：压缩列表尾元素相对于压缩列表起始地址的偏移量，占4个字节。
  - 3. zllen：压缩列表的元素个数，占2个字节。zllen无法存储元素个数超过65535（216-1）的压缩列表，必须遍历整个压缩列表才能获取到元素个数。
  - 4. entryX：压缩列表存储的元素，可以是字节数组或者整数，长度不限。entry的编码结构将在后面详细介绍。
  - 5. zlend：压缩列表的结尾，占1个字节，恒为0xFF。

|字段|zlbytes|zltail|zllen|entry1|...|entryN|zlend
|---|---|---|---|---|---|---|---
|字节数|4|4|2|不定长|不定个数|不定长|1

- ziplist存储的元素entry的布局如下, 其中:
  - previous_entry_length字段表示前一个元素的字节长度，占1个或者5个字节
    - 当前一个元素的长度小于254字节时，用1个字节表示
    - 当前一个元素的长度大于或等于254字节时，用5个字节来表示。此时previous_entry_length字段的第1个字节是固定的0xFE，后面4个字节才真正表示前一个元素的长度。
    - 假设已知当前元素的首地址为p，那么p-previous_entry_length就是前一个元素的首地址，从而实现压缩列表**反向遍历**。
  - encoding字段表示当前元素的编码，即content字段存储的数据类型，它的前两位决定了存储的类型是字节数组还是整数
    - 当content存储的是字节数组时，后续字节标识字节数组的实际长度
    - 当content存储的是整数时，可根据第3、第4位判断整数的具体类型
    - 而当encoding字段标识当前元素存储的是0～12的立即数时，数据直接存储在encoding字段的最后4位，此时没有content字段
  - content存储了数据

|字段|previous_entry_length|encoding|content
|---|---|---|---
|字节数|1 or 5|1 or 2 or 5|不定长

| 编码类型 | 十六进制 | 二进制 | encoding长度 | data长度 | 总长度 | 适用范围
| --------- | --------- | -------- | ------------ | --------- | -------- | ---------
| **ZIP_STR_06B** | 0x00-0x3F | 00pppppp | 1字节 | 0-63字节 | 1+n | 短字符串
| **ZIP_STR_14B** | 0x40-0x7F | 01pppppp qqqqqqqq | 2字节 | 64-16383字节 | 2+n | 中字符串
| **ZIP_STR_32B** | 0x80 | 10000000 ... | 5字节 | ≥16384字节 | 5+n | 长字符串
| **ZIP_INT_16B** | 0xC0 | 11000000 | 1字节 | 2字节 | 3字节 | [-32768, 32767]
| **ZIP_INT_32B** | 0xD0 | 11010000 | 1字节 | 4字节 | 5字节 | int32范围
| **ZIP_INT_64B** | 0xE0 | 11100000 | 1字节 | 8字节 | 9字节 | int64范围
| **ZIP_INT_24B** | 0xF0 | 11110000 | 1字节 | 3字节 | 4字节 | [-8388608, 8388607]
| **ZIP_INT_8B** | 0xFE | 11111110 | 1字节 | 1字节 | 2字节 | [-128, 127]
| **ZIP_INT_IMM** | 0xF1-0xFD | 1111xxxx | 1字节 | **0字节** | 1字节 | [0, 12]
| **ZIP_END** | 0xFF | 11111111 | 1字节 | - | 1字节 | 结束标记

```c
    #define ZIP_STR_06B (0 << 6) // 1B 00xxxxxx 0~63
    #define ZIP_STR_14B (1 << 6) // 2B 01xxxxxx xxxxxxxx 64~16383
    #define ZIP_STR_32B (2 << 6) // 5B 10000000 ... more then 16383
    #define ZIP_INT_16B (0xc0 | 0<<4) // 1B 11000000 2byte int
    #define ZIP_INT_32B (0xc0 | 1<<4) // 1B 11010000 4byte int
    #define ZIP_INT_64B (0xc0 | 2<<4) // 1B 11100000 8byte int
    #define ZIP_INT_24B (0xc0 | 3<<4) // 1B 11110000 3byte int
    #define ZIP_INT_8B 0xfe // 1B 11111110 1byte int
    // 0~12 立即数 1111xxxx 
    #define ZIP_INT_IMM_MIN 0xf1    /* 11110001 */
    #define ZIP_INT_IMM_MAX 0xfd    /* 11111101 */
```

- 如果char * zl指向压缩列表首地址，Redis可通过以下宏定义实现压缩列表各个字段的存取操作：

```c
// ziplist.c 第 20-35 行
// <zlbytes> - 4字节 uint32_t: ziplist 占用的总字节数 zl指向zlbytes字段
// 将指向这32 bits内存区域的指针取值 得到这32bits存储的值 也就是总字节数
#define ZIPLIST_BYTES(zl) (*((uint32_t*)(zl)))

// <zltail> - 4字节 uint32_t: 最后一个 entry 的偏移量 zl+4指向zltail字段
#define ZIPLIST_TAIL_OFFSET(zl) (*((uint32_t*)((zl)+sizeof(uint32_t))))

// <zllen> - 2字节 uint16_t: entry 的数量 zl+8指向zllen字段
// 当元素数超过 2^16-2 时，该值设为 2^16-1，需要遍历整个列表来计算实际数量
#define ZIPLIST_LENGTH(zl) (*((uint16_t*)((zl)+sizeof(uint32_t)*2)))

// <zlend> - 1字节: 特殊结束标记，值为 255 (0xFF)
#define ZIP_END 255

#define ZIP_IS_STR(enc) (((enc) & ZIP_STR_MASK) < ZIP_STR_MASK)


// ziplist的头部前32位用于表示ziplist的总字节数
// ziplist的第二个32位用于表示最后一个元素的偏移量
// ziplist紧接着的16位用于表示元素的个数
#define ZIPLIST_HEADER_SIZE     (sizeof(uint32_t)*2+sizeof(uint16_t))

// 最后8位用于表示ziplist的结束标识，并且通常塞一个unsigned int8的最大值255
#define ZIPLIST_END_SIZE        (sizeof(uint8_t))

#define ZIPLIST_ENTRY_HEAD(zl)  ((zl)+ZIPLIST_HEADER_SIZE)

 // zl+zltail指向尾元素首地址；intrev32ifbe使得数据存取统一采用小端法
// 又是一个改变指针的操作，让指针指向最后一个元素的首地址，怎么做?
// 由于ziplist已经记录了最后一个元素的偏移量，那么久可以轻松做到了
#define ZIPLIST_ENTRY_TAIL(zl)  ((zl)+intrev32ifbe(ZIPLIST_TAIL_OFFSET(zl)))

// 压缩列表最后一个字节即为zlend字段
// 这里指向Entry 尾部的操作的方式是: 通过头指针+总ziplist的全部字节，就指向ziplist最后一个字节了
// 再-1个字节8位，char *指针就挪到了指向最后一个8位的首部了，也就是末尾
#define ZIPLIST_ENTRY_END(zl)   ((zl)+intrev32ifbe(ZIPLIST_BYTES(zl))-1)
```

- 对于压缩列表的任意元素，获取前一个元素的长度、判断存储的数据类型、获取数据内容都需要经过复杂的解码运算。解码后的结果应该被缓存起来，为此定义了结构体zlentry，用于表示解码后的压缩列表元素。
- zlentry 是用于操作的辅助结构，不是实际存储格式，另外函数zipEntry用来解码压缩列表的元素，存储于zlentry结构体：

```c
typedef struct zlentry {
    unsigned int prevrawlensize; // 编码 prevlen 所需字节数
    unsigned int prevrawlen;     // 前一个节点的长度
    unsigned int lensize;        // 编码 encoding 所需字节数
    unsigned int len;            // 数据实际长度
    unsigned int headersize;     // 头部总大小 = prevrawlensize + lensize
    unsigned char encoding;      // 编码类型
    unsigned char *p;            // 指向 entry 起始位置
} zlentry;

void zipEntry(unsigned char *p, zlentry *e) {

  ZIP_DECODE_PREVLEN(p, e->prevrawlensize, e->prevrawlen);
  ZIP_DECODE_LENGTH(p + e->prevrawlensize, e->encoding, e->lensize, e->len);
  e->headersize = e->prevrawlensize + e->lensize;
  e->p = p;
}

```

### ziplist 方法

#### 创建

- 使用 ziplistNew函数创建一个压缩列表，它的实现是这样的：
  - 1. 先为头部和尾部分配内存
  - 2. 初始化头部字段
  - 3. 设置尾部结束标记255

```c
// 初始化一个ziplist结构体，本质上是分配一段连续的内存空间，返回的是ziplist的首地址指针
unsigned char *ziplistNew(void) {
    // 分配初始化结构的内存
    unsigned int bytes = ZIPLIST_HEADER_SIZE+ZIPLIST_END_SIZE; // 10 + 1
    // 分配这么多个bytes的空间
    unsigned char *zl = zmalloc(bytes);
    // 取出将头32个字节存放总长度。具体的做法是将指针转为 u_int32指针，访问它的具体值，修改。
    ZIPLIST_BYTES(zl) = intrev32ifbe(bytes);
    // 将元素的offset设置为 整个header的长度，意思是还没有新元素。
    // 具体的做法是先将指针+u_int32位指到存header的首地址，转为u_int32指针，再访问值修改
    ZIPLIST_TAIL_OFFSET(zl) = intrev32ifbe(ZIPLIST_HEADER_SIZE);
    // length同理，初始化为0，还没有新的元素
    ZIPLIST_LENGTH(zl) = 0;
    // 最后8位塞个255
    zl[bytes-1] = ZIP_END;
    return zl;
}
```

#### 插入

- 使用__ziplistInsert()插入一个entry,可以分为3个步骤：
  - 将元素内容编码，计算previous_entry_length字段、encoding字段和content字段的内容
    - encoding字段标识的是当前元素存储的数据类型和数据长度。编码时首先尝试将数据内容解析为整数，如果解析成功，则按照压缩列表整数类型编码存储；如果解析失败，则按照压缩列表字节数组类型编码存储
  - 重新分配空间
  - 复制数据
- 它的实现是这样的：
  - 1. zl就是压缩链表 p表示指向压缩链表位置的指针 s表示塞进去的数据 slen表示数据的长度
  - 2. 获取前一个节点的长度, 将新元素插入到尾部
  - 3. 将数据编码为整数，否则按字节数组处理
  - 4. 计算所需总空间
  - 5. 重新分配内存（扩容）
    - 由于重新分配了空间，新元素插入的位置指针P会失效，可以预先计算好指针P相对于压缩列表首地址的偏移量，待分配空间之后再偏移即可
  - 6. 移动数据为新元素腾出空间
  - 7. 检查是否需要级联更新
  - 8. 写入新元素的数据并更新元素计数

```c
unsigned char *__ziplistInsert(unsigned char *zl, unsigned char *p, unsigned char *s, unsigned int slen) {
    // curlen表示当前zl的total bytes
    // reqlen表示当前entry需要多少个字节，它包括了prevlen+encoding+data的字节数目
    size_t curlen = intrev32ifbe(ZIPLIST_BYTES(zl)), reqlen;
    // prevlen 表示上一个entry的长度
    unsigned int prevlensize, prevlen = 0;
    // offset表示新entry的偏移量
    size_t offset;
    int nextdiff = 0;
    unsigned char encoding = 0;
    long long value = 123456789; 
    zlentry tail;

    if (p[0] != ZIP_END) {
        ZIP_DECODE_PREVLEN(p, prevlensize, prevlen);
    } else {
        // 从压缩列表尾部insert 元素
        // ptail 指针指向最后一个元素的首地址
        unsigned char *ptail = ZIPLIST_ENTRY_TAIL(zl);
        if (ptail[0] != ZIP_END) {
            //拿到上一个元素的prelen，因为它是动态编码的，需要处理是一个字节还是5个字节保存。
            // 然后将1个或者5个字节保存的字节转成int就是prevlen了。
            prevlen = zipRawEntryLength(ptail);
        }
    }

    if (zipTryEncoding(s,slen,&value,&encoding)) {
        // int类型所需的字节数
        reqlen = zipIntSize(encoding);
    } else {
        // 直接得到字符串的字节数
        reqlen = slen;
    }
    //计算新增的prevlen的字节数，没有传入指针，只计算，不写入
    reqlen += zipStorePrevEntryLength(NULL,prevlen);
    //计算新增的encoding的字节数，没有传入指针，只计算，不写入
    reqlen += zipStoreEntryEncoding(NULL,encoding,slen);

    int forcelarge = 0;
    nextdiff = (p[0] != ZIP_END) ? zipPrevLenByteDiff(p,reqlen) : 0;
    if (nextdiff == -4 && reqlen < 4) {
        nextdiff = 0;
        forcelarge = 1;
    }

    /* Store offset because a realloc may change the address of zl. */
    // p指向新增元素的地址，zl是压缩列表首地址，p-zl就是offset长度
    offset = p-zl;
    //ziplistResize会调用realloc重新分配追加了新的entry字节数的空间，realloc会在原来的连续空间后面追加
    // 扩容的时候已经把尾部的255写完，所以扩容后多出的字节部分要写新加入的元素
    zl = ziplistResize(zl,curlen+reqlen+nextdiff);
    // p重新指向offset处
    p = zl+offset;

    if (p[0] != ZIP_END) {
        /* Subtract one because of the ZIP_END bytes */
        memmove(p+reqlen,p-nextdiff,curlen-offset-1+nextdiff);
        if (forcelarge)
            zipStorePrevEntryLengthLarge(p+reqlen,reqlen);
        else
            zipStorePrevEntryLength(p+reqlen,reqlen);

        ZIPLIST_TAIL_OFFSET(zl) =
            intrev32ifbe(intrev32ifbe(ZIPLIST_TAIL_OFFSET(zl))+reqlen);

        zipEntry(p+reqlen, &tail);
        if (p[reqlen+tail.headersize+tail.len] != ZIP_END) {
            ZIPLIST_TAIL_OFFSET(zl) =
                intrev32ifbe(intrev32ifbe(ZIPLIST_TAIL_OFFSET(zl))+nextdiff);
        }
    } else {
        // 往压缩列表尾部添加元素会到这里，修改ziplist的tail offset值
        ZIPLIST_TAIL_OFFSET(zl) = intrev32ifbe(p-zl);
    }

    if (nextdiff != 0) {
        offset = p-zl;
        zl = __ziplistCascadeUpdate(zl,p+reqlen);
        p = zl+offset;
    }

    // 往新分配出来的空间写入元素
    // 写prev entry lenth到新的空间中，1个字节就写一个255，5个字节就写个255再写剩下的
    p += zipStorePrevEntryLength(p,prevlen);
    // 写entry coding
    p += zipStoreEntryEncoding(p,encoding,slen);
    // 判断encoding的类型，写真实的data
    if (ZIP_IS_STR(encoding)) {
        memcpy(p,s,slen);
    } else {
        zipSaveInteger(p,value,encoding);
    }
    //写个tail255
    ZIPLIST_INCR_LENGTH(zl,1);
    return zl;
}
```

#### 删除

- 使用__ziplistDelete来删除一个entry，分为三个步骤：
  - 1. 计算待删除元素的总长度、
  - 2. 数据复制
  - 3. 重新分配空间
- 它的实现是这样的：
  - 1. 先获取删除的节点并且计算该entry的字节数
  - 2. 计算prevlen和tail offset，将后续entry向前移动保证连续性，如果是尾部则不需要
  - 3. 重新调整内存，删除元素时，压缩列表所需空间减小
  - 4. 检查是否需要级联更新

```c
unsigned char *__ziplistDelete(unsigned char *zl, unsigned char *p, unsigned int num) {
    unsigned int i, totlen, deleted = 0;
    zlentry first, tail;
    
    // 步骤1: 解析第一个要删除的节点
    zipEntry(p, &first);
    
    // 步骤2: 计算要删除的总字节数
    for (i = 0; p[0] != ZIP_END && i < num; i++) {
        p += zipRawEntryLength(p);
        deleted++;
    }
    totlen = p - first.p;  // 被删除元素占用的总字节数
    
    if (totlen > 0) {
        if (p[0] != ZIP_END) {
            // 步骤3: 计算prevlen字段的变化
            int nextdiff = zipPrevLenByteDiff(p, first.prevrawlen);
            p -= nextdiff;
            zipStorePrevEntryLength(p, first.prevrawlen);
            
            // 步骤4: 更新 tail offset
            ZIPLIST_TAIL_OFFSET(zl) =
                intrev32ifbe(intrev32ifbe(ZIPLIST_TAIL_OFFSET(zl)) - totlen);
            
            // 步骤5: 移动后续数据覆盖被删除的部分
            memmove(first.p, p, 
                    intrev32ifbe(ZIPLIST_BYTES(zl)) - (p - zl) - 1);
        } else {
            // 删除的是尾部所有元素
            ZIPLIST_TAIL_OFFSET(zl) =
                intrev32ifbe((first.p - zl) - first.prevrawlen);
        }
        
        // 步骤6: 缩减内存
        size_t offset = first.p - zl;
        zl = ziplistResize(zl, intrev32ifbe(ZIPLIST_BYTES(zl)) - totlen + nextdiff);
        ZIPLIST_INCR_LENGTH(zl, -deleted);
        p = zl + offset;
        
        // 步骤7: 级联更新
        if (nextdiff != 0) {
            zl = __ziplistCascadeUpdate(zl, p);
        }
    }
    
    return zl;
}
```

#### 查找元素

- 使用ziplistFind来查找指定元素，它的实现是这样的：
  - 1. 遍历所有entry直到末尾，除非传入skip参数指定间隔
  - 2. 先解析当前entry的结构，得到编码类型和数据长度
  - 3. 根据字符数组/整数分别比较
  - 4. 返回结果，如果没找到返回null
  
- 使用ziplistIndex指定一个索引来查找元素，它的实现是这样的：
  - 1. 针对传入的索引的符号，正数从头开始找，负数从尾开始
  - 2. 每次移动一个节点就更改index值
  - 3. 当index归零并且指针有效时返回，否则返回空

```c
unsigned char *ziplistFind(unsigned char *p, unsigned char *vstr, 
                          unsigned int vlen, unsigned int skip) {
    int skipcnt = 0;
    unsigned char vencoding = 0;
    long long vll = 0;
    
    while (p[0] != ZIP_END) {
        unsigned int prevlensize, encoding, lensize, len;
        unsigned char *q;
        
        // 解析当前节点
        ZIP_DECODE_PREVLENSIZE(p, prevlensize);
        ZIP_DECODE_LENGTH(p + prevlensize, encoding, lensize, len);
        q = p + prevlensize + lensize;  // 指向数据部分
        
        if (skipcnt == 0) {
            // 比较当前节点
            if (ZIP_IS_STR(encoding)) {
                // 字符串比较
                if (len == vlen && memcmp(q, vstr, vlen) == 0) {
                    return p;
                }
            } else {
                // 整数比较
                if (vencoding == 0) {
                    zipTryEncoding(vstr, vlen, &vll, &vencoding);
                }
                if (vencoding != UCHAR_MAX) {
                    long long ll = zipLoadInteger(q, encoding);
                    if (ll == vll) {
                        return p;
                    }
                }
            }
            
            skipcnt = skip;  // 重置跳过计数
        } else {
            skipcnt--;
        }
        
        // 移动到下一个节点
        p = q + len;
    }
    
    return NULL;
}
unsigned char *ziplistIndex(unsigned char *zl, int index) {
    unsigned char *p;
    unsigned int prevlensize, prevlen = 0;
    
    if (index < 0) {
        // 负索引：从尾部向前遍历
        index = (-index) - 1;
        p = ZIPLIST_ENTRY_TAIL(zl);
        if (p[0] != ZIP_END) {
            ZIP_DECODE_PREVLEN(p, prevlensize, prevlen);
            while (prevlen > 0 && index--) {
                p -= prevlen;  // 利用prevlen反向移动
                ZIP_DECODE_PREVLEN(p, prevlensize, prevlen);
            }
        }
    } else {
        // 正索引：从头部向后遍历
        p = ZIPLIST_ENTRY_HEAD(zl);
        while (p[0] != ZIP_END && index--) {
            p += zipRawEntryLength(p);  // 前向移动
        }
    }
    
    return (p[0] == ZIP_END || index > 0) ? NULL : p;
}
```

#### 遍历操作

- 使用 ziplistNext/ziplistPrev 进行正向/反向遍历操作，它的实现是这样的：
  - 1. 根据传入的p指针，逐个遍历
  - 2. 如果遍历到尾部返回

```c
unsigned char *ziplistNext(unsigned char *zl, unsigned char *p) {
    ((void) zl);  // zl参数未使用（保留用于API一致性）
    
    // 情况1: 当前已经是END
    if (p[0] == ZIP_END) {
        return NULL;
    }
    
    // 情况2: 移动到下一个entry
    p += zipRawEntryLength(p);  // 跳过当前整个entry
    
    // 情况3: 检查下一个是否是END
    if (p[0] == ZIP_END) {
        return NULL;
    }
    
    return p;
}
unsigned char *ziplistPrev(unsigned char *zl, unsigned char *p) {
    unsigned int prevlensize, prevlen = 0;
    
    if (p[0] == ZIP_END) {
        p = ZIPLIST_ENTRY_TAIL(zl);
        return (p[0] == ZIP_END) ? NULL : p;
    } else if (p == ZIPLIST_ENTRY_HEAD(zl)) {
        return NULL;
    } else {
        ZIP_DECODE_PREVLEN(p, prevlensize, prevlen);
        return p - prevlen;  // 利用prevlen反向移动
    }
}
```

#### 级联更新

- 当插入或删除元素时，如果导致某个节点的 prevlen 改变，影响其总大小，会影响后续节点的 prevlen长度，导致后续节点也要更新，引发连锁反应。
- 级联更新会导致多次重新分配内存及数据复制，效率很低。但是出现这种情况的概率是很低的，因此对于删除元素和插入元素操作，Redis并没有为了避免连锁更新而采取措施。Redis只是在删除元素和插入元素操作的末尾，检查是否需要更新后续元素的previous_entry_length字段，其实现函数为_ziplistCascadeUpdate：
  - 1. 先解析出当前entry长度和存储rawlen所需空间大小
  - 2. 检查是否有下一个节点，没有就不要级联更新
  - 3. 解析下一个节点并判断是否需要更新，比较rawlen长度
  - 4. 根据比较结果对下一个节点进行扩容或缩容，如果扩容还需要继续检查，直到没有出现扩容返回

```c
unsigned char *__ziplistCascadeUpdate(unsigned char *zl, unsigned char *p) {
    size_t curlen = intrev32ifbe(ZIPLIST_BYTES(zl));  // 当前ziplist总长度
    size_t rawlen, rawlensize;
    size_t offset, noffset, extra;
    unsigned char *np;
    zlentry cur, next;

    // ===== 主循环：检查每个entry，直到不需要更新 =====
    while (p[0] != ZIP_END) {
        // 步骤1: 解析当前entry
        zipEntry(p, &cur);
        rawlen = cur.headersize + cur.len;  // 当前entry的总长度
        
        // 计算存储rawlen需要多少字节（1或5）
        rawlensize = zipStorePrevEntryLength(NULL, rawlen);

        // 步骤2: 检查是否有下一个entry
        if (p[rawlen] == ZIP_END) 
            break;  // 没有下一个，结束
        
        // 步骤3: 解析下一个entry
        zipEntry(p + rawlen, &next);

        // 步骤4: 检查是否需要更新
        // 如果下一个entry记录的prevlen就是当前的rawlen，不需要更新
        if (next.prevrawlen == rawlen) 
            break;  //  完成，不需要继续

        // ===== 需要更新：分两种情况 =====
        
        if (next.prevrawlensize < rawlensize) {
            // 情况A: 需要扩展（1字节→5字节）
            // ────────────────────────────────
            
            offset = p - zl;
            extra = rawlensize - next.prevrawlensize;  // 增加4字节
            
            // A1. 重新分配内存（扩大ziplist）
            zl = ziplistResize(zl, curlen + extra);
            p = zl + offset;  // 更新指针
            
            np = p + rawlen;   // 指向下一个entry
            noffset = np - zl;
            
            // A2. 更新zltail（如果下一个entry不是tail）
            if ((zl + intrev32ifbe(ZIPLIST_TAIL_OFFSET(zl))) != np) {
                ZIPLIST_TAIL_OFFSET(zl) =
                    intrev32ifbe(intrev32ifbe(ZIPLIST_TAIL_OFFSET(zl)) + extra);
            }
            
            // A3. 移动后续数据，为新的prevlen字段腾出空间
            memmove(np + rawlensize,              // 目标位置：新prevlen之后
                    np + next.prevrawlensize,     // 源位置：旧prevlen之后
                    curlen - noffset - next.prevrawlensize - 1);
            
            // A4. 写入新的prevlen
            zipStorePrevEntryLength(np, rawlen);
            
            // A5. 继续检查下一个entry
            p += rawlen;
            curlen += extra;
            
        } else {
            // 情况B: prevlen字段大小不变 或 需要缩减
            // ────────────────────────────────
            
            if (next.prevrawlensize > rawlensize) {
                // B1. 需要缩减（5字节→1字节）
                // Redis策略：故意不缩减，避免"抖动"
                // 使用Large格式存储小值
                zipStorePrevEntryLengthLarge(p + rawlen, rawlen);
            } else {
                // B2. 大小不变，直接更新值
                zipStorePrevEntryLength(p + rawlen, rawlen);
            }
            
            // 不需要继续检查后续entry
            break;
        }
    }
    
    return zl;
}
```

## quicklist

- quicklist 是 Redis 3.2 版本引入的一种数据结构，用于实现 List 类型。它结合了双向链表和压缩列表（ziplist）的优点，既能够支持高效的插入和删除操作，又能够节省内存空间。
- quicklist 的设计思想是：将多个 ziplist 通过双向链表连接起来，每个 ziplist 节点存储一定数量的元素。这样既保持了 ziplist 节省内存的优势，又通过链表结构避免了 ziplist 在插入删除时可能出现的级联更新问题。
- quicklist 还支持节点压缩功能，可以对中间节点进行 LZF 压缩，进一步节省内存空间。

### quicklist 设计

- quicklist是一个双向链表，链表中的每个节点是一个ziplist结构。quicklist可以看成是用双向链表将若干小型的ziplist连接到一起组成的一种数据结构。
- 当ziplist节点个数过多，quicklist退化为双向链表
  - 一个极端的情况就是每个ziplist节点只包含一个entry，即只有一个元素。
- 当ziplist元素个数过少时，quicklist可退化为ziplist，
  - 一种极端的情况就是quicklist中只有一个ziplist节点。

- 快表结构体包含了：
  - 1. 双向指针head、tail指向quicklist的首尾节点
  - 2. count为quicklist中元素总数
  - 3. len为quicklist Node（节点）个数
  - 4. fill用来指明每个quicklistNode中ziplist长度，当fill为正数时，表明每个ziplist最多含有的数据项数,负数则是最大大小
  - 5. compress表示两端节点的**未压缩个数**
    - 由于quicklistNode节点个数较多时，我们经常访问的是两端的数据，为了进一步节省空间，Redis允许对中间的quicklistNode节点进行压缩，通过修改参数list-compress-depth进行配置，即设置compress参数，该项的具体含义是两端各有compress个节点不压缩。
    - 压缩过后的数据可以分成多个片段，每个片段有2部分：一部分是解释字段，另一部分是存放具体的数据字段。解释字段可以占用1～3个字节，数据字段可能不存在
    - LZF数据压缩的基本思想是：数据与前面重复的，记录重复位置以及重复长度，否则直接记录原始数据内容。

|fill|ziplist节点最大的大小
|---|---
|-1|4kb
|-2|8kb
|-3|16kb
|-4|32kb
|-5|64kb

- 快表节点中包含了：
  - 1. prev、next指向该节点的前后节点
  - 2. zl指向该节点对应的ziplist结构
  - 3. sz代表整个ziplist结构的大小
  - 4. count代表ziplist存储的元素数量
  - 5. encoding代表采用的编码方式：1代表是原生的，2代表使用LZF进行压缩
  - 6. container为quicklistNode节点zl指向的容器类型：1代表none,2代表使用ziplist存储数据
  - 7. recompress代表这个节点之前是否是压缩节点，若是，则在使用压缩节点前先进行解压缩，使用后需要重新压缩，此外为1，代表是压缩节点
  - 8. attempted_compress测试是否压缩
  - 9. extra为预留。
- 快表节点可以压缩，对ziplist利用LZF算法进行压缩时，quicklistNode节点指向的结构为quicklistLZF而不是ziplist:
  - 1. sz表示压缩后的数据大小
  - 2. compressed数组存储压缩后的数据
- 和ziplist类似，quicklist也提供了quicklistEntry便于使用（因为它的节点是ziplist）:
  - 1. quicklist指向当前元素所在的quicklist;
  - 2. node指向当前元素所在的quicklistNode结构
  - 3. zi指向当前元素所在的ziplist
  - 4. value指向该节点的字符串内容
  - 5. longval为该节点的整型值
  - 6. sz代表该节点的大小，与value配合使用
  - 7. offset表明该节点相对于整个ziplist的偏移量，即该节点是ziplist第多少个entry
- quicklistIter是quicklist中用于遍历的迭代器:
  - 1. quicklist指向当前元素所处的quicklist;
  - 2. current指向元素所在quicklistNode;
  - 3. zi指向元素所在的ziplist
  - 4. offset表明节点在所在的ziplist中的偏移量
  - 5. direction表明迭代器的方向。

```c
//快表结构体
// quicklist.h 第 73-80 行
typedef struct quicklist {
    quicklistNode *head;             // 头节点指针
    quicklistNode *tail;             // 尾节点指针
    unsigned long count;             // 所有元素的总数
    unsigned long len;               // 节点数量
    int fill : 16;                   // 填充因子
    unsigned int compress : 16;      // 压缩深度
} quicklist;
// quicklist.h 第 44-55 行
// 快表节点
typedef struct quicklistNode {
    struct quicklistNode *prev;      // 前驱节点指针
    struct quicklistNode *next;      // 后继节点指针
    unsigned char *zl;               // 指向 ziplist 的指针
    unsigned int sz;                 // ziplist 的字节大小
    unsigned int count : 16;          // ziplist 中元素的数量
    unsigned int encoding : 2;       // 编码类型：RAW=1, LZF=2
    unsigned int container : 2;     // 容器类型：NONE=1, ZIPLIST=2
    unsigned int recompress : 1;     // 是否临时解压缩
    unsigned int attempted_compress : 1; // 是否尝试过压缩
    unsigned int extra : 10;         // 预留位
} quicklistNode;
//快表压缩节点
// quicklist.h 第 62-65 行（压缩节点结构）
typedef struct quicklistLZF {
    unsigned int sz;                 // 压缩后的大小
    char compressed[];               // 压缩数据
} quicklistLZF;
// quicklist.h 第 90-98 行
typedef struct quicklistEntry {
    const quicklist *quicklist;
    quicklistNode *node;
    unsigned char *zi;
    unsigned char *value;
    long long longval;
    unsigned int sz;
    int offset;
} quicklistEntry;
// quicklist.h 第 82-88 行
typedef struct quicklistIter {
    const quicklist *quicklist;
    quicklistNode *current;
    unsigned char *zi;
    long offset; /* offset in current ziplist */
    int direction;
} quicklistIter;
```

### quicklist 方法

- 这里分析 quicklist 的创建、插入、删除、查找、迭代等函数。

#### 创建

- 使用 quicklistCreate() 创建空的 quicklist，使用 quicklistNew() 创建带参数的 quicklist，它们的实现是这样的：
  - 1. quicklistCreate()：
    - 1. 调用 zmalloc 分配 quicklist 结构体内存
    - 2. 初始化 head 和 tail 为 NULL，len 和 count 为 0
    - 3. 设置 compress 为 0（不压缩），fill 为 -2（使用默认值）, Redis默认quicklistNode每个ziplist的大小限制是8KB，并且不对节点进行压缩
  - 2. quicklistNew()：
    - 1. 调用 quicklistCreate() 创建 quicklist
    - 2. 调用 quicklistSetOptions() 设置 fill 和 compress 参数

```c
// quicklist.c 第 94-104 行
quicklist *quicklistCreate(void) {
    struct quicklist *quicklist;
    
    quicklist = zmalloc(sizeof(*quicklist));  // 1. 分配内存
    quicklist->head = quicklist->tail = NULL;  // 2. 初始化指针
    quicklist->len = 0;                        // 3. 初始化长度
    quicklist->count = 0;                      // 4. 初始化元素计数
    quicklist->compress = 0;                  // 5. 不压缩
    quicklist->fill = -2;                      // 6. 默认填充因子
    return quicklist;
}

// quicklist.c 第 132-136 行
quicklist *quicklistNew(int fill, int compress) {
    quicklist *quicklist = quicklistCreate();  // 1. 创建基础结构
    quicklistSetOptions(quicklist, fill, compress);  // 2. 设置参数
    return quicklist;
}
```

#### 插入

- 使用 quicklistPushHead() 和 quicklistPushTail() 在头部和尾部插入元素，它们的实现是这样的：
  - 1. 检查当前节点是否允许插入（根据 fill 因子和节点大小，因为一个ziplist有多个entry, 不允许就新建快表节点）
  - 2. 如果允许，直接在节点的 ziplist 中插入
  - 3. 如果不允许，创建新节点并插入到链表头部/尾部
  - 4. 更新节点大小和元素计数
- 具体插入策略如下：
  - 对于quicklist的一般插入可以分为可以继续插入和不能继续插入
  - 1. 当前插入位置所在的quicklistNode仍然可以继续插入，此时可以直接插入。
  - 2. 当前插入位置所在的quicklistNode不能继续插入，此时可以分为如下几种情况。
    - 1. 需要向当前quicklistNode第一个元素（entry1）前面插入元素，当前ziplist所在的quicklistNode的前一个quicklistNode可以插入，则将数据插入到前一个quicklistNode。如果前一个quicklistNode不能插入（不包含前一个节点为空的情况）​，则新建一个quicklistNode插入到当前quicklistNode前面。
    - 2. 需要向当前quicklistNode的最后一个元素（entryN）后面插入元素，当前ziplist所在的quicklistNode的后一个quicklistNode可以插入，则直接将数据插入到后一个quicklistNode。如果后一个quicklistNode不能插入（不包含为后一个节点为空的情况）​，则新建一个quicklistNode插入到当前quicklistNode的后面。
    - 3. 不满足前面2个条件的所有其他种情况，将当前所在的quicklistNode以当前待插入位置为基准，拆分成左右两个quicklistNode，之后将需要插入的数据插入到其中一个拆分出来的quicklistNode中

```c
// quicklist.c 第 480-497 行
int quicklistPushHead(quicklist *quicklist, void *value, size_t sz) {
    quicklistNode *orig_head = quicklist->head;
    
    // 1. 检查当前头节点是否允许插入
    if (likely(_quicklistNodeAllowInsert(quicklist->head, quicklist->fill, sz))) {
        // 2. 允许插入：直接在 ziplist 头部插入
        quicklist->head->zl = ziplistPush(quicklist->head->zl, value, sz, ZIPLIST_HEAD);
        quicklistNodeUpdateSz(quicklist->head);  // 3. 更新节点大小
    } else {
        // 4. 不允许插入：创建新节点
        quicklistNode *node = quicklistCreateNode();
        node->zl = ziplistPush(ziplistNew(), value, sz, ZIPLIST_HEAD);
        quicklistNodeUpdateSz(node);
        _quicklistInsertNodeBefore(quicklist, quicklist->head, node);  // 5. 插入到链表
    }
    quicklist->count++;                         // 6. 更新总计数
    quicklist->head->count++;                   // 7. 更新节点计数
    return (orig_head != quicklist->head);       // 8. 返回是否创建了新节点
}

// quicklist.c 第 503-520 行
int quicklistPushTail(quicklist *quicklist, void *value, size_t sz) {
    quicklistNode *orig_tail = quicklist->tail;
    
    // 1. 检查当前尾节点是否允许插入
    if (likely(_quicklistNodeAllowInsert(quicklist->tail, quicklist->fill, sz))) {
        // 2. 允许插入：直接在 ziplist 尾部插入
        quicklist->tail->zl = ziplistPush(quicklist->tail->zl, value, sz, ZIPLIST_TAIL);
        quicklistNodeUpdateSz(quicklist->tail);  // 3. 更新节点大小
    } else {
        // 4. 不允许插入：创建新节点
        quicklistNode *node = quicklistCreateNode();
        node->zl = ziplistPush(ziplistNew(), value, sz, ZIPLIST_TAIL);
        quicklistNodeUpdateSz(node);
        _quicklistInsertNodeAfter(quicklist, quicklist->tail, node);  // 5. 插入到链表
    }
    quicklist->count++;                         // 6. 更新总计数
    quicklist->tail->count++;                   // 7. 更新节点计数
    return (orig_tail != quicklist->tail);       // 8. 返回是否创建了新节点
}
```

#### 删除

- 使用 quicklistDelEntry() 删除指定元素,调用底层quicklistDelIndex函数，该函数可以删除quicklistNode指向的ziplist中的某个元素，其中p指向ziplist中某个entry的起始位置。也可以使用 quicklistDelRange() 删除范围元素，它们的实现是这样的：
  - 1. quicklistDelEntry()：
    - 1. 调用 quicklistDelIndex() 从节点的 ziplist 中删除元素
    - 2. 如果节点为空，删除整个节点
    - 3. 更新迭代器状态
  - 2. quicklistDelRange()：
    - 1. 根据索引找到起始位置
    - 2. 遍历节点，删除指定范围的元素
    - 3. 如果节点为空，删除整个节点
    - 返回0代表没有删除任何元素，返回1并不代表删除了count个元素，因为count可能大于quicklist所有元素个数，故而只能代表操作成功

- 另外，删除单一元素，可以使用quicklist对外的接口quicklistDelEntry实现，也可以通过quicklistPop将头部或者尾部元素弹出。quicklistPop可以弹出头部或者尾部元素，具体实现是通过ziplist的接口获取元素值，再通过上述的quicklistDelIndex将数据删除。

```c
// quicklist.c 第 634-661 行
void quicklistDelEntry(quicklistIter *iter, quicklistEntry *entry) {
    quicklistNode *prev = entry->node->prev;
    quicklistNode *next = entry->node->next;
    
    // 1. 从 ziplist 中删除元素
    int deleted_node = quicklistDelIndex((quicklist *)entry->quicklist,
                                         entry->node, &entry->zi);
    
    iter->zi = NULL;  // 2. 标记迭代器失效
    
    // 3. 如果节点被删除，更新迭代器
    if (deleted_node) {
        if (iter->direction == AL_START_HEAD) {
            iter->current = next;
            iter->offset = 0;
        } else if (iter->direction == AL_START_TAIL) {
            iter->current = prev;
            iter->offset = -1;
        }
    }
}

// quicklist.c 第 613-628 行（内部函数）
REDIS_STATIC int quicklistDelIndex(quicklist *quicklist, quicklistNode *node,
                                   unsigned char **p) {
    int gone = 0;
    
    // 1. 从 ziplist 中删除元素
    node->zl = ziplistDelete(node->zl, p);
    node->count--;  // 2. 更新节点计数
    
    // 3. 如果节点为空，删除整个节点
    if (node->count == 0) {
        gone = 1;
        __quicklistDelNode(quicklist, node);
    } else {
        quicklistNodeUpdateSz(node);  // 4. 更新节点大小
    }
    quicklist->count--;  // 5. 更新总计数
    return gone ? 1 : 0;  // 6. 返回是否删除了节点
}

// quicklist.c 第 958-1039 行
int quicklistDelRange(quicklist *quicklist, const long start, const long count) {
    if (count <= 0) return 0;
    
    unsigned long extent = count;  // 1. 计算删除范围
    
    // 2. 限制删除范围不超过列表大小
    if (start >= 0 && extent > (quicklist->count - start)) {
        extent = quicklist->count - start;
    } else if (start < 0 && extent > (unsigned long)(-start)) {
        extent = -start;
    }
    
    quicklistEntry entry;
    if (!quicklistIndex(quicklist, start, &entry))  // 3. 找到起始位置
        return 0;
    
    quicklistNode *node = entry.node;
    
    // 4. 遍历节点删除元素
    while (extent) {
        quicklistNode *next = node->next;
        unsigned long del;
        int delete_entire_node = 0;
        
        // 5. 计算当前节点需要删除的元素数
        if (entry.offset == 0 && extent >= node->count) {
            delete_entire_node = 1;
            del = node->count;
        } else if (entry.offset >= 0 && extent >= node->count) {
            del = node->count - entry->offset;
        } else if (entry.offset < 0) {
            del = -entry->offset;
            if (del > extent) del = extent;
        } else {
            del = extent;
        }
        
        // 6. 执行删除
        if (delete_entire_node) {
            __quicklistDelNode(quicklist, node);  // 删除整个节点
        } else {
            quicklistDecompressNodeForUse(node);  // 解压缩节点
            node->zl = ziplistDeleteRange(node->zl, entry.offset, del);  // 删除范围
            quicklistNodeUpdateSz(node);
            node->count -= del;
            quicklist->count -= del;
            quicklistDeleteIfEmpty(quicklist, node);  // 如果为空则删除节点
            if (node) quicklistRecompressOnly(quicklist, node);
        }
        
        extent -= del;
        node = next;
        entry.offset = 0;
    }
    return 1;
}
```

#### 查找

- 使用 quicklistIndex() 根据索引查找元素，基本思路是首先找到index对应的数据所在的quicklistNode节点，之后调用ziplist的接口函数ziplistGet得到index对应的数据，它的实现是这样的：
  - 1. 根据索引的正负判断从头还是从尾开始查找
  - 2. 遍历节点，累加每个节点的元素数量
  - 3. 找到目标节点后，在 ziplist 中定位具体元素
  - 4. 填充 quicklistEntry 结构并返回

```c
// quicklist.c 第 1225-1279 行
int quicklistIndex(const quicklist *quicklist, const long long idx,
                   quicklistEntry *entry) {
    quicklistNode *n;
    unsigned long long accum = 0;
    unsigned long long index;
    int forward = idx < 0 ? 0 : 1; /* < 0 -> reverse, 0+ -> forward */

    initEntry(entry);
    entry->quicklist = quicklist;

    if (!forward) {
        index = (-idx) - 1;
        n = quicklist->tail;
    } else {
        index = idx;
        n = quicklist->head;
    }

    if (index >= quicklist->count)
        return 0;

    while (likely(n)) {
        if ((accum + n->count) > index) {
            break;
        } else {
            D("Skipping over (%p) %u at accum %lld", (void *)n, n->count,
              accum);
            accum += n->count;
            n = forward ? n->next : n->prev;
        }
    }

    if (!n)
        return 0;

    D("Found node: %p at accum %llu, idx %llu, sub+ %llu, sub- %llu", (void *)n,
      accum, index, index - accum, (-index) - 1 + accum);

    entry->node = n;
    if (forward) {
        entry->offset = index - accum;
    } else {
        entry->offset = (-index) - 1 + accum;
    }

    quicklistDecompressNodeForUse(entry->node);
    entry->zi = ziplistIndex(entry->node->zl, entry->offset);
    ziplistGet(entry->zi, &entry->value, &entry->sz, &entry->longval);
    return 1;
}
```

#### 迭代

- 使用 quicklistGetIterator() 创建迭代器，使用 quicklistNext() 获取下一个元素，它们的实现是这样的：
  - 1. quicklistGetIterator()：
    - 1. 分配迭代器内存
    - 2. 根据方向设置起始节点和偏移量
    - 3. 初始化迭代器状态
  - 2. quicklistNext()：
    - 1. 如果当前 ziplist 位置有效，获取下一个元素
    - 2. 如果到达 ziplist 末尾，移动到下一个节点
    - 3. 解压缩节点（如果需要）并返回元素

```c
// quicklist.c 第 1048-1067 行
quicklistIter *quicklistGetIterator(const quicklist *quicklist, int direction) {
    quicklistIter *iter;
    
    iter = zmalloc(sizeof(*iter));  // 1. 分配内存
    
    // 2. 根据方向设置起始位置
    if (direction == AL_START_HEAD) {
        iter->current = quicklist->head;
        iter->offset = 0;
    } else if (direction == AL_START_TAIL) {
        iter->current = quicklist->tail;
        iter->offset = -1;
    }
    
    iter->direction = direction;      // 3. 设置方向
    iter->quicklist = quicklist;      // 4. 设置 quicklist 指针
    iter->zi = NULL;                  // 5. 初始化 ziplist 位置
    return iter;
}

// quicklist.c 第 1117-1178 行
int quicklistNext(quicklistIter *iter, quicklistEntry *entry) {
    initEntry(entry);
    
    if (!iter || !iter->current) return 0;  // 1. 检查有效性
    
    entry->quicklist = iter->quicklist;
    entry->node = iter->current;
    
    unsigned char *(*nextFn)(unsigned char *, unsigned char *) = NULL;
    int offset_update = 0;
    
    if (!iter->zi) {
        // 2. 首次访问：解压缩并定位
        quicklistDecompressNodeForUse(iter->current);
        iter->zi = ziplistIndex(iter->current->zl, iter->offset);
    } else {
        // 3. 后续访问：移动到下一个元素
        if (iter->direction == AL_START_HEAD) {
            nextFn = ziplistNext;
            offset_update = 1;
        } else if (iter->direction == AL_START_TAIL) {
            nextFn = ziplistPrev;
            offset_update = -1;
        }
        iter->zi = nextFn(iter->current->zl, iter->zi);
        iter->offset += offset_update;
    }
    
    entry->zi = iter->zi;
    entry->offset = iter->offset;
    
    if (iter->zi) {
        // 4. 获取元素值
        ziplistGet(entry->zi, &entry->value, &entry->sz, &entry->longval);
        return 1;
    } else {
        // 5. 到达 ziplist 末尾：移动到下一个节点
        quicklistCompress(iter->quicklist, iter->current);
        if (iter->direction == AL_START_HEAD) {
            iter->current = iter->current->next;
            iter->offset = 0;
        } else if (iter->direction == AL_START_TAIL) {
            iter->current = iter->current->prev;
            iter->offset = -1;
        }
        iter->zi = NULL;
        return quicklistNext(iter, entry);  // 6. 递归查找下一个节点
    }
}
```

#### 释放

- 使用 quicklistRelease() 释放整个 quicklist，它的实现是这样的：
  - 1. 遍历所有节点
  - 2. 释放每个节点的 ziplist 内存
  - 3. 释放节点结构体内存
  - 4. 释放 quicklist 结构体内存

```c
// quicklist.c 第 155-173 行
void quicklistRelease(quicklist *quicklist) {
    unsigned long len;
    quicklistNode *current, *next;
    
    current = quicklist->head;
    len = quicklist->len;
    
    // 1. 遍历所有节点
    while (len--) {
        next = current->next;
        
        zfree(current->zl);                    // 2. 释放 ziplist
        quicklist->count -= current->count;     // 3. 更新计数
        
        zfree(current);                         // 4. 释放节点
        quicklist->len--;
        current = next;
    }
    zfree(quicklist);                          // 5. 释放 quicklist 结构体
}
```

## intset

- intset（整数集合）是 Redis 一个有序的、连续空间的、存储整型数据的结构，它可以保存类型为 int16_t、int32_t 或 int64_t 的整数值，并且保证集合中不会出现重复元素。当Redis集合类型的元素都是整数并且都处在64位有符号整数范围之内时，使用该结构体存储。
- intset 的设计思想是：使用有序数组存储整数，支持动态升级编码类型（从 int16_t 升级到 int32_t 再到 int64_t），在保证有序性的同时节省内存空间。
- intset 主要用于实现 Set 类型，当集合中的元素都是整数且数量较少时，Redis 会使用 intset 作为底层实现。

### intset 设计

- intset 是一个紧凑的数组结构，包含编码类型、元素数量和实际存储的整数数组。
- intset 结构体：
  - encoding：编码类型（uint32_t），可以是 INTSET_ENC_INT16、INTSET_ENC_INT32 或 INTSET_ENC_INT64
    - 1. INTSET_ENC_INT16：当元素值都位于INT16_MIN和INT16_MAX之间时使用。该编码方式为每个元素占用2个字节。
    - 2. INTSET_ENC_INT32：当元素值位于INT16_MAX到INT32_MAX或者INT32_MIN到INT16_MIN之间时使用。该编码方式为每个元素占用4个字节。
    - 3. INTSET_ENC_INT64：当元素值位于INT32_MAX到INT64_MAX或者INT64_MIN到INT32_MIN之间时使用。该编码方式为每个元素占用8个字节
    - intset结构体会根据待插入的值决定是否需要进行扩容操作。扩容会修改encoding字段，而encoding字段决定了一个元素在contents柔性数组中占用几个字节。所以当修改encoding字段之后，intset中原来的元素也需要在contents中进行相应的扩展。
    - 当待插入值的encoding字段大于待插入intset的encoding时，说明需要进行扩容操作，既然需要更改encoding那么整数范围更大，也能表明该待插入值在该intset中肯定不存在、
    - 所以某种程度上来说，encoding决定了当前intset存储整数的**范围**，该特性对增删改查的边界条件判断很有用
  - length：集合中元素的数量（uint32_t）
  - contents：柔性数组，实际存储整数数据（int8_t[]），根据 encoding 类型解释为不同大小的整数

```c
// intset.h 第 35-39 行
typedef struct intset {
    uint32_t encoding;    // 编码类型：INTSET_ENC_INT16/INT32/INT64
    uint32_t length;      // 元素数量
    int8_t contents[];    // 柔性数组，存储实际整数数据
} intset;

// intset.c 第 40-42 行（编码类型定义）
#define INTSET_ENC_INT16 (sizeof(int16_t))  // 2 字节
#define INTSET_ENC_INT32 (sizeof(int32_t))  // 4 字节
#define INTSET_ENC_INT64 (sizeof(int64_t))  // 8 字节
```

### intset 方法

- 这里分析 intset 的创建、添加、删除、查找等函数。

#### 创建

- 使用 intsetNew() 创建空的 intset，它的实现是这样的：
  - 1. 调用 zmalloc 分配 intset 结构体内存
  - 2. 设置编码类型为 INTSET_ENC_INT16（最小类型）
  - 3. 设置长度为 0

```c
// intset.c 第 97-102 行
intset *intsetNew(void) {
    intset *is = zmalloc(sizeof(intset));  // 1. 分配内存
    is->encoding = intrev32ifbe(INTSET_ENC_INT16);  // 2. 设置编码为 int16
    is->length = 0;                        // 3. 初始化长度为 0
    return is;
}
```

#### 添加

- 使用 intsetAdd() 添加整数到集合，它的实现是这样的：
  - 1. 计算新值所需的编码类型
  - 2. 如果新编码大于当前编码，调用 intsetUpgradeAndAdd() 升级并添加
  - 3. 否则，使用二分查找确定插入位置
  - 4. 查重，如果值已存在，返回失败
  - 5. 扩容数组并移动后续元素
  - 6. 插入新值并更新长度

```c
// intset.c 第 204-231 行
intset *intsetAdd(intset *is, int64_t value, uint8_t *success) {
    uint8_t valenc = _intsetValueEncoding(value);  // 1. 计算所需编码类型
    uint32_t pos;
    if (success) *success = 1;
    
    // 2. 需要升级编码类型
    if (valenc > intrev32ifbe(is->encoding)) {
        return intsetUpgradeAndAdd(is, value);  // 升级并添加
    } else {
        // 3. 使用二分查找确定位置
        if (intsetSearch(is, value, &pos)) {
            if (success) *success = 0;  // 4. 值已存在
            return is;
        }
        
        // 5. 扩容数组
        is = intsetResize(is, intrev32ifbe(is->length) + 1);
        // 6. 移动后续元素
        if (pos < intrev32ifbe(is->length))
            intsetMoveTail(is, pos, pos + 1);
    }
    
    // 7. 插入新值
    _intsetSet(is, pos, value);
    is->length = intrev32ifbe(intrev32ifbe(is->length) + 1);
    return is;
}

// intset.c 第 115-154 行（二分查找）
static uint8_t intsetSearch(intset *is, int64_t value, uint32_t *pos) {
    int min = 0, max = intrev32ifbe(is->length) - 1, mid = -1;
    int64_t cur = -1;
    
    // 1. 空集合快速返回
    if (intrev32ifbe(is->length) == 0) {
        if (pos) *pos = 0;
        return 0;
    } else {
        // 2. 边界检查
        if (value > _intsetGet(is, max)) {
            if (pos) *pos = intrev32ifbe(is->length);
            return 0;
        } else if (value < _intsetGet(is, 0)) {
            if (pos) *pos = 0;
            return 0;
        }
    }
    
    // 3. 二分查找
    while (max >= min) {
        mid = ((unsigned int)min + (unsigned int)max) >> 1;
        cur = _intsetGet(is, mid);
        if (value > cur) {
            min = mid + 1;
        } else if (value < cur) {
            max = mid - 1;
        } else {
            break;  // 找到
        }
    }
    
    // 4. 返回结果
    if (value == cur) {
        if (pos) *pos = mid;
        return 1;  // 找到
    } else {
        if (pos) *pos = min;
        return 0;  // 未找到，返回插入位置
    }
}

// intset.c 第 157-180 行（升级编码并添加）
static intset *intsetUpgradeAndAdd(intset *is, int64_t value) {
    uint8_t curenc = intrev32ifbe(is->encoding);
    uint8_t newenc = _intsetValueEncoding(value);
    int length = intrev32ifbe(is->length);
    int prepend = value < 0 ? 1 : 0;  // 负数插入头部，正数插入尾部
    
    // 1. 设置新编码并扩容
    is->encoding = intrev32ifbe(newenc);
    is = intsetResize(is, intrev32ifbe(is->length) + 1);
    
    // 2. 从后往前升级所有元素（避免覆盖）
    while (length--)
        _intsetSet(is, length + prepend, _intsetGetEncoded(is, length, curenc));
    
    // 3. 插入新值
    if (prepend)
        _intsetSet(is, 0, value);
    else
        _intsetSet(is, intrev32ifbe(is->length), value);
    is->length = intrev32ifbe(intrev32ifbe(is->length) + 1);
    return is;
}
```

#### 删除

- 使用 intsetRemove() 从集合中删除整数，该函数查找需要删除的元素然后通过**内存地址的移动**直接将该元素覆盖掉，它的实现是这样的：
  - 1. 计算值的编码类型
  - 2. 如果编码类型兼容且值存在，使用二分查找定位
  - 3. 移动后续元素覆盖被删除的元素
  - 4. 缩容数组并更新长度

```c
// intset.c 第 234-251 行
intset *intsetRemove(intset *is, int64_t value, int *success) {
    uint8_t valenc = _intsetValueEncoding(value);
    uint32_t pos;
    if (success) *success = 0;
    
    // 1. 检查编码类型兼容性并查找位置
    if (valenc <= intrev32ifbe(is->encoding) && intsetSearch(is, value, &pos)) {
        uint32_t len = intrev32ifbe(is->length);
        
        if (success) *success = 1;  // 2. 标记成功
        
        // 3. 移动后续元素覆盖被删除元素
        if (pos < (len - 1))
            intsetMoveTail(is, pos + 1, pos);
        
        // 4. 缩容数组
        is = intsetResize(is, len - 1);
        is->length = intrev32ifbe(len - 1);
    }
    return is;
}
```

#### 查找

- 使用 intsetFind() 查找整数是否在集合中，它的实现是这样的：
  - 1. 计算值的编码类型，因为编码不符合的话肯定不在当前intset存储范围内
  - 2. 如果编码类型兼容，调用 intsetSearch() 进行二分查找，如果编码相同但超出范围也返回0
  - 3. 返回查找结果

```c
// intset.c 第 254-257 行
uint8_t intsetFind(intset *is, int64_t value) {
    uint8_t valenc = _intsetValueEncoding(value);  // 1. 计算编码类型
    // 2. 编码兼容且值存在
    // 编码方式如果大于当前intset的编码方式，直接返回0。否则调用intsetSearch函数进行查找
    return valenc <= intrev32ifbe(is->encoding) && intsetSearch(is, value, NULL);

static uint8_t intsetSearch(intset ＊is, int64_t value, uint32_t ＊pos) {
    int min = 0, max = intrev32ifbe(is->length)-1, mid = -1;
    int64_t cur = -1;
    if (intrev32ifbe(is->length) == 0) { //如果intset中没有元素，直接返回0
         if (pos) ＊pos = 0;
        return 0;
    } else { //如果元素大于最大值或者小于最小值，直接返回0
        if (value > _intsetGet(is, intrev32ifbe(is->length)-1)) {
             if (pos) ＊pos = intrev32ifbe(is->length);
                return 0;
         } else if (value < _intsetGet(is,0)) {
          if (pos) ＊pos = 0;
            return 0;
        }
    }
    while(max >= min) {//二分查找该元素
        mid = ((unsigned int)min + (unsigned int)max) >> 1;
        cur = _intsetGet(is, mid);
        if (value > cur) {
            min = mid+1;
        } else if (value < cur) {
            max = mid-1;
        } else {
            break;
        }
    }
    if (value == cur) {//查找到返回1，未查找到返回0
        if (pos) ＊pos = mid;
        return 1;
    } else {
        if (pos) ＊pos = min;
        return 0;
    }
  }
}
```

#### 获取元素

- 使用 intsetGet() 根据位置获取元素，它的实现是这样的：
  - 1. 根据编码类型从 contents 数组中读取对应大小的整数
  - 2. 进行字节序转换（如果需要）

```c
// intset.c 第 266-272 行
static int64_t _intsetGet(intset *is, int pos) {
    return _intsetGetEncoded(is,pos,intrev32ifbe(is->encoding));
}

/* Set the value at pos, using the configured encoding. */
static int64_t _intsetGetEncoded(intset *is, int pos, uint8_t enc) {
    int64_t v64;
    int32_t v32;
    int16_t v16;

    if (enc == INTSET_ENC_INT64) {
        memcpy(&v64,((int64_t*)is->contents)+pos,sizeof(v64));
        memrev64ifbe(&v64);
        return v64;
    } else if (enc == INTSET_ENC_INT32) {
        memcpy(&v32,((int32_t*)is->contents)+pos,sizeof(v32));
        memrev32ifbe(&v32);
        return v32;
    } else {
        memcpy(&v16,((int16_t*)is->contents)+pos,sizeof(v16));
        memrev16ifbe(&v16);
        return v16;
    }
}
```

#### 辅助函数

- _intsetGet() 和_intsetSet() 用于根据编码类型读写整数，它们的实现是这样的：
  - 1. _intsetGet()：
    - 1. 根据编码类型从 contents 数组中读取对应大小的整数
    - 2. 进行字节序转换（如果需要）
  - 2. _intsetSet()：
    - 1. 根据编码类型将整数写入 contents 数组
    - 2. 进行字节序转换（如果需要）

```c
// intset.c 第 76-78 行
static int64_t _intsetGet(intset *is, int pos) {
    return _intsetGetEncoded(is, pos, intrev32ifbe(is->encoding));
}

// intset.c 第 55-73 行
static int64_t _intsetGetEncoded(intset *is, int pos, uint8_t enc) {
    int64_t v64;
    int32_t v32;
    int16_t v16;
    
    // 1. 根据编码类型读取
    if (enc == INTSET_ENC_INT64) {
        memcpy(&v64, ((int64_t*)is->contents) + pos, sizeof(v64));
        memrev64ifbe(&v64);  // 2. 字节序转换
        return v64;
    } else if (enc == INTSET_ENC_INT32) {
        memcpy(&v32, ((int32_t*)is->contents) + pos, sizeof(v32));
        memrev32ifbe(&v32);
        return v32;
    } else {
        memcpy(&v16, ((int16_t*)is->contents) + pos, sizeof(v16));
        memrev16ifbe(&v16);
        return v16;
    }
}

// intset.c 第 81-94 行
static void _intsetSet(intset *is, int pos, int64_t value) {
    uint32_t encoding = intrev32ifbe(is->encoding);
    
    // 1. 根据编码类型写入
    if (encoding == INTSET_ENC_INT64) {
        ((int64_t*)is->contents)[pos] = value;
        memrev64ifbe(((int64_t*)is->contents) + pos);  // 2. 字节序转换
    } else if (encoding == INTSET_ENC_INT32) {
        ((int32_t*)is->contents)[pos] = value;
        memrev32ifbe(((int32_t*)is->contents) + pos);
    } else {
        ((int16_t*)is->contents)[pos] = value;
        memrev16ifbe(((int16_t*)is->contents) + pos);
    }
}
```

# Redis 的内存管理

- Redis 作为内存数据库，高效的内存管理至关重要。Redis 的内存管理主要包括四个方面：
  - 1. 内存分配与释放：封装底层内存分配器，提供统一的内存管理接口，并实现内存统计
  - 2. 过期键处理：通过被动过期和主动过期两种机制清理过期键
  - 3. 惰性删除：对于大对象的删除采用异步方式，避免阻塞主线程
  - 4. 内存置换算法：当内存达到上限时，根据配置的淘汰策略删除键以释放内存

- Redis 不直接使用 C 标准库的 `malloc/free`，而是封装了 `zmalloc/zfree` 等函数。这样做的原因包括：
  - 1. 统一内存统计：能够准确统计 Redis 实际使用的内存，用于 `INFO memory` 命令和内存限制检查
  - 2. 支持多种分配器：可以灵活选择 jemalloc、tcmalloc 或 libc 的 malloc
  - 3. OOM 处理：提供统一的内存不足处理机制
  - 4. 内存对齐：确保内存统计的准确性

- Redis 支持三种内存分配器，通过编译时宏定义选择：
  - 1. jemalloc：默认推荐，性能好，内存碎片少，内部使用内存池机制
  - 2. tcmalloc：Google 开发的内存分配器，也有内存池机制
  - 3. libc malloc：标准 C 库分配器，作为备选，通常没有内存池
  - 不同分配器的选择会影响 `HAVE_MALLOC_SIZE` 宏的定义：
    - 如果分配器提供了 `malloc_size` 或类似函数（如 jemalloc 的 `je_malloc_usable_size`），则 `HAVE_MALLOC_SIZE = 1`，可以直接获取分配的内存大小
    - 如果没有提供，Redis 需要在分配的内存前添加一个前缀（PREFIX_SIZE）来存储大小信息

- Redis 本身不实现内存池，它只是封装了底层内存分配器的接口，jemalloc 和 tcmalloc 这些分配器内部实现了内存池机制
  - jemalloc 的内存池机制：
    - Arena（内存区域）：jemalloc 将内存划分为多个 arena，每个 arena 管理一块8kb连续的内存区域，减少线程竞争
    - Tcache（线程缓存）：每个线程有独立的缓存，小对象分配直接从 tcache 获取，避免锁竞争
    - Size Class（大小分类）：将不同大小的内存请求归类到预定义的大小类，提高分配效率
    - 后台线程：jemalloc 可以启用后台线程进行内存清理和碎片整理
    - Redis 通过 `zmalloc()` 调用 jemalloc 的 `je_malloc()`，jemalloc 内部使用上述内存池机制
    - Redis 可以配置 jemalloc 的参数（如 arena 数量、tcache 大小等）
    - Redis 使用 jemalloc 的后台线程功能（通过 `set_jemalloc_bg_thread()`）进行异步内存清理

```c
// zmalloc.h 第 38-71 行
// 根据编译选项选择不同的内存分配器
#if defined(USE_TCMALLOC)
    #define ZMALLOC_LIB ("tcmalloc-" ...)
    #include <google/tcmalloc.h>
    #define HAVE_MALLOC_SIZE 1
    #define zmalloc_size(p) tc_malloc_size(p)
#elif defined(USE_JEMALLOC)
    #define ZMALLOC_LIB ("jemalloc-" ...)
    #include <jemalloc/jemalloc.h>
    #define HAVE_MALLOC_SIZE 1
    #define zmalloc_size(p) je_malloc_usable_size(p)
#elif defined(__APPLE__)
    #include <malloc/malloc.h>
    #define HAVE_MALLOC_SIZE 1
    #define zmalloc_size(p) malloc_size(p)
#else
    #define ZMALLOC_LIB "libc"
    #ifdef __GLIBC__
        #include <malloc.h>
        #define HAVE_MALLOC_SIZE 1
        #define zmalloc_size(p) malloc_usable_size(p)
#endif

// zmalloc.c 第 49-57 行
// PREFIX_SIZE 的定义：如果分配器不提供大小查询，需要前缀存储大小
#ifdef HAVE_MALLOC_SIZE
    #define PREFIX_SIZE (0)  // 不需要前缀
#else
    #if defined(__sun) || defined(__sparc) || defined(__sparc__)
        #define PREFIX_SIZE (sizeof(long long))  // 8 字节
    #else
        #define PREFIX_SIZE (sizeof(size_t))     // 8 字节（64位）或 4 字节（32位）
    #endif
#endif

// zmalloc.c 第 59-72 行
// 重定义 malloc/free 等函数，统一使用选定的分配器
#if defined(USE_TCMALLOC)
    #define malloc(size) tc_malloc(size)
    #define calloc(count,size) tc_calloc(count,size)
    #define realloc(ptr,size) tc_realloc(ptr,size)
    #define free(ptr) tc_free(ptr)
#elif defined(USE_JEMALLOC)
    #define malloc(size) je_malloc(size)
    #define calloc(count,size) je_calloc(count,size)
    #define realloc(ptr,size) je_realloc(ptr,size)
    #define free(ptr) je_free(ptr)
#endif
```

## 内存分配与释放

### 内存统计机制

- Redis 使用原子变量 `used_memory` 来统计当前使用的内存总量，所有内存分配和释放都会更新这个变量。
- 内存统计需要考虑内存对齐：实际分配的内存可能因为对齐而大于请求的大小，统计时需要按对齐后的值计算。

```c
// zmalloc.c 第 86-87 行
static size_t used_memory = 0;  // 全局内存使用统计（原子变量）
pthread_mutex_t used_memory_mutex = PTHREAD_MUTEX_INITIALIZER;

// zmalloc.c 第 74-84 行
// 更新内存分配统计（考虑对齐）
#define update_zmalloc_stat_alloc(__n) do { \
    size_t _n = (__n); \
    if (_n&(sizeof(long)-1)) _n += sizeof(long)-(_n&(sizeof(long)-1));  // 对齐到 long 边界
    atomicIncr(used_memory,__n);  // 原子增加
} while(0)

// 更新内存释放统计（考虑对齐）
#define update_zmalloc_stat_free(__n) do { \
    size_t _n = (__n); \
    if (_n&(sizeof(long)-1)) _n += sizeof(long)-(_n&(sizeof(long)-1));  // 对齐到 long 边界
    atomicDecr(used_memory,__n);  // 原子减少
} while(0)
```

### 内存分配函数

#### zmalloc

- `zmalloc()` 是 Redis 的基础内存分配函数，功能类似于 `malloc()`，但会进行内存统计和 OOM 处理。
- 它是这样实现的：
  - 1. 调用底层 `malloc()` 分配 `size+PREFIX_SIZE` 字节（如果需要前缀）
  - 2. 如果分配失败，调用 OOM 处理函数
  - 3. 如果分配器提供大小查询（`HAVE_MALLOC_SIZE`）：
    - 使用 `zmalloc_size()` 获取实际分配的大小
    - 更新内存统计
    - 直接返回指针
  - 4. 如果分配器不提供大小查询：
    - 在内存块的前 `PREFIX_SIZE` 字节中存储请求的大小
    - 更新内存统计（包含前缀）
    - 返回跳过前缀的指针

```c
// zmalloc.c 第 98-110 行
void *zmalloc(size_t size) {
    // 1. 调用底层分配器分配内存
    //    - 如果 HAVE_MALLOC_SIZE 未定义，需要额外分配 PREFIX_SIZE 字节用于存储大小信息
    //    - 如果 HAVE_MALLOC_SIZE 已定义，PREFIX_SIZE=0，直接分配 size 字节
    void *ptr = malloc(size+PREFIX_SIZE);
    
    // 2. 检查分配是否成功，失败则调用 OOM 处理函数
    //    - OOM 处理函数默认会打印错误信息并终止程序
    //    - 可以通过 zmalloc_set_oom_handler() 自定义处理函数
    if (!ptr) zmalloc_oom_handler(size);
    
#ifdef HAVE_MALLOC_SIZE
    // 3. 情况A：分配器提供大小查询（如 jemalloc、tcmalloc）
    //    - 使用 zmalloc_size() 获取实际分配的大小（可能因对齐而大于请求大小）
    //    - 更新内存统计：原子增加 used_memory
    //    - 直接返回指针，无需处理前缀
    update_zmalloc_stat_alloc(zmalloc_size(ptr));
    return ptr;
#else
    // 4. 情况B：分配器不提供大小查询（如标准 libc malloc）
    //    - 在内存块的前 PREFIX_SIZE 字节中存储请求的大小
    //    - 这样在释放时可以从前缀读取大小信息
    *((size_t*)ptr) = size;
    //    - 更新内存统计：统计包含前缀的总大小（size + PREFIX_SIZE）
    update_zmalloc_stat_alloc(size+PREFIX_SIZE);
    //    - 返回跳过前缀的指针，用户看到的是从数据区开始的指针
    return (char*)ptr+PREFIX_SIZE;
#endif
}
```

#### zcalloc

- `zcalloc()` 类似于 `calloc()`，分配的内存会被初始化为 0。

```c
// zmalloc.c 第 130-142 行
void *zcalloc(size_t size) {
    // 1. 调用底层分配器的 calloc，分配内存并初始化为 0
    //    - calloc(1, size+PREFIX_SIZE) 表示分配 1 个大小为 (size+PREFIX_SIZE) 的对象
    //    - 与 malloc 的区别：calloc 会将分配的内存初始化为 0
    void *ptr = calloc(1, size+PREFIX_SIZE);
    
    // 2. 检查分配是否成功，失败则调用 OOM 处理函数
    if (!ptr) zmalloc_oom_handler(size);
    
#ifdef HAVE_MALLOC_SIZE
    // 3. 情况A：分配器提供大小查询
    //    - 获取实际分配大小（考虑对齐）并更新统计
    //    - 直接返回指针
    update_zmalloc_stat_alloc(zmalloc_size(ptr));
    return ptr;
#else
    // 4. 情况B：分配器不提供大小查询
    //    - 在前缀中存储请求的大小（虽然内存已初始化为 0，但需要显式设置）
    *((size_t*)ptr) = size;
    //    - 更新内存统计（包含前缀）
    update_zmalloc_stat_alloc(size+PREFIX_SIZE);
    //    - 返回跳过前缀的指针
    return (char*)ptr+PREFIX_SIZE;
#endif
}
```

#### zrealloc

- `zrealloc()` 类似于 `realloc()`，用于调整已分配内存的大小。

```c
// zmalloc.c 第 144-171 行
void *zrealloc(void *ptr, size_t size) {
#ifndef HAVE_MALLOC_SIZE
    void *realptr;  // 用于存储包含前缀的真实指针
#endif
    size_t oldsize;  // 旧内存块的大小
    void *newptr;    // 重新分配后的新指针
    
    // 1. 如果原指针为空，等同于分配新内存
    //    - realloc(NULL, size) 的行为等同于 malloc(size)
    if (ptr == NULL) return zmalloc(size);
    
#ifdef HAVE_MALLOC_SIZE
    // 2. 情况A：分配器提供大小查询
    //    - 获取原内存块的实际大小（用于后续统计）
    oldsize = zmalloc_size(ptr);
    //    - 调用底层 realloc 重新分配内存
    //    - realloc 可能会移动内存块，也可能在原位置扩展/缩小
    newptr = realloc(ptr, size);
    //    - 检查重新分配是否成功
    if (!newptr) zmalloc_oom_handler(size);
    
    // 3. 更新内存统计：先减去旧大小，再加上新大小
    //    - 这样可以准确反映内存使用的变化
    update_zmalloc_stat_free(oldsize);
    update_zmalloc_stat_alloc(zmalloc_size(newptr));
    return newptr;
#else
    // 5. 情况B：分配器不提供大小查询
    //    - 计算包含前缀的真实指针位置
    //    - 用户传入的 ptr 是跳过前缀的，需要向前偏移 PREFIX_SIZE 字节
    realptr = (char*)ptr-PREFIX_SIZE;
    //    - 从前缀中读取旧内存块的大小
    oldsize = *((size_t*)realptr);
    //    - 调用底层 realloc，重新分配包含前缀的完整内存块
    newptr = realloc(realptr, size+PREFIX_SIZE);
    //    - 检查重新分配是否成功
    if (!newptr) zmalloc_oom_handler(size);
    
    // 6. 更新前缀中的大小信息
    *((size_t*)newptr) = size;
    // 7. 更新内存统计：先减去旧大小（包含前缀），再加上新大小（包含前缀）
    update_zmalloc_stat_free(oldsize+PREFIX_SIZE);
    update_zmalloc_stat_alloc(size+PREFIX_SIZE);
    // 8. 返回跳过前缀的指针，保持与用户接口的一致性
    return (char*)newptr+PREFIX_SIZE;
#endif
}
```

### 内存释放函数

#### zfree

- `zfree()` 是 Redis 的内存释放函数，功能类似于 `free()`，但会更新内存统计。

```c
// zmalloc.c 第 190-206 行
void zfree(void *ptr) {
#ifndef HAVE_MALLOC_SIZE
    void *realptr;   // 用于存储包含前缀的真实指针
    size_t oldsize;  // 用于存储从前缀读取的大小
#endif
    
    // 1. 空指针检查：free(NULL) 是安全的，但这里提前返回避免不必要的操作
    if (ptr == NULL) return;
    
#ifdef HAVE_MALLOC_SIZE
    // 2. 情况A：分配器提供大小查询
    //    - 获取内存块的实际大小（用于统计）
    //    - 更新内存统计：原子减少 used_memory
    update_zmalloc_stat_free(zmalloc_size(ptr));
    //    - 调用底层分配器的 free 释放内存
    //    - 释放后内存可能被分配器回收或保留在内存池中
    free(ptr);
#else
    // 3. 情况B：分配器不提供大小查询
    //    - 计算包含前缀的真实指针位置
    //    - 用户传入的 ptr 是跳过前缀的，需要向前偏移 PREFIX_SIZE 字节
    realptr = (char*)ptr-PREFIX_SIZE;
    //    - 从前缀中读取内存块的大小（用于统计）
    oldsize = *((size_t*)realptr);
    //    - 更新内存统计：减去包含前缀的总大小
    update_zmalloc_stat_free(oldsize+PREFIX_SIZE);
    //    - 调用底层分配器的 free 释放包含前缀的完整内存块
    //    - 必须释放 realptr 而不是 ptr，否则会导致内存泄漏
    free(realptr);
#endif
}
```

### 内存大小获取

- `zmalloc_size()` 用于获取指针指向的内存块的实际大小。如果分配器提供了查询函数则直接使用，否则从前缀中读取。

```c
// zmalloc.c 第 176-188 行（仅在 HAVE_MALLOC_SIZE 未定义时编译）
#ifndef HAVE_MALLOC_SIZE
size_t zmalloc_size(void *ptr) {
    void *realptr = (char*)ptr-PREFIX_SIZE;  // 1. 找到真实指针
    size_t size = *((size_t*)realptr);  // 2. 从前缀读取大小
    
    // 3. 考虑内存对齐：假设底层分配器至少按 long 对齐
    if (size&(sizeof(long)-1)) 
        size += sizeof(long)-(size&(sizeof(long)-1));
    
    return size+PREFIX_SIZE;  // 4. 返回总大小（包含前缀）
}

size_t zmalloc_usable(void *ptr) {
    return zmalloc_size(ptr)-PREFIX_SIZE;  // 返回可用大小（不含前缀）
}
#endif
```

### OOM 处理机制

- 当内存分配失败时，Redis 会调用 OOM（Out of Memory）处理函数。默认行为是打印错误信息并终止程序，但可以通过 `zmalloc_set_oom_handler()` 自定义处理函数。

```c
// zmalloc.c 第 89-96 行
// 默认 OOM 处理函数
static void zmalloc_default_oom(size_t size) {
    fprintf(stderr, "zmalloc: Out of memory trying to allocate %zu bytes\n", size);
    fflush(stderr);
    abort();  // 终止程序
}

static void (*zmalloc_oom_handler)(size_t) = zmalloc_default_oom;

// zmalloc.c 第 222-224 行
// 设置自定义 OOM 处理函数
void zmalloc_set_oom_handler(void (*oom_handler)(size_t)) {
    zmalloc_oom_handler = oom_handler;
}
```

### 内存统计查询

#### zmalloc_used_memory

- `zmalloc_used_memory()` 返回当前 Redis 使用的内存总量（通过原子变量读取）。

```c
// zmalloc.c 第 216-220 行
size_t zmalloc_used_memory(void) {
    size_t um;
    atomicGet(used_memory, um);  // 原子读取
    return um;
}
```

#### zmalloc_get_rss

- `zmalloc_get_rss()` 获取进程的 RSS（Resident Set Size，常驻内存集大小），即实际占用的物理内存。不同操作系统有不同的实现方式。

```c
// zmalloc.c 第 242-272 行（Linux 实现）
#if defined(HAVE_PROC_STAT)
size_t zmalloc_get_rss(void) {
    int page = sysconf(_SC_PAGESIZE);  // 1. 获取页大小
    size_t rss;
    char buf[4096];
    char filename[256];
    int fd, count;
    char *p, *x;
    
    snprintf(filename, 256, "/proc/%d/stat", getpid());  // 2. 构建 /proc/pid/stat 路径
    if ((fd = open(filename, O_RDONLY)) == -1) return 0;
    if (read(fd, buf, 4096) <= 0) {
        close(fd);
        return 0;
    }
    close(fd);
    
    // 3. 解析 /proc/pid/stat 文件，RSS 是第 24 个字段
    p = buf;
    count = 23;  // RSS 是第 24 个字段
    while(p && count--) {
        p = strchr(p, ' ');
        if (p) p++;
    }
    if (!p) return 0;
    x = strchr(p, ' ');
    if (!x) return 0;
    *x = '\0';
    
    rss = strtoll(p, NULL, 10);  // 4. 读取 RSS 值（页数）
    rss *= page;  // 5. 转换为字节
    return rss;
}
#endif
```

#### zmalloc_get_allocator_info

- `zmalloc_get_allocator_info()` 获取分配器的详细信息（仅 jemalloc 支持），包括已分配内存、活跃内存和常驻内存。

```c
// zmalloc.c 第 304-325 行（jemalloc 实现）
#if defined(USE_JEMALLOC)
int zmalloc_get_allocator_info(size_t *allocated,
                               size_t *active,
                               size_t *resident) {
    uint64_t epoch = 1;
    size_t sz;
    *allocated = *resident = *active = 0;
    
    // 1. 更新 jemalloc 的统计缓存
    sz = sizeof(epoch);
    je_mallctl("epoch", &epoch, &sz, &epoch, sz);
    
    sz = sizeof(size_t);
    // 2. 获取常驻内存（不包括共享库等非堆映射）
    je_mallctl("stats.resident", resident, &sz, NULL, 0);
    // 3. 获取活跃内存（不包括 jemalloc 保留的页面）
    je_mallctl("stats.active", active, &sz, NULL, 0);
    // 4. 获取已分配内存（包括所有分配，不仅仅是 zmalloc）
    je_mallctl("stats.allocated", allocated, &sz, NULL, 0);
    return 1;
}
#endif
```

### 辅助函数

#### zstrdup

- `zstrdup()` 类似于 `strdup()`，使用 `zmalloc()` 分配内存并复制字符串。

```c
// zmalloc.c 第 208-214 行
char *zstrdup(const char *s) {
    size_t l = strlen(s)+1;  // 1. 计算字符串长度（包含 '\0'）
    char *p = zmalloc(l);  // 2. 分配内存
    
    memcpy(p, s, l);  // 3. 复制字符串
    return p;
}
```

#### zlibc_free

- `zlibc_free()` 提供对原始 libc `free()` 的访问，用于释放非 Redis 分配的内存（如 `backtrace_symbols()` 返回的内存）。

```c
// zmalloc.c 第 39-41 行
void zlibc_free(void *ptr) {
    free(ptr);  // 直接调用 libc 的 free，不更新统计
}
```

### jemalloc 内存池特性利用

- Redis 通过 jemalloc 的 `mallctl` 接口来配置和利用 jemalloc 的内存池特性。
- jemalloc 内存池的工作流程：
  - 1. 分配阶段：
    - 小对象（通常 < 32KB）：优先从当前线程的 tcache 分配，无锁操作
    - 如果 tcache 为空，从对应的 arena 分配，并填充 tcache
    - 大对象：直接从 arena 分配
  - 2. 释放阶段：
    - 小对象：先释放到 tcache，如果 tcache 满了再释放到 arena
    - 大对象：直接释放到 arena
  - 3. 清理阶段：
    - jemalloc 的后台线程定期检查各个 arena
    - 将不再使用的内存页标记为 dirty，等待系统回收
      - 这个过程是异步的，不会阻塞主线程

#### set_jemalloc_bg_thread

- `set_jemalloc_bg_thread()` 用于启用或禁用 jemalloc 的后台线程，这是 jemalloc 内存池机制的一部分。
- 它是这样实现的：
  - 1. 通过 `je_mallctl()` 调用 jemalloc 的配置接口
  - 2. 设置 `background_thread` 参数来启用或禁用后台线程
  - 3. 后台线程的作用：
    - 异步进行内存清理（purge），释放不再使用的内存页
    - 在 Redis 执行 `FLUSHDB` 等操作后，即使没有新的请求，也能及时回收内存
    - 减少主线程的内存管理开销

```c
// zmalloc.c 第 327-332 行
void set_jemalloc_bg_thread(int enable) {
    /* let jemalloc do purging asynchronously, required when there's no traffic 
     * after flushdb */
    char val = !!enable;
    je_mallctl("background_thread", NULL, 0, &val, 1);  // 配置 jemalloc 后台线程
}
```

## 过期键处理

- Redis 通过两种机制来删除过期键：
  - 1. 被动过期（惰性删除）：在访问键时检查是否过期，如果过期则删除
  - 2. 主动过期（定期删除）：定期扫描过期键字典，删除已过期的键
- 这两种机制配合使用，既能在访问时及时清理过期键，又能确保即使没有访问也能清理过期键，避免内存泄漏。

### 过期键的存储机制

- Redis 使用独立的字典 `db->expires` 来存储所有设置了过期时间的键及其过期时间。
- 过期字典的键与主字典 `db->dict` 共享同一个 SDS 字符串（通过指针复用），值存储的是过期时间（毫秒时间戳）。
- 过期字典的设计：
  - 键（key）：与主字典共享同一个 SDS 字符串指针，节省内存
  - 值（value）：存储过期时间，类型为 `long long`（毫秒时间戳）
  - 当键被删除时，过期字典中的对应项也会被删除

### 设置和查询过期时间

#### setExpire

- `setExpire()` 用于为键设置过期时间，它会将键添加到过期字典中。
- 它是这样实现的：
  - 1. 在主字典中查找键，确保键存在
  - 2. 在过期字典中添加或查找该键（使用 `dictAddOrFind()`，如果不存在则添加，存在则返回）
  - 3. 设置过期时间：将 `when`（毫秒时间戳）存储到字典项的值中
  - 4. 如果是可写从节点，调用 `rememberSlaveKeyWithExpire()` 记录该键

```c
// db.c 第 1076-1088 行
void setExpire(client *c, redisDb *db, robj *key, long long when) {
    dictEntry *kde, *de;  // kde: 主字典中的键项, de: 过期字典中的键项
    
    // 1. 在主字典中查找键，确保键存在
    //    - 使用 key->ptr（SDS 字符串）作为查找键
    //    - 如果键不存在，后续操作没有意义，需要通过断言确保存在
    kde = dictFind(db->dict, key->ptr);
    serverAssertWithInfo(NULL, key, kde != NULL);  // 断言：键必须在主字典中存在
    
    // 2. 在过期字典中添加或查找键
    //    - dictAddOrFind: 如果键不存在则添加，存在则返回现有项
    //    - dictGetKey(kde): 获取主字典中键的 SDS 指针（复用，节省内存）
    //    - 过期字典的键与主字典共享同一个 SDS 字符串，避免重复分配
    de = dictAddOrFind(db->expires, dictGetKey(kde));
    // 3. 设置过期时间：将毫秒时间戳存储到字典项的值中
    //    - when 是绝对时间戳（Unix 时间戳，毫秒）
    dictSetSignedIntegerVal(de, when);
    
    // 4. 如果是可写从节点，需要特殊处理
    //    - 可写从节点：有主节点连接且不是只读模式
    //    - 如果客户端不是主节点（即来自客户端的命令），需要记录该键
    //    - 因为从节点的过期键需要自己处理（主节点不知道从节点创建的键）
    int writable_slave = server.masterhost && server.repl_slave_ro == 0;
    if (c && writable_slave && !(c->flags & CLIENT_MASTER))
        rememberSlaveKeyWithExpire(db, key);
}
```

#### getExpire

- `getExpire()` 用于获取键的过期时间，如果键没有设置过期时间则返回 -1。

```c
// db.c 第 1092-1103 行
long long getExpire(redisDb *db, robj *key) {
    dictEntry *de;  // 过期字典中的键项
    
    // 1. 快速检查：如果过期字典为空或键不存在，返回 -1
    //    - dictSize(db->expires) == 0: 快速路径，如果过期字典为空直接返回
    //    - dictFind(): 在过期字典中查找键，如果不存在返回 NULL
    //    - 返回 -1 表示键没有设置过期时间
    if (dictSize(db->expires) == 0 ||
       (de = dictFind(db->expires, key->ptr)) == NULL) 
        return -1;
    
    // 2. 安全检查：确保键也在主字典中
    //    - 理论上过期字典中的键都应该在主字典中存在
    //    - 这个断言用于检测数据一致性问题（不应该发生）
    serverAssertWithInfo(NULL, key, dictFind(db->dict, key->ptr) != NULL);
    
    // 3. 返回过期时间：从字典项的值中读取毫秒时间戳
    //    - 返回的是绝对时间戳（Unix 时间戳，毫秒）
    return dictGetSignedIntegerVal(de);
}
```

#### removeExpire

- `removeExpire()` 用于移除键的过期时间，将键从过期字典中删除。

```c
// db.c 第 1065-1070 行
int removeExpire(redisDb *db, robj *key) {
    // 1. 安全检查：确保键在主字典中存在
    serverAssertWithInfo(NULL, key, dictFind(db->dict, key->ptr) != NULL);
    
    // 2. 从过期字典中删除
    return dictDelete(db->expires, key->ptr) == DICT_OK;
}
```

### 被动过期（惰性删除）

- 被动过期机制在访问键时检查是否过期，如果过期则立即删除。这是 Redis 过期键删除的主要机制。

#### keyIsExpired

- `keyIsExpired()` 用于检查键是否已过期。
- 它是这样实现的：
  - 1. 调用 `getExpire()` 获取键的过期时间
  - 2. 如果没有设置过期时间（返回 -1），返回 0（未过期）
  - 3. 如果正在加载数据（`server.loading`），返回 0（不删除）
  - 4. 如果在 Lua 脚本执行期间，使用脚本开始时间作为当前时间（保证脚本执行期间时间一致）
  - 5. 否则获取当前时间（毫秒时间戳）
  - 6. 比较当前时间和过期时间，如果 `now > when` 则返回 1（已过期）

```c
// db.c 第 41-77 行
int keyIsExpired(redisDb *db, robj *key) {
    // 1. 获取键的过期时间（毫秒时间戳）
    //    - 如果键没有设置过期时间，返回 -1
    mstime_t when = getExpire(db, key);
    mstime_t now;  // 当前时间（毫秒时间戳）
    
    // 2. 如果没有设置过期时间，返回未过期
    //    - when < 0 表示键没有过期时间，直接返回 0（未过期）
    if (when < 0) return 0;
    
    // 3. 加载数据时不删除过期键
    //    - server.loading 为真表示正在从 RDB 或 AOF 加载数据
    //    - 在加载期间，时间可能不准确，且不应该删除键（由加载逻辑统一处理）
    if (server.loading) return 0;
    
    // 4. Lua 脚本执行期间的特殊处理
    //    - 使用脚本开始时间作为"当前时间"，保证脚本执行期间时间一致
    //    - 这样可以避免脚本执行过程中键突然过期，导致不一致
    if (server.lua_timeout && server.lua_caller) {
        now = server.lua_time_start;  // 使用脚本开始时间
    } else {
        // 5. 正常情况下获取当前时间（毫秒时间戳）
        //    - mstime() 返回当前的 Unix 时间戳（毫秒）
        now = mstime();
    }
    
    // 6. 比较当前时间和过期时间
    //    - 如果 now > when，说明当前时间已经超过了过期时间，键已过期
    //    - 返回 1 表示已过期，返回 0 表示未过期
    return now > when;
}
```

#### expireIfNeeded

- `expireIfNeeded()` 在访问键时被调用，如果键已过期则删除它。
- 它是这样实现的：
  - 1. 调用 `keyIsExpired()` 检查键是否过期，如果未过期返回 0
  - 2. 如果是从节点（`server.masterhost != NULL`），返回 1 但不删除（由主节点控制过期）
  - 3. 如果是主节点，执行删除操作：
    - 更新过期键统计 `server.stat_expiredkeys++`
    - 调用 `propagateExpire()` 将删除操作传播到 AOF 和从节点
    - 发送键空间通知 `NOTIFY_EXPIRED`
  - 4. 根据 `server.lazyfree_lazy_expire` 配置选择同步或异步删除
  - 5. 返回删除结果（1 表示删除成功，0 表示未删除）

- 调用时机：
  - `lookupKeyRead()`：读取键时检查
  - `lookupKeyWrite()`：写入键时检查
  - `dbRandomKey()`：随机获取键时检查

```c
// db.c 第 1213-1243 行
int expireIfNeeded(redisDb *db, robj *key) {
    // 1. 检查键是否过期
    //    - keyIsExpired() 会检查过期时间、加载状态、Lua 脚本状态等
    //    - 如果未过期，直接返回 0（不需要删除）
    if (!keyIsExpired(db, key)) return 0;
    
    // 2. 如果是从节点，不删除键（由主节点控制）
    //    - 从节点的过期键删除由主节点通过 DEL 命令同步
    //    - 返回 1 表示键已过期（逻辑上），但不实际删除
    //    - 这样可以保证主从数据一致性
    if (server.masterhost != NULL) return 1;
    
    // 3. 主节点删除过期键
    //    - 更新过期键统计计数器（用于 INFO 命令）
    server.stat_expiredkeys++;
    //    - 传播删除操作到 AOF 文件和从节点
    //    - 根据 lazyfree_lazy_expire 配置决定传播 DEL 还是 UNLINK
    propagateExpire(db, key, server.lazyfree_lazy_expire);
    //    - 发送键空间通知（如果客户端订阅了相关事件）
    //    - NOTIFY_EXPIRED 事件类型，事件名称为 "expired"
    notifyKeyspaceEvent(NOTIFY_EXPIRED, "expired", key, db->id);
    
    // 4. 根据配置选择同步或异步删除
    //    - lazyfree_lazy_expire 为真：使用异步删除（dbAsyncDelete）
    //      * 适用于大对象，避免阻塞主线程
    //    - lazyfree_lazy_expire 为假：使用同步删除（dbSyncDelete）
    //      * 立即释放内存，但可能阻塞主线程
    //    - 返回删除结果：1 表示删除成功，0 表示删除失败（通常不会失败）
    return server.lazyfree_lazy_expire ? 
           dbAsyncDelete(db, key) : dbSyncDelete(db, key);
}
```

### 主动过期（定期删除）

- 主动过期机制通过定期扫描过期字典来删除已过期的键，确保即使没有访问也能清理过期键。

#### activeExpireCycle

- `activeExpireCycle()` 是主动过期的核心函数，采用自适应算法，根据过期键的数量动态调整清理策略。
- 它是这样实现的：
  - 1. 使用静态变量保持状态，支持增量执行
  - 2. 检查客户端是否被暂停
  - 3. FAST 模式限制：仅在上次超时且距离上次执行足够时间后才执行
  - 4. 确定检查的数据库数量（默认 16 个，如果上次超时则检查所有）
  - 5. 计算时间限制：
    - SLOW 模式：CPU 时间的 25%（`ACTIVE_EXPIRE_CYCLE_SLOW_TIME_PERC = 25`）
    - FAST 模式：1000 微秒（`ACTIVE_EXPIRE_CYCLE_FAST_DURATION = 1000`）
  - 6. 遍历数据库，对每个数据库：
    - 如果过期字典为空，跳过
    - 如果填充率 < 1%，停止（等待字典扩容）
    - 随机采样最多 20 个键（`ACTIVE_EXPIRE_CYCLE_LOOKUPS_PER_LOOP = 20`）
    - 对每个键调用 `activeExpireCycleTryExpire()` 尝试过期
    - 如果过期键比例 >= 25%，继续循环；否则停止
    - 每 16 次迭代检查一次时间限制
  - 7. 更新全局统计信息

```c
// expire.c 第 97-244 行
void activeExpireCycle(int type) {
    // 1. 静态变量：用于在多次调用间保持状态，实现增量执行
    //    - current_db: 上次检查的数据库索引，下次从下一个数据库开始
    //      * 这样可以轮询所有数据库，避免总是检查同一个数据库
    //    - timelimit_exit: 上次是否因时间限制退出
    //      * 如果为真，说明还有工作要做，下次可能需要更积极的清理
    //    - last_fast_cycle: 上次快速周期的时间戳
    //      * 用于限制快速周期的执行频率，避免过于频繁
    static unsigned int current_db = 0;
    static int timelimit_exit = 0;
    static long long last_fast_cycle = 0;
    
    int j, iteration = 0;  // j: 数据库循环计数器, iteration: 迭代计数器
    int dbs_per_call = CRON_DBS_PER_CALL;  // 每次检查的数据库数量（默认16）
    long long start = ustime(), timelimit, elapsed;  // 记录开始时间，用于计算耗时
    
    // 2. 如果客户端被暂停，不执行过期清理
    //    - 暂停期间数据集应该保持静态，包括过期键也不应该被删除
    if (clientsArePaused()) return;
    
    // 3. FAST 模式的限制条件
    //    - FAST 模式只在特定条件下执行，避免过于频繁
    if (type == ACTIVE_EXPIRE_CYCLE_FAST) {
        // 3.1 如果上次 SLOW 模式未超时，说明工作已完成，不需要快速周期
        if (!timelimit_exit) return;
        // 3.2 限制快速周期的执行频率：距离上次至少 2 倍快速周期时长
        //     - ACTIVE_EXPIRE_CYCLE_FAST_DURATION = 1000 微秒
        //     - 即至少间隔 2000 微秒（2 毫秒）才执行一次快速周期
        if (start < last_fast_cycle + ACTIVE_EXPIRE_CYCLE_FAST_DURATION*2) 
            return;
        last_fast_cycle = start;  // 更新上次快速周期时间
    }
    
    // 4. 确定要检查的数据库数量
    //    - 如果数据库数量少于默认值，检查所有数据库
    //    - 如果上次超时（timelimit_exit=1），说明还有工作要做，检查所有数据库
    if (dbs_per_call > server.dbnum || timelimit_exit)
        dbs_per_call = server.dbnum;
    
    // 5. 计算时间限制（微秒）
    //    - SLOW 模式：使用 CPU 时间的 25%
    //      * 1000000 微秒 = 1 秒
    //      * server.hz 是每秒调用次数（默认 10）
    //      * 所以每次调用的时间限制 = (1000000 * 25 / 10 / 100) = 2500 微秒
    timelimit = 1000000*ACTIVE_EXPIRE_CYCLE_SLOW_TIME_PERC/server.hz/100;
    timelimit_exit = 0;  // 重置超时标志
    if (timelimit <= 0) timelimit = 1;  // 确保至少 1 微秒
    
    // 5.1 FAST 模式使用固定时间限制：1000 微秒（1 毫秒）
    if (type == ACTIVE_EXPIRE_CYCLE_FAST)
        timelimit = ACTIVE_EXPIRE_CYCLE_FAST_DURATION;
    
    // 6. 统计变量：用于计算过期键比例
    long total_sampled = 0;   // 总共采样的键数
    long total_expired = 0;   // 总共过期的键数
    
    // 7. 遍历数据库，对每个数据库进行过期清理
    for (j = 0; j < dbs_per_call && timelimit_exit == 0; j++) {
        int expired;  // 本次循环中过期的键数
        // 7.1 选择当前要检查的数据库（轮询方式）
        redisDb *db = server.db + (current_db % server.dbnum);
        current_db++;  // 更新索引，下次从下一个数据库开始
        
        // 8. 对每个数据库进行过期清理循环
        //    - 使用 do-while 循环，根据过期键比例决定是否继续
        do {
            unsigned long num, slots;  // num: 过期键数量, slots: 字典槽位数量
            long long now, ttl_sum;   // now: 当前时间, ttl_sum: TTL 总和
            int ttl_samples;          // TTL 样本数
            iteration++;              // 迭代计数器
            
            // 9. 如果过期字典为空，跳过该数据库
            if ((num = dictSize(db->expires)) == 0) {
                db->avg_ttl = 0;  // 重置平均 TTL
                break;
            }
            
            slots = dictSlots(db->expires);  // 获取字典槽位数量
            now = mstime();                  // 获取当前时间（毫秒）
            
            // 10. 如果填充率太低（< 1%），停止检查
            //     - 填充率低意味着字典需要扩容，此时随机采样效率很低
            //     - DICT_HT_INITIAL_SIZE: 初始哈希表大小（4）
            //     - 等待字典扩容后再检查，避免浪费 CPU
            if (num && slots > DICT_HT_INITIAL_SIZE &&
                (num*100/slots < 1)) break;
            
            // 11. 初始化统计变量
            expired = 0;      // 本次循环过期的键数
            ttl_sum = 0;      // 未过期键的 TTL 总和
            ttl_samples = 0;  // 未过期键的数量
            
            // 12. 限制每次检查的键数量
            //     - ACTIVE_EXPIRE_CYCLE_LOOKUPS_PER_LOOP = 20
            //     - 每次循环最多检查 20 个键，避免单次循环耗时过长
            if (num > ACTIVE_EXPIRE_CYCLE_LOOKUPS_PER_LOOP)
                num = ACTIVE_EXPIRE_CYCLE_LOOKUPS_PER_LOOP;
            
            // 13. 随机采样并检查过期
            while (num--) {
                dictEntry *de;      // 字典项
                long long ttl;      // 剩余 TTL（毫秒）
                
                // 14. 从过期字典中随机获取一个键
                //     - 随机采样可以避免总是检查相同的键
                //     - 如果获取失败（字典为空），退出循环
                if ((de = dictGetRandomKey(db->expires)) == NULL) break;
                
                // 14.1 计算剩余 TTL（过期时间 - 当前时间）
                ttl = dictGetSignedIntegerVal(de) - now;
                
                // 15. 尝试过期该键
                //     - activeExpireCycleTryExpire 会检查并删除已过期的键
                //     - 返回 1 表示已过期并删除，0 表示未过期
                if (activeExpireCycleTryExpire(db, de, now)) expired++;
                
                // 16. 统计未过期键的 TTL（用于计算平均 TTL）
                //     - 只统计未过期的键（ttl > 0）
                //     - 用于估算数据库中键的平均剩余生存时间
                if (ttl > 0) {
                    ttl_sum += ttl;
                    ttl_samples++;
                }
                total_sampled++;  // 更新总采样数
            }
            total_expired += expired;  // 更新总过期数
            
            // 17. 更新数据库的平均 TTL
            //     - 使用加权平均：新值占 2%，旧值占 98%
            //     - 这样可以平滑 TTL 的变化，避免突然波动
            if (ttl_samples) {
                long long avg_ttl = ttl_sum / ttl_samples;
                if (db->avg_ttl == 0) db->avg_ttl = avg_ttl;  // 首次设置
                db->avg_ttl = (db->avg_ttl/50)*49 + (avg_ttl/50);  // 加权平均
            }
            
            // 18. 每 16 次迭代检查一次时间限制
            //     - (iteration & 0xf) == 0 等价于 iteration % 16 == 0
            //     - 避免每次迭代都检查时间，提高效率
            if ((iteration & 0xf) == 0) {
                elapsed = ustime() - start;  // 计算已用时间
                if (elapsed > timelimit) {
                    timelimit_exit = 1;  // 设置超时标志
                    server.stat_expired_time_cap_reached_count++;  // 更新统计
                    break;  // 退出循环
                }
            }
            
            // 19. 如果过期键比例 < 25%，停止当前数据库的清理
            //     - ACTIVE_EXPIRE_CYCLE_LOOKUPS_PER_LOOP/4 = 20/4 = 5
            //     - 如果本次循环过期的键数 <= 5，说明过期键比例较低
            //     - 此时可以停止清理，避免浪费 CPU
        } while (expired > ACTIVE_EXPIRE_CYCLE_LOOKUPS_PER_LOOP/4);
    }
    
    // 20. 更新全局统计：过期键比例
    //     - 用于监控系统中过期键的比例
    elapsed = ustime() - start;
    latencyAddSampleIfNeeded("expire-cycle", elapsed/1000);  // 记录延迟
    
    // 20.1 计算当前过期键比例
    double current_perc;
    if (total_sampled) {
        current_perc = (double)total_expired/total_sampled;  // 过期键比例
    } else
        current_perc = 0;
    
    // 20.2 使用加权平均更新全局统计
    //      - 新值占 5%，旧值占 95%
    //      - 这样可以平滑统计值，反映长期趋势
    server.stat_expired_stale_perc = (current_perc*0.05) + 
                                     (server.stat_expired_stale_perc*0.95);
}
```

#### activeExpireCycleTryExpire

- `activeExpireCycleTryExpire()` 尝试过期单个键，如果已过期则删除。
- 它是这样实现的：
  - 1. 从字典项中获取过期时间 `t`
  - 2. 比较当前时间 `now` 和过期时间 `t`，如果 `now > t` 则已过期
  - 3. 如果已过期：
    - 创建键对象（用于删除和通知）
    - 调用 `propagateExpire()` 传播删除操作
    - 根据配置选择同步或异步删除
    - 发送键空间通知
    - 释放键对象并更新统计
    - 返回 1（已过期）
  - 4. 如果未过期，返回 0

```c
// expire.c 第 54-73 行
int activeExpireCycleTryExpire(redisDb *db, dictEntry *de, long long now) {
    // 1. 从过期字典项中获取过期时间（毫秒时间戳）
    //    - de 是过期字典中的字典项，值存储的是过期时间
    long long t = dictGetSignedIntegerVal(de);
    
    // 2. 检查是否过期：比较当前时间和过期时间
    //    - now > t 表示当前时间已经超过了过期时间，键已过期
    if (now > t) {
        // 3. 获取键的 SDS 字符串并创建键对象
        //    - dictGetKey(de): 获取字典项的键（SDS 字符串指针）
        //    - createStringObject(): 创建 redisObject 对象，用于后续删除操作
        //    - 需要创建对象是因为删除函数需要 robj* 类型参数
        sds key = dictGetKey(de);
        robj *keyobj = createStringObject(key, sdslen(key));
        
        // 4. 传播删除操作到 AOF 文件和从节点
        //    - 将 DEL 或 UNLINK 命令写入 AOF（如果启用）
        //    - 将命令传播到所有从节点，保证数据一致性
        //    - lazyfree_lazy_expire 决定传播 DEL 还是 UNLINK
        propagateExpire(db, keyobj, server.lazyfree_lazy_expire);
        
        // 5. 根据配置选择同步或异步删除
        //    - 异步删除：将删除任务放入后台线程队列，不阻塞主线程
        //    - 同步删除：立即在主线程中删除，可能阻塞但内存立即释放
        if (server.lazyfree_lazy_expire)
            dbAsyncDelete(db, keyobj);
        else
            dbSyncDelete(db, keyobj);
        
        // 6. 发送键空间通知
        //    - 如果客户端订阅了键空间事件，会收到过期通知
        //    - NOTIFY_EXPIRED: 事件类型，表示键过期
        //    - "expired": 事件名称
        notifyKeyspaceEvent(NOTIFY_EXPIRED, "expired", keyobj, db->id);
        
        // 7. 释放键对象的引用计数
        //    - createStringObject 创建的对象引用计数为 1
        //    - 删除操作可能会增加引用，这里减少引用计数
        //    - 如果引用计数为 0，对象会被释放
        decrRefCount(keyobj);
        // 8. 更新过期键统计计数器
        server.stat_expiredkeys++;
        // 9. 返回 1 表示键已过期并已删除
        return 1;
    } else {
        // 10. 返回 0 表示键未过期，不需要删除
        return 0;
    }
}
```

### 主动过期的两种模式

- Redis 的主动过期有两种模式，在不同场景下使用：

#### SLOW 模式

- 在 `databasesCron()` 中定期调用，使用 CPU 时间的 25% 进行过期清理。
- 调用时机：每 `server.hz` 次调用一次（默认 10 次/秒，即每 100ms 一次）
- 时间限制：`1000000 * 25 / server.hz / 100` 微秒（默认约 2500 微秒）

```c
// server.c 第 1008-1010 行
if (server.active_expire_enabled) {
    if (server.masterhost == NULL) {
        activeExpireCycle(ACTIVE_EXPIRE_CYCLE_SLOW);
    }
}
```

#### FAST 模式

- 在 `beforeSleep()` 中调用，用于快速清理过期键，避免阻塞事件循环。
- 调用时机：每次事件循环前
- 时间限制：1000 微秒（1 毫秒）
- 触发条件：
  - 上次 SLOW 模式因时间限制退出（`timelimit_exit = 1`）
  - 距离上次 FAST 周期至少 2000 微秒

```c
// server.c 第 1388 行（beforeSleep 函数中）
if (timelimit_exit) {
    activeExpireCycle(ACTIVE_EXPIRE_CYCLE_FAST);
}
```

### 过期键的传播

- 当键在主节点过期时，需要将删除操作传播到 AOF 文件和从节点，保证数据一致性。

#### propagateExpire

- `propagateExpire()` 将过期键的删除操作传播到 AOF 和从节点。
- 它是这样实现的：
  - 1. 构建删除命令参数数组（DEL/UNLINK + key）
  - 2. 增加参数的引用计数
  - 3. 如果 AOF 启用，写入 AOF 文件
  - 4. 将删除命令传播到所有从节点
  - 5. 释放参数的引用计数

```c
// db.c 第 1113-1127 行
void propagateExpire(redisDb *db, robj *key, int lazy) {
    robj *argv[2];
    
    // 1. 构建删除命令参数
    argv[0] = lazy ? shared.unlink : shared.del;  // 根据配置选择 DEL 或 UNLINK
    argv[1] = key;
    incrRefCount(argv[0]);  // 2. 增加引用计数
    incrRefCount(argv[1]);
    
    // 3. 写入 AOF 文件（如果启用）
    if (server.aof_state != AOF_OFF)
        feedAppendOnlyFile(server.delCommand, db->id, argv, 2);
    
    // 4. 传播到从节点
    replicationFeedSlaves(server.slaves, db->id, argv, 2);
    
    // 5. 释放引用
    decrRefCount(argv[0]);
    decrRefCount(argv[1]);
}
```

### 过期命令的实现

#### expireGenericCommand

- `expireGenericCommand()` 是 EXPIRE、PEXPIRE、EXPIREAT、PEXPIREAT 命令的通用实现。
- 它是这样实现的：
  - 1. 解析过期时间参数（从客户端参数中获取）
  - 2. 如果是秒单位，转换为毫秒
  - 3. 加上基准时间（EXPIRE/PEXPIRE 使用当前时间，EXPIREAT/PEXPIREAT 使用 0）
  - 4. 检查键是否存在，不存在返回 0
  - 5. 如果过期时间已过且不在加载状态且不是从节点：
    - 立即删除键
    - 将命令重写为 DEL/UNLINK 并传播
    - 发送键空间通知
  - 6. 否则调用 `setExpire()` 设置过期时间

```c
// expire.c 第 405-450 行
void expireGenericCommand(client *c, long long basetime, int unit) {
    robj *key = c->argv[1], *param = c->argv[2];
    long long when;  // 过期时间（毫秒时间戳）
    
    // 1. 解析过期时间参数
    if (getLongLongFromObjectOrReply(c, param, &when, NULL) != C_OK)
        return;
    
    // 2. 单位转换：秒转毫秒
    if (unit == UNIT_SECONDS) when *= 1000;
    when += basetime;  // 3. 加上基准时间（EXPIRE 用当前时间，EXPIREAT 用 0）
    
    // 4. 检查键是否存在
    if (lookupKeyWrite(c->db, key) == NULL) {
        addReply(c, shared.czero);
        return;
    }
    
    // 5. 如果过期时间已过，立即删除
    if (when <= mstime() && !server.loading && !server.masterhost) {
        robj *aux;
        
        // 6. 删除键
        int deleted = server.lazyfree_lazy_expire ? 
                     dbAsyncDelete(c->db, key) : dbSyncDelete(c->db, key);
        serverAssertWithInfo(c, key, deleted);
        server.dirty++;
        
        // 7. 重写命令为 DEL/UNLINK 并传播
        aux = server.lazyfree_lazy_expire ? shared.unlink : shared.del;
        rewriteClientCommandVector(c, 2, aux, key);
        signalModifiedKey(c->db, key);
        notifyKeyspaceEvent(NOTIFY_GENERIC, "del", key, c->db->id);
        addReply(c, shared.cone);
        return;
    } else {
        // 8. 设置过期时间
        setExpire(c, c->db, key, when);
        addReply(c, shared.cone);
        signalModifiedKey(c->db, key);
        notifyKeyspaceEvent(NOTIFY_GENERIC, "expire", key, c->db->id);
        server.dirty++;
        return;
    }
}
```

## 惰性删除

- Redis 的惰性删除（Lazy Free）机制用于异步释放大对象的内存，避免阻塞主线程。
- 当删除大对象（如包含大量元素的 Hash、Set、List 等）时，同步删除会阻塞主线程，影响 Redis 的响应性能。惰性删除将这些对象的释放操作放到后台线程中执行，主线程可以继续处理其他请求。
- 惰性删除适用于以下场景：
  - 删除大键（`DEL` 命令）
  - 过期键删除（`expireIfNeeded`）
  - 内存淘汰（`evict.c`）
  - 清空数据库（`FLUSHDB`、`FLUSHALL`）
  - Redis Cluster 的槽位映射清理

### 配置选项

- Redis 提供了以下配置选项来控制惰性删除：
  - 1. 如果经常删除大对象，启用 `lazyfree-lazy-server-del`
  - 2. 如果过期键较多且较大，启用 `lazyfree-lazy-expire`
  - 3. 如果内存压力大，启用 `lazyfree-lazy-eviction`

```conf
# 是否对 DEL 命令使用异步删除
lazyfree-lazy-server-del no

# 是否对过期键使用异步删除
lazyfree-lazy-expire no

# 是否对内存淘汰使用异步删除
lazyfree-lazy-eviction no
```

### 惰性删除的设计思想

- 同步删除的问题：
  - 删除大对象需要遍历并释放大量内存，耗时较长
  - 在主线程中执行会阻塞其他命令的处理
  - 影响 Redis 的响应时间和吞吐量

- 异步删除的优势：
  - 主线程只负责将对象标记为待删除，立即返回
  - 实际的内存释放由后台线程异步执行
  - 主线程可以继续处理其他请求，提高响应性能

- 适用条件：
  - 对象的删除成本（`free_effort`）超过阈值（`LAZYFREE_THRESHOLD = 64`）
  - 对象的引用计数为 1（只有数据库引用，没有其他引用）
  - 如果对象被共享（`refcount > 1`），不能异步删除，必须同步删除

### 删除成本评估

#### lazyfreeGetFreeEffort

- `lazyfreeGetFreeEffort()` 用于评估释放一个对象所需的工作量，返回值与对象的复杂度成正比。
- 返回值表示释放该对象需要处理的内存块数量（或元素数量），值越大，释放成本越高，越适合使用异步删除
- 它是这样实现的：
  - 1. List：返回 `quicklist->len`（元素数量）
    - 每个 quicklist 节点包含一个 ziplist，需要遍历释放
  - 2. Set（哈希表）：返回 `dictSize(ht)`（元素数量）
    - 每个字典项都需要释放键和值
  - 3. Sorted Set（跳表）：返回 `zsl->length`（元素数量）
    - 跳表中的每个节点都需要释放
  - 4. Hash（哈希表）：返回 `dictSize(ht)`（元素数量）
    - 每个字典项都需要释放键和值
  - 5. 其他类型：返回 1（单次分配，释放成本低）
    - String、小对象等通常是单次内存分配，释放成本低

- 阈值判断：
  - `LAZYFREE_THRESHOLD = 64`
  - 如果 `free_effort > 64`，使用异步删除
    - 异步删除的开销（创建任务、线程切换等）小于同步删除的开销
  - 如果 `free_effort <= 64`，使用同步删除
    - 小对象的异步删除开销反而更大，直接同步删除更高效

```c
// lazyfree.c 第 31-47 行
size_t lazyfreeGetFreeEffort(robj *obj) {
    // 1. List 类型：返回 quicklist 的长度（元素数量）
    //    - 每个元素都需要释放，所以工作量与长度成正比
    if (obj->type == OBJ_LIST) {
        quicklist *ql = obj->ptr;
        return ql->len;
    } 
    // 2. Set 类型（哈希表编码）：返回字典的大小（元素数量）
    //    - 每个字典项都需要释放
    else if (obj->type == OBJ_SET && obj->encoding == OBJ_ENCODING_HT) {
        dict *ht = obj->ptr;
        return dictSize(ht);
    } 
    // 3. Sorted Set 类型（跳表编码）：返回跳表的长度（元素数量）
    //    - 跳表中的每个节点都需要释放
    else if (obj->type == OBJ_ZSET && obj->encoding == OBJ_ENCODING_SKIPLIST){
        zset *zs = obj->ptr;
        return zs->zsl->length;
    } 
    // 4. Hash 类型（哈希表编码）：返回字典的大小（元素数量）
    //    - 每个字典项都需要释放
    else if (obj->type == OBJ_HASH && obj->encoding == OBJ_ENCODING_HT) {
        dict *ht = obj->ptr;
        return dictSize(ht);
    } 
    // 5. 其他类型（String、小对象等）：返回 1
    //    - 这些对象通常是单次分配，释放成本低
    else {
        return 1;
    }
}
```

### 同步删除与异步删除

- `dictUnlink()`：只从字典中移除，不立即释放内存
- `dictDelete()`：从字典中移除并立即释放内存
- 值对象设置为 NULL 的原因：
  - 避免 `dictFreeUnlinkedEntry()` 释放值对象
  - 值对象将在后台线程中释放

#### dbSyncDelete

- `dbSyncDelete()` 是同步删除函数，立即在主线程中删除键并释放内存。
- 它是这样实现的：
  - 1. 从过期字典中删除键（如果存在）
  - 2. 从主字典中删除键，`dictDelete()` 会：
    - 删除字典项
    - 调用 `dictFreeKey()` 释放键的 SDS
    - 调用 `dictFreeVal()` -> `decrRefCount()` 释放值对象
  - 3. 如果启用 Redis Cluster，从槽位映射中删除键
  - 4. 返回删除结果

```c
// db.c 第 271-281 行
int dbSyncDelete(redisDb *db, robj *key) {
    // 1. 从过期字典中删除键（如果存在）
    //    - 注意：删除过期字典项不会释放键的 SDS，因为键与主字典共享
    if (dictSize(db->expires) > 0) 
        dictDelete(db->expires, key->ptr);
    
    // 2. 从主字典中删除键
    //    - dictDelete 会删除字典项并释放键和值对象
    //    - 返回 DICT_OK 表示删除成功
    if (dictDelete(db->dict, key->ptr) == DICT_OK) {
        // 3. 如果启用 Redis Cluster，从槽位映射中删除键
        if (server.cluster_enabled) 
            slotToKeyDel(key);
        return 1;  // 删除成功
    } else {
        return 0;  // 键不存在，删除失败
    }
}
```

#### dbAsyncDelete

- `dbAsyncDelete()` 是异步删除函数，对于大对象会将其放入后台线程队列异步释放。
- 它是这样实现的：
  - 1. 从过期字典中删除键
  - 2. 使用 `dictUnlink()` 从主字典中取消链接键（不立即释放）
  - 3. 获取值对象并评估删除成本
  - 4. 如果满足异步删除条件（成本高且未被共享）：
    - 增加待删除对象计数
    - 创建后台任务，将对象放入 BIO 队列
    - 将字典项的值设置为 NULL（避免立即释放）
  - 5. 释放字典项（键和字典项本身）
  - 6. 如果启用 Redis Cluster，从槽位映射中删除键

```c
// lazyfree.c 第 54-91 行
#define LAZYFREE_THRESHOLD 64  // 异步删除的阈值

int dbAsyncDelete(redisDb *db, robj *key) {
    // 1. 从过期字典中删除键（如果存在）
    //    - 删除过期字典项不会释放键的 SDS，因为键与主字典共享
    if (dictSize(db->expires) > 0) 
        dictDelete(db->expires, key->ptr);
    
    // 2. 使用 dictUnlink 从主字典中"取消链接"键
    //    - dictUnlink 与 dictDelete 的区别：
    //      * dictUnlink: 只从字典中移除，不立即释放内存
    //      * dictDelete: 从字典中移除并立即释放内存
    //    - 返回字典项指针，如果键不存在返回 NULL
    dictEntry *de = dictUnlink(db->dict, key->ptr);
    
    if (de) {
        robj *val = dictGetVal(de);  // 3. 获取值对象
        
        // 4. 评估释放该对象所需的工作量
        size_t free_effort = lazyfreeGetFreeEffort(val);
        
        // 5. 判断是否使用异步删除
        //    - 条件1：free_effort > LAZYFREE_THRESHOLD（删除成本高）
        //    - 条件2：val->refcount == 1（对象未被共享）
        //    - 如果对象被共享（refcount > 1），不能异步删除
        //      * 因为其他引用可能还在使用该对象
        if (free_effort > LAZYFREE_THRESHOLD && val->refcount == 1) {
            // 5.1 增加待删除对象计数
            atomicIncr(lazyfree_objects, 1);
            
            // 5.2 创建后台任务，将对象放入 BIO_LAZY_FREE 队列
            //     - arg1: 要释放的对象
            //     - arg2, arg3: NULL（用于其他场景）
            bioCreateBackgroundJob(BIO_LAZY_FREE, val, NULL, NULL);
            
            // 5.3 将字典项的值设置为 NULL
            //     - 这样在释放字典项时不会释放值对象
            //     - 值对象将在后台线程中释放
            dictSetVal(db->dict, de, NULL);
        }
    }
    
    // 6. 释放字典项（键值对）
    //    - 如果值对象被设置为 NULL，只释放键和字典项本身
    //    - 如果值对象不为 NULL，同步释放值对象
    if (de) {
        dictFreeUnlinkedEntry(db->dict, de);
        // 7. 如果启用 Redis Cluster，从槽位映射中删除键
        if (server.cluster_enabled) 
            slotToKeyDel(key);
        return 1;  // 删除成功
    } else {
        return 0;  // 键不存在，删除失败
    }
}
```

#### dbDelete

- `dbDelete()` 是一个包装函数，根据配置选择同步或异步删除。

```c
// db.c 第 285-288 行
int dbDelete(redisDb *db, robj *key) {
    // 根据 server.lazyfree_lazy_server_del 配置选择删除方式
    // - 为真：使用异步删除（适用于大对象）
    // - 为假：使用同步删除（立即释放内存）
    return server.lazyfree_lazy_server_del ? 
           dbAsyncDelete(db, key) : dbSyncDelete(db, key);
}
```

### 后台线程处理（BIO）

- Redis 使用后台 I/O 线程（Background I/O，BIO）来处理异步任务，包括惰性删除。
- BIO 任务类型：
  - `BIO_CLOSE_FILE`：异步关闭文件
  - `BIO_AOF_FSYNC`：异步 AOF 同步
  - `BIO_LAZY_FREE`：异步对象释放（惰性删除）

#### BIO 线程初始化

- `bioInit()` 在 Redis 服务器启动时调用，初始化后台线程系统。
- 它是这样实现的：
  - 1. **初始化同步原语**：
    - 为每种任务类型创建互斥锁和条件变量
    - 创建任务队列（链表）
    - 初始化待处理任务计数
  - 2. **设置线程属性**：
    - 获取当前栈大小
    - 确保栈大小至少为 4MB（`REDIS_THREAD_STACK_SIZE`）
  - 3. **创建后台线程**：
    - 为每种任务类型创建一个独立的线程
    - 线程函数是 `bioProcessBackgroundJobs`
    - 线程参数是任务类型编号
    - 如果创建失败，记录错误并退出程序

```c
// bio.c 第 96-167 行
void bioInit(void) {
    pthread_attr_t attr;  // 线程属性
    pthread_t thread;      // 线程句柄
    size_t stacksize;      // 栈大小
    int j;

    // 1. 为每种任务类型初始化同步原语和数据结构
    //    - BIO_NUM_OPS = 3（CLOSE_FILE, AOF_FSYNC, LAZY_FREE）
    for (j = 0; j < BIO_NUM_OPS; j++) {
        // 1.1 初始化互斥锁
        //     - 用于保护任务队列的并发访问
        pthread_mutex_init(&bio_mutex[j],NULL);
        
        // 1.2 初始化条件变量（用于通知新任务到达）
        //     - bio_newjob_cond: 当有新任务时唤醒等待的线程
        pthread_cond_init(&bio_newjob_cond[j],NULL);
        
        // 1.3 初始化条件变量（用于通知任务完成）
        //     - bio_step_cond: 当任务完成时唤醒等待的线程
        pthread_cond_init(&bio_step_cond[j],NULL);
        
        // 1.4 创建任务队列（链表）
        //     - 每个任务类型都有独立的队列
        bio_jobs[j] = listCreate();
        
        // 1.5 初始化待处理任务计数
        bio_pending[j] = 0;
    }

    // 2. 设置线程属性（栈大小）
    //    - REDIS_THREAD_STACK_SIZE = 4MB
    pthread_attr_init(&attr);
    
    // 2.1 获取当前栈大小
    pthread_attr_getstacksize(&attr,&stacksize);
    
    // 2.2 Solaris 系统兼容性处理
    //     - 某些系统可能返回 0，需要特殊处理
    if (!stacksize) stacksize = 1;
    
    // 2.3 确保栈大小至少为 REDIS_THREAD_STACK_SIZE
    //     - 如果当前栈大小不足，翻倍直到满足要求
    while (stacksize < REDIS_THREAD_STACK_SIZE) stacksize *= 2;
    
    // 2.4 设置栈大小属性
    pthread_attr_setstacksize(&attr, stacksize);

    // 3. 为每种任务类型创建后台线程
    for (j = 0; j < BIO_NUM_OPS; j++) {
        // 3.1 准备线程参数（任务类型编号）
        void *arg = (void*)(unsigned long) j;
        
        // 3.2 创建线程
        //     - 线程函数：bioProcessBackgroundJobs
        //     - 线程参数：任务类型编号
        //     - 线程属性：包含栈大小等信息
        if (pthread_create(&thread,&attr,bioProcessBackgroundJobs,arg) != 0) {
            // 3.3 如果创建失败，记录错误并退出
            //     - 后台线程是 Redis 的关键组件，创建失败必须退出
            serverLog(LL_WARNING,"Fatal: Can't initialize Background Jobs.");
            exit(1);
        }
        
        // 3.4 保存线程句柄
        bio_threads[j] = thread;
    }
}
```

#### 创建后台任务

- `bioCreateBackgroundJob()` 用于创建后台任务并将其添加到任务队列中。
- 它是这样实现的：
  - 1. 分配任务结构体内存
  - 2. 设置任务参数（时间戳和三个参数指针）
  - 3. 加锁保护队列操作
  - 4. 将任务添加到队列尾部（FIFO）
  - 5. 更新待处理任务计数
  - 6. 唤醒等待的后台线程
  - 7. 释放互斥锁

```c
// bio.c 第 131-142 行
void bioCreateBackgroundJob(int type, void *arg1, void *arg2, void *arg3) {
    // 1. 分配任务结构体
    //    - 使用 zmalloc 分配内存（会更新内存统计）
    //    - bio_job 结构体包含时间戳和三个参数指针
    struct bio_job *job = zmalloc(sizeof(*job));
    
    // 2. 设置任务参数和时间戳
    //    - time: 任务创建时间，用于监控和统计
    //    - arg1, arg2, arg3: 任务参数，根据任务类型有不同的含义
    //      * BIO_LAZY_FREE + arg1: 释放单个对象
    //      * BIO_LAZY_FREE + arg2&arg3: 释放数据库（两个字典）
    //      * BIO_LAZY_FREE + arg3: 释放槽位映射
    job->time = time(NULL);
    job->arg1 = arg1;
    job->arg2 = arg2;
    job->arg3 = arg3;
    
    // 3. 加锁并添加到任务队列
    //    - 获取对应任务类型的互斥锁，保护队列的并发访问
    pthread_mutex_lock(&bio_mutex[type]);
    
    // 3.1 将任务添加到队列尾部（FIFO 顺序）
    //     - listAddNodeTail 保证任务按照提交顺序执行
    listAddNodeTail(bio_jobs[type], job);
    
    // 3.2 增加待处理任务计数
    //     - bio_pending[type] 用于统计和监控
    //     - 主线程可以通过 bioPendingJobsOfType 查询待处理任务数
    bio_pending[type]++;
    
    // 4. 唤醒等待的后台线程
    //    - pthread_cond_signal 唤醒一个等待在 bio_newjob_cond 上的线程
    //    - 如果有线程在等待新任务（队列为空时），会被唤醒
    pthread_cond_signal(&bio_newjob_cond[type]);
    
    // 5. 释放互斥锁
    pthread_mutex_unlock(&bio_mutex[type]);
}
```

#### 后台线程处理任务

- `bioProcessBackgroundJobs()` 是后台线程的主循环函数，负责从任务队列中取出任务并执行。
- 它是这样实现的：
  - 1. **初始化阶段**：
    - 验证任务类型有效性
    - 设置线程取消状态（允许快速终止）
    - 获取互斥锁
    - 屏蔽 SIGALRM 信号（避免干扰主线程）
  - 2. **主循环阶段**：
    - 如果队列为空，等待新任务（`pthread_cond_wait`）
    - 从队列头部取出任务（FIFO 顺序）
    - 释放互斥锁（允许其他线程添加任务）
    - 根据任务类型执行相应操作（在锁外执行，避免阻塞）
    - 释放任务结构体
    - 重新获取互斥锁
    - 从队列中删除任务节点
    - 更新待处理任务计数
    - 唤醒等待的线程
    - 继续循环

```c
// bio.c 第 145-216 行
void *bioProcessBackgroundJobs(void *arg) {
    struct bio_job *job;  // 任务结构体指针
    unsigned long type = (unsigned long) arg;  // 任务类型（从线程参数获取）
    sigset_t sigset;  // 信号集，用于屏蔽信号

    // 1. 参数验证：检查任务类型是否有效
    //    - BIO_NUM_OPS 是任务类型的总数（3）
    //    - 如果类型无效，记录警告并返回
    if (type >= BIO_NUM_OPS) {
        serverLog(LL_WARNING,
            "Warning: bio thread started with wrong type %lu",type);
        return NULL;
    }

    // 2. 设置线程取消状态
    //    - PTHREAD_CANCEL_ENABLE: 允许线程被取消
    //    - PTHREAD_CANCEL_ASYNCHRONOUS: 异步取消模式
    //    - 这样在 Redis 关闭时可以快速终止后台线程
    pthread_setcancelstate(PTHREAD_CANCEL_ENABLE, NULL);
    pthread_setcanceltype(PTHREAD_CANCEL_ASYNCHRONOUS, NULL);

    // 3. 获取互斥锁（进入临界区）
    //    - 每个任务类型都有独立的互斥锁
    //    - 用于保护任务队列的并发访问
    pthread_mutex_lock(&bio_mutex[type]);

    // 4. 屏蔽 SIGALRM 信号
    //    - SIGALRM 是定时器信号，用于 Redis 的定时任务
    //    - 后台线程不应该处理定时器信号，避免干扰主线程
    sigemptyset(&sigset);  // 初始化信号集为空
    sigaddset(&sigset, SIGALRM);  // 添加 SIGALRM 到信号集
    if (pthread_sigmask(SIG_BLOCK, &sigset, NULL))
        serverLog(LL_WARNING,
            "Warning: can't mask SIGALRM in bio.c thread: %s", strerror(errno));

    // 5. 主循环：不断处理任务
    while(1) {
        listNode *ln;  // 链表节点指针

        // 5.1 检查任务队列是否为空
        //     - 如果队列为空，等待新任务到达
        //     - pthread_cond_wait 会释放互斥锁并阻塞，直到被唤醒
        //     - 被唤醒后会重新获取互斥锁
        if (listLength(bio_jobs[type]) == 0) {
            pthread_cond_wait(&bio_newjob_cond[type],&bio_mutex[type]);
            continue;  // 被唤醒后继续循环
        }

        // 5.2 从队列头部取出任务（FIFO 顺序）
        //     - listFirst 获取队列的第一个节点
        //     - 保证任务按照提交顺序执行
        ln = listFirst(bio_jobs[type]);
        job = ln->value;  // 获取任务结构体

        // 5.3 释放互斥锁
        //     - 此时已经获取了任务指针，可以释放锁
        //     - 这样其他线程可以继续添加新任务
        //     - 任务处理在锁外进行，避免长时间持有锁
        pthread_mutex_unlock(&bio_mutex[type]);

        // 5.4 根据任务类型执行相应的操作
        if (type == BIO_CLOSE_FILE) {
            // 类型1：异步关闭文件
            // - arg1 存储文件描述符（转换为 long 类型）
            // - close 是系统调用，可能阻塞，放在后台线程执行
            close((long)job->arg1);
        } else if (type == BIO_AOF_FSYNC) {
            // 类型2：异步 AOF 同步
            // - arg1 存储文件描述符
            // - redis_fsync 调用 fsync，将数据同步到磁盘
            // - fsync 可能阻塞，放在后台线程执行
            redis_fsync((long)job->arg1);
        } else if (type == BIO_LAZY_FREE) {
            // 类型3：异步对象释放（惰性删除）
            // - 根据参数判断要释放的对象类型
            // 5.4.1 arg1 不为空：释放单个对象
            //       - 这是最常见的场景，删除单个键的值对象
            if (job->arg1)
                lazyfreeFreeObjectFromBioThread(job->arg1);
            // 5.4.2 arg2 和 arg3 都不为空：释放整个数据库
            //       - arg2: 主字典, arg3: 过期字典
            //       - 用于 FLUSHDB/FLUSHALL 命令
            else if (job->arg2 && job->arg3)
                lazyfreeFreeDatabaseFromBioThread(job->arg2,job->arg3);
            // 5.4.3 只有 arg3 不为空：释放槽位映射
            //       - arg3: Redis Cluster 的槽位映射（Rax 树）
            //       - 用于清空槽位映射
            else if (job->arg3)
                lazyfreeFreeSlotsMapFromBioThread(job->arg3);
        } else {
            // 未知任务类型，触发 panic（不应该发生）
            serverPanic("Wrong job type in bioProcessBackgroundJobs().");
        }
        
        // 5.5 释放任务结构体
        //     - 任务已经处理完成，释放任务结构体的内存
        zfree(job);

        // 5.6 重新获取互斥锁（进入临界区）
        pthread_mutex_lock(&bio_mutex[type]);
        
        // 5.7 从队列中删除已处理的任务节点
        listDelNode(bio_jobs[type],ln);
        
        // 5.8 减少待处理任务计数
        bio_pending[type]--;

        // 5.9 唤醒等待的线程
        //     - 可能有其他线程在等待任务完成（通过 bioWaitStepOfType）
        //     - pthread_cond_broadcast 唤醒所有等待的线程
        pthread_cond_broadcast(&bio_step_cond[type]);
        
        // 5.10 继续循环，处理下一个任务
    }
}
```

### 后台线程释放函数

#### lazyfreeFreeObjectFromBioThread

- 在后台线程中释放单个对象。

```c
// lazyfree.c 第 129-132 行
void lazyfreeFreeObjectFromBioThread(robj *o) {
    // 1. 减少对象的引用计数，如果为 0 则释放对象
    //    - decrRefCount 会根据对象类型调用相应的释放函数
    decrRefCount(o);
    
    // 2. 减少待删除对象计数
    atomicDecr(lazyfree_objects, 1);
}
```

#### lazyfreeFreeDatabaseFromBioThread

- 在后台线程中释放整个数据库（主字典和过期字典）。

```c
// lazyfree.c 第 139-144 行
void lazyfreeFreeDatabaseFromBioThread(dict *ht1, dict *ht2) {
    // 1. 获取主字典的键数量（用于统计）
    size_t numkeys = dictSize(ht1);
    
    // 2. 释放主字典和过期字典
    //    - dictRelease 会释放字典中的所有键值对和字典本身
    dictRelease(ht1);
    dictRelease(ht2);
    
    // 3. 减少待删除对象计数（按键数量）
    atomicDecr(lazyfree_objects, numkeys);
}
```

#### lazyfreeFreeSlotsMapFromBioThread

- 在后台线程中释放 Redis Cluster 的槽位映射。

```c
// lazyfree.c 第 148-152 行
void lazyfreeFreeSlotsMapFromBioThread(rax *rt) {
    // 1. 获取槽位映射的元素数量（用于统计）
    size_t len = rt->numele;
    
    // 2. 释放槽位映射（Rax 树）
    raxFree(rt);
    
    // 3. 减少待删除对象计数（按元素数量）
    atomicDecr(lazyfree_objects, len);
}
```

### 其他异步删除场景

#### freeObjAsync

- `freeObjAsync()` 用于异步释放单个对象（不涉及键删除），主要用于对象覆盖场景。
- 它是这样实现的：
  - 1. 评估释放成本（`lazyfreeGetFreeEffort`）
  - 2. 如果满足异步删除条件（成本高且未被共享）：
    - 增加待删除对象计数
    - 创建后台任务
  - 3. 否则同步释放（`decrRefCount`）

- 使用场景：
  - 在 `dbOverwrite()` 中，当覆盖旧值时：
    - 如果旧值是大对象，使用 `freeObjAsync()` 异步释放
    - 避免释放大对象阻塞主线程
  - 在内存淘汰时，释放被淘汰的对象

```c
// lazyfree.c 第 94-102 行
void freeObjAsync(robj *o) {
    // 1. 评估释放该对象的成本
    //    - 根据对象类型和大小计算释放工作量
    size_t free_effort = lazyfreeGetFreeEffort(o);
    
    // 2. 判断是否满足异步删除条件
    //    - 条件1：free_effort > LAZYFREE_THRESHOLD（释放成本高）
    //    - 条件2：o->refcount == 1（对象未被共享）
    //    - 如果对象被共享，不能异步删除（其他引用可能还在使用）
    if (free_effort > LAZYFREE_THRESHOLD && o->refcount == 1) {
        // 2.1 增加待删除对象计数
        atomicIncr(lazyfree_objects, 1);
        
        // 2.2 创建后台任务，将对象放入 BIO_LAZY_FREE 队列
        //     - arg1: 要释放的对象
        //     - arg2, arg3: NULL（不用于此场景）
        bioCreateBackgroundJob(BIO_LAZY_FREE, o, NULL, NULL);
    } else {
        // 3. 不满足异步删除条件，同步释放
        //    - 小对象或共享对象直接同步释放
        //    - decrRefCount 会检查引用计数，如果为 0 则释放对象
        decrRefCount(o);
    }
}
```

#### emptyDbAsync

- `emptyDbAsync()` 用于异步清空数据库（`FLUSHDB`、`FLUSHALL`），通过替换字典实现快速清空。主线程立即返回，不阻塞; 内存释放由后台线程异步执行, 适用于清空大型数据库的场景
- 它是这样实现的：
  - 1. 保存旧字典指针（主字典和过期字典）
  - 2. 创建新的空字典替换旧字典
    - 数据库逻辑上立即被清空
    - 新请求会使用新字典
  - 3. 更新待删除对象计数（按键数量）
  - 4. 将旧字典放入后台线程队列异步释放
  - 5. 主线程立即返回，不等待内存释放

```c
// lazyfree.c 第 107-113 行
void emptyDbAsync(redisDb *db) {
    // 1. 保存旧字典的指针
    //    - oldht1: 主字典（存储所有键值对）
    //    - oldht2: 过期字典（存储过期键）
    //    - 保存指针是为了后续在后台线程中释放
    dict *oldht1 = db->dict, *oldht2 = db->expires;
    
    // 2. 创建新的空字典替换旧字典
    //    - 立即创建新字典，数据库逻辑上已被清空
    //    - 新字典是空的，不包含任何键值对
    db->dict = dictCreate(&dbDictType, NULL);
    db->expires = dictCreate(&keyptrDictType, NULL);
    
    // 3. 增加待删除对象计数（按键数量）
    //    - 统计主字典中的键数量（过期字典的键是主字典的子集）
    //    - 用于监控待删除对象数量
    atomicIncr(lazyfree_objects, dictSize(oldht1));
    
    // 4. 创建后台任务，释放旧字典
    //    - arg1: NULL（不用于此场景）
    //    - arg2: 主字典指针
    //    - arg3: 过期字典指针
    //    - 后台线程会调用 lazyfreeFreeDatabaseFromBioThread 释放这两个字典
    bioCreateBackgroundJob(BIO_LAZY_FREE, NULL, oldht1, oldht2);
}
```

#### slotToKeyFlushAsync

- `slotToKeyFlushAsync()` 用于异步清空 Redis Cluster 的槽位映射，在 `FLUSHALL` 时调用。
- 它是这样实现的：
  - 1. 保存旧槽位映射指针（Rax 树）
  - 2. 创建新的空槽位映射并替换旧映射
    - 槽位映射逻辑上立即被清空
  - 3. 清空槽位键计数数组
  - 4. 更新待删除对象计数（按元素数量）
  - 5. 将旧槽位映射放入后台线程队列异步释放
  - 6. 主线程立即返回

- 使用场景：
  - Redis Cluster 模式下执行 `FLUSHALL` 时
  - 需要清空所有槽位的键映射关系

```c
// lazyfree.c 第 117-125 行
void slotToKeyFlushAsync(void) {
    // 1. 保存旧槽位映射的指针
    //    - slots_to_keys 是 Rax 树，用于快速查找槽位对应的键
    //    - 保存指针是为了后续在后台线程中释放
    rax *old = server.cluster->slots_to_keys;
    
    // 2. 创建新的空槽位映射
    //    - raxNew 创建新的空 Rax 树
    server.cluster->slots_to_keys = raxNew();
    
    // 2.1 清空槽位键计数数组
    //     - slots_keys_count 记录每个槽位的键数量
    //     - 需要清零，因为槽位映射已被清空
    memset(server.cluster->slots_keys_count, 0, 
           sizeof(server.cluster->slots_keys_count));
    
    // 3. 增加待删除对象计数（按元素数量）
    //    - old->numele 是旧 Rax 树中的元素数量
    //    - 用于监控待删除对象数量
    atomicIncr(lazyfree_objects, old->numele);
    
    // 4. 创建后台任务，释放旧槽位映射
    //    - arg1: NULL（不用于此场景）
    //    - arg2: NULL（不用于此场景）
    //    - arg3: 槽位映射（Rax 树）指针
    //    - 后台线程会调用 lazyfreeFreeSlotsMapFromBioThread 释放 Rax 树
    bioCreateBackgroundJob(BIO_LAZY_FREE, NULL, NULL, old);
}
```

### 惰性删除的统计和监控

#### lazyfreeGetPendingObjectsCount

- `lazyfreeGetPendingObjectsCount()` 获取当前待删除的对象数量，用于监控和等待。
- 它是这样实现的：
  - 1. 原子读取 `lazyfree_objects` 计数
  - 2. 返回待删除对象数量

- 用途：
  - 监控：通过 `INFO` 命令查看待删除对象数量
  - 内存淘汰：在 `freeMemoryIfNeeded()` 中等待异步删除完成
    - 如果待删除对象过多，可能阻塞等待，避免内存持续增长
  - 性能分析：了解异步删除的负载情况

```c
// lazyfree.c 第 10-14 行
size_t lazyfreeGetPendingObjectsCount(void) {
    size_t aux;  // 临时变量，用于存储原子读取的值
    
    // 原子读取 lazyfree_objects 计数
    // - lazyfree_objects 是原子变量，记录当前待删除的对象数量
    // - 每次创建异步删除任务时增加，任务完成时减少
    atomicGet(lazyfree_objects, aux);
    
    return aux;  // 返回待删除对象数量
}
```

## 内存置换

- Redis 的内存置换机制用于在内存使用达到上限（`maxmemory`）时，根据配置的淘汰策略删除键以释放内存。
- 当 Redis 的内存使用超过 `maxmemory` 限制时，会在执行写命令前调用 `freeMemoryIfNeeded()` 尝试释放内存。
- Redis 支持多种内存淘汰策略：
  - **LRU（Least Recently Used）**：最近最少使用
  - **LFU（Least Frequently Used）**：最不经常使用
  - **TTL（Time To Live）**：最短过期时间
  - **Random**：随机删除
  - **No Eviction**：不淘汰，返回错误

### 配置选项

- Redis 提供了以下配置选项来控制内存淘汰：
- 调整 `maxmemory-samples` 平衡准确性和性能
- 如果经常淘汰大对象，启用 `lazyfree-lazy-eviction`

```conf
# 最大内存限制（字节）
maxmemory <bytes>

# 内存淘汰策略
maxmemory-policy noeviction

# LRU/LFU 采样数量（默认 5）
maxmemory-samples 5

# LFU 对数因子（默认 10）
lfu-log-factor 10

# LFU 衰减时间（分钟，默认 1）
lfu-decay-time 1

# 是否对内存淘汰使用异步删除
lazyfree-lazy-eviction no
```

### 内存淘汰策略

- Redis 提供了 8 种内存淘汰策略，通过 `maxmemory-policy` 配置：

| 策略 | 说明 | 适用场景
| ------ | ------ | ----------
| `volatile-lru` | 从设置了过期时间的键中，选择最近最少使用的键删除 | 希望保留热点数据，但允许过期键被淘汰
| `allkeys-lru` | 从所有键中，选择最近最少使用的键删除 | 希望保留热点数据，所有键都可能被淘汰
| `volatile-lfu` | 从设置了过期时间的键中，选择最不经常使用的键删除 | 希望保留频繁访问的数据
| `allkeys-lfu` | 从所有键中，选择最不经常使用的键删除 | 希望保留频繁访问的数据，所有键都可能被淘汰
| `volatile-ttl` | 从设置了过期时间的键中，选择 TTL 最短的键删除 | 优先删除即将过期的键
| `volatile-random` | 从设置了过期时间的键中，随机选择一个键删除 | 随机淘汰，不关心访问模式
| `allkeys-random` | 从所有键中，随机选择一个键删除 | 随机淘汰，不关心访问模式
| `noeviction` | 不淘汰任何键，写操作返回错误 | 不允许数据丢失的场景

- 策略标志位：
  - `MAXMEMORY_FLAG_LRU`：LRU 策略标志
  - `MAXMEMORY_FLAG_LFU`：LFU 策略标志
  - `MAXMEMORY_FLAG_ALLKEYS`：allkeys 策略标志（从所有键中选择）

### LRU 实现

- LRU 算法就是指最近最少使用（Least Recently Used，LRU）算法，这是一个经典的缓存算法。从基本原理上来说，LRU 算法会使用一个链表来维护缓存中每一个数据的访问情况，并根据数据的实时访问，调整数据在链表中的位置，然后通过数据在链表中的位置，来表示数据是最近刚访问的，还是已经有一段时间没有访问了。具体来说，LRU 算法会把链表的头部和尾部分别设置为 MRU 端和 LRU 端。其中，MRU 是 Most Recently Used 的缩写，MRU 端表示这里的数据是刚被访问的。而 LRU 端则表示，这里的数据是最近最少访问的数据。
- LRU 算法的执行，可以分成三种情况：
  - 1. 当有新数据插入时，LRU 算法会把该数据插入到链表头部，同时把原来链表头部的数据及其之后的数据，都向尾部移动一位。
  - 2. 当有数据刚被访问了一次之后，LRU 算法就会把该数据从它在链表中的当前位置，移动到链表头部。同时，把从链表头部到它当前位置的其他数据，都向尾部移动一位。
  - 3. 当链表长度无法再容纳更多数据时，若再有新数据插入，LRU 算法就会去除链表尾部的数据，这也相当于将数据从缓存中淘汰掉。

- 如果要严格按照 LRU 算法的基本原理来实现的话，要为 Redis 使用最大内存时，可容纳的所有数据维护一个链表；每当有新数据插入或是现有数据被再次访问时，需要执行多次链表操作。既需要额外的内存空间来保存链表，还会在访问数据的过程中，让 Redis 受到数据移动和链表操作的开销影响，从而就会降低 Redis 访问性能
- 因此Redis 使用近似 LRU 算法，通过采样和淘汰池（Eviction Pool）来实现
- 近似 LRU 算法并没有使用耗时耗空间的链表，而是使用了固定大小的待淘汰数据集合，每次随机选择一些 key 加入待淘汰数据集合中。最后，再按照待淘汰集合中 key 的空闲时间长度，删除空闲时间最长的 key。避免维护完整的 LRU 链表。

- 为了实现近似 LRU 算法，Redis 首先是设置了全局 LRU 时钟，并在键值对创建时获取全局 LRU 时钟值作为访问时间戳，以及在每次访问时获取全局 LRU 时钟值，更新访问时间戳。然后，当 Redis 每处理一个命令时，都会调用 freeMemoryIfNeeded 函数来判断是否需要释放内存。如果已使用内存超出了 maxmemory，那么，近似 LRU 算法就会随机选择一些键值对，组成待淘汰候选集合，并根据它们的访问时间戳，选出最旧的数据，将其淘汰。

#### 全局 LRU 时钟值的计算

- Redis 使用全局 LRU 时钟来统一记录时间，避免为每个对象单独调用系统时间函数，提升性能。

##### LRU 时钟

- Redis 使用了近似 LRU 算法，但是，这个算法仍然需要区分不同数据的访问时效性，也就是说，Redis 需要知道数据的最近一次访问时间。因此，Redis 就设计了 LRU 时钟来记录数据每次访问的时间戳。
- Redis 使用 24 位的 LRU 时钟来记录对象的最后访问时间，存储在 `redisObject->lru` 字段中。
- LRU 时钟的设计：
  - 分辨率：1000 毫秒（1 秒），即每秒更新一次
    - 如果一个数据前后两次访问的时间间隔小于 1 秒，那么这两次访问的时间戳就是一样的
  - 范围：0 到 2^24-1（约 194 天）
  - 回绕处理：使用按位与操作，自动处理时钟回绕

```c
// server.h 第 611-612 行
#define LRU_CLOCK_MAX ((1<<LRU_BITS)-1)      // 最大 LRU 时钟值（2^24-1）
#define LRU_CLOCK_RESOLUTION 1000             // LRU 时钟分辨率（毫秒）

// evict.c 第 70-72 行
unsigned int getLRUClock(void) {
    // 1. 获取当前时间（毫秒）
    // 2. 除以分辨率（1000 毫秒 = 1 秒），得到秒数
    // 3. 与 LRU_CLOCK_MAX 做按位与，保留低 24 位
    //    - 这样可以处理时钟回绕（wrap around）
    return (mstime()/LRU_CLOCK_RESOLUTION) & LRU_CLOCK_MAX;
}
```

##### serverCron 更新全局 LRU 时钟

- `serverCron()` 是 Redis 的定时任务函数，每秒执行 `server.hz` 次（默认 10 次）。
- 在每次执行时，它会调用 `getLRUClock()` 计算当前的 LRU 时钟值，并使用原子操作更新 `server.lruclock`。
- 这样设计的好处：
  - 避免频繁的系统调用（`mstime()`）
  - 使用原子操作保证线程安全
  - 所有对象共享同一个时钟值，保证时间一致性
- 它是这样实现的：
  - 1. 调用 `getLRUClock()` 计算当前 LRU 时钟值
    - `getLRUClock()` 获取当前毫秒时间，除以分辨率（1000 毫秒），然后与 `LRU_CLOCK_MAX` 做按位与，保留低 24 位
  - 2. 使用 `atomicSet()` 原子性地更新 `server.lruclock`
    - 这样多个线程可以安全地读取这个值，无需加锁

```c
// server.c 第 1148-1160 行
unsigned long lruclock = getLRUClock();  // 1. 计算当前 LRU 时钟值
atomicSet(server.lruclock,lruclock);     // 2. 使用原子操作更新全局 LRU 时钟
```

##### LRU_CLOCK 获取全局 LRU 时钟

- `LRU_CLOCK()` 用于获取当前的全局 LRU 时钟值，它会根据更新频率决定使用缓存值还是实时计算。
- 性能优化：
  - 如果 `server.hz >= 10`（默认值），则 `1000/server.hz <= 100` 毫秒
  - 此时 `serverCron()` 的调用间隔（100ms）小于 LRU 时钟分辨率（1000ms）
  - 可以使用缓存的 `server.lruclock` 值，避免频繁的系统调用
  - 如果 `server.hz < 10`，则实时计算 LRU 时钟值
- 它是这样实现的：
  - 1. 判断更新频率：如果 `1000/server.hz <= LRU_CLOCK_RESOLUTION`，使用缓存值
  - 2. 使用缓存值：从 `server.lruclock` 原子读取（在 `serverCron()` 中更新）
  - 3. 实时计算：调用 `getLRUClock()` 获取当前 LRU 时钟

```c
// evict.c 第 78-86 行
unsigned int LRU_CLOCK(void) {
    unsigned int lruclock;
    
    // 1. 判断是否可以使用缓存的时钟值
    //    - 如果 server.hz >= 10（默认 10），则 1000/server.hz <= 100
    //    - 即每次调用间隔 <= 100ms，小于 LRU_CLOCK_RESOLUTION（1000ms）
    //    - 此时可以使用缓存的时钟值，避免频繁系统调用
    if (1000/server.hz <= LRU_CLOCK_RESOLUTION) {
        // 2. 使用缓存的时钟值（server.lruclock）
        //    - server.lruclock 在 serverCron() 中定期更新
        atomicGet(server.lruclock, lruclock);
    } else {
        // 3. 否则实时计算 LRU 时钟值
        //    - 调用 getLRUClock() 获取当前时间对应的 LRU 时钟
        lruclock = getLRUClock();
    }
    return lruclock;
}
```

#### 键值对 LRU 时钟值的初始化与更新

- 每个 `redisObject` 都有一个 `lru` 字段（24 位），用于存储该对象的最后访问时间戳。

##### createObject 初始化 LRU 时钟

- `createObject()` 是创建 Redis 对象的通用函数，在创建对象时会初始化 LRU 时钟值。
- 它是这样实现的：
  - 1. 分配 `robj` 结构体内存
  - 2. 设置对象类型、编码、指针、引用计数等基本属性
  - 3. 根据内存淘汰策略初始化 `lru` 字段：
    - 如果使用 LFU 策略：`lru = (LFUGetTimeInMinutes()<<8) | LFU_INIT_VAL`
    - 如果使用 LRU 策略：`lru = LRU_CLOCK()`（获取当前全局 LRU 时钟值）

```c
// object.c 第 41-58 行
robj *createObject(int type, void *ptr) {
    // 1. 分配 robj 结构体内存
    robj *o = zmalloc(sizeof(*o));
    
    // 2. 设置对象基本属性
    o->type = type;
    o->encoding = OBJ_ENCODING_RAW;
    o->ptr = ptr;
    o->refcount = 1;

    /* Set the LRU to the current lruclock (minutes resolution), or
     * alternatively the LFU counter. */
    // 3. 根据内存淘汰策略初始化 LRU 时钟值
    if (server.maxmemory_policy & MAXMEMORY_FLAG_LFU) {
        // 3.1 LFU 策略：使用 LFU 计数器初始化
        //     - 高 16 位：当前时间（分钟）
        //     - 低 8 位：初始计数器值（LFU_INIT_VAL = 5）
        o->lru = (LFUGetTimeInMinutes()<<8) | LFU_INIT_VAL;
    } else {
        // 3.2 LRU 策略：使用当前全局 LRU 时钟值初始化
        //     - 获取当前全局 LRU 时钟值作为对象的初始访问时间戳
        o->lru = LRU_CLOCK();
    }
    return o;
}
```

- 类似的，`createEmbeddedStringObject()` 在创建嵌入式字符串对象时也会初始化 LRU 时钟值。

##### lookupKey 更新 LRU 时钟

- `lookupKey()` 是查找键值对的底层函数，在访问键时会更新其 LRU 时钟值。
- 它是这样实现的：
  - 1. 在字典中查找键对应的 `dictEntry`
  - 2. 如果找到键值对，检查是否需要更新 LRU 时钟：
    - 如果正在执行 RDB 保存或 AOF 重写（`server.rdb_child_pid != -1 || server.aof_child_pid != -1`），不更新 LRU 时钟
      - 原因：避免触发写时复制（Copy-On-Write），导致内存使用翻倍
    - 如果设置了 `LOOKUP_NOTOUCH` 标志，不更新 LRU 时钟
      - 原因：某些操作（如 `OBJECT IDLETIME`）需要查看原始访问时间
  - 3. 根据内存淘汰策略更新 `lru` 字段：
    - 如果使用 LFU 策略：调用 `updateLFU(val)` 更新 LFU 计数器
    - 如果使用 LRU 策略：`val->lru = LRU_CLOCK()`（更新为当前全局 LRU 时钟值）

```c
// db.c 第 55-77 行
robj *lookupKey(redisDb *db, robj *key, int flags) {
    // 1. 在字典中查找键
    dictEntry *de = dictFind(db->dict,key->ptr);
    if (de) {
        robj *val = dictGetVal(de);

        /* Update the access time for the ageing algorithm.
         * Don't do it if we have a saving child, as this will trigger
         * a copy on write madness. */
        // 2. 检查是否需要更新 LRU 时钟
        //    - 如果正在执行 RDB 保存或 AOF 重写，不更新（避免触发写时复制）
        //    - 如果设置了 LOOKUP_NOTOUCH 标志，不更新（某些操作需要查看原始访问时间）
        if (server.rdb_child_pid == -1 &&
            server.aof_child_pid == -1 &&
            !(flags & LOOKUP_NOTOUCH))
        {
            // 3. 根据内存淘汰策略更新 LRU 时钟值
            if (server.maxmemory_policy & MAXMEMORY_FLAG_LFU) {
                // 3.1 LFU 策略：更新 LFU 计数器（时间衰减 + 对数递增）
                updateLFU(val);
            } else {
                // 3.2 LRU 策略：更新为当前全局 LRU 时钟值
                //     - 每次访问键时，将其 lru 字段更新为当前时间戳
                val->lru = LRU_CLOCK();
            }
        }
        return val;
    } else {
        return NULL;
    }
}
```

#### 近似 LRU 算法的实际执行

- 当 Redis 处理命令时，会调用 `freeMemoryIfNeeded()` 检查内存使用情况，如果超过 `maxmemory` 限制，则执行内存淘汰。
- 为了淘汰数据，Redis 定义了一个数组 EvictionPoolLRU，用来保存待淘汰的候选键值对。这个数组的元素类型是 evictionPoolEntry 结构体，该结构体保存了待淘汰键值对的空闲时间 idle、对应的 key 等信息。

```c
static struct evictionPoolEntry *EvictionPoolLRU;
struct evictionPoolEntry {
    unsigned long long idle;    //待淘汰的键值对的空闲时间
    sds key;                    //待淘汰的键值对的key
    sds cached;                 //缓存的SDS对象
    int dbid;                   //待淘汰键值对的key所在的数据库ID
};
```

##### freeMemoryIfNeeded 触发内存淘汰

- `freeMemoryIfNeeded()` 是内存淘汰的入口函数，在每次处理命令前被调用。
- 它是这样实现的：
  - 1. 检查内存状态：调用 `getMaxmemoryState()` 判断是否超过 `maxmemory` 限制
  - 2. 如果超过限制，根据淘汰策略选择键进行淘汰：
    - **LRU/LFU/TTL 策略**：使用淘汰池机制
      - 调用 `evictionPoolPopulate()` 从所有数据库中采样键并填充淘汰池
      - 从淘汰池右侧选择最佳键（`idle` 值最大，即最久未访问的键）
      - 处理幽灵键（在填充淘汰池后可能已被删除的键）
    - **Random 策略**：随机选择键
      - 轮询所有数据库，从字典中随机获取一个键
  - 3. 删除选中的键：调用 `dbSyncDelete()` 或 `dbAsyncDelete()` 删除键
  - 4. 循环释放内存：如果释放的内存不足，继续循环直到释放足够内存或无法继续释放

```c
// evict.c 第 446-623 行
int freeMemoryIfNeeded(void) {
    // 1. 检查从节点是否忽略 maxmemory
    //    - 如果当前实例是从节点，并且配置了 repl-slave-ignore-maxmemory 为 yes，则从节点不执行内存淘汰。
    //    - 从节点通常只复制主节点的数据，不应自行淘汰键。
    if (server.masterhost && server.repl_slave_ignore_maxmemory) return C_OK;

    size_t mem_reported, mem_tofree, mem_freed; // 报告内存、需要释放内存、已释放内存
    mstime_t latency, eviction_latency;         // 延迟监控变量
    long long delta;                            // 内存变化量
    int slaves = listLength(server.slaves);     // 连接的从节点数量

    // 2. 检查客户端是否被暂停
    //    - 如果客户端被暂停 (例如在 RDB/AOF 持久化期间)，不执行内存淘汰，直接返回 C_OK。
    if (clientsArePaused()) return C_OK;
    
    // 3. 获取当前内存状态
    //    - 调用 getMaxmemoryState 检查是否超过 maxmemory 限制。
    //    - 如果未超过限制 (返回 C_OK)，则无需释放内存，直接返回 C_OK。
    //    - 如果超过限制 (返回 C_ERR)，则 mem_reported 会被赋值为总内存，mem_tofree 会被赋值为需要释放的内存量。
    if (getMaxmemoryState(&mem_reported,NULL,&mem_tofree,NULL) == C_OK)
        return C_OK;

    mem_freed = 0; // 初始化已释放内存为 0

    // 4. 检查淘汰策略
    //    - 如果 maxmemory-policy 设置为 MAXMEMORY_NO_EVICTION，表示不允许淘汰键。
    //    - 此时直接跳转到 cant_free 标签，返回 C_ERR，表示无法释放内存。
    if (server.maxmemory_policy == MAXMEMORY_NO_EVICTION)
        goto cant_free; /* We need to free memory, but policy forbids. */

    latencyStartMonitor(latency); // 开始监控内存淘汰操作的延迟

    // 5. 内存淘汰循环：持续释放内存直到达到目标 (mem_freed >= mem_tofree)
    while (mem_freed < mem_tofree) {
        int j, k, i, keys_freed = 0; // j, k, i: 循环变量; keys_freed: 本次循环释放的键数量
        static unsigned int next_db = 0; // 静态变量，用于在不同数据库间轮询
        sds bestkey = NULL; // 最佳淘汰键的键名
        int bestdbid;       // 最佳淘汰键所在的数据库 ID
        redisDb *db;        // 数据库指针
        dict *dict;         // 字典指针 (主字典或过期字典)
        dictEntry *de;      // 字典项指针

        // 5.1 LRU/LFU/TTL 策略：使用淘汰池 (Eviction Pool) 机制
        if (server.maxmemory_policy & (MAXMEMORY_FLAG_LRU|MAXMEMORY_FLAG_LFU) ||
            server.maxmemory_policy == MAXMEMORY_VOLATILE_TTL)
        {
            struct evictionPoolEntry *pool = EvictionPoolLRU; // 获取全局淘汰池

            // 循环直到找到一个最佳淘汰键
            while(bestkey == NULL) {
                unsigned long total_keys = 0, keys; // total_keys: 所有数据库中可淘汰键的总数

                // 5.1.1 填充淘汰池：从所有数据库中采样键，填充淘汰池
                //       - 遍历所有数据库，根据淘汰策略选择 db->dict 或 db->expires 作为采样字典
                //       - evictionPoolPopulate 会将采样到的最佳候选键添加到淘汰池中
                for (i = 0; i < server.dbnum; i++) {
                    db = server.db+i;
                    dict = (server.maxmemory_policy & MAXMEMORY_FLAG_ALLKEYS) ?
                            db->dict : db->expires; // 根据策略选择主字典或过期字典
                    if ((keys = dictSize(dict)) != 0) { // 如果字典不为空
                        evictionPoolPopulate(i, dict, db->dict, pool); // 填充淘汰池
                        total_keys += keys; // 累加可淘汰键总数
                    }
                }
                if (!total_keys) break; /* No keys to evict. */ // 如果所有数据库都没有可淘汰的键，跳出循环

                // 5.1.2 从淘汰池中选择最佳淘汰键
                //       - 淘汰池按 idle 值升序排列，所以从右向左遍历 (从 idle 值最大的开始)
                for (k = EVPOOL_SIZE-1; k >= 0; k--) {
                    if (pool[k].key == NULL) continue; // 跳过空条目
                    bestdbid = pool[k].dbid; // 获取最佳键所在的数据库 ID

                    // 再次查找键，确保键仍然存在于数据库中 (因为在填充淘汰池后，键可能已被删除)
                    if (server.maxmemory_policy & MAXMEMORY_FLAG_ALLKEYS) {
                        de = dictFind(server.db[pool[k].dbid].dict,
                            pool[k].key);
                    } else {
                        de = dictFind(server.db[pool[k].dbid].expires,
                            pool[k].key);
                    }

                    // 5.1.3 从淘汰池中移除当前条目
                    if (pool[k].key != pool[k].cached)
                        sdsfree(pool[k].key); // 如果键名是独立分配的 SDS，则释放它
                    pool[k].key = NULL; // 将条目标记为空
                    pool[k].idle = 0;   // 重置 idle 值

                    // 5.1.4 如果键仍然存在于数据库中，则选中它作为最佳淘汰键，并跳出循环
                    if (de) {
                        bestkey = dictGetKey(de);
                        break;
                    } else {
                        /* Ghost... Iterate again. */ // 键已不存在 (幽灵键)，继续尝试下一个
                    }
                }
            }
        }

        // 5.2 Random 策略：随机选择键进行淘汰
        else if (server.maxmemory_policy == MAXMEMORY_ALLKEYS_RANDOM ||
                 server.maxmemory_policy == MAXMEMORY_VOLATILE_RANDOM)
        {
            // 5.2.1 遍历所有数据库，随机选择一个键
            //       - 使用静态变量 next_db 轮询数据库，确保公平性
            for (i = 0; i < server.dbnum; i++) {
                j = (++next_db) % server.dbnum; // 轮询下一个数据库
                db = server.db+j;
                dict = (server.maxmemory_policy == MAXMEMORY_ALLKEYS_RANDOM) ?
                        db->dict : db->expires; // 根据策略选择主字典或过期字典
                if (dictSize(dict) != 0) { // 如果字典不为空
                    de = dictGetRandomKey(dict); // 从字典中随机获取一个键
                    bestkey = dictGetKey(de);    // 获取键名
                    bestdbid = j;                // 获取数据库 ID
                    break; // 找到键，跳出循环
                }
            }
        }

        // 5.3 删除选定的键
        if (bestkey) {
            db = server.db+bestdbid; // 获取键所在的数据库
            // 创建一个临时的 robj 键对象，用于删除操作和事件传播
            robj *keyobj = createStringObject(bestkey,sdslen(bestkey));
            
            // 5.3.1 传播删除操作到 AOF 和从节点
            //       - 根据 server.lazyfree_lazy_eviction 配置决定传播 DEL 还是 UNLINK
            propagateExpire(db,keyobj,server.lazyfree_lazy_eviction);
            
            // 5.3.2 计算本次删除操作释放的内存量
            delta = (long long) zmalloc_used_memory(); // 记录删除前的内存使用量
            latencyStartMonitor(eviction_latency); // 开始监控删除操作延迟
            
            // 5.3.3 执行删除操作：根据配置选择同步或异步删除
            if (server.lazyfree_lazy_eviction)
                dbAsyncDelete(db,keyobj); // 异步删除
            else
                dbSyncDelete(db,keyobj); // 同步删除
            
            latencyEndMonitor(eviction_latency); // 结束监控删除操作延迟
            latencyAddSampleIfNeeded("eviction-del",eviction_latency); // 记录延迟样本
            latencyRemoveNestedEvent(latency,eviction_latency); // 移除嵌套事件
            
            delta -= (long long) zmalloc_used_memory(); // 计算删除后内存减少量
            mem_freed += delta; // 累加已释放内存总量
            server.stat_evictedkeys++; // 更新淘汰键统计
            
            // 5.3.4 发送键空间通知
            notifyKeyspaceEvent(NOTIFY_EVICTED, "evicted",
                keyobj, db->id);
            decrRefCount(keyobj); // 释放临时键对象的引用计数
            keys_freed++; // 增加本次循环释放的键数量

            // 5.3.5 如果有从节点连接，强制刷新从节点输出缓冲区
            //       - 避免从节点输出缓冲区过大，导致内存问题或复制延迟
            if (slaves) flushSlavesOutputBuffers();

            // 5.3.6 如果启用了惰性淘汰，并且每 16 个键被释放，检查是否已达到内存目标
            //       - 异步删除的内存释放是后台进行的，mem_freed 只能反映主线程同步释放的部分。
            //       - 周期性检查实际内存使用量，如果已低于 maxmemory，则可以提前结束淘汰循环。
            if (server.lazyfree_lazy_eviction && !(keys_freed % 16)) {
                if (getMaxmemoryState(NULL,NULL,NULL,NULL) == C_OK) {
                    /* Let's satisfy our stop condition. */
                    mem_freed = mem_tofree; // 强制设置已释放内存达到目标，结束循环
                }
            }
        }

        // 5.4 如果本次循环没有释放任何键，则无法继续释放内存
        if (!keys_freed) {
            latencyEndMonitor(latency); // 结束监控
            latencyAddSampleIfNeeded("eviction-cycle",latency); // 记录延迟
            goto cant_free; /* nothing to free... */ // 跳转到 cant_free 标签
        }
    }
    latencyEndMonitor(latency); // 结束监控
    latencyAddSampleIfNeeded("eviction-cycle",latency); // 记录延迟
    return C_OK; // 成功释放足够内存，返回 C_OK

cant_free:
    // 6. 无法释放足够内存时的处理
    //    - 如果无法通过淘汰键释放足够内存，检查后台惰性删除线程是否有待处理任务。
    //    - 如果有，则等待一段时间，让后台线程有机会释放内存。
    while(bioPendingJobsOfType(BIO_LAZY_FREE)) {
        // 检查是否已通过后台线程释放了足够内存
        if (((mem_reported - zmalloc_used_memory()) + mem_freed) >= mem_tofree)
            break; // 如果达到目标，跳出等待
        usleep(1000); // 等待 1 毫秒
    }
    return C_ERR; // 最终仍无法释放足够内存，返回 C_ERR
}
```

##### evictionPoolPopulate 填充淘汰池

- `evictionPoolPopulate()` 从字典中随机采样键，计算它们的 `idle` 值（空闲时间），并填充到淘汰池中。
- 它是这样实现的：
  - 1. 从字典中随机采样键（默认 5 个，由 `server.maxmemory_samples` 配置）
  - 2. 遍历采样的键，对每个键：
    - 获取值对象（`robj`）
    - 根据淘汰策略计算 `idle` 值：
      - **LRU 策略**：`idle = estimateObjectIdleTime(o)`（空闲时间，毫秒）
      - **LFU 策略**：`idle = 255 - LFUDecrAndReturn(o)`（逆频率，频率越低 `idle` 越大）
      - **TTL 策略**：`idle = ULLONG_MAX - 过期时间`（逆 TTL，TTL 越小 `idle` 越大）
    - 在淘汰池中查找插入位置（按 `idle` 值升序排列）
    - 如果可以插入（淘汰池未满或当前键的 `idle` 值大于淘汰池中最小的 `idle` 值），则插入
  - 3. 淘汰池维护了 16 个候选键，按 `idle` 值升序排列（左侧空闲时间短，右侧空闲时间长）

```c
// evict.c 第 162-257 行
void evictionPoolPopulate(int dbid, dict *sampledict, dict *keydict, struct evictionPoolEntry *pool) {
    int j, k, count;
    dictEntry *samples[server.maxmemory_samples];  // 采样数组，存储从字典中随机获取的 dictEntry 指针
    
    // 1. 从指定的字典 (sampledict) 中随机采样键
    //    - server.maxmemory_samples：配置的采样数量（默认 5 个）
    //    - dictGetSomeKeys：从字典中随机获取指定数量的键，并将其 dictEntry 存储到 samples 数组中
    count = dictGetSomeKeys(sampledict, samples, server.maxmemory_samples);
    
    // 2. 遍历采样的键，对每个键进行处理
    for (j = 0; j < count; j++) {
        unsigned long long idle;  // 评估值：空闲时间 (LRU) 或逆频率 (LFU) 或逆 TTL (TTL)
        sds key;                   // 键名 (SDS 字符串)
        robj *o;                   // 值对象 (redisObject)
        dictEntry *de;             // 字典项
        
        de = samples[j]; // 获取当前采样的字典项
        key = dictGetKey(de);  // 获取字典项的键名 (SDS)
        
        // 3. 获取值对象
        //    - 如果采样字典 (sampledict) 不是主字典 (keydict)，例如当策略是 volatile-* 且 sampledict 是 db->expires 时，
        //      需要从主字典 (db->dict) 中再次查找键以获取其值对象 (robj)。
        //    - 这是因为 db->expires 字典的值是过期时间，而不是 robj。
        if (server.maxmemory_policy != MAXMEMORY_VOLATILE_TTL) {
            if (sampledict != keydict) 
                de = dictFind(keydict, key);  // 从主字典查找对应的 dictEntry
            o = dictGetVal(de);  // 获取值对象
        }
        
        // 4. 根据当前配置的淘汰策略计算键的"idle"值 (评估分数)
        //    - idle 值越大，表示该键越适合被淘汰
        if (server.maxmemory_policy & MAXMEMORY_FLAG_LRU) {
            // 4.1 LRU 策略：计算对象的空闲时间 (毫秒)
            //     - estimateObjectIdleTime 会根据对象的 lru 字段和当前 LRU 时钟计算
            idle = estimateObjectIdleTime(o);
        } else if (server.maxmemory_policy & MAXMEMORY_FLAG_LFU) {
            // 4.2 LFU 策略：计算对象的逆频率
            //     - LFUDecrAndReturn 会根据对象的 lru 字段 (包含 LDT 和 LOG_C) 计算当前频率
            //     - 使用 255 - 频率，使得频率低的键 (即访问次数少) 具有更大的 idle 值，优先被淘汰
            idle = 255 - LFUDecrAndReturn(o);
        } else if (server.maxmemory_policy == MAXMEMORY_VOLATILE_TTL) {
            // 4.3 TTL 策略：计算对象的逆 TTL (Time To Live)
            //     - dictGetVal(de) 在 volatile-ttl 策略下返回的是键的过期时间戳
            //     - 使用 ULLONG_MAX - 过期时间戳，使得 TTL 越小 (越早过期) 的键具有更大的 idle 值，优先被淘汰
            idle = ULLONG_MAX - (long)dictGetVal(de);
        } else {
            // 未知淘汰策略：触发程序崩溃，表示配置错误
            serverPanic("Unknown eviction policy in evictionPoolPopulate()");
        }
        
        // 5. 在淘汰池 (pool) 中查找当前键的插入位置
        //    - 淘汰池是一个固定大小 (EVPOOL_SIZE=16) 的数组，按 idle 值升序排列。
        //    - 目标是找到第一个空闲条目，或者第一个 idle 值大于等于当前键 idle 值的条目。
        k = 0;
        while (k < EVPOOL_SIZE && // 确保索引不越界
               pool[k].key &&     // 确保当前条目不是空的
               pool[k].idle < idle) k++; // 查找比当前键 idle 值小的条目
        
        // 6. 判断是否可以插入当前键到淘汰池
        if (k == 0 && pool[EVPOOL_SIZE-1].key != NULL) {
            // 6.1 如果当前键的 idle 值比淘汰池中所有键的 idle 值都小，
            //     并且淘汰池已满 (最后一个条目不为空)，则当前键不适合进入淘汰池，跳过。
            continue;
        } else if (k < EVPOOL_SIZE && pool[k].key == NULL) {
            // 6.2 如果找到一个空闲位置 (pool[k].key == NULL)，直接在此位置插入。
            //     - 无需移动其他元素。
        } else {
            // 6.3 如果需要在中间位置插入，需要移动现有元素
            if (pool[EVPOOL_SIZE-1].key == NULL) {
                // 6.3.1 如果淘汰池右侧有空闲位置 (最后一个条目为空)，则将从 k 位置开始的元素向右移动一位
                //       为当前键腾出位置，同时保留最右侧的 cached SDS。
                sds cached = pool[EVPOOL_SIZE-1].cached; // 保存最右侧条目的 cached SDS
                memmove(pool+k+1, pool+k, sizeof(pool[0])*(EVPOOL_SIZE-k-1)); // 移动元素
                pool[k].cached = cached; // 将保存的 cached SDS 赋值给新腾出的位置
            } else {
                // 6.3.2 如果淘汰池已满且右侧没有空闲位置，则需要丢弃淘汰池中 idle 值最小的元素 (最左侧的元素)
                //       然后将从 1 位置开始的元素向左移动一位，为当前键腾出位置。
                k--; // 插入到 k-1 位置 (即当前找到的第一个比它大的元素的前一个位置)
                sds cached = pool[0].cached; // 保存最左侧条目的 cached SDS
                if (pool[0].key != pool[0].cached) 
                    sdsfree(pool[0].key);  // 如果最左侧键名是独立分配的 SDS，则释放它
                memmove(pool, pool+1, sizeof(pool[0])*k); // 向左移动元素
                pool[k].cached = cached; // 将保存的 cached SDS 赋值给新腾出的位置
            }
        }
        
        // 7. 设置键名 (key) 到淘汰池条目中
        //    - 尝试复用预分配的 cached SDS，如果键名太长则分配新的 SDS。
        int klen = sdslen(key); // 获取键名长度
        if (klen > EVPOOL_CACHED_SDS_SIZE) {
            // 7.1 如果键名太长，超过缓存大小，则复制键名并分配新的 SDS
            pool[k].key = sdsdup(key);
        } else {
            // 7.2 如果键名较短，可以复用 cached SDS
            memcpy(pool[k].cached, key, klen+1); // 复制键名到 cached SDS
            sdssetlen(pool[k].cached, klen);     // 设置 cached SDS 的长度
            pool[k].key = pool[k].cached;        // 将 key 指针指向 cached SDS
        }
        
        // 8. 设置 idle 值和数据库 ID
        pool[k].idle = idle;
        pool[k].dbid = dbid;
    }
}
```

##### estimateObjectIdleTime 计算空闲时间

- `estimateObjectIdleTime()` 用于估算对象的空闲时间（未访问时间），用于 LRU 淘汰。
- 它是这样实现的：
  - 1. 获取当前 LRU 时钟值（`LRU_CLOCK()`）
  - 2. 如果当前时钟 >= 对象时钟（正常情况）：
    - 空闲时间 = (当前时钟 - 对象时钟) * 分辨率（毫秒）
    - 例如：当前=1000, 对象=500, 空闲时间 = (1000-500)*1000 = 500000 毫秒
  - 3. 如果当前时钟 < 对象时钟（时钟回绕）：
    - 空闲时间 = (当前时钟 + 最大时钟值 - 对象时钟) * 分辨率
    - 假设只回绕了一次（回绕周期约 194 天，这个假设是合理的）

- 返回值：
  - 返回对象的空闲时间（毫秒）
  - 值越大，说明对象越久未被访问，越适合被淘汰

```c
// evict.c 第 90-98 行
unsigned long long estimateObjectIdleTime(robj *o) {
    // 1. 获取当前 LRU 时钟值
    //    - LRU_CLOCK() 返回当前的 LRU 时钟（24 位，秒级精度）
    unsigned long long lruclock = LRU_CLOCK();
    
    // 2. 计算空闲时间（对象最后访问时间到现在的时间差）
    if (lruclock >= o->lru) {
        // 2.1 正常情况：当前时钟 >= 对象时钟
        //     - 说明没有发生时钟回绕
        //     - 空闲时间 = (当前时钟 - 对象时钟) * 分辨率
        //     - LRU_CLOCK_RESOLUTION = 1000 毫秒，所以结果是毫秒
        return (lruclock - o->lru) * LRU_CLOCK_RESOLUTION;
    } else {
        // 2.2 时钟回绕情况：当前时钟 < 对象时钟
        //     - 说明发生了时钟回绕（LRU 时钟是 24 位，约 194 天后回绕）
        //     - 假设只回绕了一次（这是合理的，因为回绕周期很长）
        //     - 空闲时间 = (当前时钟 + 最大时钟值 - 对象时钟) * 分辨率
        //     - 例如：当前=100, 对象=200, 最大=255
        //       空闲时间 = (100 + 255 - 200) * 1000 = 155000 毫秒
        return (lruclock + (LRU_CLOCK_MAX - o->lru)) *
                    LRU_CLOCK_RESOLUTION;
    }
}
```

### LFU 实现

- LFU 算法是根据数据访问的频率来选择被淘汰数据的，所以 LFU 算法会记录每个数据的访问次数。当一个数据被再次访问时，就会增加该数据的访问次数。不过，访问次数和访问频率还不能完全等同。
- 访问频率是指在一定时间内的访问次数，也就是说，在计算访问频率时，我们不仅需要记录访问次数，还要记录这些访问是在多长时间内执行的。
- 要实现 LFU 算法时，我们需要能统计到数据的访问频率，而不是简单地记录数据访问次数
- LFU 算法的实现可以分成三部分内容，分别是键值对访问频率记录、键值对访问频率初始化和更新，以及 LFU 算法淘汰数据。

- Redis 使用 LFU（Least Frequently Used）算法，通过访问频率计数器来选择淘汰对象。LFU 复用 `redisObject->lru` 字段，将其分为两部分：
  - **高 16 位**：最后递减时间（Last Decrement Time, LDT），以分钟为单位
  - **低 8 位**：对数计数器（Logarithmic Counter, LOG_C），表示访问频率
  - Redis server 每次运行时，只能将 maxmemory-policy 配置项设置为使用一种淘汰策略，所以，LRU 算法和 LFU 算法并不会同时使用。而为了节省内存开销，Redis 源码就复用了 lru 变量来记录 LFU 算法所需的访问频率信息。

- LFU 算法的实现可以分成三部分内容：
  1. **键值对访问频率记录**：在 `redisObject->lru` 字段中同时记录访问次数（LOG_C）和访问时间戳（LDT）
  2. **键值对访问频率初始化和更新**：在创建对象时初始化 LFU 信息，在访问键时先执行时间衰减，再执行对数递增
  3. **LFU 算法淘汰数据**：使用与近似 LRU 算法相同的淘汰池机制，但按照访问频率大小来排序和选择淘汰数据
  
#### 键值对访问频率记录

##### LFU 字段布局

```c
// redisObject->lru 字段（24 位）的布局：
// +----------------+--------+
// |  16 bits (LDT) | 8 bits |
// |  Last decr time| LOG_C  |
// +----------------+--------+
```

- LDT（Last Decrement Time）：
  - 存储最后递减时间，以分钟为单位（16 位，约 45 天）
  - 用于判断是否需要递减计数器
  - 当键被访问时，LDT 会被更新为当前时间（分钟）
- LOG_C（Logarithmic Counter）：
  - 对数计数器，表示访问频率（8 位，0-255）
  - 值越大，访问频率越高
  - 使用对数增长，避免频繁访问的键计数器增长过快
  - **访问次数限制问题**：
    - 键值对的访问次数只能用 `lru` 变量中有限的 8 bits 来记录，最大值就是 255
    - 如果每访问一次键值对，访问次数就加 1，那么访问次数很容易就达到最大值
    - 这样就无法区分不同的访问频率了（例如，访问 100 次和访问 1000 次的键，计数器都是 255）
  - **概率递增解决方案**：
    - 为了区分不同的访问频率，LFU 算法在实现时采用了按概率增加访问次数的方法
    - 已有访问次数越大的键值对，它的访问次数就越难再增加
    - 这样可以让计数器值更好地反映访问频率的差异

#### 键值对访问频率初始化和更新

- LFU 算法在实现时，在键值对的 `redisObject` 结构体中的 `lru` 变量里，会同时记录访问次数和访问时间戳。当键值对被再次访问时，`lru` 变量中的访问次数，会先根据上一次访问距离当前的时长，执行衰减操作，然后才会执行增加操作。

##### createObject 初始化 LFU 信息

- `createObject()` 在创建对象时，会根据内存淘汰策略初始化 `lru` 字段。
- 如果使用 LFU 策略，`lru` 字段会被初始化为：
  - **高 16 位**：当前时间（分钟），通过 `LFUGetTimeInMinutes()` 获取
  - **低 8 位**：初始计数器值 `LFU_INIT_VAL`（默认 5）
- 初始计数器值不为 0 的原因：
  - 新键需要收集一些访问后才能被淘汰，避免新键立即被淘汰
  - 初始值 5 使得新键有很高的递增概率（接近 100%），能够快速积累访问次数

```c
// object.c 第 41-58 行
robj *createObject(int type, void *ptr) {
    // 1. 分配 robj 结构体内存
    robj *o = zmalloc(sizeof(*o));
    
    // 2. 设置对象基本属性
    o->type = type;
    o->encoding = OBJ_ENCODING_RAW;
    o->ptr = ptr;
    o->refcount = 1;

    /* Set the LRU to the current lruclock (minutes resolution), or
     * alternatively the LFU counter. */
    // 3. 根据内存淘汰策略初始化 lru 字段
    if (server.maxmemory_policy & MAXMEMORY_FLAG_LFU) {
        // 3.1 LFU 策略：初始化 LFU 信息
        //     - 高 16 位：当前时间（分钟），通过 LFUGetTimeInMinutes() 获取
        //     - 低 8 位：初始计数器值 LFU_INIT_VAL（默认 5）
        //     - 初始值 5 使得新键有很高的递增概率，能够快速积累访问次数
        o->lru = (LFUGetTimeInMinutes()<<8) | LFU_INIT_VAL;
    } else {
        // 3.2 LRU 策略：使用当前全局 LRU 时钟值初始化
        o->lru = LRU_CLOCK();
    }
    return o;
}
```

- 类似的，`createEmbeddedStringObject()` 在创建嵌入式字符串对象时也会初始化 LFU 信息。

##### updateLFU 更新 LFU 信息

- `updateLFU()` 在访问键时更新 LFU 信息，实现了"先衰减后递增"的逻辑。
- 它是这样实现的：
  - 1. **时间衰减**：调用 `LFUDecrAndReturn()` 递减计数器
    - 根据自上次访问以来经过的时间，按周期递减计数器
    - 如果经过的时间 >= `lfu_decay_time`（默认 1 分钟），递减计数器
    - 这样可以让过去频繁访问但现在不访问的键的计数器逐渐降低
  - 2. **对数递增**：调用 `LFULogIncr()` 递增计数器
    - 使用概率递增，已有访问次数越大的键，递增概率越低
    - 避免频繁访问的键计数器增长过快，无法区分不同访问频率
  - 3. **更新字段**：将当前时间（LDT）和递增后的计数器值（LOG_C）组合后更新到 `lru` 字段

```c
// db.c 第 43-50 行
/* Update LFU when an object is accessed.
 * Firstly, decrement the counter if the decrement time is reached.
 * Then logarithmically increment the counter, and update the access time. */
void updateLFU(robj *val) {
    // 1. 先递减计数器（根据时间衰减）
    //    - LFUDecrAndReturn 会根据自上次访问以来经过的时间，按周期递减计数器
    //    - 如果经过的时间 >= lfu_decay_time（默认 1 分钟），递减计数器
    //    - 这样可以让过去频繁访问但现在不访问的键的计数器逐渐降低
    unsigned long counter = LFUDecrAndReturn(val);
    
    // 2. 对数递增计数器（根据概率递增）
    //    - LFULogIncr 使用概率递增，已有访问次数越大的键，递增概率越低
    //    - 避免频繁访问的键计数器增长过快，无法区分不同访问频率
    counter = LFULogIncr(counter);
    
    // 3. 更新 lru 字段
    //    - 高 16 位：当前时间（分钟），通过 LFUGetTimeInMinutes() 获取
    //    - 低 8 位：递增后的计数器值（0-255）
    //    - 这样同时记录了访问时间戳和访问频率
    val->lru = (LFUGetTimeInMinutes()<<8) | counter;
}
```

##### lookupKey 调用 updateLFU

- `lookupKey()` 在访问键时，会根据内存淘汰策略更新 LFU 或 LRU 信息。
- 它是这样实现的：
  - 1. 在字典中查找键对应的 `dictEntry`
  - 2. 如果找到键值对，检查是否需要更新 LFU 信息：
    - 如果正在执行 RDB 保存或 AOF 重写，不更新（避免触发写时复制）
    - 如果设置了 `LOOKUP_NOTOUCH` 标志，不更新（某些操作需要查看原始访问频率）
  - 3. 根据内存淘汰策略更新：
    - 如果使用 LFU 策略：调用 `updateLFU(val)` 更新 LFU 信息（时间衰减 + 对数递增）
    - 如果使用 LRU 策略：`val->lru = LRU_CLOCK()`（更新为当前全局 LRU 时钟值）

```c
// db.c 第 55-77 行
robj *lookupKey(redisDb *db, robj *key, int flags) {
    // 1. 在字典中查找键
    dictEntry *de = dictFind(db->dict,key->ptr);
    if (de) {
        robj *val = dictGetVal(de);

        /* Update the access time for the ageing algorithm.
         * Don't do it if we have a saving child, as this will trigger
         * a copy on write madness. */
        // 2. 检查是否需要更新 LFU/LRU 信息
        //    - 如果正在执行 RDB 保存或 AOF 重写，不更新（避免触发写时复制）
        //    - 如果设置了 LOOKUP_NOTOUCH 标志，不更新（某些操作需要查看原始访问频率）
        if (server.rdb_child_pid == -1 &&
            server.aof_child_pid == -1 &&
            !(flags & LOOKUP_NOTOUCH))
        {
            // 3. 根据内存淘汰策略更新 LFU/LRU 信息
            if (server.maxmemory_policy & MAXMEMORY_FLAG_LFU) {
                // 3.1 LFU 策略：更新 LFU 信息（时间衰减 + 对数递增）
                //     - updateLFU 会先根据时间衰减递减计数器，再根据概率递增计数器
                updateLFU(val);
            } else {
                // 3.2 LRU 策略：更新为当前全局 LRU 时钟值
                val->lru = LRU_CLOCK();
            }
        }
        return val;
    } else {
        return NULL;
    }
}
```

##### LFUGetTimeInMinutes

- `LFUGetTimeInMinutes()` 获取当前时间（分钟），只保留低 16 位。

```c
// evict.c 第 299-301 行
unsigned long LFUGetTimeInMinutes(void) {
    // 1. 获取当前 Unix 时间（秒）
    // 2. 除以 60 转换为分钟
    // 3. 与 65535（2^16-1）做按位与，保留低 16 位
    //    - 这样可以处理时间回绕（约 45 天后回绕）
    return (server.unixtime/60) & 65535;
}
```

##### LFUTimeElapsed

- `LFUTimeElapsed()` 计算自上次递减时间以来经过的分钟数，处理时间回绕。
- 它是这样实现的：
  - 1. 获取当前时间（分钟）
  - 2. 如果当前时间 >= 上次递减时间：返回时间差
  - 3. 如果当前时间 < 上次递减时间（回绕）：返回回绕后的时间差

```c
// evict.c 第 307-311 行
unsigned long LFUTimeElapsed(unsigned long ldt) {
    // 1. 获取当前时间（分钟，16 位）
    unsigned long now = LFUGetTimeInMinutes();
    
    // 2. 计算时间差
    if (now >= ldt) {
        // 2.1 正常情况：当前时间 >= 上次递减时间
        return now - ldt;
    } else {
        // 2.2 时间回绕情况：当前时间 < 上次递减时间（发生了回绕）
        //     - 假设只回绕了一次
        return 65535 - ldt + now;
    }
}
```

##### LFULogIncr

- `LFULogIncr()` 对数递增计数器，值越大递增概率越低。使用概率递增，避免计数器增长过快。
- 它是这样实现的：
  - 1. 如果计数器已饱和（255），直接返回
  - 2. 生成随机数（0.0 到 1.0）
  - 3. 计算基础值（计数器值 - 初始值 5）
    - 如果计数器 < 5，基础值为 0
  - 4. 计算递增概率：`p = 1.0 / (baseval * lfu_log_factor + 1)`
    - 计数器值小时（baseval=0），概率 = 1.0（100% 递增）
    - 计数器值大时（baseval 大），概率接近 0（几乎不递增）
  - 5. 如果随机数 < 概率，递增计数器

- 对数递增的特点：
  - 计数器值小时，递增概率高（容易增长）
  - 计数器值大时，递增概率低（难以增长）
  - 避免频繁访问的键计数器增长过快
  - 使用概率递增，而不是每次访问都递增
  - 如果每次访问都递增，频繁访问的键计数器会快速增长到 255
  - 使用对数递增，让计数器增长越来越困难
  - 这样可以更好地区分不同访问频率的键

```c
// evict.c 第 315-323 行
uint8_t LFULogIncr(uint8_t counter) {
    // 1. 如果计数器已饱和（255），直接返回
    //    - 计数器最大值是 255，不能再递增
    if (counter == 255) return 255;
    
    // 2. 生成随机数（0.0 到 1.0）
    //    - 用于概率判断
    double r = (double)rand()/RAND_MAX;
    
    // 3. 计算基础值（减去初始值）
    //    - LFU_INIT_VAL = 5，新键的初始计数器值
    //    - baseval = counter - 5，表示计数器超出初始值的部分
    double baseval = counter - LFU_INIT_VAL;
    if (baseval < 0) baseval = 0;  // 如果 counter < 5，baseval = 0
    
    // 4. 计算递增概率
    //    - p = 1.0 / (baseval * server.lfu_log_factor + 1)
    //    - baseval 越大，p 越小，递增概率越低
    //    - server.lfu_log_factor 默认 10，控制递增难度
    //    - 例如：
    //      * counter=5, baseval=0, p=1.0/(0*10+1)=1.0 (100% 递增)
    //      * counter=10, baseval=5, p=1.0/(5*10+1)=1/51≈0.02 (2% 递增)
    //      * counter=20, baseval=15, p=1.0/(15*10+1)=1/151≈0.0066 (0.66% 递增)
    double p = 1.0/(baseval*server.lfu_log_factor+1);
    
    // 5. 根据概率决定是否递增
    //    - 如果随机数 < 概率，递增计数器
    //    - 这是对数递增的核心：值越大，递增概率越低
    if (r < p) counter++;
    return counter;
}
```

##### LFUDecrAndReturn

- `LFUDecrAndReturn()` 根据时间衰减递减计数器，并返回当前计数器值。用于扫描数据集时递减计数器。
- 它是这样实现的：
  - 1. 从 `o->lru` 中提取 LDT（高 16 位）和计数器（低 8 位）
  - 2. 计算经过的时间周期数：
    - `LFUTimeElapsed(ldt)`：计算自上次递减时间以来经过的分钟数
    - `num_periods = LFUTimeElapsed(ldt) / lfu_decay_time`
    - 例如：经过 5 分钟，衰减时间 1 分钟，周期数 = 5
  - 3. 如果周期数 > 0，递减计数器：
    - 如果周期数 > 计数器值：递减到 0（避免负数）
    - 否则：递减 `num_periods`
  - 4. 返回递减后的计数器值（不更新 `o->lru` 字段）

- 时间衰减的作用：
  - 让过去频繁访问但现在不访问的键的计数器逐渐降低
  - 使算法能够适应访问模式的变化
  - 避免"历史热点"长期占用内存

- 使用场景：
  - 在 `evictionPoolPopulate()` 中扫描键时调用
  - 在 `updateLFU()` 中访问键时调用
  - 用于评估键的当前访问频率

```c
// evict.c 第 335-342 行
unsigned long LFUDecrAndReturn(robj *o) {
    // 1. 从 lru 字段中提取 LDT 和计数器
    //    - o->lru 是 24 位字段，分为两部分：
    //      * 高 16 位（右移 8 位）：最后递减时间（LDT，分钟）
    unsigned long ldt = o->lru >> 8;
    //      * 低 8 位（与 255 按位与）：对数计数器（LOG_C，0-255）
    unsigned long counter = o->lru & 255;
    
    // 2. 计算经过的时间周期数
    //    - LFUTimeElapsed(ldt)：自上次递减时间以来经过的分钟数
    //    - server.lfu_decay_time：衰减时间（分钟），默认 1
    //    - 如果经过的时间 >= 衰减时间，需要递减计数器
    //    - 例如：经过 5 分钟，衰减时间 1 分钟，周期数 = 5/1 = 5
    unsigned long num_periods = server.lfu_decay_time ? 
                                LFUTimeElapsed(ldt) / server.lfu_decay_time : 0;
    
    // 3. 根据时间周期数递减计数器
    if (num_periods) {
        // 3.1 如果周期数 > 计数器值，递减到 0
        //     - 例如：计数器=3, 周期数=5, 递减到 0
        // 3.2 否则递减 num_periods
        //     - 例如：计数器=10, 周期数=3, 递减到 7
        counter = (num_periods > counter) ? 0 : counter - num_periods;
    }
    
    // 4. 返回递减后的计数器值
    //    - 注意：这里只返回计数器值，不更新 o->lru 字段
    //    - 更新操作在 updateLFU() 中进行
    return counter;
}
```

#### LFU 算法淘汰数据

- 对于 LFU 算法的执行流程来说，它和 LRU 算法的基本执行流程是相同的，这包括入口函数、待释放内存空间计算、更新待淘汰候选键值对集合，以及选择实际被淘汰数据这几个关键步骤。
- 在实现使用 LFU 算法淘汰数据时，Redis 是采用了和实现近似 LRU 算法相同的方法：
  - 使用全局数组 `EvictionPoolLRU` 来保存待淘汰候选键值对集合
  - 在 `processCommand` 函数处理每个命令时，调用 `freeMemoryIfNeededAndSafe` 函数和 `freeMemoryIfNeeded` 函数来执行具体的数据淘汰流程
  - 不同的是，LFU 算法在待淘汰键值对集合中，是按照键值对的访问频率大小来排序和选择淘汰数据的

##### evictionPoolPopulate 中的 LFU 计算

- 在 `evictionPoolPopulate()` 中，当使用 LFU 策略时，会计算键的逆频率作为 `idle` 值。
- 它是这样实现的：
  - 1. 调用 `LFUDecrAndReturn(o)` 获取当前访问频率（考虑时间衰减后的计数器值）
  - 2. 计算逆频率：`idle = 255 - 频率`
    - 频率越低（访问次数少），`idle` 值越大，优先被淘汰
    - 频率越高（访问次数多），`idle` 值越小，越不容易被淘汰
  - 3. 将键插入淘汰池（按 `idle` 值升序排列）
    - 淘汰池左侧：频率高（`idle` 值小），不容易被淘汰
    - 淘汰池右侧：频率低（`idle` 值大），优先被淘汰

```c
// evict.c 第 187-197 行（evictionPoolPopulate 函数中）
if (server.maxmemory_policy & MAXMEMORY_FLAG_LRU) {
    // LRU 策略：计算空闲时间
    idle = estimateObjectIdleTime(o);
} else if (server.maxmemory_policy & MAXMEMORY_FLAG_LFU) {

    // LFU 策略：计算逆频率
    // - LFUDecrAndReturn 会根据对象的 lru 字段计算当前频率（考虑时间衰减）
    // - 使用 255 - 频率，使得频率低的键具有更大的 idle 值，优先被淘汰
    idle = 255 - LFUDecrAndReturn(o);
} else if (server.maxmemory_policy == MAXMEMORY_VOLATILE_TTL) {
    // TTL 策略：计算逆 TTL
    idle = ULLONG_MAX - (long)dictGetVal(de);
}
```

##### LFU 与 LRU 淘汰流程的相同点

- LFU 算法和 LRU 算法使用相同的淘汰流程：
  1. **入口函数**：`freeMemoryIfNeededAndSafe()` → `freeMemoryIfNeeded()`
  2. **内存检查**：调用 `getMaxmemoryState()` 计算需要释放的内存大小
  3. **填充淘汰池**：调用 `evictionPoolPopulate()` 从所有数据库中采样键并填充淘汰池
  4. **选择淘汰键**：从淘汰池右侧选择最佳键（`idle` 值最大）
  5. **删除键**：调用 `dbSyncDelete()` 或 `dbAsyncDelete()` 删除键
  6. **循环释放**：如果释放的内存不足，继续循环直到释放足够内存

##### LFU 与 LRU 淘汰流程的不同点

- LFU 算法和 LRU 算法的唯一不同在于 `idle` 值的计算方式：
  - **LRU 策略**：`idle = estimateObjectIdleTime(o)`（空闲时间，毫秒）
    - 值越大，表示越久未访问，优先被淘汰
  - **LFU 策略**：`idle = 255 - LFUDecrAndReturn(o)`（逆频率）
    - 值越大，表示访问频率越低，优先被淘汰
- 淘汰池的排序方式相同（按 `idle` 值升序排列），但 `idle` 值的含义不同：
  - LRU：`idle` 表示空闲时间
  - LFU：`idle` 表示逆频率（频率越低，`idle` 越大）

### 淘汰池（Eviction Pool）

- Redis 使用淘汰池来维护候选淘汰键，避免每次淘汰都重新采样。

#### 淘汰池结构

- evictionPoolEntry淘汰池结构体：
  - 大小：16 个候选键（`EVPOOL_SIZE = 16`）
  - 排序：按 `idle` 值升序排列（左侧空闲时间短，右侧空闲时间长）
  - 缓存：为小键名（<= 255 字节）预分配 SDS，避免频繁分配

```c
// evict.c 第 52-59 行
#define EVPOOL_SIZE 16  // 淘汰池大小（16 个候选键）
#define EVPOOL_CACHED_SDS_SIZE 255  // 缓存的 SDS 大小

struct evictionPoolEntry {
    unsigned long long idle;    // 空闲时间（LRU）或逆频率（LFU）
    sds key;                    // 键名（SDS 字符串）
    sds cached;                 // 缓存的 SDS 对象（用于小键名）
    int dbid;                   // 键所在的数据库 ID
};
```

#### evictionPoolAlloc

- `evictionPoolAlloc()` 分配并初始化淘汰池。
- 它是这样实现的：
  - 1. 分配淘汰池内存（16 个条目）
  - 2. 初始化每个条目：
    - `idle = 0`（空闲时间）
    - `key = NULL`（空条目）
    - `cached`：预分配 255 字节的 SDS（用于小键名）
    - `dbid = 0`（数据库 ID）
  - 3. 保存全局指针

```c
// evict.c 第 139-151 行
void evictionPoolAlloc(void) {
    struct evictionPoolEntry *ep;
    int j;
    
    // 1. 分配淘汰池内存
    //    - 大小为 EVPOOL_SIZE 个 evictionPoolEntry 结构体
    ep = zmalloc(sizeof(*ep)*EVPOOL_SIZE);
    
    // 2. 初始化每个条目
    for (j = 0; j < EVPOOL_SIZE; j++) {
        ep[j].idle = 0;  // 空闲时间初始化为 0
        ep[j].key = NULL;  // 键名初始化为 NULL（表示空条目）
        
        // 2.1 预分配缓存的 SDS 对象
        //     - 用于存储小键名（<= 255 字节），避免频繁分配
        ep[j].cached = sdsnewlen(NULL, EVPOOL_CACHED_SDS_SIZE);
        ep[j].dbid = 0;  // 数据库 ID 初始化为 0
    }
    
    // 3. 保存全局淘汰池指针
    EvictionPoolLRU = ep;
}
```

#### evictionPoolPopulate

- `evictionPoolPopulate()` 从字典中采样键并填充淘汰池。
- 它是这样实现的：
  - 1. 从字典中随机采样键（默认 5 个）
  - 2. 遍历采样的键，对每个键：
    - 获取值对象
    - 根据淘汰策略计算 `idle` 值：
      - LRU：空闲时间（毫秒）
      - LFU：逆频率（255 - 频率）
      - TTL：逆 TTL（ULLONG_MAX - TTL）
    - 在淘汰池中查找插入位置（按 `idle` 升序）
    - 如果可以插入，设置键名和 `idle` 值
  - 3. 淘汰池维护了 16 个候选键，按 `idle` 值升序排列

```c
// evict.c 第 162-257 行
void evictionPoolPopulate(int dbid, dict *sampledict, dict *keydict, struct evictionPoolEntry *pool) {
    int j, k, count;
    dictEntry *samples[server.maxmemory_samples];  // 采样数组
    
    // 1. 从字典中随机采样键
    //    - server.maxmemory_samples：采样数量（默认 5）
    //    - dictGetSomeKeys：随机获取一些键
    count = dictGetSomeKeys(sampledict, samples, server.maxmemory_samples);
    
    // 2. 遍历采样的键
    for (j = 0; j < count; j++) {
        unsigned long long idle;  // 空闲时间或逆频率
        sds key;                   // 键名
        robj *o;                   // 值对象
        dictEntry *de;             // 字典项
        
        de = samples[j];
        key = dictGetKey(de);  // 获取键名
        
        // 3. 获取值对象
        //    - 如果采样字典不是主字典（是过期字典），需要从主字典查找
        if (server.maxmemory_policy != MAXMEMORY_VOLATILE_TTL) {
            if (sampledict != keydict) 
                de = dictFind(keydict, key);  // 从主字典查找
            o = dictGetVal(de);  // 获取值对象
        }
        
        // 4. 根据淘汰策略计算 idle 值
        if (server.maxmemory_policy & MAXMEMORY_FLAG_LRU) {
            // 4.1 LRU 策略：计算空闲时间（毫秒）
            idle = estimateObjectIdleTime(o);
        } else if (server.maxmemory_policy & MAXMEMORY_FLAG_LFU) {
            // 4.2 LFU 策略：计算逆频率
            //     - 频率越高，逆频率越小
            //     - 使用 255 - 频率，使得频率低的键 idle 值大
            idle = 255 - LFUDecrAndReturn(o);
        } else if (server.maxmemory_policy == MAXMEMORY_VOLATILE_TTL) {
            // 4.3 TTL 策略：计算逆 TTL
            //     - TTL 越小（越早过期），逆 TTL 越大
            //     - 使用 ULLONG_MAX - TTL，使得 TTL 小的键 idle 值大
            idle = ULLONG_MAX - (long)dictGetVal(de);
        } else {
            serverPanic("Unknown eviction policy in evictionPoolPopulate()");
        }
        
        // 5. 在淘汰池中查找插入位置
        //    - 淘汰池按 idle 值升序排列
        //    - 找到第一个空闲条目或 idle 值 >= 当前 idle 的条目
        k = 0;
        while (k < EVPOOL_SIZE &&
               pool[k].key &&
               pool[k].idle < idle) k++;
        
        // 6. 判断是否可以插入
        if (k == 0 && pool[EVPOOL_SIZE-1].key != NULL) {
            // 6.1 如果当前键的 idle 值 < 池中最小的 idle 值，且池已满，跳过
            continue;
        } else if (k < EVPOOL_SIZE && pool[k].key == NULL) {
            // 6.2 如果找到空位置，直接插入
        } else {
            // 6.3 如果需要在中间插入，移动元素
            if (pool[EVPOOL_SIZE-1].key == NULL) {
                // 6.3.1 如果右侧有空位置，向右移动元素
                sds cached = pool[EVPOOL_SIZE-1].cached;
                memmove(pool+k+1, pool+k, sizeof(pool[0])*(EVPOOL_SIZE-k-1));
                pool[k].cached = cached;
            } else {
                // 6.3.2 如果右侧无空位置，向左移动元素（丢弃最小的）
                k--;
                sds cached = pool[0].cached;
                if (pool[0].key != pool[0].cached) 
                    sdsfree(pool[0].key);  // 释放旧的键名
                memmove(pool, pool+1, sizeof(pool[0])*k);
                pool[k].cached = cached;
            }
        }
        
        // 7. 设置键名（复用缓存的 SDS 或分配新的）
        int klen = sdslen(key);
        if (klen > EVPOOL_CACHED_SDS_SIZE) {
            // 7.1 键名太长，分配新的 SDS
            pool[k].key = sdsdup(key);
        } else {
            // 7.2 键名较短，复用缓存的 SDS
            memcpy(pool[k].cached, key, klen+1);
            sdssetlen(pool[k].cached, klen);
            pool[k].key = pool[k].cached;
        }
        
        // 8. 设置 idle 值和数据库 ID
        pool[k].idle = idle;
        pool[k].dbid = dbid;
    }
}
```

### 内存状态检查

#### freeMemoryGetNotCountedMemory

- `freeMemoryGetNotCountedMemory()` 计算不应计入内存使用的部分（AOF 缓冲区和从节点输出缓冲区）。
- 它是这样实现的：
  - 1. 计算所有从节点的输出缓冲区大小
  - 2. 计算 AOF 缓冲区大小（如果启用）
  - 3. 返回总开销

- 为什么不计入这些内存：
  - 这些缓冲区是临时的，会定期刷新
  - 如果计入，可能导致频繁触发内存淘汰
  - 避免网络问题导致的内存淘汰循环

```c
// evict.c 第 352-370 行
size_t freeMemoryGetNotCountedMemory(void) {
    size_t overhead = 0;
    int slaves = listLength(server.slaves);  // 从节点数量
    
    // 1. 计算所有从节点的输出缓冲区大小
    if (slaves) {
        listIter li;
        listNode *ln;
        
        listRewind(server.slaves, &li);
        while((ln = listNext(&li))) {
            client *slave = listNodeValue(ln);
            // 1.1 累加每个从节点的输出缓冲区大小
            overhead += getClientOutputBufferMemoryUsage(slave);
        }
    }
    
    // 2. 计算 AOF 缓冲区大小
    if (server.aof_state != AOF_OFF) {
        // 2.1 AOF 缓冲区大小
        overhead += sdsalloc(server.aof_buf);
        // 2.2 AOF 重写缓冲区大小
        overhead += aofRewriteBufferSize();
    }
    
    return overhead;  // 返回总开销
}
```

#### getMaxmemoryState

- `getMaxmemoryState()` 获取内存状态，判断是否超过限制，并返回相关信息。
- 参数：
  - `total`：总内存使用量（包括 AOF 和从节点缓冲区）
  - `logical`：逻辑内存使用量（不包括 AOF 和从节点缓冲区）
  - `tofree`：需要释放的内存大小
  - `level`：内存使用率（0.0 到 1.0+）
- 它是这样实现的：
  - 1. 获取报告的内存使用量（`zmalloc_used_memory()`）
  - 2. 快速返回检查：
    - 如果未设置 `maxmemory` 或报告内存 <= `maxmemory`，快速返回
    - 如果不需要计算使用率，直接返回 `C_OK`
  - 3. 计算逻辑内存使用量：
    - 减去 AOF 缓冲区大小
    - 减去从节点输出缓冲区大小
  - 4. 计算内存使用率（如果请求）：
    - 使用率 = 逻辑内存使用量 / maxmemory
    - 可能 > 1.0（超过限制）
  - 5. 如果未超过限制，返回 `C_OK`
  - 6. 如果超过限制：
    - 计算需要释放的内存大小：`mem_tofree = mem_used - server.maxmemory`
    - 设置输出参数（`logical` 和 `tofree`）
    - 返回 `C_ERR`

```c
// evict.c 第 396-435 行
int getMaxmemoryState(size_t *total, size_t *logical, size_t *tofree, float *level) {
    size_t mem_reported, mem_used, mem_tofree;
    
    // 1. 获取报告的内存使用量
    //    - zmalloc_used_memory() 返回 Redis 分配的所有内存（包括 AOF 和从节点缓冲区）
    mem_reported = zmalloc_used_memory();
    if (total) *total = mem_reported;  // 设置总内存使用量（如果请求）
    
    // 2. 快速返回检查
    //    - 如果没有设置 maxmemory（server.maxmemory == 0），直接返回 OK
    //    - 如果报告的内存 <= maxmemory，也直接返回 OK（未超过限制）
    int return_ok_asap = !server.maxmemory || mem_reported <= server.maxmemory;
    
    // 2.1 如果满足快速返回条件且不需要计算使用率，直接返回
    if (return_ok_asap && !level) return C_OK;
    
    // 3. 计算逻辑内存使用量（减去 AOF 和从节点缓冲区）
    //    - 这些缓冲区是临时的，不应该计入内存使用量
    mem_used = mem_reported;
    size_t overhead = freeMemoryGetNotCountedMemory();  // 获取不计入的内存大小
    mem_used = (mem_used > overhead) ? mem_used - overhead : 0;  // 减去开销
    
    // 4. 计算内存使用率（如果请求）
    if (level) {
        if (!server.maxmemory) {
            *level = 0;  // 未设置 maxmemory，使用率为 0
        } else {
            // 计算使用率：逻辑内存使用量 / maxmemory
            // - 可能 > 1.0（超过限制）
            *level = (float)mem_used / (float)server.maxmemory;
        }
    }
    
    // 5. 如果满足快速返回条件，返回 C_OK
    if (return_ok_asap) return C_OK;
    
    // 6. 检查逻辑内存使用量是否超过限制
    if (mem_used <= server.maxmemory) return C_OK;  // 未超过限制
    
    // 7. 超过限制，计算需要释放的内存大小
    mem_tofree = mem_used - server.maxmemory;
    
    // 8. 设置输出参数（如果请求）
    if (logical) *logical = mem_used;   // 逻辑内存使用量
    if (tofree) *tofree = mem_tofree;   // 需要释放的内存大小
    
    return C_ERR;  // 超过限制，返回错误
}
```

### 内存释放核心函数

#### freeMemoryIfNeeded

- `freeMemoryIfNeeded()` 是内存淘汰的核心函数，在内存超过限制时释放内存。
- 它是这样实现的：
  - 1. **前置检查**：
    - 检查从节点状态（从节点通常不执行内存淘汰）
    - 检查客户端暂停状态
    - 检查内存状态（如果未超过限制，直接返回）
    - 检查淘汰策略（如果是 `noeviction`，无法释放）
  - 2. **内存释放循环**：
    - **LRU/LFU/TTL 策略**：
      - 从所有数据库采样键并填充淘汰池
      - 从淘汰池右侧选择最佳键（`idle` 值最大）
      - 处理幽灵键（已删除的键）
    - **Random 策略**：
      - 轮询所有数据库，随机选择一个键
    - 删除选中的键（同步或异步）
    - 计算释放的内存大小
    - 更新统计和通知
    - 刷新从节点输出缓冲区
    - 异步删除时定期检查内存状态
  - 3. **错误处理**：
    - 如果无法释放内存，等待异步删除完成
    - 返回结果（`C_OK` 或 `C_ERR`）

```c
// evict.c 第 446-623 行
int freeMemoryIfNeeded(void) {
    // 1. 从节点检查：如果是从节点且配置忽略 maxmemory，直接返回
    //    - 从节点应该完全复制主节点的数据，不应该执行内存淘汰
    //    - 如果配置了 repl_slave_ignore_maxmemory，从节点忽略内存限制
    if (server.masterhost && server.repl_slave_ignore_maxmemory) 
        return C_OK;
    
    size_t mem_reported, mem_tofree, mem_freed;  // 内存相关变量
    mstime_t latency, eviction_latency;           // 延迟监控
    long long delta;                              // 内存变化量
    int slaves = listLength(server.slaves);       // 从节点数量
    
    // 2. 如果客户端被暂停，不执行内存淘汰
    //    - 暂停期间数据集应该保持静态，包括内存淘汰也不应该执行
    if (clientsArePaused()) return C_OK;
    
    // 3. 检查内存状态，如果未超过限制，直接返回
    //    - getMaxmemoryState 会计算需要释放的内存大小（mem_tofree）
    if (getMaxmemoryState(&mem_reported, NULL, &mem_tofree, NULL) == C_OK)
        return C_OK;
    
    mem_freed = 0;  // 已释放的内存大小（初始化为 0）
    
    // 4. 如果策略是 noeviction，无法释放内存
    //    - noeviction 策略不允许淘汰任何键，只能返回错误
    if (server.maxmemory_policy == MAXMEMORY_NO_EVICTION)
        goto cant_free;
    
    // 5. 开始内存释放循环
    //    - 循环直到释放足够的内存（mem_freed >= mem_tofree）
    latencyStartMonitor(latency);  // 开始监控延迟
    while (mem_freed < mem_tofree) {
        int j, k, i, keys_freed = 0;  // 循环变量和已释放键数
        static unsigned int next_db = 0;  // 静态变量，用于轮询数据库（Random 策略）
        sds bestkey = NULL;  // 最佳淘汰键（初始化为 NULL）
        int bestdbid;        // 最佳键所在的数据库 ID
        redisDb *db;
        dict *dict;
        dictEntry *de;
        
        // 6. LRU/LFU/TTL 策略：使用淘汰池选择键
        if (server.maxmemory_policy & (MAXMEMORY_FLAG_LRU|MAXMEMORY_FLAG_LFU) ||
            server.maxmemory_policy == MAXMEMORY_VOLATILE_TTL)
        {
            struct evictionPoolEntry *pool = EvictionPoolLRU;
            
            // 6.1 填充淘汰池并选择最佳键
            //     - 使用 while 循环，因为可能遇到幽灵键（已删除的键）
            while(bestkey == NULL) {
                unsigned long total_keys = 0, keys;
                
                // 6.1.1 从所有数据库采样键并填充淘汰池
                //        - 遍历所有数据库，确保公平选择
                for (i = 0; i < server.dbnum; i++) {
                    db = server.db + i;
                    
                    // 选择采样字典
                    // - allkeys 策略：从主字典采样（所有键）
                    // - volatile 策略：从过期字典采样（只有过期键）
                    dict = (server.maxmemory_policy & MAXMEMORY_FLAG_ALLKEYS) ?
                            db->dict : db->expires;
                    
                    // 如果字典不为空，填充淘汰池
                    if ((keys = dictSize(dict)) != 0) {
                        // 填充淘汰池：采样键并计算 idle 值
                        evictionPoolPopulate(i, dict, db->dict, pool);
                        total_keys += keys;  // 累加总键数
                    }
                }
                
                // 6.1.2 如果没有键可以淘汰，退出循环
                if (!total_keys) break;
                
                // 6.1.3 从淘汰池中选择最佳键（从右到左，idle 值最大）
                //        - 淘汰池按 idle 值升序排列，右侧是空闲时间最长的键
                for (k = EVPOOL_SIZE-1; k >= 0; k--) {
                    if (pool[k].key == NULL) continue;  // 跳过空条目
                    bestdbid = pool[k].dbid;  // 记录数据库 ID
                    
                    // 在对应数据库中查找键
                    // - allkeys 策略：在主字典中查找
                    // - volatile 策略：在过期字典中查找
                    if (server.maxmemory_policy & MAXMEMORY_FLAG_ALLKEYS) {
                        de = dictFind(server.db[pool[k].dbid].dict, pool[k].key);
                    } else {
                        de = dictFind(server.db[pool[k].dbid].expires, pool[k].key);
                    }
                    
                    // 从淘汰池中移除该条目（清理）
                    if (pool[k].key != pool[k].cached)
                        sdsfree(pool[k].key);  // 释放分配的键名（如果不是缓存的）
                    pool[k].key = NULL;  // 清空键名
                    pool[k].idle = 0;    // 清空 idle 值
                    
                    // 如果键存在，选择它；否则继续查找（可能是幽灵键）
                    // - 幽灵键：淘汰池中的键可能已经被删除（在其他操作中）
                    if (de) {
                        bestkey = dictGetKey(de);  // 获取键名（SDS 指针）
                        break;  // 找到有效键，退出循环
                    }
                    // 否则继续查找下一个条目
                }
            }
        }
        // 7. Random 策略：随机选择键
        else if (server.maxmemory_policy == MAXMEMORY_ALLKEYS_RANDOM ||
                 server.maxmemory_policy == MAXMEMORY_VOLATILE_RANDOM)
        {
            // 7.1 轮询所有数据库，随机选择一个键
            //     - 使用静态变量 next_db 轮询，避免总是从同一个数据库选择
            for (i = 0; i < server.dbnum; i++) {
                // 7.1.1 轮询数据库（使用模运算）
                j = (++next_db) % server.dbnum;
                db = server.db + j;
                
                // 7.1.2 选择采样字典
                dict = (server.maxmemory_policy == MAXMEMORY_ALLKEYS_RANDOM) ?
                        db->dict : db->expires;
                
                // 7.1.3 如果字典不为空，随机获取一个键
                if (dictSize(dict) != 0) {
                    de = dictGetRandomKey(dict);  // 随机获取一个字典项
                    bestkey = dictGetKey(de);     // 获取键名
                    bestdbid = j;                 // 记录数据库 ID
                    break;  // 找到键，退出循环
                }
            }
        }
        
        // 8. 删除选中的键
        if (bestkey) {
            db = server.db + bestdbid;
            
            // 8.1 创建键对象（用于删除和通知）
            robj *keyobj = createStringObject(bestkey, sdslen(bestkey));
            
            // 8.2 传播删除操作到 AOF 和从节点
            //     - 将 DEL 或 UNLINK 命令写入 AOF 和传播到从节点
            //     - 根据 lazyfree_lazy_eviction 配置决定传播 DEL 还是 UNLINK
            propagateExpire(db, keyobj, server.lazyfree_lazy_eviction);
            
            // 8.3 记录删除前的内存使用量
            //     - 用于计算实际释放的内存大小
            delta = (long long) zmalloc_used_memory();
            
            // 8.4 根据配置选择同步或异步删除
            latencyStartMonitor(eviction_latency);  // 开始监控删除延迟
            if (server.lazyfree_lazy_eviction)
                dbAsyncDelete(db, keyobj);  // 异步删除（适用于大对象）
            else
                dbSyncDelete(db, keyobj);   // 同步删除（立即释放内存）
            latencyEndMonitor(eviction_latency);     // 结束监控
            latencyAddSampleIfNeeded("eviction-del", eviction_latency);  // 记录延迟
            latencyRemoveNestedEvent(latency, eviction_latency);  // 移除嵌套事件
            
            // 8.5 计算释放的内存大小
            //     - delta = 删除前内存 - 删除后内存
            //     - 注意：异步删除时，delta 可能为 0（内存还未释放）
            delta -= (long long) zmalloc_used_memory();
            mem_freed += delta;  // 累加已释放内存
            
            // 8.6 更新统计和通知
            server.stat_evictedkeys++;  // 增加淘汰键计数
            notifyKeyspaceEvent(NOTIFY_EVICTED, "evicted", keyobj, db->id);  // 发送通知
            decrRefCount(keyobj);  // 释放键对象
            keys_freed++;  // 增加已释放键数
            
            // 8.7 如果有从节点，刷新输出缓冲区
            //     - 避免输出缓冲区过大，导致内存问题
            //     - 在循环中定期刷新，确保从节点及时收到删除命令
            if (slaves) flushSlavesOutputBuffers();
            
            // 8.8 异步删除时的特殊处理
            //     - 每删除 16 个键检查一次内存状态
            //     - 因为异步删除的内存释放是延迟的，需要定期检查
            if (server.lazyfree_lazy_eviction && !(keys_freed % 16)) {
                // 8.8.1 检查内存状态，如果已回到限制以下，提前退出
                if (getMaxmemoryState(NULL, NULL, NULL, NULL) == C_OK) {
                    mem_freed = mem_tofree;  // 已达到目标，设置 mem_freed 以退出循环
                }
            }
        }
        
        // 9. 如果没有释放任何键，退出循环
        //    - 可能原因：所有键都不符合淘汰条件、所有键都是幽灵键等
        if (!keys_freed) {
            latencyEndMonitor(latency);
            latencyAddSampleIfNeeded("eviction-cycle", latency);
            goto cant_free;  // 无法释放内存，跳转到错误处理
        }
    }
    
    // 10. 释放成功，记录延迟并返回
    latencyEndMonitor(latency);
    latencyAddSampleIfNeeded("eviction-cycle", latency);
    return C_OK;  // 成功释放内存
    
cant_free:
    // 11. 无法释放内存时的最后尝试：等待异步删除完成
    //     - 如果使用了异步删除，可能有些内存还在后台线程中释放
    //     - 等待一段时间，看是否能释放足够的内存
    while(bioPendingJobsOfType(BIO_LAZY_FREE)) {
        // 11.1 计算当前已释放的内存（包括异步删除的）
        //      - mem_reported - zmalloc_used_memory()：异步删除释放的内存
        //      - mem_freed：同步删除释放的内存
        if (((mem_reported - zmalloc_used_memory()) + mem_freed) >= mem_tofree)
            break;  // 已释放足够内存，退出等待
        usleep(1000);  // 等待 1 毫秒，避免 CPU 占用过高
    }
    return C_ERR;  // 返回错误，表示无法释放足够的内存
}
```

#### freeMemoryIfNeededAndSafe

- `freeMemoryIfNeededAndSafe()` 是 `freeMemoryIfNeeded()` 的安全包装，在特定条件下才执行。
- 它是这样实现的：
  - 1. 检查 Lua 脚本超时状态和加载状态
  - 2. 如果安全，调用 `freeMemoryIfNeeded()`

```c
// evict.c 第 632-635 行
int freeMemoryIfNeededAndSafe(void) {
    // 1. 如果 Lua 脚本超时或正在加载数据，不执行内存淘汰
    //    - 这些情况下执行内存淘汰可能导致数据不一致
    if (server.lua_timedout || server.loading) return C_OK;
    
    // 2. 调用 freeMemoryIfNeeded
    return freeMemoryIfNeeded();
}
```

# Redis 的网络通信

## main 函数

- 我们知道，main 函数是 Redis 整个运行程序的入口，并且 Redis 实例在运行时，也会从这个 main 函数开始执行。同时，由于 Redis 是典型的 Client-Server 架构，一旦 Redis 实例开始运行，Redis server 也就会启动，而 main 函数其实也会负责 Redis server 的启动运行。
- main 函数的主要工作可以分为五个阶段：
  1. **基本初始化**：设置时区、OOM 处理、随机种子、哈希种子等
  2. **检查哨兵模式，并检查是否要执行 RDB 检测或 AOF 检测**：判断运行模式
  3. **运行参数解析**：解析命令行参数和配置文件
  4. **初始化 server**：初始化服务器数据结构、数据库、网络框架等
  5. **执行事件驱动框架**：进入事件循环，处理客户端请求

### 基本初始化

- **目的**：设置运行环境的基础参数，在这个阶段，main 函数主要是完成一些基本的初始化工作，包括设置 server 运行的时区、设置哈希函数的随机种子等

- **主要操作**：
  - 设置时区和本地化（`setlocale`、`tzset`）
  - 设置 OOM 处理函数（`zmalloc_set_oom_handler`）
  - 设置随机种子（`srand`）
  - 设置哈希种子（`dictSetHashFunctionSeed`），防止哈希碰撞攻击
  - 检查哨兵模式（`checkForSentinelMode`）
  - 初始化服务器配置（`initServerConfig`），设置默认值
  - 初始化模块系统（`moduleInitModulesSystem`）
  - 保存可执行文件路径和命令行参数（用于后续重启）
- 在 main 函数的开始部分，有一段宏定义覆盖的代码。这部分代码的作用是，如果定义了 REDIS_TEST 宏定义，并且 Redis server 启动时的参数符合测试参数，那么 main 函数就会执行相应的测试程序。

### 检查哨兵模式，并检查是否要执行 RDB 检测或 AOF 检测

- Redis server 启动后，可能是以哨兵模式运行的，而哨兵模式运行的 server 在参数初始化、参数设置，以及 server 启动过程中要执行的操作等方面，与普通模式 server 有所差别。所以，main 函数在执行过程中需要根据 Redis 配置的参数，检查是否设置了哨兵模式。如果有设置哨兵模式的话，main 函数会调用 initSentinelConfig 函数，对哨兵模式的参数进行初始化设置，以及调用 initSentinel 函数，初始化设置哨兵模式运行的 server。

- **目的**：确定运行模式，处理特殊启动模式
- **主要操作**：
  - 如果是哨兵模式，初始化哨兵配置和工作（`initSentinelConfig`、`initSentinel`）
  - 检查是否是 RDB 或 AOF 检测模式（`redis-check-rdb`、`redis-check-aof`），如果是则执行检测并退出

### 运行参数解析

- 在这一阶段，main 函数会对命令行传入的参数进行解析，并且调用 loadServerConfig 函数，对命令行参数和配置文件中的参数进行合并处理，然后为 Redis 各功能模块的关键参数设置合适的取值，以便 server 能高效地运行。
- 首先，Redis 在 main 函数中会先调用 initServerConfig 函数，为各种参数设置默认值。接下来，main 函数就会对 Redis 程序启动时的命令行参数进行逐一解析。main 函数会把解析后的参数及参数值保存成字符串，接着，main 函数会调用 loadServerConfig 函数进行第二和第三轮的赋值。
  - loadServerConfig 函数是在config.c文件中实现的，该函数是以 Redis 配置文件和命令行参数的解析字符串为参数，将配置文件中的所有配置项读取出来，形成字符串。紧接着，loadServerConfig 函数会把解析后的命令行参数，追加到配置文件形成的配置项字符串。那么配置项字符串就同时包含了配置文件中设置的参数，以及命令行设置的参数。
- 最后，loadServerConfig 函数会进一步调用 loadServerConfigFromString 函数，对配置项字符串中的每一个配置项进行匹配。一旦匹配成功，loadServerConfigFromString 函数就会按照配置项的值设置 server 的参数。

- **目的**：解析命令行参数和配置文件，设置服务器配置
- **主要操作**：
  - 处理特殊选项（`--help`、`--version`、`--test-memory`）
  - 解析配置文件路径（第一个非 `--` 开头的参数）
  - 解析命令行选项（如 `--port 6380`），转换为配置字符串格式
  - 加载配置文件并合并命令行参数（`loadServerConfig`）
  - 检查是否需要后台运行（守护进程模式），如果是则调用 `daemonize()`

### 初始化 server

- 在完成对运行参数的解析和设置后，main 函数会调用 initServer 函数，对 server 运行时的各种资源进行初始化工作。这主要包括了 server 资源管理所需的数据结构初始化、键值对数据库初始化、server 网络框架初始化等。而在调用完 initServer 后，main 函数还会再次判断当前 server 是否为哨兵模式。如果是哨兵模式，main 函数会调用 sentinelIsRunning 函数，设置启动哨兵模式。否则的话，main 函数会调用 loadDataFromDisk 函数，从磁盘上加载 AOF 或者是 RDB 文件，以便恢复之前的数据。
  - 可以从 loadDataFromDisk 函数中看到，Redis server 会先读取 AOF；而如果没有 AOF，则再读取 RDB。
- 初始化server的大致流程：
  - 1. Redis server 运行时需要对多种资源进行管理
    - 比如说，和 server 连接的客户端、从库等，Redis 用作缓存时的替换候选集，以及 server 运行时的状态信息，这些资源的管理信息都会在 initServer 函数中进行初始化。
  - 2. 在完成资源管理信息的初始化后，initServer 函数会对 Redis 数据库进行初始化。因为一个 Redis 实例可以同时运行多个数据库，所以 initServer 函数会使用一个循环，依次为每个数据库创建相应的数据结构。
    - 这个代码逻辑是实现在 initServer 函数中，它会为每个数据库执行初始化操作，包括创建全局哈希表，为过期 key、被 BLPOP 阻塞的 key、将被 PUSH 的 key 和被监听的 key 创建相应的信息表。
  - 3. initServer 函数会为运行的 Redis server 创建事件驱动框架，并开始启动端口监听，用于接收外部请求。
    - 为了高效处理高并发的外部请求，initServer 在创建的事件框架中，针对每个监听 IP 上可能发生的客户端连接，都创建了监听事件，用来监听客户端连接请求。同时，initServer 为监听事件设置了相应的处理函数 acceptTcpHandler，只要有客户端连接到 server 监听的 IP 和端口，事件驱动框架就会检测到有连接事件发生，然后调用 acceptTcpHandler 函数来处理具体的连接
- **目的**：初始化服务器的所有组件，准备接受客户端连接
- **主要操作**：
  - **`initServer()`**：核心初始化函数
    - 初始化服务器数据结构
    - 初始化键值对数据库（创建数据库数组、设置哈希函数等）
    - 初始化网络框架（创建事件循环、创建监听套接字等）
  - 创建 PID 文件（如果配置了）
  - 设置进程标题
  - 打印 ASCII 艺术字
  - 检查 TCP backlog 设置
  - 非哨兵模式：
    - 加载模块队列（`moduleLoadFromQueue`）
    - 最后初始化步骤（`InitServerLast`）
    - **加载持久化数据**（`loadDataFromDisk`）：从 AOF 或 RDB 文件恢复数据
    - 集群模式验证（如果启用）
    - 打印就绪信息
  - 哨兵模式：
    - 最后初始化步骤（`InitServerLast`）
    - 启动哨兵（`sentinelIsRunning`）

### 执行事件驱动框架

- 为了能高效处理高并发的客户端连接请求，Redis 采用了事件驱动框架，来并发处理不同客户端的连接和读写请求。所以，main 函数执行到最后时，会调用 aeMain 函数进入事件驱动框架，开始循环处理各种触发的事件。
- 在进入事件驱动循环前，main 函数会分别调用 aeSetBeforeSleepProc 和 aeSetAfterSleepProc 两个函数，来设置每次进入事件循环前 server 需要执行的操作，以及每次事件循环结束后 server 需要执行的操作

- **目的**：进入事件循环，开始处理客户端请求
- **主要操作**：
  - 设置事件循环的前置和后置回调函数（`beforeSleep`、`afterSleep`）
  - **`aeMain(server.el)`**：进入事件循环主循环
    - 这是 Redis 服务器的主循环，会一直运行直到服务器关闭
    - 不断调用 `aeProcessEvents` 处理文件事件（客户端连接、数据读写）和时间事件（定时任务）
  - 清理事件循环（正常情况下不会执行到这里）

```c

// server.c 第 4095-4331 行
int main(int argc, char **argv) {
    struct timeval tv;
    int j;

    // 测试模式：如果定义了 REDIS_TEST 宏，可以执行各种测试
#ifdef REDIS_TEST
    if (argc == 3 && !strcasecmp(argv[1], "test")) {
        // 支持 ziplist、quicklist、intset 等数据结构的测试
        if (!strcasecmp(argv[2], "ziplist")) {
            return ziplistTest(argc, argv);
        }
        // ... 其他测试
    }
#endif

    // ========== 阶段一：基本初始化 ==========
    // 1.1 初始化进程标题设置（如果支持）
#ifdef INIT_SETPROCTITLE_REPLACEMENT
    spt_init(argc, argv);
#endif

    // 1.2 设置时区和本地化
    setlocale(LC_COLLATE,"");  // 设置字符串排序规则
    tzset();                   // 设置时区，填充 'timezone' 全局变量

    // 1.3 设置 OOM 处理函数
    //     - 当内存分配失败时，调用 redisOutOfMemoryHandler 处理
    zmalloc_set_oom_handler(redisOutOfMemoryHandler);

    // 1.4 设置随机种子
    //     - 使用当前时间和进程 ID 的异或值作为随机种子
    //     - 确保每次启动的随机序列不同
    srand(time(NULL)^getpid());
    gettimeofday(&tv,NULL);

    // 1.5 设置哈希种子
    //     - 生成 16 字节的随机哈希种子
    //     - 用于字典的哈希函数，防止哈希碰撞攻击
    char hashseed[16];
    getRandomHexChars(hashseed,sizeof(hashseed));
    dictSetHashFunctionSeed((uint8_t*)hashseed);

    // 1.6 检查是否启动哨兵模式
    //     - 通过启动命令或命令参数检查
    server.sentinel_mode = checkForSentinelMode(argc,argv);

    // 1.7 初始化服务器配置（设置默认值）
    initServerConfig();

    // 1.8 初始化模块系统
    moduleInitModulesSystem();

    // 1.9 保存可执行文件路径和命令行参数
    //     - 用于后续服务器重启
    server.executable = getAbsolutePath(argv[0]);
    server.exec_argv = zmalloc(sizeof(char*)*(argc+1));
    server.exec_argv[argc] = NULL;
    for (j = 0; j < argc; j++) {
        server.exec_argv[j] = zstrdup(argv[j]);
    }

    // ========== 阶段二：检查哨兵模式，并检查是否要执行 RDB 检测或 AOF 检测 ==========
    // 2.1 如果是哨兵模式，初始化哨兵配置和工作
    if (server.sentinel_mode) {
        initSentinelConfig();  // 初始化哨兵配置
        initSentinel();        // 初始化哨兵工作
    }

    // 2.2 检查是否需要执行 RDB 或 AOF 检测
    //     - 如果启动命令是 redis-check-rdb 或 redis-check-aof，执行相应的检测
    if (strstr(argv[0],"redis-check-rdb") != NULL)
        redis_check_rdb_main(argc,argv,NULL);
    else if (strstr(argv[0],"redis-check-aof") != NULL)
        redis_check_aof_main(argc,argv);

    // ========== 阶段三：运行参数解析 ==========
    if (argc >= 2) {
        j = 1; /* First option to parse in argv[] */
        sds options = sdsempty();
        char *configfile = NULL;

        // 3.1 处理特殊选项：--help、--version、--test-memory
        if (strcmp(argv[1], "-v") == 0 ||
            strcmp(argv[1], "--version") == 0) version();
        if (strcmp(argv[1], "--help") == 0 ||
            strcmp(argv[1], "-h") == 0) usage();
        if (strcmp(argv[1], "--test-memory") == 0) {
            // 内存测试模式
            if (argc == 3) {
                memtest(atoi(argv[2]),50);
                exit(0);
            }
        }

        // 3.2 解析配置文件路径
        //     - 如果第一个参数不是以 "--" 开头，则认为是配置文件路径
        if (argv[j][0] != '-' || argv[j][1] != '-') {
            configfile = argv[j];
            server.configfile = getAbsolutePath(configfile);
            // 替换文件名为绝对路径
            zfree(server.exec_argv[j]);
            server.exec_argv[j] = zstrdup(server.configfile);
            j++;
        }

        // 3.3 解析命令行选项（如 --port 6380）
        //     - 将所有选项转换为配置字符串格式
        while(j != argc) {
            if (argv[j][0] == '-' && argv[j][1] == '-') {
                /* Option name */
                if (!strcmp(argv[j], "--check-rdb")) {
                    j++;
                    continue;
                }
                if (sdslen(options)){
                    options = sdscat(options,"\n");
                }
                options = sdscat(options,argv[j]+2);  // 去掉 "--" 前缀
                options = sdscat(options," ");
            } else {
                /* Option argument */
                options = sdscatrepr(options,argv[j],strlen(argv[j]));
                options = sdscat(options," ");
            }
            j++;
        }

        // 3.4 哨兵模式不允许从 STDIN 读取配置
        if (server.sentinel_mode && configfile && *configfile == '-') {
            serverLog(LL_WARNING,
                "Sentinel config from STDIN not allowed.");
            exit(1);
        }

        // 3.5 重置服务器保存参数
        resetServerSaveParams();

        // 3.6 加载配置文件并合并命令行参数
        //     - loadServerConfig 会解析配置文件，并将命令行参数覆盖配置文件中的设置
        //     - Redis 为各功能模块的关键参数设置合适的取值，以便 server 能高效运行
        loadServerConfig(configfile,options);
        sdsfree(options);
    }

    // 3.7 打印启动信息
    serverLog(LL_WARNING, "oO0OoO0OoO0Oo Redis is starting oO0OoO0OoO0Oo");
    serverLog(LL_WARNING,
        "Redis version=%s, bits=%d, commit=%s, modified=%d, pid=%d, just started",
            REDIS_VERSION,
            (sizeof(long) == 8) ? 64 : 32,
            redisGitSHA1(),
            strtol(redisGitDirty(),NULL,10) > 0,
            (int)getpid());

    if (argc == 1) {
        serverLog(LL_WARNING, "Warning: no config file specified, using the default config.");
    } else {
        serverLog(LL_WARNING, "Configuration loaded");
    }

    // 3.8 检查是否需要后台运行（守护进程模式）
    server.supervised = redisIsSupervised(server.supervised_mode);
    int background = server.daemonize && !server.supervised;
    if (background) daemonize();  // 将进程转为守护进程

    // ========== 阶段四：初始化 server ==========
    /*
     * 真实初始化 server 的地方:
     * 1. server 相关资源管理所需数据结构初始化
     * 2. 键值对数据库初始化（例如全局 key-value 映射的 hash 结构的哈希函数）
     * 3. server 网络框架初始化（事件循环、监听套接字等）
     */
    initServer();

    // 4.1 创建 PID 文件（如果配置了后台运行或指定了 PID 文件）
    if (background || server.pidfile) createPidFile();

    // 4.2 设置进程标题
    redisSetProcTitle(argv[0]);

    // 4.3 打印 ASCII 艺术字
    redisAsciiArt();

    // 4.4 检查 TCP backlog 设置
    checkTcpBacklogSettings();

    // 4.5 非哨兵模式的初始化
    if (!server.sentinel_mode) {
        serverLog(LL_WARNING,"Server initialized");
#ifdef __linux__
        linuxMemoryWarnings();  // Linux 内存警告
#endif
        moduleLoadFromQueue();  // 加载模块队列
        InitServerLast();       // 最后初始化步骤

        // 4.5.1 加载 AOF 和 RDB 文件，恢复 Redis 内存中的数据
        loadDataFromDisk();

        // 4.5.2 集群模式验证
        if (server.cluster_enabled) {
            if (verifyClusterConfigWithData() == C_ERR) {
                serverLog(LL_WARNING,
                    "You can't have keys in a DB different than DB 0 when in "
                    "Cluster mode. Exiting.");
                exit(1);
            }
        }

        // 4.5.3 打印就绪信息
        if (server.ipfd_count > 0)
            serverLog(LL_NOTICE,"Ready to accept connections");
        if (server.sofd > 0)
            serverLog(LL_NOTICE,"The server is now ready to accept connections at %s", server.unixsocket);
    } else {
        // 4.6 哨兵模式的初始化
        InitServerLast();
        sentinelIsRunning();
    }

    // 4.7 警告可疑的 maxmemory 设置
    if (server.maxmemory > 0 && server.maxmemory < 1024*1024) {
        serverLog(LL_WARNING,"WARNING: You specified a maxmemory value that is less than 1MB.");
    }

    // ========== 阶段五：执行事件驱动框架 ==========
    // 5.1 设置事件循环的前置和后置回调函数
    //     - beforeSleep：在每次事件循环前执行（处理客户端输入、执行命令等）
    //     - afterSleep：在每次事件循环后执行（处理输出缓冲区等）
    aeSetBeforeSleepProc(server.el,beforeSleep);
    aeSetAfterSleepProc(server.el,afterSleep);

    // 5.2 开启事件驱动框架，进入事件循环
    //     - aeMain 会不断调用 aeProcessEvents 处理文件事件和时间事件
    //     - 这是 Redis 服务器的主循环，会一直运行直到服务器关闭
    //     - 类似自研网络框架的 event loop run 方法所做的事
    aeMain(server.el);

    // 5.3 清理事件循环（正常情况下不会执行到这里，除非服务器关闭）
    aeDeleteEventLoop(server.el);
    return 0;
}
```

## IO 多路复用基础

### 为什么需要 IO 多路复用？

- Redis 作为一个 Client-Server 架构的数据库，其源码中少不了用来实现网络通信的部分。通常系统实现网络通信的基本方法是使用 Socket 编程模型，包括创建 Socket、监听端口、处理连接请求和读写请求。但是，由于基本的 Socket 编程模型一次只能处理一个客户端连接上的请求，所以当要处理高并发请求时，一种方案就是使用多线程，让每个线程负责处理一个客户端的请求。而 Redis 负责客户端请求解析和处理的线程只有一个，那么如果直接采用基本 Socket 模型，就会影响 Redis 支持高并发的客户端访问。
- 因此，为了实现高并发的网络通信，Redis 采用了 **IO 多路复用（IO Multiplexing）** 技术，在 Linux 上通常使用 **epoll** 模型来进行网络通信。

### IO 多路复用的基本概念

- **IO 多路复用**：一种同步 IO 模型，允许单个进程/线程同时监视多个文件描述符（fd），当某个文件描述符就绪（可读或可写）时，通知程序进行相应的读写操作。
- **核心优势**：
  - 单线程/进程可以同时处理多个客户端连接
  - 避免了多线程/多进程的上下文切换开销
  - 适合高并发、低延迟的场景

### select、poll、epoll 详解

#### select

- **定义**：`select()` 是最早的 IO 多路复用接口，在 POSIX 标准中定义。
  - select 函数使用三个集合，表示监听的三类事件，分别是读数据事件（对应readfds集合）、写数据事件（对应writefds集合）和异常事件（对应__exceptfds集合）
  - fd_set 结构体的定义，其实就是一个 long int 类型的数组，该数组中一共有 32 个元素，每个元素是 32 位，每一位可以用来表示一个文件描述符的状态。select 函数对每一个描述符集合，都可以监听 1024 个描述符。
    - 1. 在调用 select 函数前，可以先创建好传递给 select 函数的描述符集合，然后再创建监听套接字。而为了让创建的监听套接字能被 select 函数监控，需要把这个套接字的描述符加入到创建好的描述符集合中。
    - 2. 然后可以调用 select 函数，并把创建好的描述符集合作为参数传递给 select 函数。程序在调用 select 函数后，会发生阻塞。而当 select 函数检测到有描述符就绪后，就会结束阻塞，并返回就绪的文件描述符个数。
    - 3. 可以使用一个循环流程, 在描述符集合中查找哪些描述符就绪了,依次对就绪描述符对应的套接字进行读写或异常处理操作

- **函数签名**：

```c
#include <sys/select.h>
int select(int nfds, fd_set *readfds, fd_set *writefds, 
           fd_set *exceptfds, struct timeval *timeout);
```

- **参数说明**：
  - `nfds`：需要监视的文件描述符的最大值 + 1
  - `readfds`：可读文件描述符集合
  - `writefds`：可写文件描述符集合
  - `exceptfds`：异常文件描述符集合
  - `timeout`：超时时间（NULL 表示阻塞等待，0 表示非阻塞）
- **返回值**：
  - 成功：返回就绪的文件描述符数量
  - 超时：返回 0
  - 错误：返回 -1
- **使用示例**：

```c
fd_set readfds;
FD_ZERO(&readfds);           // 清空集合
FD_SET(sockfd, &readfds);    // 添加文件描述符
int ret = select(sockfd + 1, &readfds, NULL, NULL, NULL);
if (ret > 0 && FD_ISSET(sockfd, &readfds)) {
    // sockfd 可读
}
```

- **特点**：
  - **优点**：跨平台，几乎所有操作系统都支持
  - **缺点**：
    - 文件描述符数量限制：`FD_SETSIZE`（通常为 1024）
    - 每次调用都需要将文件描述符集合从用户态拷贝到内核态
    - 返回后需要遍历所有文件描述符找出就绪的（O(n) 复杂度）
    - 每次调用都需要重新设置文件描述符集合

#### poll

- **定义**：`poll()` 是 `select()` 的改进版本，解决了文件描述符数量限制的问题。
- 与select类似，创建 pollfd 数组和监听套接字，并进行绑定，将监听套接字加入 pollfd 数组，并设置其监听读事件，也就是客户端的连接请求，循环调用 poll 函数，检测 pollfd 数组中是否有就绪的文件描述符。和 select 函数相比，poll 函数的改进之处主要就在于允许一次监听超过 1024 个文件描述符。但是当调用了 poll 函数后仍然需要遍历每个文件描述符，检测该描述符是否就绪，然后再进行处理
  - 如果是连接套接字就绪，这表明是有客户端连接，可以调用 accept 接受连接，并创建已连接套接字，并将其加入 pollfd 数组，并监听读事件
  - 如果是已连接套接字就绪，这表明客户端有读写请求，调用 recv/send 函数处理读写请求

- **函数签名**：

```c
#include <poll.h>
int poll(struct pollfd *fds, nfds_t nfds, int timeout);
```

- **参数说明**：
  - `fds`：`pollfd` 结构体数组，每个元素包含文件描述符和关注的事件
  - `nfds`：数组元素个数
  - `timeout`：超时时间（毫秒，-1 表示阻塞等待，0 表示非阻塞）
- **pollfd 结构体**：
- pollfd 结构体里包含了要监听的描述符，以及该描述符上要监听的事件类型。pollfd 结构体中包含了三个成员变量 fd、events 和 revents，分别表示要监听的文件描述符、要监听的事件类型和实际发生的事件类型。
- pollfd 结构体中要监听和实际发生的事件类型，是通过以下三个宏定义来表示的，分别是 POLLRDNORM、POLLWRNORM 和 POLLERR，它们分别表示可读、可写和错误事件

```c
struct pollfd {
    int fd;         // 文件描述符
    short events;   // 关注的事件（POLLIN、POLLOUT 等）
    short revents;  // 返回的事件（由内核填充）
};
```

- **使用示例**：

```c
struct pollfd fds[1];
fds[0].fd = sockfd;
fds[0].events = POLLIN;
int ret = poll(fds, 1, -1);
if (ret > 0 && (fds[0].revents & POLLIN)) {
    // sockfd 可读
}
```

- **特点**：
  - **优点**：
    - 没有文件描述符数量限制（理论上只受系统资源限制）
    - 使用 `pollfd` 数组，接口更灵活
  - **缺点**：
    - 每次调用仍然需要将文件描述符数组从用户态拷贝到内核态
    - 返回后仍然需要遍历所有文件描述符找出就绪的（O(n) 复杂度）
    - 性能与 `select()` 类似，在大量文件描述符时效率低

#### epoll

- **定义**：`epoll()` 是 Linux 特有的 IO 多路复用接口，是 `select()` 和 `poll()` 的高效替代方案。、
- 对于 epoll 机制来说，需要先调用 epoll_create 函数，创建一个 epoll 实例。
  - 这个 epoll 实例内部维护了两个结构，分别是记录要监听的文件描述符和已经就绪的文件描述符，而对于已经就绪的文件描述符来说，它们会被返回给用户程序进行处理。
- 在创建了 epoll 实例后，需要再使用 epoll_ctl 函数，给被监听的文件描述符添加监听事件类型，以及使用 epoll_wait 函数获取就绪的文件描述符。
- 最后根据 epoll_wait 函数返回的已就绪描述符进行对应的事件处理，不用像使用 select 和 poll 一样，遍历查询哪些文件描述符已经就绪了。

- **核心函数**：
  - `epoll_create()`：创建一个 epoll 实例，返回文件描述符
  - `epoll_ctl()`：向 epoll 实例中添加、修改或删除文件描述符
  - `epoll_wait()`：等待文件描述符就绪
- **函数签名**

```c
#include <sys/epoll.h>
int epoll_create(int size);  // size 是提示值，Linux 2.6.8 后忽略
int epoll_ctl(int epfd, int op, int fd, struct epoll_event *event);
int epoll_wait(int epfd, struct epoll_event *events, int maxevents, int timeout);
```

- **epoll_event 结构体**：
- 使用 epoll_event 结构体，来记录待监听的文件描述符及其监听的事件类型，其中包含了 epoll_data_t 联合体变量，以及整数类型的 events 变量。epoll_data_t 联合体中有记录文件描述符的成员变量 fd，而 events 变量会取值使用不同的宏定义值，来表示 epoll_data_t 变量中的文件描述符所关注的事件类型：
  - 1. EPOLLIN：读事件，表示文件描述符对应套接字有数据可读。
  - 2. EPOLLOUT：写事件，表示文件描述符对应套接字有数据要写。
  - 3. EPOLLERR：错误事件，表示文件描述符对于套接字出错。

```c
struct epoll_event {
    uint32_t events;      // 关注的事件（EPOLLIN、EPOLLOUT 等）
    epoll_data_t data;    // 用户数据
};
typedef union epoll_data {
    void *ptr;
    int fd;
    uint32_t u32;
    uint64_t u64;
} epoll_data_t;
```

- **使用示例**：

```c
int epfd = epoll_create(1024);
struct epoll_event event;
event.events = EPOLLIN;
event.data.fd = sockfd;
epoll_ctl(epfd, EPOLL_CTL_ADD, sockfd, &event);

struct epoll_event events[10];
int ret = epoll_wait(epfd, events, 10, -1);
for (int i = 0; i < ret; i++) {
    if (events[i].events & EPOLLIN) {
        // events[i].data.fd 可读
    }
}
```

- **特点**：
  - **优点**：
    - 没有文件描述符数量限制
    - **高效**：使用红黑树和就绪链表，时间复杂度 O(1)
    - **事件驱动**：只返回就绪的文件描述符，不需要遍历
    - **边缘触发（ET）模式**：可以进一步减少系统调用次数
  - **缺点**：
    - 只在 Linux 上可用（其他系统有类似的 kqueue、IOCP 等）

### Reactor 和 Proactor 模式

#### Reactor 模式

- **定义**：Reactor 模式是一种事件驱动的设计模式，用于处理并发服务请求。
- Reactor 模型的基本工作机制：客户端的不同类请求会在服务器端触发连接、读、写三类事件，这三类事件的监听、分发和处理又是由 reactor、acceptor、handler 三类角色来完成的，然后这三类角色会通过事件驱动框架来实现交互和事件处理。
- **核心思想**：
  - 应用程序向 Reactor 注册事件处理器（Handler）
  - Reactor 负责监听和分发事件
  - 当事件就绪时，Reactor 调用相应的事件处理器
- **工作流程**：
  1. 应用程序注册事件处理器到 Reactor
  2. Reactor 调用 IO 多路复用函数（select/poll/epoll）等待事件
  3. 当事件就绪时，Reactor 分发事件给相应的事件处理器
  4. 事件处理器执行实际的 IO 操作（读/写）
- **特点**：
  - **同步 IO**：事件处理器需要自己执行 IO 操作
  - **单线程/多线程**：可以在单线程中处理所有事件，也可以使用线程池
  - **适合场景**：高并发、低延迟的网络服务
- **Redis 使用 Reactor 模式**：
  - Redis 的事件循环是典型的 Reactor 模式
  - 使用 epoll 作为 IO 多路复用机制
  - 单线程处理所有事件（主线程）

#### Proactor 模式

- **定义**：Proactor 模式是异步 IO 模式，IO 操作由操作系统异步完成。
- **核心思想**：
  - 应用程序发起异步 IO 操作
  - 操作系统完成 IO 操作后，通过回调通知应用程序
  - 应用程序处理完成事件
- **工作流程**：
  1. 应用程序发起异步 IO 操作（如 `aio_read`）
  2. 操作系统在后台执行 IO 操作
  3. IO 操作完成后，操作系统通过回调通知应用程序
  4. 应用程序处理完成事件
- **特点**：
  - **异步 IO**：IO 操作由操作系统异步完成
  - **适合场景**：大量 IO 操作、CPU 密集型任务
- **Linux 异步 IO**：
  - Linux 的异步 IO（AIO）支持不完善
  - Windows 的 IOCP（I/O Completion Port）是典型的 Proactor 实现

### 为什么 Redis 不使用 poll？

- 1. **性能优势不明显**：`poll()` 虽然解决了 `select()` 的文件描述符数量限制，但性能与 `select()` 类似，都是 O(n) 复杂度
- 2. **epoll 更优**：在 Linux 上，`epoll()` 的性能远优于 `poll()`，特别是在大量文件描述符时
- 3. **代码简洁性**：`select()` 作为最后的备选方案，已经足够处理少量连接的情况
- 4. **跨平台考虑**：`select()` 的跨平台支持更好，作为备选方案更合适

### 为什么 Redis 不使用 Proactor？

- 1. **平台支持限制**：
  - **Linux 异步 IO 支持不完善**：Linux 的异步 IO（AIO）实现存在诸多问题
    - `aio_read()` 和 `aio_write()` 只对直接 IO（O_DIRECT）有效，对普通文件描述符支持不佳
    - 网络套接字的异步 IO 支持不完整，很多情况下会退化为同步 IO
    - AIO 的实现存在性能问题和 bug
  - **跨平台兼容性**：Proactor 模式主要依赖操作系统的异步 IO 支持
    - Windows 的 IOCP（I/O Completion Port）是典型的 Proactor 实现，但 Redis 主要运行在 Linux 上
    - 不同平台的异步 IO API 差异很大，难以统一封装

- 2. **Reactor 模式已足够高效**：
  - **epoll 性能优异**：在 Linux 上，`epoll()` 配合 Reactor 模式已经能够实现非常高的性能
    - `epoll()` 是 O(1) 复杂度，只返回就绪的文件描述符
    - 单线程事件驱动可以处理数万并发连接
  - **实现简单**：Reactor 模式使用同步 IO，代码逻辑清晰，易于理解和维护
    - 事件处理函数直接调用 `read()`/`write()`，流程直观
    - 错误处理简单，不需要处理异步 IO 的复杂状态

- 3. **Redis 的业务特点**：
  - **内存操作为主**：Redis 的主要操作都在内存中完成，IO 操作相对较少
    - 命令执行速度很快，IO 不是主要瓶颈
    - 网络 IO 的延迟对整体性能影响较小
  - **单线程模型**：Redis 采用单线程事件驱动模型，Reactor 模式更符合这种设计
    - 避免了异步 IO 带来的复杂状态管理
    - 避免了多线程环境下的同步问题

- 4. **代码复杂度和维护成本**：
  - **异步 IO 的复杂性**：Proactor 模式需要处理异步 IO 的复杂状态
    - 需要管理 IO 操作的上下文信息
    - 错误处理更加复杂（异步错误通知）
    - 调试和问题排查更困难
  - **统一接口困难**：不同平台的异步 IO API 差异很大
    - Windows 的 IOCP、Linux 的 AIO、BSD 的 kqueue 异步模式，API 完全不同
    - 难以像 Reactor 模式那样提供统一的封装接口

- 5. **实际性能考虑**：
  - **网络 IO 的特点**：对于网络 IO，Reactor 模式已经能够充分利用系统资源
    - 非阻塞 IO + epoll 已经能够实现高效的并发处理
    - 异步 IO 的优势主要体现在磁盘 IO 上，对网络 IO 的提升有限
  - **Redis 的使用场景**：Redis 主要用于缓存和消息队列，网络 IO 延迟要求不是极端严格
    - 不需要为了微小的性能提升而引入复杂的异步 IO 实现

## Redis ae 事件驱动框架

- Redis 的 ae（An Event-driven programming library）框架是一个简单的事件驱动编程库，封装了不同平台的 IO 多路复用机制，提供了统一的事件处理接口。为了适配不同的操作系统，Redis 对不同操作系统实现的网络 IO 多路复用函数，都进行了统一的封装，封装后的代码分别通过以下四个文件中实现：
  - ae_epoll.c，对应 Linux 上的 IO 复用函数 epoll；
  - ae_evport.c，对应 Solaris 上的 IO 复用函数 evport；
  - ae_kqueue.c，对应 macOS 或 FreeBSD 上的 IO 复用函数 kqueue；
  - ae_select.c，对应 Linux（或 Windows）的 IO 复用函数 select。

### ae 框架的设计思想

- **统一接口**：通过函数指针和统一的数据结构，屏蔽不同平台的 IO 多路复用差异
- **自动选择**：根据编译时的宏定义，自动选择最优的 IO 多路复用机制
- **事件抽象**：将 IO 事件抽象为文件事件（File Event）和时间事件（Time Event）

### ae 框架的核心数据结构

#### aeEventLoop 事件循环

- `aeEventLoop` 是事件循环的核心数据结构，包含了所有事件处理所需的信息。

```c
// ae.h 第 97-109 行
typedef struct aeEventLoop {
    int maxfd;   //当前注册的最大文件描述符（用于 select）
    int setsize; //最大文件描述符数量
    long long timeEventNextId;
    time_t lastTime;     /* Used to detect system clock skew */
    aeFileEvent *events; // 表示 IO 事件
    aeFiredEvent *fired; //已触发的事件数组
    aeTimeEvent *timeEventHead; // 时间事件链表头
    int stop; // 停止标识
    void *apidata; /* This is used for polling API specific data */
    aeBeforeSleepProc *beforesleep; // 进入事件循环前执行的函数
    aeBeforeSleepProc *aftersleep;  // 退出事件循环后执行的函数
} aeEventLoop;
```

- **字段说明**：
  - `maxfd`：当前注册的最大文件描述符（用于 select）
  - `setsize`：最大文件描述符数量
  - aeFileEvent 类型的指针 *events，表示 IO 事件。之所以类型名称为 aeFileEvent，是因为所有的 IO 事件都会用文件描述符进行标识；
  - aeTimeEvent 类型的指针 *timeEventHead，表示时间事件，即按一定时间周期触发的事件。
  - `fired`：已触发的事件数组
  - `apidata`：平台相关的数据（epoll 的 epfd、select 的 fd_set 等）
  - `beforesleep`、`aftersleep`：事件循环的前置和后置回调

#### aeCreateEventLoop 初始化事件循环

- `aeCreateEventLoop()` 是创建和初始化事件循环的函数，负责分配内存、初始化数据结构，并创建平台相关的 IO 多路复用实例。
- 参数 setsize 的大小，其实是由 server 结构的 maxclients 变量和宏定义 CONFIG_FDSET_INCR 共同决定的。其中，maxclients 变量的值大小，可以在 Redis 的配置文件 redis.conf 中进行定义，默认值是 1000。而宏定义 CONFIG_FDSET_INCR 的大小，等于宏定义 CONFIG_MIN_RESERVED_FDS 的值再加上 96
  - 事件驱动框架监听的 IO 事件数组大小就等于参数 setsize，这样决定了和 Redis server 连接的客户端数量

- 1. aeCreateEventLoop 函数会创建一个 aeEventLoop 结构体类型的变量 eventLoop。然后，该函数会给 eventLoop 的成员变量分配内存空间，比如，按照传入的参数 setsize，给 IO 事件数组和已触发事件数组分配相应的内存空间。此外，该函数还会给 eventLoop 的成员变量赋初始值。
- 2. aeCreateEventLoop 函数会调用 aeApiCreate 函数。aeApiCreate 函数就会调用 epoll_create 创建 epoll 实例，同时会创建 epoll_event 结构的数组，数组大小等于参数 setsize。
  - aeApiCreate 函数是把创建的 epoll 实例描述符和 epoll_event 数组，保存在了 aeApiState 结构体类型的变量 state，紧接着，aeApiCreate 函数把 state 变量赋值给 eventLoop 中的 apidata。这样一来，eventLoop 结构体中就有了 epoll 实例和 epoll_event 数组的信息，这样就可以用来基于 epoll 创建和处理事件了
- 3. aeCreateEventLoop 函数会把所有网络 IO 事件对应文件描述符的掩码，初始化为 AE_NONE，表示暂时不对任何事件进行监听

- 它是这样实现的：
  - 1. **分配事件循环结构体**：使用 `zmalloc` 分配 `aeEventLoop` 结构体内存
  - 2. **分配文件事件数组**：分配大小为 `setsize` 的 `aeFileEvent` 数组，索引为文件描述符
  - 3. **分配已触发事件数组**：分配 `aeFiredEvent` 数组，用于存储就绪的事件
  - 4. **初始化基本字段**：
    - `setsize`：最大文件描述符数量
    - `lastTime`：当前时间（用于检测系统时钟偏移）
    - `timeEventHead`：时间事件链表头（初始化为 NULL）
    - `timeEventNextId`：时间事件 ID 计数器（从 0 开始）
    - `stop`：停止标志（初始化为 0，表示不停止）
    - `maxfd`：最大文件描述符（初始化为 -1）
    - `beforesleep`、`aftersleep`：前置和后置回调（初始化为 NULL）
  - 5. **创建 IO 多路复用实例**：调用 `aeApiCreate()` 创建平台相关的 IO 多路复用实例（epoll/select/kqueue）
  - 6. **初始化文件事件掩码**：将所有文件事件的掩码初始化为 `AE_NONE`，表示未注册任何事件
  - 7. **错误处理**：如果初始化失败，释放已分配的内存

```c
#define CONFIG_MIN_RESERVED_FDS 32
#define CONFIG_FDSET_INCR (CONFIG_MIN_RESERVED_FDS+96)
// ae.c 第 63-97 行
aeEventLoop *aeCreateEventLoop(int setsize) {
    aeEventLoop *eventLoop;
    int i;

    // 1. 分配事件循环结构体内存
    if ((eventLoop = zmalloc(sizeof(*eventLoop))) == NULL) goto err;

    // 2. 分配文件事件数组
    //    - events 数组大小为 setsize，索引为文件描述符
    eventLoop->events = zmalloc(sizeof(aeFileEvent)*setsize);
    // 3. 分配已触发事件数组
    //    - fired 数组用于存储就绪的事件
    eventLoop->fired = zmalloc(sizeof(aeFiredEvent)*setsize);
    if (eventLoop->events == NULL || eventLoop->fired == NULL) goto err;
    
    // 4. 初始化事件循环的基本字段
    eventLoop->setsize = setsize;              // 设置最大文件描述符数量
    eventLoop->lastTime = time(NULL);          // 记录当前时间（用于检测系统时钟偏移）
    eventLoop->timeEventHead = NULL;           // 时间事件链表头初始化为 NULL
    eventLoop->timeEventNextId = 0;            // 时间事件 ID 从 0 开始
    eventLoop->stop = 0;                       // 停止标志初始化为 0（不停止）
    eventLoop->maxfd = -1;                    // 最大文件描述符初始化为 -1
    eventLoop->beforesleep = NULL;            // 前置回调初始化为 NULL
    eventLoop->aftersleep = NULL;             // 后置回调初始化为 NULL
    
    // 5. 创建平台相关的 IO 多路复用实例
    //    - aeApiCreate 封装了 epoll_create/select/kqueue 的调用
    //    - 在 Linux 上会创建 epoll 实例，在其他系统上会初始化相应的机制
    if (aeApiCreate(eventLoop) == -1) goto err;
    
    /* Events with mask == AE_NONE are not set. So let's initialize the
     * vector with it. */
    // 6. 初始化所有文件事件的掩码为 AE_NONE
    //    - 表示所有文件描述符都未注册事件
    for (i = 0; i < setsize; i++)
        eventLoop->events[i].mask = AE_NONE;
    
    return eventLoop;

err:
    // 7. 初始化失败的处理
    //    - 如果 eventLoop 已经分配了空间，则释放掉
    if (eventLoop) {
        zfree(eventLoop->events);
        zfree(eventLoop->fired);
        zfree(eventLoop);
    }
    return NULL;
}
```

#### aeFileEvent 文件事件

- `aeFileEvent` 表示一个文件事件，包含事件类型和处理函数。
  - mask 是用来表示事件类型的掩码。对于网络通信的事件来说，主要有 AE_READABLE、AE_WRITABLE 和 AE_BARRIER 三种类型事件。框架在分发事件时，依赖的就是结构体中的事件类型；
  - rfileProc 和 wfileProce 分别是指向 AE_READABLE 和 AE_WRITABLE 这两类事件的处理函数，也就是 Reactor 模型中的 handler。框架在分发事件后，就需要调用结构体中定义的函数进行事件处理；
  - clientData 是用来指向客户端私有数据的指针。

```c
// ae.h 第 71-76 行
typedef struct aeFileEvent {
    int mask; /* one of AE_(READABLE|WRITABLE|BARRIER) */
    aeFileProc *rfileProc;  // 读事件处理函数
    aeFileProc *wfileProc;  // 写事件处理函数
    void *clientData;        // 客户端数据
} aeFileEvent;
```

- **事件类型**：
  - `AE_READABLE`：可读事件
  - `AE_WRITABLE`：可写事件
  - `AE_BARRIER`：屏障事件（与 WRITABLE 一起使用，确保在 READABLE 之后触发）

#### 文件事件的处理函数

##### aeCreateFileEvent 事件注册

- `aeCreateFileEvent()` 是事件注册函数，用于注册要监听的事件以及相应的事件处理函数。
- 这个函数的参数有 5 个，分别是循环流程结构体 `*eventLoop`、IO 事件对应的文件描述符 `fd`、事件类型掩码 `mask`、事件处理回调函数`*proc`，以及事件私有数据`*clientData`。因为循环流程结构体*eventLoop中有 IO 事件数组，这个数组的元素是 aeFileEvent 类型，所以，每个数组元素都对应记录了一个文件描述符（比如一个套接字）相关联的监听事件类型和回调函数。
- 1. aeCreateFileEvent 函数会先根据传入的文件描述符 fd，在 eventLoop 的 IO 事件数组中，获取该描述符关联的 IO 事件指针变量*fe
- 2. 调用 aeApiAddEvent 函数，添加要监听的事件,实际上会调用调用 epoll_ctl 函数，添加要监听的事件
- **调用时机**：
  - 当 Redis 启动后，服务器程序的 `main` 函数会调用 `initServer` 函数来进行初始化
  - 而在初始化的过程中，`aeCreateFileEvent` 就会被 `initServer` 函数调用，用于注册要监听的事件，以及相应的事件处理函数

- **封装关系**：
  - Linux 提供了 `epoll_ctl` API，用于增加新的观察事件
  - Redis 在此基础上，封装了 `aeApiAddEvent` 函数，对 `epoll_ctl` 进行调用
  - 所以这样一来，`aeCreateFileEvent` 就会调用 `aeApiAddEvent`，然后 `aeApiAddEvent` 再通过调用 `epoll_ctl`，来注册希望监听的事件和相应的处理函数
  - 等到 `aeProcessEvents` 函数捕获到实际事件时，它就会调用注册的函数对事件进行处理了
- **它是这样实现的**：
  - 1. **检查文件描述符范围**：确保文件描述符不超过 `setsize` 限制
  - 2. **获取事件结构体**：从 `events` 数组中获取对应文件描述符的事件结构体
  - 3. **调用平台 API**：调用 `aeApiAddEvent()` 将文件描述符添加到 IO 多路复用机制
    - 在 Linux 上：`aeApiAddEvent()` → `epoll_ctl(EPOLL_CTL_ADD/MOD)`
    - 在 BSD/macOS 上：`aeApiAddEvent()` → `kevent()`
    - 在其他系统上：`aeApiAddEvent()` → `FD_SET()`
  - 4. **更新事件掩码**：将新的事件类型合并到现有掩码中
  - 5. **设置处理函数**：根据事件类型（可读/可写）设置相应的处理函数
  - 6. **保存客户端数据**：保存客户端数据指针（通常指向 `client` 结构体）
  - 7. **更新最大文件描述符**：更新 `maxfd`（用于 `select` 优化）

```c
// ae.c 第 140-159 行
int aeCreateFileEvent(aeEventLoop *eventLoop, int fd, int mask,
        aeFileProc *proc, void *clientData)
{
    // 1. 检查文件描述符是否超出限制
    //    - eventLoop->setsize 是最大文件描述符数量
    if (fd >= eventLoop->setsize) {
        errno = ERANGE;
        return AE_ERR;
    }
    
    // 2. 获取文件描述符对应的事件结构体
    //    - events 数组的索引就是文件描述符
    aeFileEvent *fe = &eventLoop->events[fd];

    // 3. 调用平台相关的 API 添加事件到 IO 多路复用机制
    //    - aeApiAddEvent 封装了 epoll_ctl(EPOLL_CTL_ADD/MOD) 的调用
    //    - 在 Linux 上，这会调用 epoll_ctl 将文件描述符添加到 epoll 实例中
    //    - 在 BSD/macOS 上，这会调用 kevent 将文件描述符添加到 kqueue 中
    //    - 在其他系统上，这会调用 FD_SET 将文件描述符添加到 fd_set 中
    if (aeApiAddEvent(eventLoop, fd, mask) == -1)
        return AE_ERR;
    
    // 4. 更新文件事件的掩码（合并新的事件）
    fe->mask |= mask;
    
    // 5. 设置事件处理函数
    //    - 如果注册了可读事件，设置读事件处理函数
    if (mask & AE_READABLE) fe->rfileProc = proc;
    //    - 如果注册了可写事件，设置写事件处理函数
    if (mask & AE_WRITABLE) fe->wfileProc = proc;
    
    // 6. 保存客户端数据
    //    - clientData 通常是指向 client 结构体的指针
    fe->clientData = clientData;
    
    // 7. 更新最大文件描述符（用于 select）
    //    - select 需要知道最大文件描述符的值
    if (fd > eventLoop->maxfd)
        eventLoop->maxfd = fd;
    
    return AE_OK;
}
```

##### aeDeleteFileEvent 删除文件事件

- `aeDeleteFileEvent()` 用于从事件循环中删除文件事件，取消对文件描述符的监听。
- **它是这样实现的**：
  - 1. **检查文件描述符范围**：确保文件描述符不超过 `setsize` 限制
  - 2. **获取文件事件结构体**：从 `events` 数组中获取对应文件描述符的事件结构体
  - 3. **检查是否已注册**：如果文件描述符未注册任何事件，直接返回
  - 4. **处理 AE_BARRIER 标志**：如果删除可写事件，同时删除 `AE_BARRIER` 标志
  - 5. **调用平台 API**：调用 `aeApiDelEvent()` 从 IO 多路复用机制中删除事件
  - 6. **更新事件掩码**：从现有掩码中移除要删除的事件类型
  - 7. **更新最大文件描述符**：如果删除的是最大文件描述符的事件，需要重新查找并更新 `maxfd`

```c
// ae.c 第 161-181 行
void aeDeleteFileEvent(aeEventLoop *eventLoop, int fd, int mask)
{
    // 1. 检查文件描述符范围
    if (fd >= eventLoop->setsize) return;
    
    // 2. 获取文件事件结构体
    aeFileEvent *fe = &eventLoop->events[fd];
    
    // 3. 如果文件描述符未注册任何事件，直接返回
    if (fe->mask == AE_NONE) return;

    /* We want to always remove AE_BARRIER if set when AE_WRITABLE
     * is removed. */
    // 4. 如果删除可写事件，同时删除 AE_BARRIER 标志
    //    - AE_BARRIER 只与 AE_WRITABLE 一起使用才有意义
    if (mask & AE_WRITABLE) mask |= AE_BARRIER;

    // 5. 调用平台相关的 API 删除事件
    //    - aeApiDelEvent 封装了 epoll_ctl(EPOLL_CTL_DEL/MOD) 的调用
    aeApiDelEvent(eventLoop, fd, mask);
    
    // 6. 更新文件事件的掩码（移除要删除的事件）
    fe->mask = fe->mask & (~mask);
    
    // 7. 更新最大文件描述符（如果删除的是最大文件描述符的事件）
    if (fd == eventLoop->maxfd && fe->mask == AE_NONE) {
        /* Update the max fd */
        int j;
        // 7.1 从后往前查找最大的已注册文件描述符
        for (j = eventLoop->maxfd-1; j >= 0; j--)
            if (eventLoop->events[j].mask != AE_NONE) break;
        // 7.2 更新 maxfd
        eventLoop->maxfd = j;
    }
}
```

##### aeGetFileEvents 获取文件事件

- `aeGetFileEvents()` 用于获取文件描述符已注册的事件类型。

```c
// ae.c 第 183-188 行
int aeGetFileEvents(aeEventLoop *eventLoop, int fd) {
    // 1. 检查文件描述符范围
    if (fd >= eventLoop->setsize) return 0;
    
    // 2. 获取文件事件结构体
    aeFileEvent *fe = &eventLoop->events[fd];

    // 3. 返回事件掩码（AE_READABLE、AE_WRITABLE 等）
    return fe->mask;
}
```

#### Redis 中的 IO 事件处理函数

- Redis 在实际使用中，为不同的 IO 事件注册了不同的处理函数：
  - **监听套接字的读事件**：`acceptTcpHandler`（TCP）和 `acceptUnixHandler`（Unix Socket）
  - **客户端连接的读事件**：`readQueryFromClient`
  - **客户端连接的写事件**：`sendReplyToClient`

##### acceptTcpHandler 连接事件

- `acceptTcpHandler()` 是监听套接字的读事件处理函数，用于接受客户端的 TCP 连接请求。
- **它是这样实现的**：
  - 1. **循环接受连接**：每次最多接受 `MAX_ACCEPTS_PER_CALL` 个连接，避免阻塞事件循环
  - 2. **接受 TCP 连接**：调用 `anetTcpAccept()` 接受连接，获取客户端文件描述符、IP 地址和端口
  - 3. **错误处理**：如果接受失败且不是 `EWOULDBLOCK`（非阻塞模式下的正常情况），记录警告日志
  - 4. **记录连接信息**：记录接受的客户端 IP 和端口
  - 5. **处理连接**：调用 `acceptCommonHandler()` 进行通用处理
    - 创建客户端结构体（`createClient()`）
    - 设置非阻塞模式
    - 注册读事件（`aeCreateFileEvent(fd, AE_READABLE, readQueryFromClient, client)`）

- **调用时机**：
  - 在 `initServer()` 中，为每个监听 IP 的套接字注册了 `AE_READABLE` 事件，处理函数为 `acceptTcpHandler`
  - 当有客户端连接到服务器监听的 IP 和端口时，事件驱动框架会检测到连接事件，然后调用 `acceptTcpHandler` 函数

```c
// networking.c 第 752-772 行
// 真正处理redis client连接的回调函数
// 也就是接收TCP连接请求
void acceptTcpHandler(aeEventLoop *el, int fd, void *privdata, int mask) {
    int cport, cfd, max = MAX_ACCEPTS_PER_CALL;
    char cip[NET_IP_STR_LEN];
    UNUSED(el);
    UNUSED(mask);
    UNUSED(privdata);

    // 1. 循环接受连接，每次最多接受 MAX_ACCEPTS_PER_CALL 个连接
    //    - 这样可以避免在大量连接请求时阻塞事件循环
    while(max--) {
        // 2. 调用底层库接受 TCP 连接
        //    - anetTcpAccept 封装了 accept() 系统调用
        //    - 返回客户端文件描述符、IP 地址和端口
        cfd = anetTcpAccept(server.neterr, fd, cip, sizeof(cip), &cport);
        
        // 3. 检查接受连接是否成功
        if (cfd == ANET_ERR) {
            // 3.1 如果错误不是 EWOULDBLOCK（非阻塞模式下的正常情况），记录警告
            if (errno != EWOULDBLOCK)
                serverLog(LL_WARNING,
                    "Accepting client connection: %s", server.neterr);
            return;
        }
        
        // 4. 记录接受的连接信息
        serverLog(LL_VERBOSE,"Accepted %s:%d", cip, cport);
        
        // 5. 调用通用连接处理函数
        //    - acceptCommonHandler 会创建客户端、设置非阻塞、注册读事件等
        acceptCommonHandler(cfd, 0, cip);
    }
}
```

##### readQueryFromClient 读事件

- `readQueryFromClient()` 是客户端连接的读事件处理函数，用于从客户端读取命令数据。

- **调用时机**：
  - 在 `createClient()` 中，为新创建的客户端注册了 `AE_READABLE` 事件，处理函数为 `readQueryFromClient`
  - 当客户端发送数据时，事件驱动框架会检测到读事件，然后调用 `readQueryFromClient` 函数

```c
// networking.c 第 1550-1623 行
void readQueryFromClient(aeEventLoop *el, int fd, void *privdata, int mask) {
    client *c = (client*) privdata;
    int nread, readlen;
    size_t qblen;
    UNUSED(el);
    UNUSED(mask);

    // 1. 设置读取长度（默认值）
    readlen = PROTO_IOBUF_LEN;
    
    // 2. 如果是多批量请求且正在处理大参数，优化读取长度
    //    - 尽量让查询缓冲区包含完整的对象字符串，避免复制缓冲区
    if (c->reqtype == PROTO_REQ_MULTIBULK && c->multibulklen && c->bulklen != -1
        && c->bulklen >= PROTO_MBULK_BIG_ARG)
    {
        ssize_t remaining = (size_t)(c->bulklen+2)-sdslen(c->querybuf);
        if (remaining > 0 && remaining < readlen) readlen = remaining;
    }

    // 3. 获取当前查询缓冲区长度
    qblen = sdslen(c->querybuf);
    
    // 4. 更新查询缓冲区峰值
    if (c->querybuf_peak < qblen) c->querybuf_peak = qblen;
    
    // 5. 为查询缓冲区预分配空间
    c->querybuf = sdsMakeRoomFor(c->querybuf, readlen);
    
    // 6. 从套接字读取数据到查询缓冲区
    //    - 操作系统底层从 socket 中读取数据到客户端输入缓冲区
    nread = read(fd, c->querybuf+qblen, readlen);
    
    // 7. 处理读取结果
    if (nread == -1) {
        // 7.1 读取错误
        if (errno == EAGAIN) {
            // EAGAIN 表示暂时没有数据可读（非阻塞模式），直接返回
            return;
        } else {
            // 其他错误，记录日志并释放客户端
            serverLog(LL_VERBOSE, "Reading from client: %s",strerror(errno));
            freeClient(c);
            return;
        }
    } else if (nread == 0) {
        // 7.2 客户端关闭连接（EOF）
        serverLog(LL_VERBOSE, "Client closed connection");
        freeClient(c);
        return;
    } else if (c->flags & CLIENT_MASTER) {
        // 7.3 如果是主节点连接，追加到待处理缓冲区

        c->pending_querybuf = sdscatlen(c->pending_querybuf,
                                        c->querybuf+qblen,nread);
    }

    // 8. 更新 SDS 结构体的长度
    sdsIncrLen(c->querybuf,nread);
    
    // 9. 记录最后交互时间戳
    c->lastinteraction = server.unixtime;
    
    // 10. 如果是主节点连接，更新复制偏移量
    if (c->flags & CLIENT_MASTER) c->read_reploff += nread;
    
    // 11. 更新网络输入字节统计
    server.stat_net_input_bytes += nread;
    
    // 12. 检查查询缓冲区是否超过最大长度限制
    if (sdslen(c->querybuf) > server.client_max_querybuf_len) {
        sds ci = catClientInfoString(sdsempty(),c), bytes = sdsempty();
        bytes = sdscatrepr(bytes,c->querybuf,64);
        serverLog(LL_WARNING,"Closing client that reached max query buffer length: %s (qbuf initial bytes: %s)", ci, bytes);
        sdsfree(ci);
        sdsfree(bytes);
        freeClient(c);
        return;
    }

    // 13. 处理输入缓冲区
    //    - processInputBufferAndReplicate 会解析命令、执行命令、处理复制等
    processInputBufferAndReplicate(c);
}
```

- **它是这样实现的**：
  - 1. **设置读取长度**：默认使用 `PROTO_IOBUF_LEN`，对于大参数会优化读取长度
  - 2. **优化读取长度**：如果是多批量请求且正在处理大参数，尽量读取完整对象
  - 3. **预分配缓冲区空间**：使用 `sdsMakeRoomFor()` 为查询缓冲区预分配空间
  - 4. **读取数据**：调用 `read()` 从套接字读取数据到查询缓冲区
  - 5. **处理读取结果**：
    - 错误（`nread == -1`）：如果是 `EAGAIN` 直接返回，其他错误释放客户端
    - 连接关闭（`nread == 0`）：释放客户端
    - 主节点连接：追加到待处理缓冲区
  - 6. **更新状态**：更新 SDS 长度、最后交互时间、复制偏移量、统计信息
  - 7. **检查缓冲区限制**：如果超过最大长度，释放客户端
  - 8. **处理输入缓冲区**：调用 `processInputBufferAndReplicate()` 解析和执行命令

##### sendReplyToClient 发送回复给客户端

- `sendReplyToClient()` 是客户端连接的写事件处理函数，用于向客户端发送命令执行结果。

- **调用时机**：
  - 当命令执行完成后，如果需要发送回复但输出缓冲区已满，会注册 `AE_WRITABLE` 事件，处理函数为 `sendReplyToClient`
  - 当套接字可写时，事件驱动框架会检测到写事件，然后调用 `sendReplyToClient` 函数

```c
// networking.c 第 1091-1097 行
/* Write event handler. Just send data to the client. */
// 这个函数事件的回调用于给客户端直接发送数据
void sendReplyToClient(aeEventLoop *el, int fd, void *privdata, int mask) {
    UNUSED(el);
    UNUSED(mask);
    // 1. 调用 writeToClient 发送数据
    //    - handler_installed 参数为 1，表示事件处理器已安装
    writeToClient(fd, privdata, 1);
}
```

- **它是这样实现的**：
  - 1. **调用底层发送函数**：调用 `writeToClient()` 实际发送数据
  - 2. **参数说明**：`handler_installed` 参数为 1，表示写事件处理器已安装，发送完成后会删除写事件

##### writeToClient 实际发送数据

- `writeToClient()` 是实际向客户端发送数据的函数，处理输出缓冲区的发送逻辑。
- **它是这样实现的**：
  - 1. **循环发送数据**：只要客户端有待发送的回复，就继续发送
  - 2. **发送固定缓冲区**：如果固定缓冲区（`c->buf`）有数据，先发送固定缓冲区
  - 3. **发送回复链表**：如果固定缓冲区为空，发送回复链表（`c->reply`）中的数据
  - 4. **限制发送量**：每次事件最多发送 `NET_MAX_WRITES_PER_EVENT` 字节，避免单个客户端占用过多时间
  - 5. **处理写入错误**：
    - `EAGAIN`：暂时无法写入（非阻塞模式），正常情况
    - 其他错误：记录日志并释放客户端
  - 6. **更新状态**：更新最后交互时间、统计信息
  - 7. **清理工作**：
    - 如果没有待发送的数据，删除写事件（`aeDeleteFileEvent`）
    - 如果设置了关闭标志，释放客户端

```c
// networking.c 第 999-1089 行
int writeToClient(int fd, client *c, int handler_installed) {
    ssize_t nwritten = 0, totwritten = 0;
    size_t objlen;
    clientReplyBlock *o;

    // 1. 循环发送，直到没有待发送的数据
    while(clientHasPendingReplies(c)) {
        // 2. 如果固定缓冲区有数据，先发送固定缓冲区
        if (c->bufpos > 0) {
            // 2.1 发送固定缓冲区中未发送的数据
            nwritten = write(fd, c->buf+c->sentlen, c->bufpos-c->sentlen);
            if (nwritten <= 0) break;
            
            // 2.2 更新已发送长度
            c->sentlen += nwritten;
            totwritten += nwritten;

            /* If the buffer was sent, set bufpos to zero to continue with
             * the remainder of the reply. */
            // 2.3 如果固定缓冲区发送完毕，重置状态
            if ((int)c->sentlen == c->bufpos) {
                c->bufpos = 0;
                c->sentlen = 0;
            }
        } else {
            // 3. 如果固定缓冲区为空，发送回复链表中的数据
            o = listNodeValue(listFirst(c->reply));
            objlen = o->used;

            // 3.1 如果对象长度为 0，删除空节点
            if (objlen == 0) {
                c->reply_bytes -= o->size;
                listDelNode(c->reply, listFirst(c->reply));
                continue;
            }

            // 3.2 发送回复对象中未发送的数据
            nwritten = write(fd, o->buf + c->sentlen, objlen - c->sentlen);
            if (nwritten <= 0) break;
            
            // 3.3 更新已发送长度
            c->sentlen += nwritten;
            totwritten += nwritten;

            /* If we fully sent the object on head go to the next one */
            // 3.4 如果对象发送完毕，删除节点并重置状态
            if (c->sentlen == objlen) {
                c->reply_bytes -= o->size;
                listDelNode(c->reply, listFirst(c->reply));
                c->sentlen = 0;
                /* If there are no longer objects in the list, we expect
                 * the count of reply bytes to be exactly zero. */
                if (listLength(c->reply) == 0)
                    serverAssert(c->reply_bytes == 0);
            }
        }

        // 4. 限制每次事件发送的数据量
        //    - 避免单个客户端占用过多时间，影响其他客户端
        //    - 如果超过内存限制，或者是从节点/监控客户端，则不受限制
        if (totwritten > NET_MAX_WRITES_PER_EVENT &&
            (server.maxmemory == 0 ||
             zmalloc_used_memory() < server.maxmemory) &&
            !(c->flags & CLIENT_SLAVE)) break;
    }
    
    // 5. 更新网络输出字节统计
    server.stat_net_output_bytes += totwritten;
    
    // 6. 处理写入错误
    if (nwritten == -1) {
        if (errno == EAGAIN) {
            // 6.1 EAGAIN 表示暂时无法写入（非阻塞模式），正常情况
            nwritten = 0;
        } else {
            // 6.2 其他错误，记录日志并释放客户端
            serverLog(LL_VERBOSE,
                "Error writing to client: %s", strerror(errno));
            freeClient(c);
            return C_ERR;
        }
    }
    
    // 7. 更新最后交互时间（非主节点客户端）
    if (totwritten > 0) {

        if (!(c->flags & CLIENT_MASTER)) c->lastinteraction = server.unixtime;
    }
    
    // 8. 如果没有待发送的数据，删除写事件
    if (!clientHasPendingReplies(c)) {
        c->sentlen = 0;
        // 8.1 如果事件处理器已安装，删除写事件
        if (handler_installed) aeDeleteFileEvent(server.el, c->fd, AE_WRITABLE);

        /* Close connection after entire reply has been sent. */
        // 8.2 如果设置了关闭标志，释放客户端
        if (c->flags & CLIENT_CLOSE_AFTER_REPLY) {
            freeClient(c);
            return C_ERR;
        }
    }
    return C_OK;
}
```

#### aeTimeEvent 时间事件

- `aeTimeEvent` 表示一个时间事件，包含触发时间、处理函数等信息。

```c
// ae.h 第 79-88 行
typedef struct aeTimeEvent {
    long long id; //时间事件的唯一标识符
    long when_sec; /* 事件到达的秒级时间戳 seconds */
    long when_ms; /* 事件到达的毫秒级时间戳 milliseconds */
    aeTimeProc *timeProc; // 时间事件触发后的处理函数
    aeEventFinalizerProc *finalizerProc; // 事件结束后的回调函数
    void *clientData; // 事件相关的私有数据
    struct aeTimeEvent *prev; // 时间事件链表的前向指针
    struct aeTimeEvent *next; // 时间事件链表的后向指针
} aeTimeEvent;
```

- **字段说明**：
  - `id`：时间事件的唯一标识符
  - `when_sec`、`when_ms`：事件触发的时间戳（秒和毫秒）
  - `timeProc`：时间事件触发后的处理函数
  - `finalizerProc`：事件结束后的回调函数（用于清理资源）
  - `clientData`：事件相关的私有数据
  - `prev`、`next`：时间事件链表的前向和后向指针（双向链表）

#### 时间事件的处理函数

##### aeCreateTimeEvent 创建时间事件

- `aeCreateTimeEvent()` 用于创建并注册一个时间事件，将事件添加到时间事件链表中。
- milliseconds是所创建时间事件的触发时间距离当前时间的时长，是用毫秒表示的。*proc是所创建时间事件触发后的回调函数。
- aeCreateTimeEvent 函数的执行逻辑不复杂，主要就是创建一个时间事件的变量 te，对它进行初始化，并把它插入到框架循环流程结构体 eventLoop 中的时间事件链表中。在这个过程中，aeCreateTimeEvent 函数会调用 aeAddMillisecondsToNow 函数，根据传入的 milliseconds 参数，计算所创建时间事件具体的触发时间戳，并赋值给 te。
- 实际上，Redis server 在初始化时，除了创建监听的 IO 事件外，也会调用 aeCreateTimeEvent 函数创建时间事件

- **它是这样实现的**：
  - 1. **生成时间事件 ID**：使用 `timeEventNextId` 作为唯一标识符，并递增
  - 2. **分配内存**：使用 `zmalloc` 分配 `aeTimeEvent` 结构体内存
  - 3. **初始化字段**：
    - `id`：时间事件 ID
    - `when_sec`、`when_ms`：计算触发时间（当前时间 + 延迟时间）
    - `timeProc`：设置处理函数
    - `finalizerProc`：设置结束回调函数
    - `clientData`：设置私有数据
  - 4. **插入链表**：将时间事件插入到双向链表的头部
  - 5. **返回 ID**：返回时间事件 ID，用于后续删除

```c
// ae.c 第 213-233 行
long long aeCreateTimeEvent(aeEventLoop *eventLoop, long long milliseconds,
        aeTimeProc *proc, void *clientData,
        aeEventFinalizerProc *finalizerProc)
{
    // 1. 生成时间事件 ID
    //    - 使用 timeEventNextId 作为唯一标识符，并递增
    long long id = eventLoop->timeEventNextId++;
    aeTimeEvent *te;

    // 2. 分配时间事件结构体内存
    te = zmalloc(sizeof(*te));
    if (te == NULL) return AE_ERR;
    
    // 3. 初始化时间事件字段
    te->id = id;
    // 3.1 计算触发时间（当前时间 + 延迟时间）
    aeAddMillisecondsToNow(milliseconds, &te->when_sec, &te->when_ms);
    te->timeProc = proc;                    // 设置处理函数
    te->finalizerProc = finalizerProc;      // 设置结束回调函数
    te->clientData = clientData;            // 设置私有数据
    
    // 4. 将时间事件插入到链表头部
    //    - 使用双向链表，新事件插入到头部
    te->prev = NULL;
    te->next = eventLoop->timeEventHead;
    if (te->next)
        te->next->prev = te;
    eventLoop->timeEventHead = te;
    
    // 5. 返回时间事件 ID（用于后续删除）
    return id;
}
```

##### aeDeleteTimeEvent 删除时间事件

- `aeDeleteTimeEvent()` 用于删除时间事件，采用延迟删除策略（标记为删除，在 `processTimeEvents` 中实际删除）。
- **它是这样实现的**：
  - 1. **遍历链表**：从 `timeEventHead` 开始遍历时间事件链表
  - 2. **查找匹配 ID**：查找 `id` 匹配的时间事件
  - 3. **标记删除**：将时间事件的 `id` 设置为 `AE_DELETED_EVENT_ID`（延迟删除策略）
    - 不立即删除节点，而是在 `processTimeEvents` 中实际删除
    - 这样可以避免在遍历链表时删除节点导致的问题
  - 4. **返回结果**：找到并标记成功返回 `AE_OK`，未找到返回 `AE_ERR`

```c
// ae.c 第 235-246 行
int aeDeleteTimeEvent(aeEventLoop *eventLoop, long long id)
{
    // 1. 遍历时间事件链表
    aeTimeEvent *te = eventLoop->timeEventHead;
    while(te) {
        // 2. 查找匹配的时间事件 ID
        if (te->id == id) {
            // 3. 标记为删除（延迟删除策略）
            //    - 不立即删除，而是在 processTimeEvents 中实际删除
            //    - 这样可以避免在遍历链表时删除节点导致的问题
            te->id = AE_DELETED_EVENT_ID;
            return AE_OK;
        }
        te = te->next;
    }
    // 4. 如果未找到，返回错误
    return AE_ERR; /* NO event with the specified ID found */
}
```

##### processTimeEvents 处理时间事件

- `processTimeEvents()` 是处理时间事件的核心函数，遍历时间事件链表，处理到期的事件，并删除标记为删除的事件。
- 它的基本流程就是从时间事件链表上逐一取出每一个事件，然后根据当前时间判断该事件的触发时间戳是否已满足。如果已满足，那么就调用该事件对应的回调函数进行处理。这样一来，周期性任务就能在不断循环执行的 aeProcessEvents 函数中，得到执行了

- **它是这样实现的**：
  - 1. **检测系统时钟偏移**：如果系统时钟被调回到过去，强制所有时间事件立即处理
  - 2. **遍历时间事件链表**：从 `timeEventHead` 开始遍历所有时间事件
  - 3. **删除标记为删除的事件**：
    - 如果事件的 `id` 为 `AE_DELETED_EVENT_ID`，从链表中移除
    - 调用 `finalizerProc` 结束回调函数（如果设置了）
    - 释放内存
  - 4. **跳过新创建的事件**：跳过在当前迭代中创建的时间事件（避免重复处理）
  - 5. **获取当前时间**：调用 `aeGetTime()` 获取当前时间
  - 6. **检查事件是否到期**：如果当前时间 >= 触发时间，则事件到期
  - 7. **执行处理函数**：调用 `timeProc` 处理函数
  - 8. **根据返回值决定后续操作**：
    - 如果返回值不是 `AE_NOMORE`：表示需要继续执行，返回值表示下次执行的延迟时间（毫秒），更新触发时间
    - 如果返回值是 `AE_NOMORE`：表示事件执行完毕，标记为删除

```c
// ae.c 第 274-352 行
/* Process time events */
static int processTimeEvents(aeEventLoop *eventLoop) {
    int processed = 0;
    aeTimeEvent *te;
    long long maxId;
    time_t now = time(NULL);

    //    - 如果系统时钟被调回到过去，会导致时间事件延迟
    //    - 检测到时钟偏移时，强制所有时间事件立即处理
    if (now < eventLoop->lastTime) {
        te = eventLoop->timeEventHead;
        while(te) {
            te->when_sec = 0;  // 设置为 0，表示立即触发
            te = te->next;
        }
    }
    eventLoop->lastTime = now;

    // 2. 遍历时间事件链表
    te = eventLoop->timeEventHead;
    maxId = eventLoop->timeEventNextId-1;
    while(te) {
        long now_sec, now_ms;
        long long id;

        /* Remove events scheduled for deletion. */
        // 3. 删除标记为删除的时间事件
        if (te->id == AE_DELETED_EVENT_ID) {
            aeTimeEvent *next = te->next;
            // 3.1 从链表中移除节点
            if (te->prev)
                te->prev->next = te->next;
            else
                eventLoop->timeEventHead = te->next;
            if (te->next)
                te->next->prev = te->prev;
            // 3.2 调用结束回调函数（如果设置了）
            if (te->finalizerProc)
                te->finalizerProc(eventLoop, te->clientData);
            // 3.3 释放内存
            zfree(te);
            te = next;
            continue;
        }

        // 4. 跳过在当前迭代中创建的时间事件
        //    - 避免处理在本次迭代中刚创建的事件
        if (te->id > maxId) {
            te = te->next;
            continue;
        }
        
        // 5. 获取当前时间
        aeGetTime(&now_sec, &now_ms);
        
        // 6. 检查时间事件是否到期
        //    - 如果当前时间 >= 触发时间，则事件到期
        if (now_sec > te->when_sec ||
            (now_sec == te->when_sec && now_ms >= te->when_ms))
        {
            int retval;

            id = te->id;
            // 7. 执行时间事件处理函数
            retval = te->timeProc(eventLoop, id, te->clientData);
            processed++;
            
            // 8. 根据返回值决定是否继续执行
            if (retval != AE_NOMORE) {
                // 8.1 如果返回值不是 AE_NOMORE，表示需要继续执行
                //     - 返回值表示下次执行的延迟时间（毫秒）
                aeAddMillisecondsToNow(retval, &te->when_sec, &te->when_ms);
            } else {
                // 8.2 如果返回值是 AE_NOMORE，表示事件执行完毕，标记为删除
                te->id = AE_DELETED_EVENT_ID;
            }
        }
        te = te->next;
    }
    return processed;  // 返回处理的事件数量
}
```

### aeMain 主循环

- `aeMain()` 是事件驱动框架的主循环函数，负责不断判断事件循环的停止标记，并调用 `aeProcessEvents()` 处理事件。

- 工作流程：
  - 如果事件循环的停止标记被设置为 `true`（`eventLoop->stop == 1`），那么针对事件捕获、分发和处理的整个主循环就停止了
  - 否则，主循环会一直执行，不断调用 `aeProcessEvents()` 处理事件
- 它是这样实现的：
  - 1. 初始化停止标志：将 `eventLoop->stop` 设置为 0（表示不停止）
  - 2. 进入主循环：不断判断 `eventLoop->stop` 标志
  - 3. 执行前置回调：如果设置了 `beforesleep` 回调，在每次循环前执行
  - 4. 处理事件：调用 `aeProcessEvents()` 处理所有类型的事件
  - 5. 循环继续：如果 `stop` 标志为 0，继续下一轮循环

```c
// ae.c 第 521-530 行
/**
 * 事件驱动框架入口
 * @param eventLoop 事件循环结构体指针
 */
void aeMain(aeEventLoop *eventLoop) {
    // 1. 将事件循环的 stop 标志设置为 0（表示不停止）
    //    - stop 标志用于控制事件循环的退出
    //    - 当需要关闭服务器时，会将 stop 设置为 1，循环退出
    eventLoop->stop = 0;
    
    // 2. 主循环：不断处理事件，直到 stop 标志被设置为 1
    while (!eventLoop->stop) {
        // 2.1 如果设置了 beforesleep 回调，在每次循环前执行
        //     - beforesleep 回调用于处理客户端输入、执行命令等
        //     - 这是 Redis 处理客户端请求的关键步骤
        if (eventLoop->beforesleep != NULL) {
            eventLoop->beforesleep(eventLoop);
        }
        
        // 2.2 处理所有类型的事件
        //     - AE_ALL_EVENTS：处理所有类型的事件（文件事件和时间事件）
        //     - AE_CALL_AFTER_SLEEP：在休眠后调用 aftersleep 回调
        //     - aeProcessEvents 会：
        //       * 调用 IO 多路复用函数（epoll_wait/select）等待事件
        //       * 处理就绪的文件事件（客户端连接、数据读写）
        //       * 处理到期的时间事件（定时任务）
        //       * 调用 aftersleep 回调（处理输出缓冲区等）
        aeProcessEvents(eventLoop, AE_ALL_EVENTS|AE_CALL_AFTER_SLEEP);
    }
}
```

### beforeSleep 事件循环前置回调

- `beforeSleep()` 是事件循环的前置回调函数，在每次进入事件循环主循环前（在调用 IO 多路复用函数等待事件之前）执行。

- **调用时机**：
  - 在 `aeMain()` 的主循环中，每次调用 `aeProcessEvents()` 之前，会先调用 `beforeSleep()` 回调
  - 在 `initServer()` 中，通过 `aeSetBeforeSleepProc(server.el, beforeSleep)` 设置

- **主要功能**：
  - 处理集群相关操作
  - 快速过期键清理
  - 处理复制相关操作
  - 处理被阻塞的客户端
  - 刷新 AOF 缓冲区
  - **处理待写入的客户端**（调用 `handleClientsWithPendingWrites()`）

- **它是这样实现的**：
  - 1. **处理集群操作**：如果启用了集群模式，调用 `clusterBeforeSleep()` 处理集群相关操作
  - 2. **快速过期键清理**：运行快速过期周期，清理过期键（只在主节点上执行）
  - 3. **处理复制操作**：如果有客户端被阻塞，向所有从节点发送 ACK 请求
  - 4. **处理同步复制客户端**：解除因同步复制（WAIT 命令）而阻塞的客户端
  - 5. **处理模块阻塞客户端**：检查是否有被模块实现的阻塞命令解除阻塞的客户端
  - 6. **处理解除阻塞的客户端**：尝试处理刚解除阻塞的客户端的待处理命令
  - 7. **刷新 AOF 缓冲区**：将 AOF 缓冲区中的数据写入磁盘
  - 8. **处理待写入的客户端**：调用 `handleClientsWithPendingWrites()` 处理有待发送输出缓冲区的客户端
  - 9. **释放模块 GIL**：在进入休眠前，释放模块的全局解释器锁

```c
// server.c 第 1392-1444 行
void beforeSleep(struct aeEventLoop *eventLoop) {
    UNUSED(eventLoop);
    // 1. 处理集群相关操作
    //    - 处理故障转移、更新集群状态、保存配置等
    if (server.cluster_enabled) clusterBeforeSleep();

    // 2. 快速过期键清理
    //    - 运行快速过期周期，清理过期键
    //    - 只在主节点上执行（server.masterhost == NULL）
    if (server.active_expire_enabled && server.masterhost == NULL)
        activeExpireCycle(ACTIVE_EXPIRE_CYCLE_FAST);

    // 3. 处理复制相关操作
    //    - 如果在上一次事件循环迭代中有客户端被阻塞，向所有从节点发送 ACK 请求
    if (server.get_ack_from_slaves) {
        robj *argv[3];
        argv[0] = createStringObject("REPLCONF",8);
        argv[1] = createStringObject("GETACK",6);
        argv[2] = createStringObject("*",1); /* Not used argument. */
        replicationFeedSlaves(server.slaves, server.slaveseldb, argv, 3);
        decrRefCount(argv[0]);
        decrRefCount(argv[1]);
        decrRefCount(argv[2]);
        server.get_ack_from_slaves = 0;
    }

    // 4. 处理同步复制的客户端
    //    - 解除所有因同步复制（WAIT 命令）而阻塞的客户端
    if (listLength(server.clients_waiting_acks))
        processClientsWaitingReplicas();

    // 5. 处理模块阻塞的客户端
    //    - 检查是否有被模块实现的阻塞命令解除阻塞的客户端
    moduleHandleBlockedClients();

    // 6. 处理刚解除阻塞的客户端
    //    - 尝试处理刚解除阻塞的客户端的待处理命令
    if (listLength(server.unblocked_clients))
        processUnblockedClients();

    // 7. 刷新 AOF 缓冲区到磁盘
    //    - 将 AOF 缓冲区中的数据写入磁盘
    flushAppendOnlyFile(0);

    // 8. 处理待写入的客户端
    //    - 处理有待发送输出缓冲区的客户端
    //    - 这是 beforeSleep 中最重要的操作之一
    handleClientsWithPendingWrites();

    // 9. 释放模块的 GIL（Global Interpreter Lock）
    //    - 在进入休眠前，让模块线程访问数据集
    if (moduleCount()) moduleReleaseGIL();
}
```

### handleClientsWithPendingWrites 处理待写入客户端

- `handleClientsWithPendingWrites()` 用于处理有待发送输出缓冲区的客户端，尝试在进入事件循环前先发送数据，避免注册写事件。

- **调用时机**：
  - 在 `beforeSleep()` 中被调用
  - 在进入事件循环前，尝试先同步发送数据，如果发送不完再注册写事件

- **设计目的**：
  - **优化性能**：在进入事件循环前先尝试发送数据，避免不必要的系统调用
  - **减少事件注册**：如果数据能够一次性发送完，就不需要注册写事件
  - **提高响应速度**：减少延迟，提高客户端的响应速度

  - **设计优势**：
  - **减少系统调用**：在进入事件循环前先尝试发送数据，避免不必要的写事件注册
  - **提高性能**：如果数据能够一次性发送完，就不需要等待写事件，减少延迟
  - **优化资源使用**：减少事件注册的数量，降低事件循环的负担

- **它是这样实现的**：
  - 1. **遍历待写入客户端列表**：从 `server.clients_pending_write` 列表中遍历所有待写入的客户端
  - 2. **清除标志并移除**：清除客户端的 `CLIENT_PENDING_WRITE` 标志，并从列表中移除
  - 3. **检查客户端保护状态**：如果客户端被保护（`CLIENT_PROTECTED`），跳过处理
  - 4. **尝试同步写入**：调用 `writeToClient()` 尝试同步写入数据
    - `handler_installed` 参数为 0，表示写事件处理器尚未安装
    - 如果数据能够一次性发送完，就不需要注册写事件
  - 5. **注册写事件（如果需要）**：
    - 如果同步写入后仍有待发送的数据，需要注册写事件
    - 如果 AOF 策略是 `always`，设置 `AE_BARRIER` 标志，确保在同一个事件循环迭代中不会同时处理读和写事件
    - 注册写事件，处理函数为 `sendReplyToClient`
    - 如果注册失败，异步释放客户端

```c
// networking.c 第 1103-1143 行
/* This function is called just before entering the event loop, in the hope
 * we can just write the replies to the client output buffer without any
 * need to use a syscall in order to install the writable event handler,
 * get it called, and so forth. */
int handleClientsWithPendingWrites(void) {
    listIter li;
    listNode *ln;
    int processed = listLength(server.clients_pending_write);

    // 1. 遍历待写入客户端列表
    listRewind(server.clients_pending_write, &li);
    while((ln = listNext(&li))) {
        client *c = listNodeValue(ln);
        
        // 2. 清除待写入标志并从列表中移除
        c->flags &= ~CLIENT_PENDING_WRITE;
        listDelNode(server.clients_pending_write, ln);

        // 3. 如果客户端被保护，跳过处理
        //    - 被保护的客户端不应该触发写错误或重新创建处理器
        if (c->flags & CLIENT_PROTECTED) continue;

        // 4. 尝试同步写入数据到客户端套接字
        //    - handler_installed 参数为 0，表示写事件处理器尚未安装
        //    - 如果写入成功且数据发送完毕，writeToClient 会返回 C_OK
        //    - 如果写入失败或数据未发送完毕，writeToClient 会返回 C_ERR 或仍有待发送数据
        if (writeToClient(c->fd, c, 0) == C_ERR) continue;

        /* If after the synchronous writes above we still have data to
         * output to the client, we need to install the writable handler. */
        // 5. 如果同步写入后仍有待发送的数据，需要注册写事件
        if (clientHasPendingReplies(c)) {
            int ae_flags = AE_WRITABLE;
            
            // 5.1 如果 AOF 策略是 always，设置 AE_BARRIER 标志
            //     - 确保在同一个事件循环迭代中，不会同时处理读和写事件
            //     - 这样可以在接收查询和服务客户端之间调用 beforeSleep() 执行 AOF fsync
            if (server.aof_state == AOF_ON &&
                server.aof_fsync == AOF_FSYNC_ALWAYS)
            {
                ae_flags |= AE_BARRIER;
            }
            
            // 5.2 注册写事件
            //     - 如果注册失败，异步释放客户端
            if (aeCreateFileEvent(server.el, c->fd, ae_flags,
                sendReplyToClient, c) == AE_ERR)
            {
                freeClientAsync(c);
            }
        }
    }
    return processed;  // 返回处理的客户端数量
}
```

### aeProcessEvents 事件捕获与分发

- `aeProcessEvents()` 是事件捕获与分发的核心函数，实现的主要功能包括捕获事件、判断事件类型和调用具体的事件处理函数，从而实现事件的处理。
- 从 aeProcessEvents 函数的主体结构中，我们可以看到主要有三个 if 条件分支：
- **三种情况**：
  - **情况一**：既没有时间事件，也没有网络事件
  - **情况二**：有 IO 事件或者有需要紧急处理的时间事件
  - **情况三**：只有普通的时间事件

- **处理逻辑**：
  - 对于**第一种情况**：因为没有任何事件需要处理，`aeProcessEvents` 函数就会直接返回到 `aeMain` 的主循环，开始下一轮的循环
  - 对于**第三种情况**：该情况发生时只有普通时间事件发生，所以 `aeProcessEvents` 函数会调用专门处理时间事件的函数 `processTimeEvents`，对时间事件进行处理
  - 对于**第二种情况**：首先，当该情况发生时，Redis 需要捕获发生的网络事件，并进行相应的处理。在这种情况下，`aeApiPoll` 函数会被调用，用来捕获事件。`aeApiPoll` 函数就是封装了对 `epoll_wait`（或 `select`、`kqueue`）的调用

- 它是这样实现的：
  - 1. **情况一判断**：如果既没有时间事件也没有网络事件，直接返回 0
  - 2. **情况二和情况三判断**：如果有 IO 事件或需要处理时间事件，进入处理流程
  - 3. **查找最近时间事件**：如果设置了 `AE_TIME_EVENTS`，查找最近的时间事件用于计算超时时间
  - 4. **计算超时时间**：
    - 如果有时间事件，计算距离最近时间事件的等待时间
    - 如果没有时间事件，根据 `AE_DONT_WAIT` 标志决定是否阻塞等待
  - 5. **捕获网络事件**：调用 `aeApiPoll()` 等待事件就绪（封装了 `epoll_wait`/`select`/`kqueue`）
  - 6. **执行后置回调**：在 IO 多路复用休眠后执行 `aftersleep` 回调
  - 7. **处理文件事件**：遍历就绪的文件事件，调用相应的事件处理函数
    - 正常情况下：先处理读事件，再处理写事件
    - 如果设置了 `AE_BARRIER`：先处理写事件，再处理读事件（用于在回复客户端前先持久化数据）
  - 8. **处理时间事件**：调用 `processTimeEvents()` 处理到期的时间事件

```c
// ae.c 第 369-493 行
int aeProcessEvents(aeEventLoop *eventLoop, int flags)
{
    int processed = 0, numevents;

    /* Nothing to do? return ASAP */
    // 情况一：既没有时间事件，也没有网络事件
    //    - 如果 flags 中既没有 AE_TIME_EVENTS 也没有 AE_FILE_EVENTS，直接返回
    if (!(flags & AE_TIME_EVENTS) && !(flags & AE_FILE_EVENTS)) return 0;

    // 情况二和情况三：有 IO 事件或者有需要紧急处理的时间事件，如果没有IO事件，也会一直处理时间事件。
    //    - 如果有文件描述符注册（maxfd != -1），或者需要处理时间事件且不立即返回
    if (eventLoop->maxfd != -1 ||
        ((flags & AE_TIME_EVENTS) && !(flags & AE_DONT_WAIT))) {
        int j;
        aeTimeEvent *shortest = NULL;
        struct timeval tv, *tvp;

        // 1. 查找最近的时间事件，用于计算超时时间
        //    - 如果设置了 AE_TIME_EVENTS 且不立即返回，查找最近的时间事件
        if (flags & AE_TIME_EVENTS && !(flags & AE_DONT_WAIT))
            shortest = aeSearchNearestTimer(eventLoop);
        
        // 2. 计算超时时间
        if (shortest) {
            long now_sec, now_ms;
            aeGetTime(&now_sec, &now_ms);
            tvp = &tv;

            // 2.1 计算距离最近时间事件的等待时间
            long long ms =
                (shortest->when_sec - now_sec)*1000 +
                shortest->when_ms - now_ms;

            if (ms > 0) {
                // 2.2 如果还有时间，设置超时时间
                tvp->tv_sec = ms/1000;
                tvp->tv_usec = (ms % 1000)*1000;
            } else {
                // 2.3 如果时间事件已经到期，立即返回（不等待）
                tvp->tv_sec = 0;
                tvp->tv_usec = 0;
            }
        } else {

            // 3. 如果没有时间事件，根据 flags 设置超时时间
            if (flags & AE_DONT_WAIT) {
                // 3.1 如果设置了 AE_DONT_WAIT，立即返回（不等待）
                tv.tv_sec = tv.tv_usec = 0;
                tvp = &tv;
            } else {
                // 3.2 否则阻塞等待（直到有事件发生）
                tvp = NULL; /* wait forever */
            }
        }

        // 4. 调用 IO 多路复用 API 等待事件就绪
        //    - aeApiPoll 封装了 epoll_wait/select/kqueue 的调用
        //    - 只有超时或者有文件就绪事件发生时才会返回
        numevents = aeApiPoll(eventLoop, tvp);

        // 5. 在 IO 多路复用休眠后执行 aftersleep 回调
        //    - 用于处理输出缓冲区、刷新从节点输出缓冲区等
        if (eventLoop->aftersleep != NULL && flags & AE_CALL_AFTER_SLEEP)
            eventLoop->aftersleep(eventLoop);

        // 6. 处理所有就绪的文件事件
        for (j = 0; j < numevents; j++) {
            // 6.1 获取文件事件和就绪的事件类型
            aeFileEvent *fe = &eventLoop->events[eventLoop->fired[j].fd];
            int mask = eventLoop->fired[j].mask;
            int fd = eventLoop->fired[j].fd;
            int fired = 0; /* Number of events fired for current fd. */

            // 6.2 判断是否需要反转调用顺序（AE_BARRIER 标志）
            int invert = fe->mask & AE_BARRIER;
            // 6.3 处理读事件（如果没有设置 AE_BARRIER，先处理读事件）
            if (!invert && fe->mask & mask & AE_READABLE) {
                fe->rfileProc(eventLoop, fd, fe->clientData, mask);
                fired++;
            }

            // 6.4 处理写事件
            if (fe->mask & mask & AE_WRITABLE) {
                // 6.4.1 如果读事件未触发，或者读写事件处理函数不同，调用写事件处理函数
                if (!fired || fe->wfileProc != fe->rfileProc) {
                    fe->wfileProc(eventLoop, fd, fe->clientData, mask);
                    fired++;
                }
            }

            // 6.5 如果设置了 AE_BARRIER，在写事件之后处理读事件
            if (invert && fe->mask & mask & AE_READABLE) {
                if (!fired || fe->wfileProc != fe->rfileProc) {
                    fe->rfileProc(eventLoop, fd, fe->clientData, mask);
                    fired++;
                }
            }

            processed++;
        }
    }
    
    /* Check time events */
    // 7. 处理时间事件
    //    - 情况三：只有普通的时间事件时，会执行到这里
    //    - processTimeEvents 会遍历时间事件链表，处理到期的时间事件
    if (flags & AE_TIME_EVENTS)
        processed += processTimeEvents(eventLoop);

    return processed; /* return the number of processed file/time events */
}
```

### ae 框架的 IO 多路复用封装

- ae 框架通过统一的函数接口封装不同平台的 IO 多路复用机制，这些函数都是 `static` 的，只在对应的实现文件中可见。

#### 统一的函数接口

- 所有 IO 多路复用实现都需要提供以下函数：
  - `aeApiCreate()`：创建 IO 多路复用实例
  - `aeApiResize()`：调整文件描述符集合大小
  - `aeApiFree()`：释放 IO 多路复用实例
  - `aeApiAddEvent()`：添加文件描述符到监听集合
  - `aeApiDelEvent()`：从监听集合中删除文件描述符
  - `aeApiPoll()`：等待事件就绪
  - `aeApiName()`：返回 IO 多路复用机制的名称

#### epoll 封装实现

- Redis 在 Linux 上使用 epoll 作为 IO 多路复用机制，封装在 `ae_epoll.c` 中。

```c
// ae_epoll.c 第 34-37 行
typedef struct aeApiState {
    int epfd;                        // epoll 文件描述符
    struct epoll_event *events;      // epoll 事件数组
} aeApiState;
```

##### aeApiCreate 创建 epoll 实例

```c
// ae_epoll.c 第 39-56 行
static int aeApiCreate(aeEventLoop *eventLoop) {
    aeApiState *state = zmalloc(sizeof(aeApiState));
    
    if (!state) return -1;
    
    // 1. 分配 epoll_event 数组
    //    - 大小为 setsize，用于存储就绪的事件
    state->events = zmalloc(sizeof(struct epoll_event)*eventLoop->setsize);
    if (!state->events) {
        zfree(state);
        return -1;
    }
    
    // 2. 创建 epoll 实例
    //    - epoll_create(1024) 中的 1024 是提示值，Linux 2.6.8 后忽略
    //    - 返回 epoll 文件描述符
    state->epfd = epoll_create(1024);
    if (state->epfd == -1) {
        zfree(state->events);
        zfree(state);
        return -1;
    }
    
    // 3. 将状态保存到 eventLoop 的 apidata 中
    eventLoop->apidata = state;
    return 0;
}
```

##### aeApiAddEvent 添加事件

```c
// ae_epoll.c 第 73-88 行
static int aeApiAddEvent(aeEventLoop *eventLoop, int fd, int mask) {
    aeApiState *state = eventLoop->apidata;
    struct epoll_event ee = {0}; /* avoid valgrind warning */
    
    // 1. 判断操作类型
    //    - 如果文件描述符之前没有注册事件，使用 EPOLL_CTL_ADD
    //    - 如果文件描述符已经注册了事件，使用 EPOLL_CTL_MOD
    int op = eventLoop->events[fd].mask == AE_NONE ?
            EPOLL_CTL_ADD : EPOLL_CTL_MOD;
    
    // 2. 设置 epoll 事件
    ee.events = 0;
    mask |= eventLoop->events[fd].mask; /* Merge old events */
    if (mask & AE_READABLE) ee.events |= EPOLLIN;   // 可读事件
    if (mask & AE_WRITABLE) ee.events |= EPOLLOUT;  // 可写事件
    ee.data.fd = fd;  // 保存文件描述符，用于事件返回时识别
    
    // 3. 调用 epoll_ctl 添加或修改事件
    if (epoll_ctl(state->epfd, op, fd, &ee) == -1) return -1;
    return 0;
}
```

##### aeApiDelEvent 删除事件

```c
// ae_epoll.c 第 90-106 行
static void aeApiDelEvent(aeEventLoop *eventLoop, int fd, int delmask) {
    aeApiState *state = eventLoop->apidata;
    struct epoll_event ee = {0}; /* avoid valgrind warning */
    
    // 1. 计算删除后的掩码
    //    - 从当前掩码中移除要删除的事件
    int mask = eventLoop->events[fd].mask & (~delmask);
    
    // 2. 设置剩余的事件
    ee.events = 0;
    if (mask & AE_READABLE) ee.events |= EPOLLIN;
    if (mask & AE_WRITABLE) ee.events |= EPOLLOUT;
    ee.data.fd = fd;
    
    // 3. 根据剩余事件决定操作
    if (mask != AE_NONE) {
        // 3.1 如果还有事件，使用 MOD 操作更新
        epoll_ctl(state->epfd, EPOLL_CTL_MOD, fd, &ee);
    } else {
        // 3.2 如果没有事件了，使用 DEL 操作删除
        //     - 注意：Linux < 2.6.9 需要非空的 event 指针
        epoll_ctl(state->epfd, EPOLL_CTL_DEL, fd, &ee);
    }
}
```

##### aeApiPoll 等待事件

```c
// ae_epoll.c 第 108-131 行
static int aeApiPoll(aeEventLoop *eventLoop, struct timeval *tvp) {
    aeApiState *state = eventLoop->apidata;
    int retval, numevents = 0;
    
    // 1. 调用 epoll_wait 等待事件就绪
    //    - timeout 转换为毫秒（-1 表示阻塞等待）
    retval = epoll_wait(state->epfd, state->events, eventLoop->setsize,
            tvp ? (tvp->tv_sec*1000 + tvp->tv_usec/1000) : -1);
    
    if (retval > 0) {
        int j;
        numevents = retval;
        
        // 2. 遍历就绪的事件，转换为 ae 框架的事件格式
        for (j = 0; j < numevents; j++) {
            int mask = 0;
            struct epoll_event *e = state->events+j;
            
            // 2.1 转换 epoll 事件为 ae 事件
            if (e->events & EPOLLIN) mask |= AE_READABLE;   // 可读
            if (e->events & EPOLLOUT) mask |= AE_WRITABLE;  // 可写
            if (e->events & EPOLLERR) mask |= AE_WRITABLE;  // 错误时也触发写事件
            if (e->events & EPOLLHUP) mask |= AE_WRITABLE; // 挂起时也触发写事件
            
            // 2.2 保存到 fired 数组中
            eventLoop->fired[j].fd = e->data.fd;
            eventLoop->fired[j].mask = mask;
        }
    }
    return numevents;  // 返回就绪事件的数量
}
```

#### select 封装实现

- Redis 在不支持 epoll/kqueue 的系统上使用 select 作为备选方案，封装在 `ae_select.c` 中。

```c
// ae_select.c 第 35-40 行
typedef struct aeApiState {
    fd_set rfds, wfds;        // 可读和可写文件描述符集合
    /* We need to have a copy of the fd sets as it's not safe to reuse
     * FD sets after select(). */
    fd_set _rfds, _wfds;      // select 后的副本（select 会修改原集合）
} aeApiState;
```

##### aeApiCreate 创建 select 状态

```c
// ae_select.c 第 42-50 行
static int aeApiCreate(aeEventLoop *eventLoop) {
    aeApiState *state = zmalloc(sizeof(aeApiState));
    
    if (!state) return -1;
    
    // 1. 初始化文件描述符集合
    FD_ZERO(&state->rfds);  // 清空可读集合
    FD_ZERO(&state->wfds);  // 清空可写集合
    
    // 2. 将状态保存到 eventLoop 的 apidata 中
    eventLoop->apidata = state;
    return 0;
}
```

##### aeApiAddEvent 添加事件

```c
// ae_select.c 第 62-68 行
static int aeApiAddEvent(aeEventLoop *eventLoop, int fd, int mask) {
    aeApiState *state = eventLoop->apidata;
    
    // 1. 根据事件类型添加到对应的集合
    if (mask & AE_READABLE) FD_SET(fd, &state->rfds);  // 添加到可读集合
    if (mask & AE_WRITABLE) FD_SET(fd, &state->wfds);  // 添加到可写集合
    
    return 0;
}
```

##### aeApiDelEvent 删除事件

```c
// ae_select.c 第 70-75 行
static void aeApiDelEvent(aeEventLoop *eventLoop, int fd, int mask) {
    aeApiState *state = eventLoop->apidata;
    
    // 1. 根据事件类型从对应的集合中删除
    if (mask & AE_READABLE) FD_CLR(fd, &state->rfds);  // 从可读集合删除
    if (mask & AE_WRITABLE) FD_CLR(fd, &state->wfds);  // 从可写集合删除
}
```

##### aeApiPoll 等待事件

```c
// ae_select.c 第 77-100 行
static int aeApiPoll(aeEventLoop *eventLoop, struct timeval *tvp) {
    aeApiState *state = eventLoop->apidata;
    int retval, j, numevents = 0;
    
    // 1. 复制文件描述符集合
    //    - select 会修改传入的集合，所以需要先复制
    memcpy(&state->_rfds, &state->rfds, sizeof(fd_set));
    memcpy(&state->_wfds, &state->wfds, sizeof(fd_set));
    
    // 2. 调用 select 等待事件就绪
    //    - maxfd+1 是因为 select 需要最大文件描述符 + 1
    retval = select(eventLoop->maxfd+1,
                &state->_rfds, &state->_wfds, NULL, tvp);
    
    if (retval > 0) {
        // 3. 遍历所有文件描述符，找出就绪的
        //    - 这是 select 的缺点：需要 O(n) 遍历
        for (j = 0; j <= eventLoop->maxfd; j++) {
            int mask = 0;
            aeFileEvent *fe = &eventLoop->events[j];
            
            // 3.1 跳过未注册的文件描述符
            if (fe->mask == AE_NONE) continue;
            
            // 3.2 检查是否就绪
            if (fe->mask & AE_READABLE && FD_ISSET(j, &state->_rfds))
                mask |= AE_READABLE;
            if (fe->mask & AE_WRITABLE && FD_ISSET(j, &state->_wfds))
                mask |= AE_WRITABLE;
            
            // 3.3 如果就绪，保存到 fired 数组
            if (mask) {
                eventLoop->fired[numevents].fd = j;
                eventLoop->fired[numevents].mask = mask;
                numevents++;
            }
        }
    }
    return numevents;  // 返回就绪事件的数量
}
```

### ae 框架的自动选择机制

- Redis 通过编译时的宏定义自动选择最优的 IO 多路复用机制，优先级从高到低：

```c
// ae.c 第 47-61 行
/* Include the best multiplexing layer supported by this system.
 * The following should be ordered by performances, descending. */
#ifdef HAVE_EVPORT
    #include "ae_evport.c"      // Solaris evport（最高性能）
#else
    #ifdef HAVE_EPOLL
        #include "ae_epoll.c"   // Linux epoll
    #else
        #ifdef HAVE_KQUEUE
            #include "ae_kqueue.c"  // BSD/macOS kqueue
        #else
            #include "ae_select.c"  // 其他系统 select（备选方案）
        #endif
    #endif
#endif
```

- **选择顺序**：
  1. **evport**（Solaris）：最高性能
  2. **epoll**（Linux）：高性能，O(1) 复杂度
  3. **kqueue**（BSD/macOS）：类似 epoll 的高性能机制
  4. **select**（其他系统）：备选方案，兼容性最好
