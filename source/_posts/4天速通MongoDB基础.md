---
title: 4天速通MongoDB基础
date: 2026-01-15 16:13:14
tags: "你知道吗"
categories: "只属于你的小妙招 <br> 看似有用实则没用"
---
# Mongo 概念
## MongoDB
- MongoDB是一个开源、跨平台、分布式文档数据库，属于NoSQL（Not Only SQL）数据库的一种。使用文档（document）对象存储数据，这种方式比关系型数据库（RDBMS）中的数据行格式更加灵活。文档可以支持在单个记录中表示复杂的层级关系。 
- MongoDB不需要预定义模式结构（schema），可以更加方便快捷地增加或删除文档中的字段。

## 数据格式
- 在MongoDB中，数据使用**BSON**格式进行处理和存储。
    - BSON :  BSON（Binary Serialized Document Format）是一种类json的二进制形式的存储格式，简称Binary JSON。BSON和JSON一样，支持内嵌的文档对象和数组对象，但是BSON有JSON没有的一些数据类型，如date和binData类型
### 文档
- MongoDB以BSON文档的形式存储数据记录，简称为**文档**（Document）。 MongoDB 文档由成对的字段和字段值组成，**是一个由字段-值组成的集合**。
- 字段：字段为有序字段。也就是说，存储在文档中的每一个键值对是**有序**的。
    - 这意味着如果两个文档有同样内容的字段**但字段在文档中存储的顺序不同**，那么**它们是不同的文档**
- 字段名称：可以理解成键，必须是**字符串**。
- 字段名称有命名限制：
    - 1. **字段名称 _id 保留用作主键**；它的值在集合中必须是唯一的、不可变的，并且可以是除数组或正则表达式之外的任何类型。如果 _id 包含子字段，则子字段名称不能以 ($) 符号开头。
    - 2. 字段名称**不能包含 null 字符**。
    - 3. 服务器**允许**存储包含点 (.) 和美元符号 ($) 的字段名称。MongodB 5.0 改进了对在字段名称中使用 ($) 和 (.) 的支持。
    - 4. **每个字段名称在文档中必须是唯一的**。 不得存储具有重复字段的文档，因为如果文档具有重复字段，MongoDB CRUD操作可能会出现意外行为。
- 字段值：可以理解成值，类型可以是任何一种 BSON 数据类型，包括其他文档、数组，对象等。
### 集合
- MongoDB使用集合（Colletion）存储文档。一个集合就是一组文档。 可以理解成关系数据库的表。
- 集合的模式是动态的。这意味着集合中的多个文档结构可能完全不同，也就是说集合中的**文档的类型可以是不同的**
- 集合名称有命名限制：
    - 1. 集合名**不能是空字符串""**。
    - 2. 集合名**不能含有`\0`字**，这个字符表示集合名的结尾。
    - 3. 集合名**不能以"system."开头**，这是为系统集合保留的前缀。
    - 4. 用户创建的集合名字不能含有保留字符 $ 。有些驱动程序的确支持在集合名里面包含，这是因为某些系统生成的集合中包含该字符。除非你要访问这种系统创建的集合，否则千万不要在名字里出现$。
### 数据库
- MongoDB集合存储在数据库中。单个MongoDB实例可以包含多个数据库。
- 数据库有命名限制：
    - 1. 数据库名称不能是空字符串（""）​。
    - 2. 数据库名称不能包含 /、\、.、"、*、<、>、:、|、?、$、单一的空格以及 \0（空字符）​，基本上只能使用 ASCII 字母和数字。
    - 3. 数据库名称区分大小写。
    - 4. 数据库名称的长度限制为 64 字节。
    - 5. 不能和保留数据库重名。admin, local, config, 
### 命名空间
- 命名空间（Namespace）由数据库名加上其中的集合名组成。命名空间可以用于完整引用一个集合。 
    - 例如，对于数据库bookdb中的集合books，命名空间为bookdb.books。
## BSON 数据类型
- 以下展示了常用的数据类型：

|类型|含义|说明|
|---|---|---|
|int|32位整数|shell不可用 自动转换为64位浮点数 可以使用NumberInt|
|long|64位整数|shell不可用 自动转换为64位浮点数 可以使用NumberLong|
|double|64位浮点数|shell的默认数值类型|
|string|字符串|使用UTF-8字符|
|bool|布尔值|true/false|
|array|数组|值的集合或者列表|
|date|日期|64位有符号整数|
|timestamp|时间|64位有符号整数|
|minKey|最小值|表示可能的最小值 shell中没有这个类型|
|maxKey|最大值|表示可能的最大值 shell中没有这个类型|
|regex|正则|{"x":/foobar/i}
|object|对象||
|objectId|对象id|文档的12字节的唯一ID
|javascript|JS代码|{"x":function(){}}|
|null|空值|表示空值或者未定义的对象|
|binData|二进制数据|可以由任意字节的串组成 shell中无法使用|
|decimal128|高精度十进制|IEEE 754|

### 数组
- 数组是一组值，既可以作为有序对象（如列表、栈或队列）来操作，也可以作为无序对象（如集合）来操作。
- 数组**可以包含不同数据类型的元素**, 实际上，常规键值对支持的任何类型都可以作为数组（甚至是嵌套数组）的值
```json
{"things" : ["pie", 3.14]}
```
- 点符号：MongoDB 使用点符号来访问数组的元素和访问嵌入式文档的字段。
    - 1. 要通过从零开始的索引位置指定或访问数组的元素，用点号 (.) 将数组名称和从零开始的索引位置连接，并用引号引起来：`"<array>.<index>"`
    - 2. 要使用点符号指定或访问嵌入式文档的字段，将嵌入式文档名称与点 ( .) 和字段名称连接起来，并用引号引起来: `"<embedded document>.<field>"`
### 二进制数据
- BSON 二进制binData值是**字节数组**。 binData值有一个子类型，用于指示如何解释二进制数据。
### 对象id 和 _id字段
#### 对象id
- ObjectId（对象标识符）很小，可能是唯一的，生成速度快并且是有序的，大致按创建时间排序，**但并非完全有序**。在包含 ObjectId 值的 _id 字段上对集合排序，大致相当于按创建时间排序。
- ObjectId 值的长度为 12 个字节，包含：
    - 1. 一个大端字节序 4 字节时间戳，它表示 ObjectId 的创建时间，并以自 UNIX 纪元以来的秒数为单位进行测量。如果使用整数值创建对象标识符（ObjectId），则该整数将替换时间戳。
    - 2. 小端字节序 5 字节的随机值，每个客户端进程生成一次。这个随机值对于机器和进程是唯一的。如果进程重新启动或进程的主节点发生变化，此值会被重新生成。
    - 3. 每个客户端进程的大端字节序 3字节递增计数器，初始化为随机值。当进程重新启动时，计数器会重置。
#### _id 字段
- 在MongoDB中，存储在标准集合中的每个文档都需要一个**唯一的_id字段作为主键**。如果插入的文档省略了 _id字段，则MongoDB驱动程序会自动为 _id字段生成 ObjectId。
    - 1. 默认情况下，MongoDB 在创建集合期间会在 _id 字段上**创建唯一索引**。
    - 2. _id 字段始终是文档中的第一个字段。如果在服务器收到的文档中，_id 不是第一个字段，则服务器会将该字段移动到开头。
    - 3. 如果 _id 包含子字段，则子字段名称不能以 ($) 符号开头。
    - 4. _id 字段可以包含任何 BSON 数据类型的值（**数组、正则表达式或未定义类型除外**）。
    - 5. 在时间序列集合中，文档不需要唯一的_id字段，因为MongoDB不会在_id 字段上创建索引。
- 以下是存储 _id 值的常见选项：
    - 1. 使用对象标识符（ObjectId）。
    - 2. 使用自然唯一标识符（如果可用）。这样可以节省空间并避免附加索引。
    - 3. 生成一个自动递增的数字。可以理解为**自增主键**，因为每个文档就是用_id作为主键的。
    - 4. 在应用程序代码中生成 UUID。为了更有效率地将 UUID 值存储在该集合和 _id 索引中，请将 UUID 存储为 BSON BinData 类型的值。如果满足以下条件，则 BinData 类型的索引键可以更有效地存储在索引中：二进制子类型值的范围是 0-7 或 128-135，并且字节数组的长度为：0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 14, 16, 20, 24 或 32。
    - 5. 使用驱动程序的 BSON UUID 工具生成 UUID。请注意，驱动程序实现可能会以不同的方式实施 UUID 序列化和反序列化逻辑，这可能与其他驱动程序不完全兼容。
### 日期与时间戳
#### 日期
- BSON Date（BSON 日期）是一个 64 位整数，它表示自 UNIX 纪元（1970 年 1 月 1 日）以来的毫秒数。BSON Date 类型为**有符号值**，负值代表 1970 年之前的日期。
- 创建Date对象时**需要调用new Date()**，而不仅仅是Date()，因为Date()返回的是日期字符串而不是Date对象。
#### 时间戳
- BSON 具一种特殊的时间戳类型，供 **MongoDB 内部使用**，与常规的 Date 类型无关。要存储日期和时间，请使用**date**
- 此内部时间戳类型是 64 位值，其中：
    - 1. 最高的 32 位有效位则是 time_t 值（自 UNIX 纪元以来的秒数）
    - 2. 对于给定秒内的操作，最低有效的 32 位是递增的 ordinal。
    - 3. 虽然 BSON 格式是小端字节序，因此首先存储最低有效位，但在所有平台上，mongod 实例始终先比较 time_t 值，然后再比较 ordinal 值，不受字节序的影响。
### decimal128
- decimal128 是 128 位十进制表示形式，用于在四舍五入很重要的情况下存储非常大或非常精确的数字。它创建于 2009 8 月，作为 IEEE 754-2008 浮点修订版的一部分。使用BSON数据类型时如果需要高精度，则应使用 decimal128。
- decimal128 支持 34 位十进制数的精度或有效数以及 -6143 到 +6144 的指数范围。有效数字在 decimal128 标准中未进行规范化，允许多种可能的表示形式：10 x 10^-1 = 1 x 10^0 = .1 x 10^1 = .01 x 10^2 等。能力分别以 10^6144 和 10^-6143 的顺序存储最大值和最小值，可以实现很高的精度。
## Mongo Shell 
- Mongo shell 是一个用于连接MongoDB的交互式JavaScript接口
    - 1. 可以用于操作MongoDB中的数据，也可以执行一些管理任务。
    - 2. mongo shell 是一个功能完备的JavaScript解释器，所以我们可以用它执行 JavaScript 代码
- mongo shell 会自动连接到本地（localhost）默认端口（27017）上的MongoDB 服务。默认情况下，它会连接本地MongoDB服务中的test数据库，并且将数据库连接设置为全局变量db。 

# MongoDB 的增删查改
## 数据库操作
```shell
use database_name # 使用数据库 如果不存在自动创建
db # 查看当前数据库
show dbs # 查看所有数据库
db.dropDatabase() # 删除当前数据库
```
## 集合操作
```shell
db.createCollection(name, options) # 创建集合
show collections # 查看当前数据库的集合
db.collection.drop() # 删除集合
db.adminCommand({
  renameCollection: "sourceDb.sourceCollection",
  to: "targetDb.targetCollection",
  dropTarget: <boolean>
}) # 重命名集合
```
### 固定大小集合
- 固定大小集合是大小固定的集合，根据插入顺序插入和检索文档。固定大小集合的工作方式与循环缓冲区类似：一旦一个集合填满了分配的空间，它就会通过覆盖集合中最旧的文档来为新文档腾出空间。
```js
db.createCollection(name, {capped: true})
```
- 固定大小集合无法进行分片。
- 无法在事务中写入固定大小集合。
- $out 聚合管道阶段无法将结果写入固定大小集合。
- 通常情况下，TTL（存活时间）索引比固定大小集合提供更好的性能和更大的灵活性。TTL 索引会过期，并根据日期类型字段的值和索引的 TTL 值从正常集合中删除数据。
- 固定大小集合对写入操作进行序列化，因此其并发插入、更新和删除性能不如非固定大小集合。在创建固定大小集合之前，考虑是否可以改用 TTL 索引。
- 固定大小集合最常见的使用场景是**存储日志信息**。当固定大小集合达到其最大大小时，旧的日志条目将自动被新的条目覆盖。
## 用户管理

```shell
use <database_name> # 用户需要与数据库关联
db.createUser({
  user: "testuser",
  pwd: "password123",
  roles: [
    { role: "readWrite", db: "<database_name>" },
    { role: "dbAdmin", db: "<database_name>" }
  ]
})
db.auth("testuser", "password123") # 创建用户
db.dropUser("testuser") # 删除用户
```
## 创建文档
### insertOne()
- 集合的insertOne()方法可以用于创建单个文档。该方法的语法如下： 
```js
db.collection.insertOne
( 
    <document>, 
    { 
        writeConcern: <document>
    } 
) 
```
- insertOne()方法包含两个参数： 
    - 1. document是想要创建的文档内容，这是一个必选参数。 
    - 2. writeConcern是一个可选参数，用于指定插入操作结果的确认级别
- insertOne()方法的返回结果包含以下字段信息： 
    - 1. acknowledged，一个布尔值。如果插入文档时指定了安全写入 （writeConcern），该字段的值为true；如果禁用了安全写入机制，该字段的值为false。 
    - 2. **insertedId**，存储了文档的_id字段的值。 
- **如果集合不存在，insertOne()方法同时会创建该集合并插入文档**。 
- 如果插入文档时没有指定_id字段，MongoDB会自动增加该字段并产生一个唯一的ObjectId。
- 如果显式指定了_id字段的值，需要确保数据在集合内的唯一性。 否则，MongoDB将会返回一个重复键错误。 
- inserOne()不与explain()兼容。
###  insertMany()
- insertMany()方法可以一次插入多个文档，该方法的语法如下： 
```js
db.collection.insertMany
( 
    [document1, document2, ...], 
    { 
        writeConcern: <document>, 
        ordered: <boolean> 
    } 
) 
```
- insertMany()方法包含两个参数：
    - 1. 第一个参数**是一个文档数组**，代表了需要插入的文档。
    - 2. 第二个参数**是一个文档**，包含了两个可选的字段。
        - 其中writeConcern指定写入操作的安全确认级别，ordered用于指定是否需要按照顺序写入文档。
        - 如果ordered设置为true，MongoDB将会按照第一个参数中的顺序写入文档，这是默认值。 如果 ordered 设置为 true 并且插入失败，则**服务器不会继续插入记录**。
        - 如果ordered设置为false，MongoDB可能会为了提高性能重新组织文档的顺序。如果 ordered 设为 false 且插入操作失败，服务器**会继续插入记录并跳过插入失败的记录**。文档可按 mongod 重新排序，从而提高性能。所以如果使用无序 insertMany()，应用程序不应依赖插入的顺序。
