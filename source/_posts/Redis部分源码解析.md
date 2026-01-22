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

# Redis-5.0.8 主要结构

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
- 其中，数据结构的设计和使用必须是内存友好的，也就是效率高的；而内存淘汰则是用置换算法，关于这些算法（LRU/LFU）需要在内存管理部分解析
- 对于实现数据结构来说，如果想要节省内存，一是使用连续的内存空间，避免内存碎片开销；二是针对不同长度的数据，采用不同大小的元数据，以避免使用统一大小的元数据，造成内存空间的浪费。
- 在数据访问方面，你也要知道使用共享对象其实可以避免重复创建冗余的数据，从而也可以有效地节省内存空间。不过，共享对象主要适用于只读场景，如果一个字符串被反复地修改，就无法被多个请求共享访问了。

## 基本数据对象
- redisObject 结构体是在 server.h 文件中定义的，主要功能是用来保存键值对中的值。这个结构一共定义了 4 个元数据和一个指针，一共**占16字节**：
    - type、encoding 和 lru 三个变量后面都有一个冒号，并紧跟着一个数值，表示该元数据占用的比特数。这种定义方法可以用来有效地节省内存开销。
    - 也就是我们所说的**位域**:
        > C 语言的位域（bit-field）是一种特殊的结构体成员，允许我们按位对成员进行定义，指定其占用的位数。
        > - 定义位域时，可以指定成员的位域宽度，即成员所占用的位数。
        > - 一个位域存储在同一个字节中，如一个字节所剩空间不够存放另一位域时，则会从下一单元起存放该位域。也可以占位有意使某位域从下一单元开始
        > - 位域的宽度不能超过其数据类型的大小，因为位域必须适应所使用的整数类型。
        > - 位域的数据类型可以是 int、unsigned int、signed int 等整数类型，也可以是枚举类型。
        > - 位域可以单独使用，也可以与其他成员一起组成结构体。
        > - 位域的访问是通过点运算符（.）来实现的，与普通的结构体成员访问方式相同。
```c
typedef struct redisObject {
    unsigned type:4; //redisObject的数据类型，4个bits
    unsigned encoding:4; //redisObject的编码类型，4个bits
    unsigned lru:LRU_BITS;  //redisObject的LRU时间，LRU_BITS宏定义默认为24个bits
    int refcount; //redisObject的引用计数，4个字节
    void *ptr; //指向值的指针，8个字节
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
    - 2. redis 确实是使用不同大小的数据类型来存储 len 和 alloc 的，一共划分为五种，_下划线后面的数字表示该类型的sds中，len占用的位数，比如sdshdr8表示len占用8位，那么该类型最大存储2^8也就是256字节；宏定义的整数表示类型的编号，只要3 bit就能表示这5种类型：
    - 3. sds使用`__attribute__ ((__packed__))`：内存对齐机制会对结构体进行padding，使用这个宏来修饰，内存对齐的对齐边界就是1字节了，也就是不做对齐，不会加入padding填充字节，进一步节省空间
    - 4. 另外，**sds指针指向sds结构体中的buf数组**，而不是平常那样指向sds结构体头部，实际操作中会根据具体类型加上hdrlen
        - 比如sdshdr8的头部占用len+alloc+flag=17字节，那么hdrlen是17，sds的值就是在内存分配函数返回的**指针sh加上hdrlen指针偏移量**。
```c
#define SDS_TYPE_5  0
#define SDS_TYPE_8  1
#define SDS_TYPE_16 2
#define SDS_TYPE_32 3
#define SDS_TYPE_64 4
```
- sds的具体定义如下：
```c
// sds.h
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
sds sdsnewlen(const void *init, size_t initlen) {
    void *sh;
    sds s;
    char type = sdsReqType(initlen);  // 第1步：根据长度选择类型
    if (type == SDS_TYPE_5 && initlen == 0) type = SDS_TYPE_8;  // 空字符串特殊处理
    int hdrlen = sdsHdrSize(type);

    sh = s_malloc(hdrlen+initlen+1);  // 第2步：分配内存
    s = (char*)sh+hdrlen;             // 第3步：指针指向buf开始
    fp = ((unsigned char*)s)-1;       // flags指针
    
    // 第4步：根据类型初始化头部
    switch(type) {
        case SDS_TYPE_5: {
            *fp = type | (initlen << SDS_TYPE_BITS);  // 长度存在flags高5位
            break;
        }
        case SDS_TYPE_8: {
            SDS_HDR_VAR(8,s);
            sh->len = initlen;      // len记录实际长度
            sh->alloc = initlen;    // alloc初始化为len（无预分配）
            *fp = type;
            break;
        }
        // TYPE_16/32/64 类似...
    }
    
    if (initlen && init)
        memcpy(s, init, initlen);   // 第5步：复制数据
    s[initlen] = '\0';              // 第6步：添加结尾\0（二进制安全）
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
sds sdsMakeRoomFor(sds s, size_t addlen) {
    size_t avail = sdsavail(s);    // 当前可用空间
    
    /* 快速路径：空间充足，无需分配 */
    if (avail >= addlen) return s;

    size_t len = sdslen(s);
    char oldtype = s[-1] & SDS_TYPE_MASK;
    
    /* 计算新大小 */
    size_t newlen = len + addlen;
    if (newlen < SDS_MAX_PREALLOC)     // < 1MB
        newlen *= 2;                   // 翻倍扩容
    else
        newlen += SDS_MAX_PREALLOC;    // 增加1MB

    char type = sdsReqType(newlen);    // 是否需要升级类型？
    
    if (type == SDS_TYPE_5) type = SDS_TYPE_8;  // TYPE_5不能扩容，升级到TYPE_8
    
    int hdrlen = sdsHdrSize(type);
    
    /* 情况1：头部大小不变 */
    if (oldtype == type) {
        newsh = s_realloc(sh, hdrlen+newlen+1);  // 原地扩容
        s = (char*)newsh+hdrlen;
    } 
    /* 情况2：头部大小改变（升级类型） */
    else {
        newsh = s_malloc(hdrlen+newlen+1);       // 分配新内存
        memcpy((char*)newsh+hdrlen, s, len+1);  // 复制数据
        s_free(sh);                              // 释放旧内存
        s = (char*)newsh+hdrlen;
        s[-1] = type;                            // 更新flags
        sdssetlen(s, len);                       // 更新len
    }
    
    sdssetalloc(s, newlen);  // 更新alloc为实际分配大小
    return s;
}
```
#### 拼接
- 使用sdscatlen函数对sds进行拼接/追加，它的实现是这样的：
    - 1. 调用 sdsMakeRoomFor 检查是否需要扩容
    - 2. 复制并追加数据以及`\0`
```c
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
sds sdsdup(const sds s) {
    return sdsnewlen(s, sdslen(s));  // 简单调用sdsnewlen
}
```

#### 覆盖
- 使用sdscpylen()将新字符串串t的内容覆盖到sds，它的实现是这样的：
    - 1. 先检查是否需要扩容
    - 2. 调用memcpy将新串的内容写到s中
```c
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
    -  另外还有一个next指针，用于在哈希冲突时使用链式寻址法解决冲突，通过头插法形成单链表

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
    - 该方法的执行逻辑：
        - 1. 先检查是否正在重哈希
        - 2. 然后检查是否首次分配
        - 3. 再进行扩容条件判断，传入dictExpand的参考扩容大小是当前哈希表元素的2倍
            - 实际上**分配的内存**如上所述是**哈希表大小的2倍** 而不是用哈希表当前存储元素的2倍，因为要求分配内存是大于size（这里是2倍used）的最小2的整数幂

```c
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