- insertMany()方法的返回结果包含了以下信息： 
    - 1. 如果插入文档时指定了安全写入（writeConcern），acknowledged字段的值为true；如果禁用了安全写入机制，该字段的值为false。 
    - 2. 一个由**文档_id字段的值组成的数组**，代表了成功插入的文档。
- insertMany()不与explain()兼容。
- **如果该集合不存在，则 insertMany() 会在成功写入时创建该集合**。
- 如果文档包含 _id 字段，则 _id 值在集合中必须是唯一的，以避免重复键错误。如果文档未指定 _id 字段，mongod 则会添加 _id 字段并为该文档分配一个唯一 ObjectId()。
## 查找文档
### findOne()
- findOne()方法用于返回集合中满足条件的单个文档，该方法的语法如下：
```js
db.collection.findOne(query, projection, options) 
```
- findOne()方法包含三个可选的参数： 
    - 1. query用于指定一个选择标准. 如果省略query参数，findOne()返回一个满足指定查询条件的文档。
    - 2. projection用于**指定返回的字段**。如果省略 projection 参数，默认返回文档中的全部字段。 可以使用以下格式指定projection参数： `{field1: value, field1: value, ... } `其中，value设置为true或者1表示返回该字段；如果value设置为false或者0，MongoDB不会返回该字段。
    - 3. options指定查询的附加选项。这些选项可修改查询行为以及返回结果的方式。
    - 默认情况下，MongoDB总是返回_id字段。如果不需要返回该字段，可以在projection 参数中明确指定_id:0。
- findOne()的返回策略如下：
    - 1. 如果结果为 0 ，返回Null
    - 2. 如果结果为 1， 返回该文档
    - 3. 如果结果为 2 或更多，使用索引时返回索引第一个匹配的文档，否则根据自然顺序返回第一个文档。另外，在固定大小集合中，自然顺序与插入顺序相同。
### find()
- find()方法用于查找满足指定条件的文档，并且返回**一个指向这些文档的游标（指针）而不是文档本身**。该方法的语法如下： 
```js
db.collection.find(query, projection)
```
- find()方法包含三个可选的参数： 
    - 1. query用于指定一个选择标准。如果省略该参数或者指定一个空文档参数，将会返回集合中的全部文档。 
    - 2. **projection用于指定返回的字段**。如果省略该参数，将会返回文档中的全部字段。 默认情况下，MongoDB总是返回_id字段。如果不需要返回该字段，可以在projection参数中明确指定_id:0。 
    - 3. options指定查询的附加选项。这些选项可修改查询行为以及返回结果的方式。
    - 默认情况下，MongoDB总是返回_id字段。如果不需要返回该字段，可以在projection参数中明确指定_id:0。
- 由于mongo shell自动遍历find()方法返回的游标，我们不需要执行额外的操作就可以获取游标中的文档。默认情况下，mongo shell只显示前20篇文档，输入it命令可以显示更多文档。 

### 投影操作筛选字段
- 在MongoDB中，投影（projection）表示在查询中返回指定的字段。
- 默认情况下find()和findOne()方法会返回文档中的全部字段，但是大多数情况下我们不需要查询全部字段。可以在一个文档中指定这些字段并将该文档作为参数传递给find()和findOne()方法。该参数文档被称为投影文档。指定返回字段的语法如下：
```js
{ <field>: value, ...} 
```
- 如果value设置为1或者true，表示返回字段；如果value设置为0或者false，表示不返回该字段。如果投影文档为空（{}），表示返回全部字段。 
- 对于嵌入式文档中的字段，可以使用点号指定(命名空间), 对于数组中的字段，也可以使用点号指定：
```js
{ "<embeddedDocument>.<field>": value, ... } 
{ "<arrayField>.field": value, ...} 
```

### 比较操作符
- MongoDB中查找文档时常用的一些比较运算符**包括$eq、$gt、$gte、$lt、$lte、$ne、$in以及$nin**。

|运算符|用途|
|---|---|
|$eq|匹配等于指定值的值|
|$gt|匹配大于指定值的值|
|$gte|匹配大于等于指定值的值|
|$in|匹配数组中指定的任何值|
|$lt|匹配小于指定值的值|
|$lte|匹配小于等于指定值的值|
|$ne|匹配所有不等于指定值的值|
|$nin|如果该值不等于任何给定值列表，则匹配|

#### $eq 和 $ne 运算符 
- $eq运算符用于匹配字段等于（=）指定值的文档。$eq运算符的语法如下：
```js
{ <field>: { $eq: <value> } } 
// 可以省略括号和运算符：
{<field>: <value>} 
```
- 如果指定的 <value> 是数组，则 MongoDB 会匹配字段 <field> 与数组完全匹配的字段**或 <field> 包含与数组完全匹配的元素**的文档。
- $ne 运算符匹配字段不等于（<>）指定值的文档。$ne运算符的语法如下： 
```js
{ field: {$ne: value}} 
```
- 要查询存在且不为空的字段，请使用 { $ne : null }过滤。
- 在比较数组时，$ne 匹配文档数组与 $ne 中指定的数组不相同的文档。具体来说 $nq将匹配完全与value数组不同的文档（具有不同元素值或字符串/元素的顺序/数量不同/文档中不存在）

#### $gt 和 $gte运算符
- $gt运算符用于匹配字段大于（>）指定值的文档。$gt运算符的语法如下： 
```js
{ field: { $gt: value}} 
```
- $gte运算符用于匹配字段大于等于（>=）指定值的文档。$gte运算符的语法如下： 
```js
{field: {$gte: value} }
```
- 对于大多数数据类型，比较运算符只对 BSON 类型与查询值类型相匹配的字段进行比较。假如查询的文档有多种类型，那么只会返回匹配类型又大于指定值的文档。
#### $lt 和 $lte运算符 
- $lt运算符用于匹配字段小于（<）指定值的文档。$lt运算符的语法如下： 
```js
{field: {$lt: value} } 
```
- $lte运算符用于匹配字段小于等于（<=）指定值的文档。$lte运算符的语法如下：
```js
{field: {$lte: value} }
```
- 对于大多数数据类型，比较运算符只对 BSON 类型与查询值类型相匹配的字段进行比较。假如查询的文档有多种类型，那么只会返回匹配类型大于指定值的文档。
#### $in 和 $nin运算符
- $in 运算符匹配字段等于（=）数组中**任意值**的文档。
```js
{ field: { $in: [<value1>, <value2>,...] }}
```
- 如果field只有一个值，$in运算符匹配该字段等于数组中**任意值**的文档。
- 如果 field 也是一个数组，$in运算符匹配**该数组包含数组[value1, value2,…]中任意值**的文档。也就是说，**field如果有数组值和value中的某个数组值相等，那么匹配成功**。
- $nin运算符匹配字段不等于（!=）数组中任意值的文档，或者**指定字段不存在**的文档。$nin运算符的语法如下： 
```js
{ field: { $nin: [ <value1>, <value2> ...]} }
```
- 如果field只有一个值，$nin运算符匹配该字段**不等于数组中任意值**的文档。
- 如果 field 包含一个数组，则 $nin 操作符会匹配该数组中没有与指定数组中的值（如 <value1>、<value2>等）相等的元素。也就是说，**field只要有一个数组值和value中的某个数组值相等，那么匹配失败**。

### 逻辑操作符
- MongoDB中查找文档时常用的一些逻辑运算符包括括$and、$or、$not以及$nor

|运算符|用途|
|---|---|
|$and|使用逻辑 AND 连接查询子句，并返回与所有子句的条件匹配的文档|
|$nor|使用逻辑 NOR 连接查询子句，并返回未能匹配所有子句的所有文档|
|$not|反转查询谓词的效果，并返回与查询谓词不匹配的文档|
|$or|使用逻辑 OR 连接查询子句，并返回至少匹配一个子句的所有文档|

#### $and 运算符
- $and 是一个逻辑查询运算符，可以基于一个或多个表达式执行逻辑AND操作，并选择**满足所有表达式**的文档。。$and 运算符的语法如下： 
```js
$and :[{expression1}, {expression2},...] 
```
- 指定用逗号分隔的表达式列表时，MongoDB 提供隐式 AND 操作。

#### $or运算符 
- $or是一个逻辑查询运算符，可以基于一个或多个表达式执行逻辑OR操作，返回**至少满足一个表达式**的文档。
```js
$or:[{expression1}, {expression2},...] 
```
- **$or 连接的两个字句均有索引时才会选择索引扫描**，否则进行集合扫描。这和MySQL的OR子句相似。将索引与 $or 查询一起使用时，$or 的每个子句都可使用自己的索引。
- 如果 $or 包含 $text （文本查询），则 $or 数组中的**所有子句都必须由索引支持**。这是因为 $text 查询必须使用索引，而仅当索引支持 $or 的所有子句时，后者才能使用索引。如果 $text 查询无法使用索引，则该查询将返回错误，因为文本搜索必须依赖索引。
#### $not运算符 
- $not是一个逻辑查询运算符，可以将一个表达式的结果进行逻辑NOT运算，**返回不满足条件的文档，包括那些不存在指定字段的文档**
- 也就是说，假如将$not 与 $lt等运算符连用，**也将返回不存在指定字段的文档**，而不是只返回比指定value大的
```js
{ field: { $not: { <expression> } } }
```
#### $nor运算符 
- $nor是一个逻辑查询运算符，可以基于一个或多个表达式执行逻辑NOR运算，返回**不满足所有条件**的文档。
- 与$not运算符类似，$nor运算符也会返回指定字段不存在的文档。 
```js
{ $nor: [ { <expression1> }, { <expression2> },...] }
```

### 元素运算符 
- MongoDB中两个元素查询运算符是$exists以及$type。
#### $exists
- $exists是一个元素查询运算符，语法如下：
```js
{ field: { $exists: <boolean_value> } } 
```
- 如果设置为true，$exists运算符将会匹配指定字段**存在数值**的文档，数值**可以是null**。 如果设置为false，$exists运算符将会匹配**不包含指定字段**的文档。
- 可以利用$exist/$not/$lt三者联合达到$gt的效果，但多此一举

#### $type运算符 
- $type是一个元素查询运算符，可以查找字段为指定BSON类型的文档。$type运算符的语法如下： 
```js
{ field: { $type: <BSON type> } } 
{ field: { $type: [ <BSON type1> , <BSON type2>, ... ] } }
```
- 可以指定 BSON 类型的编号或别名。
- 如果传入type数组，那么匹配数组中的**其中任意一个**。
- 有时候我们需要处理非结构化的数据，而它们没有明确的数据类型。此时，我们就需要使用$type运算符。 
- 对于 field 为数组的文档，$type 返回的文档中**至少有一个数组元素与传递给 $type 的类型匹配**，也就是说**如果field数组某一元素的类型能够在type数组中找到，那么就是匹配的**
- 对 $type: "array" 的查询会**返回字段本身为数组**的文档。

### 数组运算符 
- MongoDB中查找数组元素相关的运算符**包括$size、$all以及$elemMatch**。

|运算符|用途|
|---|---|
|$all|匹配包含查询中指定的所有元素的数组|
|$elemMatch|如果大量字段中至少有一个元素与所有指定的 $elemMatch 条件匹配，则选择文档|
|$size|	如果大量字段包含指定数量的元素，则选择文档|

#### $size运算符 
- $size是一个数组查询运算符，可以判断文档的字段是否**包含指定数量**的元素。
```js
{ array_field: {$size: element_count} }
```
- 其中，array_field是字段名，element_count表示该字段包含的元素数量。
- 查询语句用到$size的部分无法使用索引，但其它子句如果能使用那就会使用索引。

#### $all运算符 
- $all 是一个数组查询运算符，可以判断文档的字段是否**包含指定的所有元素**。有点类似于and。
```js
{ <arrayField>: { $all: [element1, element2, ...]} } 
```
- 如果$all运算符后面的数组为空，不会匹配任何文档。 
- 如果$all运算符只有一个元素，应该使用表达式$and，而不是数组：
- 如果$all运算符指定一个数组，匹配field等于该数组或包含该数组的文档。

#### $elemMatch运算符 
- $elemMatch也是一个数组查询运算符，可以判断文档是否包含指定数组字段，并且该字段**至少包含一个满足条件**的元素。
```js
{ <field>: { $elemMatch: { <query1>, <query2>, ... } } }
```
- 不能在 $elemMatch 中指定 $where操作符。
- 无法在 $elemMatch 中指定 $text 查询运算符。

### 其他运算符

#### 按位操作

|运算符|用途|
|---|---|
|$bitsAllClear|匹配数字或二进制值，其中一组片段位置均包含值|
|$bitsAllSet|匹配数字或二进制值，其中一组片段位置均包含值1|
|$bitsAnyClear|匹配数字或二进制值，其中一组位位置中的任何位的值为0|
|$bitsAnySet|匹配数字或二进制值，其中一组位位置中的任何 位的值为 1|

#### 地理空间与几何

|运算符|用途|
|---|---|
|$geoIntersects|选择与 GeoJSON 几何图形相交的几何图形。2dsphere 索引支持 $geoIntersects|
|$geoWithin|选择在边界 GeoJSON 几何图形内的几何图形。2dsphere 和 2d 索引支持 $geoWithin|
|$near|返回靠近点的地理空间对象。需要地理空间索引。2dsphere 和 2d 索引支持 $near|
|$nearSphere|返回与球面上的某个点相邻的地理空间对象。需要地理空间索引。2dsphere 和 2d 索引支持 $nearSphere|
|$box|指定一个矩形框，使用 legacy coordinate pairs 进行 $geoWithin 查询。2d 索引支持 $box|
|$center|当使用平面几何时，使用旧版坐标对为 $geoWithin 查询指定一个圆。2d 索引支持 $center|
|$centerSphere|在使用球面几何时，使用旧版坐标对或 GeoJSON 格式为 $geoWithin 查询指定一个圆2dsphere 和 2d 索引支持 $centerSphere|
|$geometry|为地理空间查询操作符指定 GeoJSON 格式的几何图形|
|$maxDistance|指定最大距离以限制$near和$nearSphere查询的结果。 2dsphere和2d索引支持$maxDistance|
|$minDistance|指定限制 $near 和 $nearSphere 查询结果的最小距离。仅适用于 2dsphere 索引|
|$polygon|指定一个多边形，使用 legacy coordinate pairs 进行 $geoWithin 查询。2d 索引支持 $polygon|

### sort()
- sort()方法可以为查询返回的文档指定指定一个显示顺序，**每个字段都可以指定升序或者降序排序**。
```js
cursor.sort({field1: order, field2: order, ...}) 
```
- **{ field: 1 }表示按照字段的升序排序，{ field: -1}表示按照字段的降序排序**
- field可以指定多个，如果对多个字段进行排序，则**按从左到右的顺序进行排序**。例如文档首先按 `<field1>` 排序。然后，具有相同 `<field1>` 值的文档将按 `<field2>` 进一步排序。
- 如果排序字段的类型不同将按如下顺序进行比较：
MinKey（内部类型）-> null -> 数值（int、long、double、decimal） -> 符号，字符串 -> 对象 -> 数组 -> BinData -> ObjectId -> 布尔 -> Date -> 时间戳 -> 正则表达式 -> JavaScript代码 -> 带作用域的 JavaScript 代码 -> MaxKey（内部类型）
- **最多可以对 32 个键进行排序**。
- 为排序模式**提供重复字段会导致错误**。
- MongoDB 不按特定顺序将文档存储在集合中。对包含重复值的字段进行排序时，可能会以任何顺序返回包含这些值的文档。
- sort()方法不是“稳定排序”，这意味着具有等效排序键的文档在输出中不一定能保持与输入相同的相对顺序。
- 如果排序条件中指定的字段在两个文档中都不存在，那么它们排序所依据的值是相同的。这两个文档可以以任何顺序返回。
- 如果需要一致的排序顺序，请在排序中至少纳入一个包含唯一值的字段。最简单方法是在排序查询中纳入 _id 字段。

### limit()
- limit()方法可以**限制查询返回的文档数量**。
```js
db.collection.find(<query>).limit(<documentCount>)
```
- 通常结合limit()和skip()方法实现分页功能。skip()方法用于指定从哪一个文档开始返回结果
```js
cursor.skip(<offset>) 
```
- skip()意味着 MongoDB服务器需要从结果集中扫描并忽略指定数量的文档，然后开始返回结果。因此，随着页数的增加，skip()方法会越来越慢。
    - 例如skip(1000000).limit(10),遍历大量数据并丢弃只取10条，读取性价比太低，执行效率还很慢
- 将 skip() 和 limit() 链接在一起时，方法链接顺序不会影响结果。服务器始终会根据排序顺序应用跳过操作，然后再应用对返回文档数量的限制。

## 更新文档

### updateOne()方法 
- updateOne()方法可以更新满足条件的单个文档，语法如下： 
```js
db.collection.updateOne(filter, update, options)
```
- 其中， 
    - 1. filter用于指定一个查询条件。如果多个文档都满足条件，updateOne()**只会更新第一个满足条件的文档**。如果指定一个空文档（{}）作为查询条件，updateOne()将会更新集合中返回的第一个文档。 
    - 2. update用于指定更新操作。 
    - 3. options参数用于指定一些更新选项：
        - 1. upsert：如果没有匹配的文档，是否插入一个新文档。true将创建并插入一个新文档。如果存在匹配的文档又设置该字段为true, 则该操作会修改或替换匹配的一个或多个文档。
        - 2. arrayFilters：当更新嵌套数组时，指定应更新的数组元素的条件。
        - 3. collation：指定比较字符串时使用的排序规则。
- updateOne()方法将会返回一个结果文档，包括但不限于以下字段： 
    - 1. matchedCount字段返回了**满足条件的文档数量**。 
    - 2. modifiedCount字段返回了**被更新的文档数量**。对于updateOne()方法，结果为0或者1。
    - 3. upsertedId 包含用于已更新或插入的文档的 _id
    - 4. upsertedCount 包含更新或插入文档的数量。
    - 5. 如果操作使用写关注来运行，则布尔值 acknowledged 为 true；如果已禁用写关注，则为 false
- updateOne() 与 db.collection.explain() 不兼容。
- $set 操作符 用于替换指定字段的值，语法如下：
```js 
{ $set: { <field1>: <value1>, <field2>: <value2>, ...}} 
```
- **如果指定的字段不存在，$set操作符将会为文档增加一个新的字段**，只要新的字段不违反类型约束。 
- 如果指定字段时使用了点符号，例如embededDoc.field，同时字段 field不存在，$set 操作符将会创建一个嵌入式文档。
- upsert选项：更新插入包含了两个操作，更新文档和插入文档： 
    - 1. 如果存在匹配的文档，更新该文档； 
    - 2. 否则，插入一个新文档。 
- 如果想要实现更新插入，可以将 updateOne()方法中的 upsert 选项设置为 true
```js
db.collection.updateOne(filter, update, { upsert: true} ) 
```

###  updateMany()方法 
- updateMany() 方法可以**更新满足条件的所有文档**，语法如下： 
```js
db.collection.updateMany(filter, update, options)
```
- 其中， 
    - 1. filter用于指定一个查询条件。如果多个文档都满足条件，updateMany()**只会更新第一个满足条件的文档**。如果指定一个空文档（{}）作为查询条件，updateMany()将会更新集合中返回的第一个文档。 
    - 2. update用于指定更新操作。 
    - 3. options参数用于指定一些更新选项
        - 1. upsert：如果没有匹配的文档，是否插入一个新文档。true将创建并插入一个新文档。如果存在匹配的文档又设置该字段为true, 则该操作会修改或替换匹配的一个或多个文档。
        - 2. arrayFilters：当更新嵌套数组时，指定应更新的数组元素的条件。
        - 3. collation：指定比较字符串时使用的排序规则。
- updateOne()方法将会返回一个结果文档，包括但不限于以下字段： 
    - 1. matchedCount字段返回了**满足条件的文档数量**。 
    - 2. modifiedCount字段返回了**被更新的文档数量**。
    - 3. upsertedId 包含用于已更新或插入的文档的 _id
    - 4. upsertedCount 包含更新或插入文档的数量。
    - 5. 如果操作使用写关注来运行，则布尔值 acknowledged 为 true；如果已禁用写关注，则为 false
- updateMany() 同样使用 $set 操作符执行更新操作。
- updateMany() 单独修改每个文档，**MongoDB保证单文档写入都是一个原子操作**，**但updateMany() 作为一个整体不是原子操作**，如果单个文档更新失败，则**保留失败之前写入的所有文档更新，但不会更新任何剩余的匹配文档**
- 如果想要实现更新插入，可以将 updateMany()方法中的 upsert 选项设置为 true
```js
db.collection.updateMany(filter, update, { upsert: true} ) 
```
### replaceOne()方法
- replaceOne根据筛选器替换集合内的单个文档。
```js
db.collection.replaceOne(filter, replacement, options)
```
- 其中， 
    - 1. filter用于指定一个查询条件。如果多个文档都满足条件，replaceOne()**只会替换第一个满足条件的文档**。如果指定一个空文档（{}）作为查询条件，replaceOne()将会更新集合中返回的第一个文档。 
    - 2. replacement用于替换文档，可以具有与原始文档不同的字段，**必须仅包含字段/值对，不能包含更新操作符表达式**
    - 3. options参数用于指定一些更新选项
        - 1. upsert：如果没有匹配的文档，是否插入一个新文档。true将创建并插入一个新文档。如果存在匹配的文档又设置该字段为true, 则该操作会修改或替换匹配的一个或多个文档。
        - 2. arrayFilters：当更新嵌套数组时，指定应更新的数组元素的条件。
        - 3. collation：指定比较字符串时使用的排序规则。
- replaceOne()方法返回一个文档包含以下内容：
    - 1. 如果插入文档时指定了安全写入（writeConcern），acknowledged字段的值为true；如果禁用了安全写入机制，该字段的值为false。
    - 2. matchedCount 包含匹配文档的数量
    - 3. modifiedCount 包含已修改文档的数量
    - 4. upsertedId 包含用于**已更新或插入的文档的 _id**
- replacement替换文档中可以省略 _id 字段，因为 _id 字段是不可变的。但是，如果确实包括 _id 字段，则它的值必须与当前值相同。

### findOneAndUpdate()方法
- findOneAndUpdate()方法用于查找并更新单个文档，**可以选择返回更新前或更新后的文档**。除非指定选项，**默认返回旧文档**。可以使用sort选项来指定查找时的顺序。
```js
db.collection.findOneAndUpdate(filter, update, options)
```
- 其中， 
    - 1. filter用于指定一个查询条件。如果多个文档都满足条件，findOneAndUpdate()只会更新第一个满足条件的文档。如果指定一个空文档（{}）作为查询条件，findOneAndUpdate()将会更新集合中返回的第一个文档。 
    - 2. update用于指定更新操作。可以是更新文档或者**聚合管道**
    - 3. options参数用于指定一些更新选项，不限于以下选项：
        - 1. upsert：如果没有匹配的文档，是否插入一个新文档。true将创建并插入一个新文档。如果存在匹配的文档又设置该字段为true, 则该操作会修改或替换匹配的一个或多个文档。
        - 2. sort，可选。为 filter 所匹配的文档指定排序顺序。
        - 3. arrayFilters：当更新嵌套数组时，指定应更新的数组元素的条件。
        - 4. collation：指定比较字符串时使用的排序规则。
        - 5. **returnDocument字段根据状态指定返回文档，before返回更新前的文档，after返回更新后的文档**。
        - 6. projection：投影，指定返回的字段。
        - 7. writeConcern：指定写操作的确认级别。
- findOneAndUpdate()方法是个**原子操作**，因为它也是对单文档进行操作，只是先读再写
- 如果没有文档与 filter 匹配，则**不会更新任何文档**，并且也**不会返回任何文档而是Null**。

### findOneAndReplace()方法
- findOneAndReplace()方法用于查找并更新单个文档，**可以选择返回更新前或更新后的文档**。除非指定选项，**默认返回旧文档**。可以使用sort选项来指定查找时的顺序。
```js
db.collection.findOneAndReplace(filter, replacement, options)
```
- 其中， 
    - 1. filter用于指定一个查询条件。如果多个文档都满足条件，findOneAndReplace()只会替换第一个满足条件的文档。如果指定一个空文档（{}）作为查询条件，findOneAndReplace()将会替换集合中返回的第一个文档。 
    - 2. replacement用于指定更新替换的文档。可以具有与原始文档不同的字段，**必须仅包含字段/值对，不能包含更新操作符表达式**
    - 3. options参数用于指定一些更新选项，不限于以下选项：
        - 1. upsert：如果没有匹配的文档，是否插入一个新文档。true将创建并插入一个新文档。如果存在匹配的文档又设置该字段为true, 则该操作会修改或替换匹配的一个或多个文档。
        - 2. sort，可选。为 filter 所匹配的文档指定排序顺序。
        - 3. collation：指定比较字符串时使用的排序规则。
        - 4. **returnDocument字段根据状态指定返回文档，before返回更新前的文档，after返回更新后的文档**。
        - 5. projection：投影，指定返回的字段。
        - 6. writeConcern：指定写操作的确认级别。
- findOneAndReplace()方法是个**原子操作**，因为它也是对单文档进行操作，只是先读再替换
- 如果没有文档与 filter 匹配，则**不会更新任何文档**，并且也**不会返回任何文档而是Null**。


### 更新操作符
#### $set 和 $unset操作符
- $set 操作符会用指定值替换某个字段的值。
```js 
{ $set: { <field1>: <value1>, <field2>: <value2>, ...}} 
```
- 如果指定的字段不存在，**$set操作符将会为文档增加一个新的字段**，只要新的字段不违反类型约束。 
- 如果$set更新文档为空{}，**则什么也不做**
- 如果指定字段时使用了点符号，例如embededDoc.field，同时字段 field不存在，$set 操作符将会创建一个嵌入式文档。
- $unset 是一个字段更新操作符，用于**删除文档中的指定字段**。 $unset 操作符的语法如下： 
```js
{ $unset: {<field>: "", ... }} 
```
- 参数中的字段值不影响操作结果，可以指定任意值。如果**指定字段不存在，不会执行任何操作**，也不会返回错误或者警告。
- 如果想要指定嵌入书文档中的字段，可以使用点符号： `{ $unset: { "<embedded_doc>.<field>": "", ... }} `
- $unset 操作符**不会删除任何数组元素，而是将数组元素设置为空**。
#### $inc 和 $mul操作符
- $inc 操作符用来增加指定字段的值。$inc 操作符的语法如下： 
```js
{ $inc: {<field1>: <amount1>, <field2>: <amount2>, ...} }
```
- 其中，amount 可以是**正数或者负数**。正数表示增加字段的值，负数表示减少字段的值。 
- 如果指定的字段不存在，$inc 操作符**将会创建并设置该字段的值**。
- 如果$inc更新文档为空{}，**则什么也不做**
- 对 **null** 值的字段使用 $inc 运算符会**产生错误**。
-  $mul 操作符用于将字段的值乘以一个倍数。
```js
{ $mul: { <field1>: <number1>, <field2>: <number2>, ... } }
```
- 被更新的字段**必须是一个数字字段**。
- 如果需要更新嵌入式文档中的字段或者数组中的元素，可以使用点符号，例如 `<embedded_doc>.<field>` 或者`<array>.<index>`。
- 如果被更新的字段不存在，$mul 操作符将会**创建字段并将其值设置为与乘数数值类型相同的零值**。
- 如果$inc更新文档为空{}，则**什么也不做**
- 与混合数值类型（32 位整数、64 位整数、Double、十进制128）的值相乘可能会导致数值类型转换。如果两个 32 位整数的乘积超过 32 位整数的最大值，则结果为 64 位整数。超过 64 位整数最大值的任何类型的整数运算都会产生错误。
#### $min 和 $max 操作符
- $min 是一个字段更新操作符，如果指定的数值小于（<）字段当前值，将字段的值修改为指定值
```js
{ $min: {<field1>: <value1>, ...} }
```
- 如果指定的字段不存在，$min 操作符将会**创建字段并设置字段的值**。 
- 如果$min操作符的更新文档为空{}，或者指定数值大于等于字段当前值，那么什么也不做
- $max 是一个字段更新操作符，如果指定的数值大于（>）字段当前值，将字段的值修改为指定值。 
```js
{ $max: {<field1>: <value1>, ...} }
```
- 如果指定的字段不存在，$max 操作符将会**创建字段并设置字段的值**。 
- 如果$max操作符的更新文档为空{}，或者指定数值小于等于字段当前值，那么什么也不做
#### $rename 操作符  
- $rename 是一个字段更新操作符，可以用于修改文档的字段名。
```js
{ $rename: { <field_name>: <new_field_name>, ...}}
```
- **新的字段名必须和原字段名不同**。
- 如果要重命名的字段在文档中不存在，$rename 不会执行任何操作。
- 如果$rename操作符的更新文档为空{}，不会执行任何操作
- 如果文档中已经存在一个名为field_name的字段，$rename 操作符将会删除该字段，然后将字段field_name改名为new_field_name。
- 实际上，$rename执行两步操作：
    - 1. 从文档中删除旧 `<field>` 和具有 `<newName>` 的字段（使用 $unset）。
    - 2. 通过使用 `<field>` 中的值，使用 `<newName>` 执行 $set 操作。 

## 删除文档
### deleteOne()方法
- deleteOne()方法用于删除集合中的单个文档，语法如下：
```js
db.collection.deleteOne(filter, option) 
```
- 该方法包含两个参数： 
    - 1. filter 是一个**必选**参数，用于指定一个查询条件，满足条件的文档才会被删除。如果指定一个空文档（{}）作为查询条件，将会删除集合中的第一个文档
    - 2. option 是一个可选参数，用于指定删除选项
            - 1. writeConcern：指定写操作的确认级别。
            - 2. collation：指定比较字符串时使用的排序规则。
- deleteOne() 方法返回一个结果文档，其中
    - 1. acknowledged，一个布尔值。如果插入文档时指定了安全写入 （writeConcern），该字段的值为true；如果禁用了安全写入机制，该字段的值为false。 
    - 2. **deleteCount** 字段存储了**被删除文档的数量**。 

### deleteMany()方法
- deleteMany()方法用于删除满足条件的所有文档，语法如下： 
```js
db.collection.deleteMany(filter, option)
```
- 该方法包含两个参数： 
    - 1. filter 是一个**必选**参数，用于指定一个查询条件，满足条件的文档才会被删除。如果指定一个空文档（{}）作为查询条件，将会删除集合中的**全部文档**。**返回已经删除的文档**。
    - 2. option 是一个可选参数，用于指定删除选项
        - 1. writeConcern：指定写操作的确认级别。
        - 2. collation：指定比较字符串时使用的排序规则。
- deleteMany() 方法返回一个结果文档，其中
    - 1. acknowledged，一个布尔值。如果插入文档时指定了安全写入 （writeConcern），该字段的值为true；如果禁用了安全写入机制，该字段的值为false。 
    - 2. deleteCount 字段存储了**被删除文档的数量**。
### findOneAndDelete()方法
- findOneAndDelete()根据条件删除单个文档，并返回**已删除的文档**。
```js
db.collection.findOneAndDelete()(filter, options)
```
- 该方法包含两个参数： 
    - 1. filter 是一个**必选**参数，用于指定一个查询条件，满足条件的文档才会被删除。如果多个文档都满足条件，findOneAndDelete()只会删除第一个满足条件的文档。如果指定一个空文档（{}）作为查询条件，将会删除集合中的**全部文档**
    - 2. option 是一个可选参数，用于指定删除选项
            - 1. writeConcern：指定写操作的确认级别。
            - 2. collation：指定比较字符串时使用的排序规则。
            - 3. projection：投影，指定返回的字段。
            - 4. sort：指定排序顺序以确定要删除的文档。
- findOneAndDelete()方法同样也是**原子操作**
- 如果没有文档与 filter 匹配，则**不会删除任何文档**，并且也**不会返回任何文档而是Null**。

### 其它更新操作符
#### 字段

|运算符|用途|
|---|---|
|$currentDate|将字段的值设置为当前日期，可以是日期或时间戳|
|$inc|将字段的值按指定量递增|
|$min|仅当指定值小于现有字段值时才更新字段|
|$max|仅当指定值大于现有字段值时才更新字段|
|$mul|将字段的值乘以指定量|
|$rename|重命名字段|
|$set|设置文档中字段的值|
|$setOnInsert|如果某一更新操作导致插入文档，则设置字段的值。对修改现有文档的更新操作没有影响|
|$unset|从文档中删除指定的字段|

#### 数组

|运算符|用途|
|---|---|
|$|充当占位符，用于更新与查询条件匹配的第一个元素|
|$[]|充当占位符，以更新数组中与查询条件匹配的文档中的所有元素|
|`$[<identifier>]`|充当占位符，以更新与查询条件匹配的文档中所有符合 arrayFilters 条件的元素|
|$addToSet|仅向数组中添加尚不存在于该数组的元素|
|$pop|**删除数组的第一项或最后一项**|
|$pull|**删除与指定查询匹配的所有数组元素，必须传入条件**|
|$push|**向数组添加一项**|
|$pullAll|**从数组中删除所有匹配值，必须传入明确的值**|
|$each|修饰 $push 和 $addToSet 运算符，以在数组更新时追加多个项目|
|$position|修饰 $push 运算符，以指定在数组中添加元素的位置|
|$slice|**修饰 $push 运算符，从头部删除元素以限制更新后数组的大小**|
|$sort|**修饰 $push 运算符**，以对存储在数组中的文档重新排序|
|$bit|对整数值执行按位 AND、OR 和 XOR 更新|

# 聚合管道与聚合操作
- MongoDB 聚合操作可以处理多个文档并返回计算后的结果。聚合操作通常用于按照指定字段的值进行分组并计算汇总结果。
- 聚合管道用于执行聚合操作，**一个聚合管道包含一个或者多个处理文档的阶段**。每个阶段都会基于它的输入文档执行操作，然后返回输出文档；输出文档会传递给下一个阶段，最后一个阶段返回最终的结果。
## aggregate()方法
- 使用db.collection.aggregate()来创建一个聚合管道以执行聚合操作：
```js
db.collection.aggregate( <pipeline>, <options> )
```
- 其中：
    - 1. pipeline是一个数组，接受多个阶段操作，该方法仍然可以接受管道阶段作为单独的参数，而不是作为数组中的元素；但是，如果您未将 pipeline 指定为数组，则无法指定 options 参数。
    - 2. options是可选项，仅当将 pipeline 指定为数组时才可用。
- aggregate()方法返回一个在聚合分析管道的最后阶段生成的**文档游标**。
    - 由于mongo shell自动遍历aggregate()返回的游标，我们不需要执行额外的操作就可以获取游标中的文档。默认情况下，mongo shell只显示前20篇文档，输入it命令可以显示更多文档。 
- 如果管道包含 explain 选项，查询将返回一个详细说明聚合操作处理的文档。
- 如果管道包含 $out 或 $merge 操作符，查询将返回一个**空游标**。
- 示例：以下聚合操作选择状态等于 "A" 的文档，按 cust_id 字段对匹配文档进行分组，并根据 amount 字段的总和计算每个 cust_id 字段的 total，并对结果按 total 字段降序排列：
```js
db.orders.aggregate( [
   { $match: { status: "A" } },
   { $group: { _id: "$cust_id", total: { $sum: "$amount" } } },
   { $sort: { total: -1 } }
] )
```
- 下表列出了 SQL 和 MongoDB 聚合操作的比对： 

|MongoDB|MySQL|
|---|---|
|**$project**|**select**|
|**db.collection.aggregate(…)**|**from**|
|**$unwind**|**UNNEST/LATERAL JOIN**|
|**$match**|**where**|
|**$group**|**group by**|
|**聚合表达式**：$avg、$count、$sum、$max、$min|**聚合函数**：avg、count、sum、max、min|
|**$match**|**having**|
|**$limit**|**limit**|
|**$lookup**|**join**|
|$out|SELECT INTO NEW_TABLE|
|$merge|MERGE INTO TABLE|
|$unionWith|UNION ALL|

## 聚合操作
### $project
- $project：将带所请求字段的文档传递至管道中的下个阶段。指定的字段可以是输入文档中的已有字段或新计算的字段。相当于投影操作。
```js
{ $project: { <specification(s)> } }
```
- $project 采用的文档可以指定包含字段、添加新字段以及重置现有字段的值, 也可以指定排除字段。
- 默认情况下，_id 字段包含在输出文档中。要在输出文档中包含输入文档中的任何其他字段，必须在 $project 中明确指定包含该字段。要从输出文档中排除 _id 字段，必须在 $project 中明确指定 _id 字段为零。
- 如果$project没有指定后续阶段用到的索引字段，或者为它们起了**别名**，**会导致索引失效**
- 如果指定包含的字段在文档中并不存在，那么 $project 将**忽略**该字段。
- 如果指定排除一个或多个字段，则**所有其他字段均为在输出文档中返回**
### $addFields
- $addFields: 为文档**添加新字段**。$addFields 输出文档包含输入文档中的**所有现有字段**和**新添加的字段**。指定要添加的每个字段的名称，并将其值设立为聚合表达式或空对象。
```js
{ $addFields: { <newField>: <expression>, ... } }
```
- $addFields 阶段等效于 $project 阶段，后者明确指定输入文档中的所有现有字段并添加新字段。还可以使用 $set 阶段，它是 $addFields 的别名。
- 如果新字段名称与现有字段名称（包括 _id）相同，$addFields 将用指定表达式的值覆盖该字段的现有值。

### $match
- $match：用于过滤数据，只输出符合条件的文档。$match使用MongoDB的标准查询操作，支持所有查询操作符
```js
{ $match: { <query predicate> } }
```
- **尽可能早地将 $match 放在聚合管道中**。由于 $match 限制了聚合管道中的文档总数，因此早期的 $match 操作会最大限度地减少管道中的处理量。
- 如果在管道的开头放置一个 $match，查询可以像使用任何其他 db.collection.find() 或 db.collection.findOne() 那样**使用索引**。
- 如果满足以下条件之一，则 $match 阶段会从管道结果中过滤掉文档：
    - 1. $match查询谓词返回该文档的 0、null 或 false 值。
    - 2. $match查询谓词使用了该文档中缺少的字段。
- **不能在 $match 阶段使用 $where**。
- 不能在 $match 阶段中使用 $near 或 $nearSphere。可以改用：
    - 1. 使用 $geoNear 阶段而不是 $match 阶段。
    - 2. 在 $match 阶段使用带有 $center 或 $centerSphere 的 $geoWithin 查询谓词操作符。
- 要在 $match 阶段中使用 $text， $match 阶段必须是管道的第一阶段。
### $limit
- $limit：用来限制MongoDB聚合管道返回的文档数。
```js
{ $limit: <positive 64-bit integer> }
```
- $limit 取一个正整数，用于指定传递的最大文档数量。
- 从 MongoDB 5.0 开始，$limit 管道聚合有 64 位整数限制。传递给管道的值如果超过此限制，将返回无效参数错误。
- 如果将 $limit 阶段与以下任何一项一起使用，在将结果传递到 $limit 阶段之前，请务必在排序中至少包含一个包含唯一值的字段：
    - 1. $sort 聚合阶段
    - 2. sort() 方法
    - 3. findAndModify()方法中的 sort 字段
- 因为对包含重复值的字段进行排序时，可能会在多次执行中对这些重复字段返回不一致的排序顺序，尤其是当集合正在接收写入时。为确保排序一致，最简单方法是在排序查询中纳入 _id 字段。
### $skip
- $skip：在聚合管道中跳过指定数量的文档，并返回余下的文档。
```js
{ $skip: <positive 64-bit integer> }
```
- $skip 取一个正整数，用于指定传递的最大文档数量。
- 如果要将$skip与$limit连用进行分页，**务必将$skip放在$limit前面**
- 从 MongoDB 5.0 开始，$skip 管道聚合有 64 位整数限制。传递给管道的值如果超过此限制，将返回无效参数错误。
- 如果将 $skip 阶段与以下任何一项一起使用，在将结果传递到 $limit 阶段之前，请务必在排序中至少包含一个包含唯一值的字段：
    - 1. $sort 聚合阶段
    - 2. sort() 方法
    - 3. findAndModify()方法中的 sort 字段
- 因为对包含重复值的字段进行排序时，可能会在多次执行中对这些重复字段返回不一致的排序顺序，尤其是当集合正在接收写入时。为确保排序一致，最简单方法是在排序查询中纳入 _id 字段。
### $unwind
- $unwind：解构输入文档中的数组字段，以便为每个元素输出文档。具体来说，将文档中的某一个数组类型字段**拆分成多条**，每条包含数组中的一个值, 再为它们创建输出文档，每个文档包含数组中的一个字段。$unwind有以下**两种**用法：
```js
{ 
  $unwind: <field path> 
}

{
  $unwind:
    {
      path: <field path>,
      includeArrayIndex: <string>,
      preserveNullAndEmptyArrays: <boolean>
    }
}
```
- 可以将数组字段路径传递给 $unwind。使用该语法时，如果**字段值为 null、缺失或空数组**，则 $unwind **不会输出文档**。
- 可以将文档传递给 $unwind 以指定各种行为选项：
    - 1. includeArrayIndex可选，新字段的名称，用于保存该元素的数组索引。名称不能以美元符号 $ 开头。
    - 2. preserveNullAndEmptyArrays可选，一个布尔值，默认值为 false。true：如果path 为 null、缺失或空数组，$unwind 会输出文档；false：如果为path ，如果 为 null、缺失或空数组，则$unwind 不会输出文档。
### $group
- $group：将集合中的文档**分组并对每一组数据执行聚合计算**，可用于统计结果。
```js
{
 $group:
   {
     _id: <expression>, // Group key
     <field1>: { <accumulator1> : <expression1> },
     ...
   }
 }
```
- $group 有两个参数：
    - 1. _id：必需。分组规则，_id表达式指定分组依据的键，可以是字段名、常量、表达式、多个字段联合分组。如果指定的 _id 值为null或任何其他常量值，$group 阶段将返回聚合所有输入文档值的单个文档，相当于**对整个集合的文档分一组**。
        - 格式： **`_id: "$field_name"`** ，字段名**必须加 $ 前缀**，这是 MongoDB 聚合中引用字段值的固定语法
    - 2. field ：自定义聚合字段名与聚合表达式，对每个分组内的所有文档，执行聚合计算，得到统计结果，也就是`新字段名: { 聚合表达式: 参数 }`
- **$group 不会对其输出文档进行排序**，应使用$sort

### $lookup
- $lookup：将当前集合/视图与**同一个数据库的**另一个集合/视图进行**左外连接**(Left Outer Join), 把匹配到的数据作为**数组字段**追加到主集合的文档中
```js
{
   $lookup:
     {
       from: <collection to join>,
       localField: <field from the input documents>,
       foreignField: <field from the documents of the "from" collection>,
       let: { <var_1>: <expression>, …, <var_n>: <expression> },
       pipeline: [ <pipeline to run> ],
       as: <output array field>
     }
}

```
- $lookup有六个参数：
  - 1. from: 左连接的主集合
  - 2. localField:左集合中用于匹配的字段
  - 3. foreignField:右集合中用于和左集合匹配字段进行比较的字段
  - 4. as：匹配到的副表数据放在主表的哪个字段里，这个字段是自动新增的，永远是数组类型。如果这个字段已经存在，将使用连接后的数据**覆盖**
  - 5. let，可选，指定在管道阶段中使用的变量。使用变量表达式访问本地集合文档中的字段，这些文档输入到 pipeline。
  - pipeline: 管道，返回左集合的文档。如要返回所有文档，请指定一个空的 管道: []
- 要组合来自两个不同集合的元素，使用 $unionWith。

### $sort
- $sort：将输入文档排序后输出。
```js
{ $sort: { <field1>: <sort order>, <field2>: <sort order> ... } }
```
- $sort 接受一个文档参数：
    - 1. field指定多个如果对多个字段进行排序，则**按从左到右的顺序进行排序**。例如文档首先按 `<field1>` 排序。然后，具有相同 `<field1>` 值的文档将按 `<field2>` 进一步排序。
    - 2. <sort order> 指定排序规则，1 是升序，-1是降序
- $sort 是阻塞阶段，这会导致管道等待为阻塞阶段检索到所有输入数据，然后再处理数据。阻塞阶段可能会降低性能，因为它会减少具有多个阶段的管道的并行处理。 对于大型数据集，阻塞阶段还可能使用大量内存。
- 最多可以对 32 个键进行排序。
- 为排序模式提供重复字段会导致错误。
- MongoDB 不按特定顺序将文档存储在集合中。对包含重复值的字段进行排序时，可能会以任何顺序返回包含这些值的文档。
- $sort 操作不是“稳定排序”，这意味着具有等效排序键的文档在输出中不一定能保持与输入相同的相对顺序。
- 如果排序条件中指定的字段在两个文档中都不存在，那么它们排序所依据的值是相同的。这两个文档可以以任何顺序返回。
- 如果需要一致的排序顺序，请在排序中至少纳入一个包含唯一值的字段。最简单方法是在排序查询中纳入 _id 字段。

### 其它操作符
- 执行系列聚合操作时，参考的合理管道顺序设计：
    - 1. **$match**用查询条件在第一时间减少文档数量
    - 2. $project/$addFields添加所需字段/删除所需字段
    - 3. $sort利用索引加速，避免后期内存排序
    - 4. $lookup关联外部集合, 关联前确保数据集最小化
    - 5. $unwind展开数组, 在关联后展开，避免数据爆炸
    - 6. $group分组聚合计算
    - 7. **$project**精简字段, **后置避免提前删除索引字段** 
    - 8. $skip/$limit最终分页
- **除 `$out`、`$merge`、`$geoNear`、`$changeStream`、`$changeStreamSplitLargeEvent` 外，其他阶段可在管道中多次出现**；
- 适用方法中未特别标注的阶段，仅支持 `db.collection.aggregate()`；
- 别名阶段功能完全等价，可互换使用（如 `$addFields` 与 `$set`）；
- 标有版本限制的阶段，需确保 MongoDB 实例版本满足要求才能使用。
- 下表列出了常用的聚合阶段操作符：

| 阶段名称               | 别名                 | 核心说明                                                                 | 特殊限制                                                                 | 适用方法                          |
| ---------------------- | -------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------ | --------------------------------- |
| `$addFields`           | `$set`               | **为文档添加新字段**，保留现有字段，重塑文档，与 $project 类似，$addFields 重塑了流中的每个文档；具体来说，就是在输出文档中添加新字段，这些输出文档既包含输入文档中的现有字段，也包含新添加的字段。                                 | 无                                                                      | db.collection.aggregate()         |
| `$bucket`              | -                    | 根据指定表达式和边界，将文档分组成多个「存储桶」                         | 无                                                                      | db.collection.aggregate()         |
| `$bucketAuto`          | -                    | 根据指定表达式，自动划分存储桶边界，将文档均匀分配到指定数量的存储桶     | 无                                                                      | db.collection.aggregate()         |
| `$changeStream`        | -                    | 返回集合的 Change Stream 游标                                             | 仅能出现一次，且必须作为管道第一阶段                                     | db.collection.aggregate()、db.aggregate() |
| `$changeStreamSplitLargeEvent` | -              | 分割超过16MB的大型 change stream 事件                                     | 仅能在 `$changeStream` 管道中使用，且必须是该管道最后阶段                 | db.collection.aggregate()         |
| `$collStats`           | -                    | 返回集合或视图的统计信息                                                 | 无                                                                      | db.collection.aggregate()         |
| `$count`               | -                    | 返回当前阶段的文档数量计数（区别于 `$count` 聚合累加器）                  | 无                                                                      | db.collection.aggregate()         |
| `$densify`             | -                    | 在文档序列中创建新文档，补充字段中缺失的值                                 | 无                                                                      | db.collection.aggregate()         |
| `$documents`           | -                    | 从输入表达式返回字面文档                                                 | 无                                                                      | db.collection.aggregate()、db.aggregate() |
| `$facet`               | -                    | 单个阶段内处理多个聚合管道，支持多分面数据统计                             | 无                                                                      | db.collection.aggregate()         |
| `$fill`                | -                    | 填充文档中的 `null` 和缺失字段值                                          | 无                                                                      | db.collection.aggregate()         |
| `$geoNear`             | -                    | 根据地理空间点接近程度返回有序文档，整合 `$match`、`$sort`、`$limit` 功能 | 无                                                                      | db.collection.aggregate()         |
| `$graphLookup`         | -                    | 对集合执行递归搜索，为输出文档添加递归遍历结果数组                       | 无                                                                      | db.collection.aggregate()         |
| `$group`               | -                    | 按指定标识符分组文档，应用累加器表达式统计                               | 无                                                                      | db.collection.aggregate()         |
| `$indexStats`          | -                    | 返回集合每个索引的使用情况统计                                           | 无                                                                      | db.collection.aggregate()         |
| `$limit`               | -                    | 传递前 n 个文档到下一阶段                                                 | 无                                                                      | db.collection.aggregate()         |
| `$listClusterCatalog`  | -                    | 检索集群中集合的信息（名称、创建选项等）                                 | 无                                                                      | db.collection.aggregate()         |
| `$listSampledQueries`  | -                    | 列出所有集合或特定集合的抽样查询                                         | 无                                                                      | db.collection.aggregate()         |
| `$listSearchIndexes`   | -                    | 返回指定集合/视图上的 MongoDB Search 索引信息                             | 无                                                                      | db.collection.aggregate()         |
| `$listSessions`        | -                    | 列出已传播到 `system.sessions` 集合的所有活动会话                         | 无                                                                      | db.collection.aggregate()         |
| `$lookup`              | -                    | **对同一数据库的另一个集合/视图执行左外连接**                                 | 无                                                                      | db.collection.aggregate()         |
| `$match`               | -                    | 筛选文档流，仅匹配文档进入下一阶段（使用标准 MongoDB 查询）               | 无                                                                      | db.collection.aggregate()         |
| `$merge`               | -                    | 将聚合结果写入集合（支持插入、合并、替换等操作）                           | 必须是管道最后一个阶段                                                   | db.collection.aggregate()         |
| `$out`                 | -                    | 将聚合结果写入集合                                                       | 必须是管道最后一个阶段                                                   | db.collection.aggregate()         |
| `$planCacheStats`      | -                    | 返回集合的计划缓存信息                                                   | 无                                                                      | db.collection.aggregate()         |
| `$project`             | -                    | 重塑文档（添加/删除字段）                                                 | 无                                                                      | db.collection.aggregate()         |
| `$querySettings`       | -                    | 返回之前通过 `setQuerySettings` 添加的查询设置                            | 8.0版本新增                                                            | db.collection.aggregate()         |
| `$queryStats`          | -                    | 返回已记录查询的运行时统计信息                                           | 不支持，未来版本可能变更输出格式                                         | db.collection.aggregate()         |
| `$rankFusion`          | -                    | 合并多个排名管道结果，去重后用倒数排名融合算法生成最终排名                 | 无                                                                      | db.collection.aggregate()         |
| `$redact`              | -                    | 根据文档内信息限制内容，整合 `$project` 和 `$match` 功能（字段级访问控制） | 无                                                                      | db.collection.aggregate()         |
| `$replaceRoot`         | `$replaceWith`       | 用指定嵌入文档替换原文档（替换所有字段，包括 `_id`）                       | 无                                                                      | db.collection.aggregate()         |
| `$replaceWith`         | `$replaceRoot`       | 用指定嵌入文档替换原文档（替换所有字段，包括 `_id`）                       | 无                                                                      | db.collection.aggregate()         |
| `$sample`              | -                    | **从输入中随机选择指定数量的文档**                                           | 无                                                                      | db.collection.aggregate()         |
| `$search`              | -                    | 对 Atlas 集合的字段执行全文搜索                                           | 仅适用于 MongoDB Atlas 集群                                             | db.collection.aggregate()         |
| `$searchMeta`          | -                    | 返回 MongoDB Search 查询的元数据结果                                     | 仅适用于 MongoDB Atlas 集群                                             | db.collection.aggregate()         |
| `$set`                 | `$addFields`         | 为文档添加新字段，保留现有字段，重塑文档                                 | 无                                                                      | db.collection.aggregate()         |
| `$setWindowFields`     | -                    | 将文档分组到窗口，对每个窗口应用操作符                                   | 5.0版本新增                                                            | db.collection.aggregate()         |
| `$skip`                | -                    | 跳过前 n 个文档，传递剩余文档到下一阶段                                   | 无                                                                      | db.collection.aggregate()         |
| `$sort`                | -                    | 按指定排序键重新排序文档流                                               | 无                                                                      | db.collection.aggregate()         |
| `$sortByCount`         | -                    | 按指定表达式分组文档，计算每个分组的文档数量                               | 无                                                                      | db.collection.aggregate()         |
| `$unionWith`           | -                    | 执行两个集合/视图的管道结果并集                                           | 无                                                                      | db.collection.aggregate()         |
| `$unset`               | -                    | 从文档中删除/排除字段（`$project` 的别名）                                | 无                                                                      | db.collection.aggregate()         |
| `$unwind`              | -                    | 解构数组字段，为每个数组元素输出一个文档                                 | 无                                                                      | db.collection.aggregate()         |
| `$vectorSearch`        | -                    | 对 Atlas 集合的向量字段执行近似/精确最近邻搜索                             | 仅适用于 MongoDB v6.0.11+ 的 Atlas 集群，不适用于自管理部署              | db.collection.aggregate()         |
| `$currentOp`           | -                    | 返回 MongoDB 部署的活动/休眠操作信息                                     | 无                                                                      | db.aggregate()                    |
| `$listLocalSessions`   | -                    | 列出当前连接实例上最近使用的活动会话（可能未传播到 `system.sessions`）     | 无                                                                      | db.aggregate()                    |

## 聚合表达式
- MongoDB 聚合操作中常用的表达式有$sum, $avg, $count, $min 和 $max

### $ sum表达式
- $sum 表达式，用于返回一组数值的总和。该表达式的语法如下： 
```js
{ $sum: <expression> } 
```
- 如果汇总的字段包含**非数值内容**， $sum 表达式会**忽略**相应的内容。
- 如果所有文档中都**不存在**指定的汇总字段，$sum 表达式的**结果为 0**。
- 如果所有操作数都是**非数字、非数组或包含 null 值**，则 $sum 返回 0。
- 当混合输入类型时，$sum 会将较小的输入类型提升为两者中较大的输入类型。当一个类型表示更广泛的值时，该类型被视为较大。数字类型从小到大的顺序为：integer → long → double → decimal
- 较大的输入类型也决定了结果类型，除非操作溢出，超出了较大数据类型所代表的范围。在溢出的情况下，$sum 按照以下顺序推送结果：
   - 1. 如果较大的输入类型为 integer，则结果类型将提升为 long。
    - 2. 如果较大的输入类型为 long，则结果类型将提升为 double。
    - 3. 如果较大的类型是 double 或 decimal，则溢出结果表示为 + 或 - 无穷大。没有对结果进行类型推送。

### $count 表达式 
-  $count 表达式的作用就是返回文档的数量，语法如下：
```js
{ $count: {} }
```
- $count 表达式不需要任何参数, 等价于以下形式的 $sum 表达式：`{ $sum: 1 }`
 
### $avg 表达式 
- $avg 表达式的作用是返回一组数据的平均值，语法如下：
```js
{ $avg: <expression> } 
```
- $avg 表达式将会**忽略任何非数字数据和缺失的数据**。如果所有的数据都是非数字数据，表达式将会返回 null, 因为零值的平均值未定义。
- 默认返回类型是 double。如果至少有一个操作数是 decimal，则返回类型为 decimal。

### $max 表达式 
- $max 表达式用于返回一组数据中的最大值，语法如下：
```js
{ $max: <expression> } 
```
- $max 表达式在执行操作时会**忽略 null 或者缺失的数据**。 
- 当输入数据包含多种数据类型时，按照 BSON 比较顺序比较输入数据
- 如果表达式的参数全部为 null 或者缺失的数据，$max 表达式将会返回 null。
 
### $min 表达式 
- $min 表达式可以返回一组数据中的最小值，语法如下： 
```js
{ $min: <expression> } 
```
- $min 表达式在执行操作时会**忽略 null 或者缺失的数据**。 
- 当输入数据包含多种数据类型时，按照 BSON 比较顺序比较输入数据
- 如果表达式的参数全部为 null 或者缺失的数据，$min 表达式将会返回 null。
 
# 索引
- 索引是一种特殊的数据结构，它以易于遍历的形式存储一小部分集合数据集。索引可存储某个特定字段或多个字段的值，并按字段的值进行排序。索引条目的排序支持高效的相等匹配和基于范围的查询操作。此外，MongoDB 还可使用索引中的顺序来返回排序后的结果。
- MongoDB 使用 **BTree** 结构存储索引。
- MongoDB 在创建集合时会在 _id 字段上创建一个**唯一索引**。_id 索引可防止客户端插入两个具有相同 _id 字段值的文档。**无法删除此索引**。
- 索引的默认名称是索引键和索引中每个键的方向（1 或 -1）的连接，使用下划线作为分隔符。
    - 例如，在 { item : 1, quantity: -1 } 上创建的索引的名称item_1_quantity_-1。
- 索引一旦创建便**无法重命名**。必须删除索引并使用新名称重新创建索引。
## 创建索引
- createIndex() 方法可以用于创建新的索引。
```js
db.collection.createIndex( <keys>, <options>, <commitQuorum>)
```
- createIndex()接受三个参数：
    - 1. keys是包含字段和值对的文档，其中字段是索引键，值描述该字段的索引类型。对于字段的升序索引，指定值为 1。对于降序索引，请指定值 -1。
    - 2. options可选。包含一组控制索引创建的设立的文档。同一文档中可指定多个索引选项。不同索引类型可以有特定于该类型的附加选项。
    - 3. commitQuorum：整数或字符串可选。承载数据的投票副本集成员的最小数量（即提交法定节点数），包括主节点，必须在主节点将indexes标记为就绪之前报告索引构建成功。“投票”成员是members[n].votes大于0的任何副本集成员。
- createIndex()方法**返回了索引的名称**。
- 如果为已存在的索引调用 db.collection.createIndex()，MongoDB **不会重新创建该索引**。
- options: 除非另有说明，否则以下选项可用于所有索引类型：

|option|含义|
|---|---|
|unique|布尔值，**创建唯一索引**，以便集合不会接受索引键值与索引中现有值匹配的文档插入或更新。指定 true 可创建唯一索引。默认值为 false。该选项不适用于哈希索引|
|name|字符串，**索引名称**。如果未指定，MongoDB 将通过连接索引字段的名称和排序顺序来生成索引名称|
|partialFilterExpression|文档，如果指定，索引只引用与过滤器表达式匹配的文档|
|sparse|布尔值，**稀疏索引**，如果为true，则索引仅引用具有指定字段的文档。这些索引使用的空间较少，但在某些情况下（尤其是排序），其行为会有所不同。默认值为false，2dsphere/2d/Text默认为稀疏索引|
|expireAfterSeconds|**整型**，必须介于 0 和 2147483647，**TTL索引**，指定以秒为单位的生存时间 (TTL) 值，以便控制 MongoDB 在此集合中保留文档的时长。此选项**仅会应用于 TTL 索引**|
|hidden|布尔值，用于确定是否从查询规划器中隐藏索引。隐藏索引不会作为查询计划选择的一部分进行评估。默认值为 false|
|storageEngine|文档, 允许用户在创建索引时基于每个索引配置存储引擎|

## 删除索引
- dropIndex() 方法可以用于删除索引，语法如下： 
```js
db.collection.dropIndex(index) 
```
- 其中，index 代表了想要删除的索引，它可以是一个指定索引名称的字符串，也可以是描述索引定义的文档。 
- **_id 字段上的默认索引无法被删除。**

## 索引种类

### 复合索引
- 复合索引（compound index）是指**基于多个字段**的索引，通常可以用于优化匹配多个字段的查询。
```js
db.collection.createIndex({ 
    field1: sortOrder, 
    field2: sortOrder, 
    field3: sortOrder, 
    ... 
}); 
```
- 其中，field1、field2、field3 都是字段；sortOrder 代表了描述该字段的索引类型。对于字段的升序索引，指定值为 1。对于降序索引，请指定值 -1。
- MongoDB 复合索引最多包含 32 个字段。
- 复合索引中的**字段顺序**至关重要。如果一个复合索引包含字段 field1、field2，索引首先按照 field1 进行排序，如果 field1 相同，再按照 field2 排序。 
- 设计复合索引时，按照ESR 原则： 等值(E) -> 排序(S) -> 范围(R) 的索引字段排列顺序，帮助 MongoDB 最大化利用索引进行高效的数据筛选和有序检索，避免不必要的内存排序
- 复合索引遵循**最左匹配原则**。例如，一个复合索引包含字段 field1、field2、field3，可以支持以下查询优化： 
    - 1. 基于字段 field1 的匹配 
    - 2. 基于字段 field1 以及 field2 的匹配 
    - 3. 基于字段 field1 以及 field3 的匹配，索引部分命中
    - 4. 但是，它不支持基于字段 field2 的查询优化，因为不遵循最左匹配。
- 当同时存在复合索引和复合索引中的字段建立的单字段索引时，MongoDB 会**优先使用复合索引**，在此情况下可以删除后者
- 复合索引**可以包含单个哈希索引字段**
- 复合索引的**排序方向需与查询排序一致**，因为索引字段排序方向是索引的一部分，否则排序无法利用索引；同时也必须遵循最左前缀，否则会触发文件排序
    - 如索引 {a:1, b:-1}，查询排序 {a:1, b:-1} 命中，{a:1, b:1} 未命中
    - 如索引 {a:1,b:1}，查询 db.col.find({a:1}).sort({c:1})，sort 阶段索引失效
    - 但是如果索引{a:1,b:-1},查询排序{a:-1,b:-1}，**这种完全相反的情况下，可以利用索引**

### 唯一索引
- 唯一索引确保文档中**某个字段值的唯一性**，创建唯一索引的方法和普通索引相同，只需要额外指定 {unique: true} 选项：
```js
db.collection.createIndex(
   { <field>: <sortOrder> },
   { unique: true }
 )
```
- MongoDB 使用唯一索引确保主键 _id 的唯一性
- 通常，我们会在插入数据之前创建唯一索引，可以从头开始确保数据的唯一性。如果基于已有数据创建唯一索引，可能会由于重复数据导致索引创建失败。为此，我们需要删除重复的数据之后再创建索引。除非，使用prepareUnique选项：
    - 1. 在要实施唯一索引的一个或多个字段上创建非唯一索引。
    - 2. 使用 collMod 命令将索引的prepareUnique设立为 true。
    - 3. 将 prepareUnique设立为 true 时，将对索引字段的所有新写入强制执行唯一约束。现有的重复值不会被删除。
    - 4. 解析索引字段中任何现有的重复值。
    - 5. 使用 collMod 命令使索引成为唯一索引。
- 对于唯一单字段索引中的索引字段，如果某文档存在 null 或缺失值，则该索引为该文档存储 null 值。
- 对于唯一单字段索引中的索引字段，只能存在一个索引条目是 null 值的文档。
- 唯一索引**不能是哈希索引**

### 复合唯一索引
- **基于多个字段创建的唯一索引**就是复合唯一索引（unique compound index）。复合唯一索引可以确保**多个字段值的组合唯一**。创建复合唯一索引需要基于多个字段，并且额外指定 {unique: true} 选项：
```js
db.collection.createIndex(
   {
      <field1>: <sortOrder>,
      <field2>: <sortOrder>,
      ...
      <fieldN>: <sortOrder>
   },
   { unique: true }
 )
```
- **对于复合唯一索引中缺失文档字段，如果某个文档的一个或多个索引字段具有 null 或缺失值，则索引会为该文档索引条目中的每个 null 或缺失字段存储一个 null 值**。
- 对于复合唯一索引中缺失文档字段，只能存在一个索引条目全都是 null 值的文档。

### 稀疏索引
- 稀疏索引**仅包含具有索引字段的文档的条目**，该索引将**跳过缺少索引字段的所有文档**。创建稀疏索引的方法和普通索引相同，只需要额外指定 {sparse : true} 选项：
```js
db.collection.createIndex(
   { <field>: <sortOrder> },
   { sparse : true }
 )
```
- 2d/2dsphere/Text/通配符索引始终是稀疏的
- 既稀疏又唯一的索引可防止集合的文档具有重复的字段值的同时，允许多个省略该键的文档。

### TTL 索引
- TTL 索引可在**一定时间后从集合中自动删除文档**。TTL 索引字段**必须是日期类型（Date）或包含日期元素的数组**。创建TTL索引的方法和普通索引相同，只需要额外指定 expireAfterSeconds 选项为以秒为单位的生存时间：
```js
db.collection.createIndex(
   { <field>: <sortOrder> },
   { expireAfterSeconds : sec }
 )
```
- MongoDB 有**后台线程定期检查并删除**TTL索引的字段。
- TTL 索引是单字段索引。**复合索引不支持 TTL**，并且会忽略 expireAfterSeconds 选项，因为该选项仅针对 TTL索引。
- **_id 字段不支持 TTL 索引**。
- **固定集合上无法创建 TTL 索引**，因为固定集合的数据被删除的时机取决于循环写入达到上限时覆盖数据
- **如果某个字段已存在非 TTL 单字段索引，则无法对同一字段创建 TTL 索引**，因为无法创建具有相同键规范且仅选项不同的索引。
- 要将非 TTL 单字段索引更改为 TTL 索引，使用 collMod 数据库命令
```shell
db.runCommand({
  "collMod": <collName>,
  "index": {
    "keyPattern": <keyPattern>,
    "expireAfterSeconds": <number>
  }
})
```
- 不能使用 createIndex() 更改现有索引的 expireAfterSeconds 值。使用 collMod 数据库命令。
    - 1. 更改 expireAfterSeconds 参数不会触发完全重新生成索引。但是，降低 expireAfterSeconds 值可能会使许多文档符合立即删除条件，并且由于删除操作的增加，可能会导致性能问题。
    - 2. 推荐的方法是在更新 TTL 索引之前手动批量删除文档。这有助于控制对集群的影响。
    - 3. 删除许多文档可能会使存储文件碎片化，从而进一步影响性能。可能需要在集合上运行 compact 命令或执行初始同步以回收空间并优化存储。
```shell
db.runCommand({
  "collMod": <collName>,
  "index": {
    "keyPattern": <keyPattern>,
    "expireAfterSeconds": <number>
  }
})
```

### 多键索引
- 多键索引是针对数组或者数组中的嵌入式文档的字段建立的索引。

```js
db.<collection>.createIndex( 
    { <field>: <sortOrder> }
     )
```
- 对类型是**数组**的字段**创建索引**时，MongoDB 会自动将该索引设为多键索引。
- 对**数组中的嵌入式文档的字段**上创建索引时，MongoDB 会将该索引存储为多键索引
- 如果数组有重复值，则索引仅包含该值的一个条目。
- 在复合多键索引中，每个索引文档**最多可以有一个值为数组的索引字段**，如果索引字段中的多个字段是数组，则无法创建复合多键索引。对于已经创建复合多键索引的文档，无法插入有多个值为数组的文档。
- **哈希索引**不能是多键索引。
- **$expr 操作符不支持**多键索引。
- 对使用多键索引的数组字段进行排序时，查询计划会包含一个内存排序阶段，除非同时满足以下两个条件：
    - 1. 所有排序字段的索引边界均为 [MinKey, MaxKey]。
    - 2. 任何多键已索引字段的边界均不得与排序模式的路径前缀相同。

### 通配符索引 (Wildcard Indexes)

- MongoDB 支持在一个字段或一组字段上创建索引，以提高查询性能。MongoDB 支持灵活模式，这意味着文档字段名在一个集合中可能会有所不同。可以使用通配符索引来支持对任意或未知字段的查询。
- 要创建通配符索引，使用通配符说明符 ($**) 作为索引键
```js
db.collection.createIndex( 
    { "$**": <sortOrder> } 
    )
```
- 可以在一个集合中创建多个通配符索引。
- 通配符索引可涵盖与集合中其他索引相同的字段。
- 默认情况下，通配符索引会省略 _id 字段。要将 _id 字段包含在通配符索引中，您必须通过指定 { "_id" : 1 } 将其明确包含在 wildcardProjection 文档中。
- 通配符索引是**稀疏索引**，仅包含具有索引字段的文档的条目。
- 通配符索引不同于通配符文本索引，并且与通配符文本索引不兼容。
- 通配符索引不支持使用 $text 操作符的查询。
- 仅当需要索引的字段未知或可能更改时，才使用通配符索引。通配符索引的性能不及针对特定字段的目标索引:
    - 1. 如果您的应用程序查询字段名称因文档而异的集合，请创建通配符索引以支持对所有可能的文档字段名称进行查询
    - 2. 如果应用程序重复查询子字段不一致的嵌入式文档字段，请创建通配符索引以支持对所有子字段的查询
    - 3. 如果应用程序会对具有共同特征的文档进行查询。复合通配符索引可以有效地覆盖许多具有共同字段的文档查询
- 仅当满足以下所有条件时，通配符索引才支持覆盖查询：
    - 1. 查询规划器选择通配符索引来满足查询条件。
    - 2. 查询谓词可精确指定通配符索引所涵盖的一个字段。
    - 3. 查询投影明确排除 _id，仅包含查询字段。
    - 4. 指定的查询字段绝不是数组。

### 地理空间索引

- 用于地理空间数据的查询。地理空间索引可提高对地理空间坐标数据进行查询的性能。MongoDB 提供两种类型的地理空间索引：使用平面几何返回结果的 2d 索引。使用球面几何返回结果的 2dsphere 索引。
- 如果应用程序经常查询包含地理空间数据的字段，则可以创建地理空间索引，提高查询性能。
- 某些查询操作需要地理空间索引。如果要使用 $near 或 $nearSphere 操作符或 $geoNear 聚合阶段进行查询，则必须创建地理空间索引
- 分片集合：在对集合进行分片时，不能将地理空间索引用作分片键。但是，您可以使用不同字段作为分片键在分片集合上创建地理空间索引。您可以使用地理空间查询操作符和聚合阶段，查询分片集合上的地理空间数据。
- 覆盖查询：地理空间索引无法涵盖查询。
- 球面查询：使用 2d 索引查询球形数据可能会返回不正确的结果或错误。例如，2d 索引不支持环绕极点的球形查询。不过，您可以将 2dsphere 索引用于球形查询和二维查询。对于二维查询，2dsphere 索引将作为传统坐标对存储的数据转换为 GeoJSON 点类型。

### 哈希索引

- 用于对字段值进行哈希处理的索引。哈希索引**支持哈希分片**。基于哈希的分片使用字段的哈希索引作为分片键，在分片集群中对数据分区。
- 当 MongoDB 使用哈希索引解析查询时，会使用哈希函数自动计算哈希值。应用程序无需计算哈希值。要查看某个键的哈希值，请使用 convertShardKeyToHashed() 方法。此方法使用与哈希索引相同的哈希函数。
哈希索引有如下限制：
    - 1. 数组字段哈希函数不支持多键索引：您无法在包含数组的字段上创建哈希索引，也无法将数组插入哈希索引字段。如果复合索引中的任何字段是数组，则该索引中的任何字段都不能使用哈希索引。这包括非数组字段。不能在成为多键索引的复合索引中使用哈希索引。
    - 2. 覆盖查询：哈希索引无法涵盖查询。
    - 3. 唯一约束：不能在哈希索引上指定唯一约束。也就是说唯一索引不能是哈希索引。相反，您可以创建具有唯一约束的附加非哈希索引。MongoDB 可以使用该非哈希索引来强制实施所选字段的唯一性。
    - 4. 哈希索引不能是多键索引。

## 索引失效
### 操作索引字段
- MongoDB 无法对经过修改的索引字段进行匹配，必须直接使用字段本身
    - 1. 字段用函数/表达式
    - 2. 字段用 $where 表达式
    - 3. 字段被隐式类型转换（字段类型≠查询类型）
    - 4. 字段被截取/拼接
### 使用 $where 或 JavaScript 表达式
- $where 会逐文档执行脚本，绕过索引。改用内置查询运算符或聚合表达式。
### 模糊查询/正则含前缀通配符
- 只有从开头锚定（^abc）且不使用其他复杂表达式时才可能用到索引
  - 示例：/{.*abc/} 或 /^.*abc/（以通配符开头）
- 避免前缀通配符或改用全文索引（text）搜索引擎。

### 正则表达式不以固定前缀开始或含复杂表达式
- 索引可用的条件很苛刻，优先使用精确匹配或前缀匹配
  - 示例：/foo.*bar/ 或 不以 ^ 开头的 /abc/i（i用来不区分大小写会影响）

### 复合索引违背最左前缀原则
- 比如复合索引 {a:1, b:1, c:1}，以下场景失效：
    - 1. 跳过最左字段：{b:2, c:3}；
    - 2. 中间字段用**范围查询**，后续字段**索引截断**无法命中：{a:1, b: {$gt:2}, c:3}（仅 a 和 b 命中索引，c 失效）
    - 3. 查询排序规定的字段不符合最左前缀：{b:1}（跳过最左字段）→ 失效。
### 排序字段与索引方向不一致/不匹配
- 一般有两种情况：
    - 1. 索引排序规则和查询排序规则不一致（比如索引是1升序而sort是-1降序）
      - 但是**复合索引中所有排序字段方向一致**，可反向使用（如索引{a:1,b:1}，排序{a:-1,b:-1}），此时索引仍生效
    - 2. 复合索引中，查询排序规定的字段不符合最左前缀，比如{b:1}（跳过最左字段）→ 失效
### 使用否定 / 非确定性操作符
- 以下操作符通常无法利用索引，导致全表扫描：
    - 1. 否定操作符：$ne、$not、$nin
    - 2. 存在性判断：$exists: 
    - 3. $or 中字段未全部命中索引（如 { $or: [{a:1}, {b:2}] } 仅 a 有索引）
    - 4. $in 包含过多值
### 查询条件包含非索引字段且结果集过大
- 索引字段仅作为过滤条件，但查询返回的字段是非索引字段，MongoDB 认为集合扫描比索引扫描+回表查询更高效，会主动放弃索引
### 查询字段是数组中的字段/嵌入式字段中的字段
- 索引字段为数组类型，查询整个数组：db.col.find({tags: ["a","b"]}) → 索引生效；但查询数组中的元素：db.col.find({tags: "a"}) ， 索引失效（需创建数组索引db.col.createIndex({tags:1})才能生效）；
- 索引字段为内嵌文档，直接匹配整个文档：db.col.find({user: {name:"张三"}}) ，索引生效；但匹配内嵌字段：db.col.find({"user.name": "张三"}) ， 需创建点索引db.col.createIndex({"user.name":1})，否则失效；
### 查询字段条件是null
- 查询null值：db.col.find({age: null}) ， 会匹配字段值为 null + 字段不存在的所有文档，索引失效。
### 索引字段是稀疏索引但查询的是不存在的字段
- 稀疏索引（sparse: true）的特性是：只对字段存在的文档创建索引，如果查询字段不存在的文档， db.col.find({age: {$exists: false}}) ，索引失效。
### 使用覆盖索引但返回了_id字段被迫需要回表
- 覆盖索引：查询的过滤条件 + 返回字段都在索引中，无需回表查询文档，但如果索引中没有包含_id，而查询没有手动剔除_id:0，MongoDB 会**自动回表查询_id**，导致覆盖索引失效，性能下降。
### 多键索引和某些表达式不兼容
- 复合多键索引中只能有一个数组字段；$expr 等表达式通常不能利用索引。
  - 示例：复合多键索引中多个字段为数组、或使用 $expr/$expr 类操作。
### 聚合管道中的索引失效
- $match 阶段放在 $group/$unwind/$project/$lookup 之后，类似 SQL中 from/where/group-by/having/select/order-by/limit的子句顺序，**需要将 $match放在第一阶段**
- $project 阶段删除索引字段/重命名索引字段/新增计算字段，建议将 $project 放在最后从所有返回的字段中筛选需要的字段
    - 1. 删除索引字段：{ $project: { status: 0 } } ，后续$match:{status:"已支付"}无法用索引；
    - 2. 重命名索引字段：{ $project: { orderStatus: "$status" } } ， 后续$match:{orderStatus:"已支付"}无法用原status索引；
    - 3. 新增计算字段：{ $project: { newPrice: { $add: ["$price", 100] } } } ， 新的计算字段newPrice无索引

## 索引策略
- 在创建索引时，需要考虑以下因素：
    - 1. 查询频率：优先考虑那些经常用于查询的字段。
    - 2. 字段基数：字段值的基数越高（即唯一值越多），索引的效果越好。
    - 3. 索引大小：索引的大小会影响数据库的内存占用和查询性能。

## 索引优化
- 在对索引进行优化时，可以考虑以下方法：
    - 1. 选择合适的索引类型：根据查询需求选择合适的索引类型。
    - 2. 创建复合索引：对于经常一起使用的字段，考虑创建复合索引以提高查询效率。
    - 3. 监控索引性能：定期监控索引的使用情况，根据实际需求调整索引。

# 事务
## 概念与注意事项
- 在 MongoDB 中，对单个文档的操作具有原子性。对于需要对多个文档（在单个或多个集合中）的读写操作具有原子性的情况，MongoDB 支持多文档事务。利用分布式事务，可以跨多个操作、集合、数据库、文档和分片使用事务。**MongoDB独立运行部署不支持事务**。要使用事务，必须是**多节点副本集**。
- 分布式事务具有**原子性**：
  - 1. 事务要么应用所有数据更改，要么回滚更改。
  - 2. 在事务提交时，事务中所做的所有数据更改都会保存，并且在事务之外可见。
  - 3. 在事务进行提交前，在事务中所做的数据更改在事务外不可见。
  - 4. 不过，当事务写入多个分片时，并非所有外部读取操作都需等待已提交事务的结果在各个分片上可见。例如，如果事务已提交并且写入 1 在分片 A 上可见，但写入 2 在分片 B 上尚不可见，则读关注 "local" 处的外部读取可以在不看到写入 2 的情况下读取写入 1 的结果。
  - 5. 事务中止后，在事务中所做的所有数据更改会被丢弃且不会变得可见。例如，如果事务中的任何操作失败，事务就会中止，事务中所做的所有数据更改将被丢弃且不会变得可见。
- 可以在事务中创建集合和索引, 事务中使用的集合可以位于不同的数据库中
- 不能写入固定大小集合。
- 从固定大小集合读取时不能使用读关注 "snapshot"。
- 不能在 config、admin 或 local 数据库中读取/写入集合。不能写入 system.* 集合。
- 无法在跨分片写事务中创建新集合。例如，如果在一个分片中写入一个现有集合，并在另一个分片中隐式创建一个集合，MongoDB 将无法在同一事务中执行这两个操作。
- 对于在 ACID 事务外部创建的游标，无法在 ACID 事务内部调用 getMore。
- 对于在事务中创建的游标，无法在事务外部调用 getMore。
- 不能将 killCursors 命令指定为事务中的第一个操作。此外，如果在ACID 事务中运行killCursors 命令，服务器会立即停止指定的游标。它不会等待ACID 事务提交。
## 事务操作
### 文档
- 事务支持大部分CRUD操作
### 集合
- 如果事务不是跨分片写入事务，可以在分布式事务中创建集合。在事务中创建集合时：
  - 1. 可以隐式创建一个集合，例如对不存在的集合进行插入/更新插入操作
  - 2. 可以使用 create 命令或db.createCollection()显式创建集合。要在事务内显式创建集合或索引，事务读关注级别**必须为 "local"**。
### 索引
- 如果事务不是跨分片写入事务，可以在先前同一事务中创建的新空集合上创建索引。在事务内创建索引时，要创建的索引必须位于以下情形之一：
  - 1. 不存在的集合。集合作为操作的一部分创建。
  - 2. 先前在同一事务中创建的新空集合。
### 计数
- 计数：要在事务内执行计数操作，使用 $count 聚合阶段或 $group（带有 $sum 表达式）聚合阶段。
### 去重
- 去重：
  - 1. 对于未分片的集合，可以使用 db.collection.distinct() 方法/distinct 命令以及带有 $group 阶段的聚合管道。
  - 2. 对于分片集合，**不能使用 db.collection.distinct() 方法或 distinct 命令**。要查找分片集合的不同值，改用带有$group阶段的聚合管道。
## 事务和读取偏好
- 事务中的操作使用事务级读取偏好。
  - 1. 使用驱动程序，您可以在事务启动时设置事务级读取偏好：
  - 2. 如果未设置事务级别的读取偏好，则事务将使用会话级别的读取偏好。
  - 3. 如果未设置事务级别和会话级别的读取偏好，则事务将使用客户端级别的读取偏好。默认情况下，客户端级别的读取偏好为 primary。
- 包含读取操作的分布式事务必须使用读取偏好 primary。给定事务中的所有操作必须路由到同一节点。
## 事务和读关注
- 事务中的操作使用事务级读关注。也就是说，在集合和数据库级别设置的任何读关注在事务中都会被忽略。
  - 1. 如果未设置事务级别的读关注，则事务级别的读关注默认为会话级别的读关注。
  - 2. 如果未设置事务级读关注和会话级读关注，则事务级读关注默认为客户端级读关注。默认情况下，对于主节点上的读取，客户端级读关注是 "local"。
- 事务支持以下读关注级别：
  - 1. "local": 读关注 "local" 返回节点中可用的最新数据，但可以回滚。
    - 在副本集上，即使ACID 事务使用读关注（read concern）local ，您也可能会观察到更强的读隔离性性，因为该操作会从ACID 事务打开点的快照中读取。
    - 对于分片集群上的事务，读关注 "local" 无法保证数据来自跨分片的同一快照视图。如果需要快照隔离，使用读关注 "snapshot"。
  - 2. "majority": 如果事务以写关注“majority”提交，则读关注 "majority" 返回已被多数副本集节点确认且无法回滚的数据。否则，读关注 "majority" 不保证读取操作读取多数提交的数据。
    - 对于分片集群上的事务，读关注 "majority" 无法保证数据来自跨分片的同一快照视图。如果需要快照隔离，使用读关注 "snapshot"。
  - 3. "snapshot": 如果事务使用写关注“majority”提交，则读关注 "snapshot" 会从多数已提交数据的快照中返回数据。
    - 如果事务不使用写关注“majority”提交，则 "snapshot" 读关注不保证读操作会使用大多数已提交数据的快照。
    - 对于分片集群上的事务，数据的 "snapshot" 视图会在各分片之间同步。
### 读关注级别
- local：默认。返回当前节点上的最新数据，可能会被回滚（非多数提交）。
- majority：只返回已被多数副本确认且不可回滚的数据。
- linearizable：最强一致性，只能在 primary 上使用，保证读到最近已确认的写入。
- available：返回可用数据（很少用，行为依部署而异）。
- snapshot：用于事务，提供跨集合/跨分片的快照隔离（事务内常用）
## 事务和写关注
- 事务使用事务级写关注来提交写入操作。事务内的写入操作必须在没有明确写关注规范的情况下执行，并须使用默认的写关注。在提交时，使用事务级写关注来提交写入。
  - 1. 如果未设置事务级别的写关注，则事务级别的写关注默认为提交的会话级别写关注。
  - 2. 如果未设置事务级别的写关注和会话级别的的写关注，则事务级别的写关注默认为 的客户端级别的写关注
### 写关注级别
- w:0（unacknowledged）—— 不等待确认，最快但不保证写入成功感知。
- w:1（acknowledged，默认）—— 等主节点确认写入。
- w:n（数字）—— 等 n 个成员确认（包括主节点）。
- w:"majority" —— 等多数副本确认后返回（常用于强一致性/事务提交）。
- j:true —— 等待写入写入到磁盘（journal）后再返回。
- wtimeout（ms）—— 写关注等待超时设置。
# 复制
## 主从架构
- MongoDB 中的副本集是一组维护相同数据集的 mongod 进程。副本集提供冗余和高可用性，是所有生产部署的基础。复制可提供冗余并提高数据可用性。通过在不同的数据库服务器上设置数据副本，复制为单个数据库服务器丢失的情况提供了一定程度的容错能力。在某些情况下，复制可以提供更多的读取容量，因为客户端可以将读取请求发送到不同的服务器。在不同数据中心维护数据副本可以提高分布式应用程序的数据局部性和可用性。
- MongoDB 采用一主多从的架构: 
  - 1. 副本集包含多个数据承载节点和一个可选的仲裁节点。在数据承载节点中，只有一个主节点，其他为从节点。
  - 2. **每个副本集节点必须属于且只属于一个副本集**, 副本集**只能有一个**可以使用 { w: "majority" } 写关注（write concern）级别对写入请求进行确认的**主节点**。如果当前的主节点不可用，则将通过选举决定新的主节点。
  - 3. 主节点会接收所有写入操作并在其操作日志（即 **oplog**）中记录对其数据集的所有更改。
  - 4. 从节点复制主节点oplog操作日志，并将操作应用于其数据集。
  - 5. 副本集的所有节点都可以接受读取操作。但是，默认情况下，应用程序将其读取操作定向到主节点。
- 复制延迟：主节点上的操作与将该操作从 oplog 应用到从节点之间的延迟。一些小的延迟是可以接受的，但随着复制延迟的增加，会出现严重的问题，包括在主节点上创建缓存压力。
- 自动故障转移：当主节点在超过配置的 electionTimeoutMillis 时间段（默认 10 秒）内未与副本集中的其他节点通信时，一个符合条件的从节点将发起选举，并提名自己成为新的主节点。集群将尝试完成新主节点的选举并恢复其正常运转。将写关注配置为需要确认复制到从节点。这样可以防止在复制跟不上写入负载时返回写入操作。在成功完成选举之前，副本集无法处理写操作。如果将读取查询配置为当主节点离线时在从节点上运行，那么副本集可以继续为读取查询提供服务。

## 操作日志Oplog
- oplog（操作日志）是特殊的固定大小集合，滚动记录修改数据库中存储的数据的所有操作。如果写入操作未修改任何数据或失败，则不会创建 oplog 条目。与其他固定大小集合不同，oplog 可能会增长到超过配置的大小限制，从而避免删除 majority commit point。
- MongoDB 会对主节点应用数据库操作，并在主节点的 oplog 中记录这些操作。然后，从节点成员会在异步流程中复制并应用这些操作。在 local.oplog.rs 集合中，所有副本集成员均包含此 oplog 的副本，从而可维持数据库的当前状态。
- 为了便于复制，所有副本集成员都会向所有其他成员发送心跳 (ping)。任何次要成员都可以从任何其他成员导入 oplog 条目。
- 在 mongod 创建 oplog 之前，可以使用 oplogSizeMB 选项指定其大小。首次启动副本集成员后，使用 replSetResizeOplog 管理命令更改 oplog 大小。可以使用 replSetResizeOplog 动态调整 oplog 的大小，而无需重启 mongod 进程。
- 可以指定保留 oplog 条目的最小小时数，在此期间， mongod 仅在以下两个条件都满足时才会删除 oplog 条目：
  - 1. oplog 已达到最大配置大小。
  - 2. oplog 条目早于根据主机系统时钟配置的小时数。
- 默认情况下，MongoDB 不设置最小 oplog 保留期，并自动从最旧的条目开始截断 oplog，以维持配置的 oplog 最大大小。要在启动 mongod 时配置 oplog 最短保留期，将 storage.oplogMinRetentionHours 设置添加到 mongod配置文件中, 或添加 --oplogMinRetentionHours 命令行选项。要在正在运行的 mongod 上配置最短 oplog 保留期，使用 replSetResizeOplog。


## 读取偏好
- 默认情况下，客户端从主节点读取；但是，客户端可以指定读取偏好以向从节点发送读取操作。
- 包含读操作的分布式事务必须使用读取偏好 primary。给定事务中的所有操作必须路由至同一节点。

## 镜像读取
- 镜像读取可减少由于中断或计划维护后主节点选举对系统的影响。在副本集发生故障转移后，接管成为新主节点的从节点会在新查询请求传入时更新其缓存。在缓存预热期间，性能可能会受到影响。
- 镜像读会预热 electable 从节点副本集成员的缓存。为了预热可选举从节点的缓存，主节点会将其接收到的受支持操作的示例镜像到可选举的从节点。

- 可以使用 mirrorReads 参数来配置接收镜像读的 electable 从节点副本集节点的子集的大小。
- **镜像读取不会影响主节点对客户端的响应**。主节点镜像复制到从节点的读取是“发后即忘”类型的操作。主节点不会等待响应。

# 分片
## 基本概念
### 分片机制
- 分片是一种跨多台机器分布数据的方法。MongoDB 使用分片来支持超大数据集和高吞吐量操作的部署。将一个集合的海量数据，先按分区规则切分成多个逻辑分区，再将这些分区均匀分发到集群中多个独立的分片节点，每个分片节点存储一部分分区数据，最终实现数据分布式存储、读写负载分摊的架构模式。
- MongoDB 分片集群由以下组件构成：
  - 1. 分片：每个分片都包含分片数据的一个子集。每个分片都必须作为一个副本集进行部署。
  - 2. 使用mongos进行查询路由：mongos 充当查询路由器，在客户端应用程序和分片集群之间提供接口。
  - 3. 配置服务器：配置服务器会存储集群的元数据和配置设置。配置服务器必须部署为副本集 (CSRS)。
- MongoDB **在集合级别对数据进行分片**，从而将集合数据分布到集群中的分片上。
### 分片优点
- 读取/写入：MongoDB 在分片集群中的分片之间分配读写工作负载，支持每个分片处理集群操作的子集。通过添加更多的分片，读写工作负载都可以在集群中横向扩展。对于包含分片键或复合分片键前缀的查询，mongos 可将查询定向到特定分片或一组分片。这些有针对性的操作通常比向集群中的每个分片进行广播更为有效。
- 存储容量：分片将数据分布在集群中的分片上，从而允许每个分片包含整个集群数据的子集。随着数据集的增长，更多的分片会增加集群的存储容量。
- 高可用性：按副本集部署配置服务器和分片，可提高可用性。即使一个或多个分片副本集变为完全不可用，分片集群仍可继续执行部分读取和写入操作。换言之，即便无法访问不可用分片上的数据，针对可用分片的读取或写入仍可成功完成。
### 限制操作
- $where 不允许从 $where 函数引用 db 对象。
- MongoDB 不支持跨分片的唯一索引，除非唯一索引包含完整分片键作为索引的前缀，此时MongoDB 将在整个键上强制执行唯一性，而不是单个字段。
- MongoDB 不保证所有分片的索引一致。addShard 操作或数据段迁移期间的索引创建可能不会传播到新的分片。
- 在分片集群上，数据定义语言（DDL）操作以写关注（write concern）"majority"运行。如果指定不同的写关注（write concern），则该操作会使用 "majority" 覆盖所提供的写关注（write concern）设置。
### 分片键
- MongoDB 使用分片键在分片之间分发集合的文档。对集合进行分片时会用到分片键。分片键由文档中的一个或多个字段组成。
- 分片集合中的文档可能缺少分片键字段。跨分片分发文档时，缺少的分片键字段将视为具有 null 值，但在路由查询时则不会。
- 从 MongoDB 5.0 开始，可以通过更改集合的分片键对集合重新分片。
- 可以通过向现有分片键添加后缀字段或字段来优化分片键。
- 文档的分片键值决定了其在各分片中的分布。可以更新文档的分片键值，除非分片键字段是不可变的 _id 字段。
- 分片键索引：要对已填充的集合进行分片，该集合必须具有以分片键开头的索引。对空集合进行分片时，如果该集合还没有指定分片键的适当索引，MongoDB 会创建索引。索引可以是分片键上的索引，也可以是复合索引，其中分片键是索引的前缀。
- 分片键策略：分片键的选择会影响分片集群的性能、效率和可扩展性。具有最佳硬件和基础架构的集群可能会因为选择分片键而遇到瓶颈。 分片键及其后备索引的选择也会影响集群可以使用的分片策略
### 数据段
- MongoDB 将数据分片为数据段。每个数据段都有一个基于分片键、包含下限且不包含上限的范围。
- 数据段可以表示的最小数据单位是单个唯一的分片键值。
### 负载均衡器和均匀数据分布
为了实现数据在集群中所有分片上的均匀分布，负载均衡器会在后台运行，以便在各分片之间迁移范围。
### mongos 路由器
- MongoDB mongos 实例将查询和写入操作路由到分片集群中的分片。从应用程序的角度来看，mongos 提供了通向分片集群的唯一接口。应用程序永远不会直接与分片连接或通信。mongos 通过缓存来自配置服务器的元数据来跟踪哪个分片上有哪些数据。mongos 使用该元数据将操作从应用程序和客户端路由到 mongod 实例。mongos 没有持久状态，且会使用最少的系统资源。
- mongos 实例通过以下方式将查询路由到集群：
  - 1. 确定必须接收查询的分片的列表。
  - 2. 在所有目标分片上建立游标。
- 然后，mongos 会合并来自每个目标分片的数据，并返回结果文档。如果结果不需要在数据库的主分片上运行，则在多个分片上运行的聚合操作可能会将结果路由回mongos以合并结果。
#### 定向操作与广播操作

- 广播操作：mongos 实例会向集合的所有分片广播查询，除非 mongos 可以确定哪个分片或分片子集存储此数据，例如使用分片键和来自配置服务器的集群元数据路由到单个分片的查询。在mongos收到所有分片的响应后，它会合并数据并返回结果文档。广播操作性能取决于集群的整体负载，以及网络延迟、单个分片负载和每个分片返回的文档数量等变量。尽可能选择引起针对性操作而非广播操作的操作。
  - 多更新(Many)操作始终是广播操作。
  - updateMany() 和 deleteMany() 方法为广播操作，除非查询文档完整指定了分片键。
- 定向操作:mongos 可以将包含分片键或复合分片键前缀的查询路由到特定分片或分片集。mongos 使用分片键值来定位范围包含分片键值的数据段，并将查询指向包含该数据段的分片。
- 当分片键或分片键的前缀是查询的一部分时，mongos 会执行定向操作，将查询路由到集群中的分片子集。如果查询不含分片键或复合分片键的前缀，执行广播操作，将查询路由到集群中的所有分片
### 配置服务器
- 配置服务器用于存储分片集群上的元数据。元数据反映了分片集群内所有数据和组件的状态和组织。元数据包括每个分片上的数据段列表以及定义数据段的范围。
- mongos 实例缓存此数据，并使用它来将读取和写入操作路由到正确的分片。mongos 在集群的元数据发生变化（例如添加分片）时更新缓存。分片还从配置服务器读取数据段元数据。
- 配置服务器还存储“自管理部署上的身份验证”配置信息，例如基于角色的访问控制或集群的内部身份验证设置。
- MongoDB 还使用配置服务器来管理分布式锁。
- 每个分片集群必须拥有自己的配置服务器。请勿对不同的分片集群使用相同的配置服务器。
- 如果配置服务器副本集丢失其主节点并且无法选择主节点，则集群的元数据将变为只读。仍然可以从分片读取和写入数据，但在副本集可以选择主节点之前，不会发生数据段迁移或数据段分割。
- 在分片集群中，mongod 和 mongos 实例监控分片集群中的副本集（例如分片副本集、配置服务器副本集）。如果所有配置服务器都变得不可用，那么集群可能会无法正常运行。为了确保配置服务器始终可用，并且功能与数据均完好无损，备份配置服务器非常重要。与集群中存储的数据相比，配置服务器上的数据量较小，并且配置服务器的活动负载也相对较低。

- 从MongoDB 8.0开始，可以配置一个配置服务器，除了存储通常的分片集群元数据之外，还用于存储应用程序数据。**存储应用程序数据的配置服务器称为配置分片**。集群需要配置服务器，但它可以是配置分片，而不是专用的配置服务器。使用配置分片可减少所需节点的数量，并可简化部署。
### 分片和非分片集合
- 数据库可混合使用分片和未分片集合。分片集合会进行分区并分布在集群的各个分片上。分片片集合可以位于任何分片上，但不能跨分片。
### 连接到分片集群
- 必须连接到 mongos 路由器才能与分片集群中的任意集合进行交互。其中包括分片和非分片集合。客户端永不应连接到单个分片来执行读取或写入操作。
### 分片策略
- MongoDB 支持两种分片策略，可在多个分片集群之间分配数据。

- 1. 哈希分片**涉及计算分片键字段值的哈希值**。哈希分片使用单字段哈希索引或组合哈希索引作为分片键，在分片集群中对数据进行分区，然后根据哈希分片键值为每个数据段分配一个范围。在使用哈希索引解析查询时，MongoDB 会自动计算哈希值。基于哈希值的数据分配可促进更均匀的数据分布，尤其是在分片键单调变化的数据集中。然而，哈希分布意味着对分片键进行基于范围的查询时，不太可能以单个分片为目标，从而导致更多的集群范围的广播操作
- 2. 范围分片涉及**根据分片键值将数据划分为多个范围**。然后，根据分片键值为每个数据段分配一个范围。范围分片的效率取决于所选分片键。考虑不周的分片键可能会导致数据分布不均，从而抵消分片的某些好处甚或导致性能瓶颈。

### 分区
- MongoDB 的分区 (Partition)，是指：将一个集合中的文档按照指定的规则，切分成多个互不重叠、完整覆盖的逻辑数据子集，**每个子集就是一个分区**，所有分区都是基于分片键实现
- 在分片集群中，可以根据分片键创建分片数据区域。您可以将每个区域与集群中的一个或多个分片相关联。一个分片可以与任意数量的区域关联。在均衡的集群中，MongoDB 仅将区域覆盖的数据段迁移到与该区域相关联的分片。每个区域涵盖分片键值的一个或多个范围。某一区域所覆盖的每个范围始终包括其下边界，而不包括其上边界。
- 为要覆盖的区域定义范围时，必须使用分片键中包含的字段。如果使用的是复合分片键，此范围则须包含分片键的前缀。所以在选择分片键时，应考虑将来可能使用区域的情况。另外在对空的或不存在的集合进行分片之前设置区域和区域范围可更快地设置分区分片。

# explain 执行计划
- 在 MongoDB 中，可以使用 explain 方法来分析查询的执行计划，了解查询如何执行以及潜在的性能问题。这是优化查询性能的重要工具，尤其是在排查慢查询时。通过 explain 方法，可以定位导致慢查询的问题（如索引未被利用）并进行优化。explain 会提供以下关键信息：
  - 1. 查询阶段：如是否使用索引（COLLSCAN 或 IXSCAN）。
  - 2. 扫描的文档数：查询是否进行了全表扫描。
  - 3. 返回的文档数：查询结果是否符合预期。
  - 4. 查询耗时：查询的执行时间（executionTimeMillis）。
- explain返回以下方法的查询计划信息：aggregate()，count()，find()，distinct()，findAndModify()
- 使用 explain 会忽略所有现有的计划缓存条目，并防止 MongoDB 查询计划器创建新的计划缓存条目。
```js
db.collection.find({ <query> }).explain("executionStats")
```
##  Explain 方法的参数
- verbosity字符串，可选。指定解释输出的详细模式。该模式会影响 explain() 的行为并确定要返回的信息量：
  - 1. queryPlanner（默认）
    - 提供查询的计划和索引信息，但不执行查询。
    - 快速分析查询计划。
  - 2. executionStats
    - 执行查询，并提供查询执行的统计信息。
    - 包括扫描的文档数、返回的文档数和查询耗时等。
  - 3. allPlansExecution
    - 提供最详细的信息，包括所有候选查询计划的执行统计数据。
    - 通常用于深度调试。
##  Explain 方法的返回结果
- explain 返回的结果中，以下字段对分析慢查询至关重要：
  - 1. queryPlanner
    - winningPlan：MongoDB 选择的最佳查询计划（如索引扫描 IXSCAN 或全表扫描 COLLSCAN）。
    - rejectedPlans：被排除的其他查询计划。
  - 2. executionStats
    - nReturned：查询返回的文档数量。
    - executionTimeMillis：查询耗时（毫秒）。
    - totalKeysExamined：扫描的索引条目数。
    - totalDocsExamined：扫描的文档数。
  - 3. allPlansExecution： 提供所有候选计划的统计信息，便于选择最优索引。
  - 4. explainVersion，输出格式版本。
  - 5. command，其中详细说明了要解释的命令。
  - 6. serverInfo，提供有关 MongoDB 实例的信息。
  - 7. serverParameters ，详细说明了内部参数。
## 常见慢查询原因及优化建议
- 未使用索引（COLLSCAN）：查询执行时需要扫描整个集合（全表扫描），导致慢查询。为查询条件字段创建索引。
- 索引不匹配：查询未按索引字段的顺序执行，导致索引未被利用。创建复合索引并确保查询字段顺序与索引匹配。
- 返回数据过多：查询返回大量无用数据，增加了处理开销。限制返回结果或只返回必要字段。使用$project或projection选项来投影字段。
- 排序未优化：查询结果需要排序，但未使用索引，导致慢查询。检查排序字段是否复合最左前缀，或为排序字段创建索引。