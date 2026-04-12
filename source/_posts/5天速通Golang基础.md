---
title: 5天速通Golang基础
date: 2026-01-12 01:25:13
updated: 2026-01-12 01:25:13
tags: "你知道吗"
categories: "只属于你的小妙招 <br> 看似有用实则没用"
cover: /images/画廊/Arcara/1-8.webp
---

# Go语言学习笔记

## 代码格式化

```shell
$ gofmt
```

## Package（包）

`package` 声明当前go文件所属包。

- 包是导入的基本单位而非文件，命名小写
- 入口文件必须声明为 `main`
- 包内类型访问权限使用大小写开头来区分公有/私有

## Import（导入包）

导入包后可以使用类型/方法/函数或变量。

- 可以按 `别名 "packagename"` 来进行重命名
- 别名为下划线 `_` 时匿名导入，这样的包无法被使用，通常是为了加载包下的 `init` 函数，但又不需要用到包中的类型
- 访问包中的类型使用 `packagename.identifier` 包名.标识符
- `. "packagename"` 形如该方法导入包将引入所有类型，但包中如果存在重复类型将无法通过编译
- 包名为 `internal` 为内部包，外部包将无法访问包中的任何内容

## 标识符

标识符用于包/函数/变量命名等。

- 只能由字母数字下划线组成
- 只能以字母下划线开头
- 区分大小写
- 不得重复或与关键字冲突

## init() 函数

`init()` 函数是一种在Go语言中用于执行初始化操作的特殊函数。每个包可以包含多个 `init()` 函数，它们会在包被导入时按照顺序自动执行。

**调用时机：**

- 当包被导入时，`init()` 函数会按照导入的顺序自动执行
- 同一个包中的多个 `init()` 函数按照编写的顺序执行
- 虽然 `init()` 函数在包被导入时自动执行，但它们并不会被外部调用。这与其他函数不同，其他函数需要显式地被调用才能执行
- `init()` 函数不能有返回值，其返回值会被忽略

**用途：**

- 对于全局变量的初始化，`init()` 函数也是一个很好的选择。通过在 `init()` 函数中初始化全局变量，可以确保它们在包被导入时具有正确的初始值，避免在使用时出现未初始化的情况
- 在一些情况下，`init()` 函数可以用于实现一些类似单例模式的功能。通过在 `init()` 函数中进行一次性的初始化，可以保证在整个程序生命周期中只有一个实例被创建

## main包

在Go语言里，命名为 `main` 的包具有特殊的含义。Go语言的编译程序会试图把这种名字的包编译为二进制可执行文件。所有用Go语言编译的可执行程序都必须有一个名叫 `main` 的包。

- 当编译器发现某个包的名字为 `main` 时，它一定也会发现名为 `main()` 的函数，否则不会创建可执行文件。`main()` 函数是程序的入口，所以，如果没有这个函数，程序就没有办法开始执行
- 程序编译时，会使用声明 `main` 包的代码所在的目录的目录名作为二进制可执行文件的文件名

## 运算符

### 运算符优先级

| 优先级 | 运算符 |
|:------:|:------:|
| 5 | `*` `/` `%` `<<` `>>` `&` `&^` |
| 4 | `+` `-` `\|` `^` |
| 3 | `==` `!=` `<` `<=` `>` `>=` |
| 2 | `&&` |
| 1 | `\|\|` |

**注意事项：**

- `^` 异或（二元）同时也是取反（一元）
- `&^` 等价于 `&(^)`，`a &^ b = a & (^b)`，先取反后与运算，也即所谓的位清空操作，把b中1对应位置在c位置上清空
- 无 `++i`/`--i`，并且 `i++`/`i--` 只能作为表达式

## 函数（func）

`func` 是函数声明关键字。

### 函数参数

- 函数参数中，`argv_name argv_type` 参数名在前，参数类型在后，参数名也可以不带名称
- 对于类型相同的参数而言，可以只需要声明一次类型，不过条件是它们必须相邻
- Go 中的函数参数是传值传递，即在传递参数时会拷贝实参的值
- 变长参数可以接收 0 个或多个值，必须声明在参数列表的末尾，最典型的例子就是 `fmt.Printf` 函数

```go
func Printf(format string, a ...any) (n int, err error) {
  return Fprintf(os.Stdout, format, a...)
}
```

### 函数返回值

- 一个函数可以有多个返回值，需要用括号将返回值围起来，并且可以命名，但不能与参数名重复
- 当函数没有返回值时，不需要 `void`，不带返回值即可
- 不管具名返回值如何声明，永远都是以 `return` 关键字后的值为最高优先级

### 函数特性

- 函数签名由函数名称、参数列表、返回值组成
- 函数内变量必须被使用
- Go 中的函数**不支持重载**

**具名返回值示例：**

```go
func Pos() () (x, y float64) {
    ...
}
```

**使用 var 声明函数：**

```go
var sum = func (a int, b int) int {
    return a + b
}
```

### 匿名函数

匿名函数没有名称，必须紧跟括号传参调用，可以作为参数进行传参，例如为排序函数传入自定义比较函数。

### Function Value

将函数作为参数变量或返回值的情况称为 function value。

- function value 本质是指向 `runtime.funcval` 结构体的指针，该结构体包含了函数的入口地址

### 闭包（Lambda）

闭包是函数+引用环境。可以捕获函数内部变量和参数，并将它们和函数创建的环境绑定。

- 当函数外部引用该闭包时，闭包就可以访问这些变量和参数
- 典型用法是在函数 `func1` 返回一个 Lambda，该 Lambda 的函数体用到了 `func1` 的局部变量
- 这样 `func1` 因返回调用完毕后，被 Lambda 引用的变量的生存期得以延长
- 如果外部将 Lambda 的返回值保存给外部变量，那么就能维护该变量的值
- 也就是说闭包最常见的方式就是引用了其外层函数定义的局部变量并以函数方式返回
- 而这种方式也符合 function value，所以在Go语言中闭包只是拥有一个或多个捕获变量的 Function Value
```go
func newCounter() func() int {
  count := 0
  return func() int {
    count++
    return count
  }
}
​
func main() {
  f := newCounter()
  f()              // 1
  f()              // 2
  f1 := newCounter() //再次调用，count重新初始化赋值
  f1()             // 1
  f1()
}
```
**闭包的实质：**

通过内部的函数的方式获取其所在函数的引用环境的变量和参数访问和修改权限。在本质上，闭包是将函数内部和函数外部连接起来的桥梁。因此，可以将闭包理解为函数以及函数所引用的自由变量的组合。函数提供了逻辑和操作的功能，而自由变量提供了函数执行时的上下文信息。这种组合使得闭包具有保持状态、记忆和灵活性的能力。

**闭包的用途：**

- 回调函数
- 函数工厂
- 延长变量生存期
- 保护私有变量
- 延迟执行操作（比如回收资源）

**注意事项：**

闭包如果引用大量内存或长期活动，因为闭包需要在堆上分配内存来保存捕获的变量，有一定性能损耗。

### defer（延迟调用）

使用 `defer` 关键字，使得一个函数延迟一段时间调用，在函数返回之前这些 defer 描述的函数最后都会被逐个执行，执行顺序按后进先出。

- 延迟调用通常用于释放文件资源，关闭网络连接等操作，还有一个用法是捕获 `panic`
- 一般建议不要在 for 循环中使用 defer，在 Go 中，每创建一个 defer，就需要在当前协程申请一片内存空间。在循环次数很大或次数不确定时可能会导致内存泄漏

**defer 参数预计算：**

对于 defer 直接作用的函数而言，它的参数是会被预计算的。
```go
// eg1
func main() {
  defer fmt.Println(Fn1())
  fmt.Println("3")
}

func Fn1() int {
  fmt.Println("2")
  return 1
} // 2 3 1
//eg2
func main() {
  var a, b int
  a = 1
  b = 2
  defer fmt.Println(sum(a, b))
  a = 3
  b = 4
}

func sum(a, b int) int {
  return a + b
} // 3
//eg3
func main() {
  var a, b int
  a = 1
  b = 2
  f := func() {
    fmt.Println(sum(a, b))
  }
  a = 3
  b = 4
  f()// 调用 7
}
//eg4
func main() {
  var a, b int
  a = 1
  b = 2
  defer func() {
    fmt.Println(sum(a, b))
  }()
  a = 3
  b = 4
} // 7
//eg5
func main() {
  var a, b int
  a = 1
  b = 2
  defer func(num int) {
    fmt.Println(num)
  }(sum(a, b))
  a = 3
  b = 4
} // 3
//实际上因为参数预计算 defer fmt.Println(sum(a,b)) == defer fmt.Println(3)
```

## 数据类型

### bool（布尔类型）

- 注意：`1` 和 `0` 不等价于 `true`/`false`

### 整型

| 类型 | 说明 |
|:-----|:-----|
| `uint8` | 无符号 8 位整型 |
| `uint16` | 无符号 16 位整型 |
| `uint32` | 无符号 32 位整型 |
| `uint64` | 无符号 64 位整型 |
| `int8` | 有符号 8 位整型 |
| `int16` | 有符号 16 位整型 |
| `int32` | 有符号 32 位整型 |
| `int64` | 有符号 64 位整型 |
| `uint` | 无符号整型，至少 32 位 |
| `int` | 整型，至少 32 位 |
| `uintptr` | 等价于无符号 64 位整型，但是专用于存放指针运算，用于存放指针地址 |

### 浮点数

- `float32`
- `float64`

### 复数

- `complex64`：32位实数和虚数
- `complex128`：64位实数和虚数

### 字符

| 类型 | 说明 |
|:-----|:-----|
| `byte` | 等价 `uint8`，可以表达 ASCII 字符 |
| `rune` | 等价 `int32`，可以表达 Unicode 字符 |
| `string` | 字符串即字节序列，可以转换为 `[]byte` 类型即字节切片 |

### 派生类型

| 类型 | 示例 | 说明 |
|:-----|:-----|:-----|
| 数组 | `[5]int` | 长度为 5 的整型数组 |
| 切片 | `[]float64` | 64 位浮点数切片 |
| 映射表 | `map[string]int` | 键为字符串类型，值为整型的映射表 |
| 结构体 | `type Gopher struct{}` | Gopher 结构体 |
| 指针 | `*int` | 一个整型指针 |
| 函数 | `type f func()` | 一个没有参数，没有返回值的函数类型 |
| 接口 | `type Gopher interface{}` | Gopher 接口 |
| 通道 | `chan int` | 整型通道 |

### 零值

一个类型的空值或者说默认值。

| 类型 | 零值 |
|:-----|:-----|
| 数字类型 | `0` |
| 布尔类型 | `false` |
| 字符串类型 | `""` |
| 数组 | 固定长度的对应类型的零值集合 |
| 结构体 | 内部字段都是零值的结构体 |
| 切片、映射表、函数、接口、通道、指针 | `nil` |

**注意事项：**

- `nil` 类似于其它语言中的 `none` 或者 `null`，但并不等同。`nil` 仅仅只是一些引用类型的零值，并且不属于任何类型
- 枚举：Go 没有 `enum`，但可以使用 自定义类型+常量+`iota`+函数+接口 来实现

### 常量

常量只能是基本数据类型，不能是结构体、接口、切片、数组、映射等。

- 常量值可以是字面量/常量标识符/常量表达式/结果为常量的类型转换/`iota`
- 常量声明时**必须初始化**，可以省略类型
- 同一括号内的同组常量声明时，已经赋值的常量后面的常量可以不用重复赋值（如果要它们值相同的话）

**iota：**

内置的常量标识符，通常用于表示一个常量声明中的无类型整数序数，一般都是在括号中使用。

- 本质上就是 `iota` 所在行相对于当前 `const` 分组的第一行的差值，不同的 `const` 分组则相互不会影响
- `iota` 是递增的，第一个常量使用 `iota` 值的表达式，根据序号值的变化会自动的赋值给后续的常量，直到用新的 `const` 重置，这个序号其实就是代码的相对行号，是相对于当前分组的起始行号

### 变量

声明时类型后置：`var name type`

- 相同类型的多个变量可以使用逗号分隔，只写一次类型
- 只声明不初始化，默认初始化为对应类型的零值
- 赋值可以使用短变量 `name := value` 来进行类型推导，但必须保证该变量的类型不变，并且不能使用 `nil` 值，也不能对一个已经存在的变量使用，除非同时为两个新旧变量赋值
- 可以使用下划线 `_` 来定义一个匿名变量，当不需要使用它（例如不需要某个函数返回值）可以用来省略

### 变量值交换
- 不需要使用指针，直接使用赋值：
```go
a, b = 1, 2
a, b = b, a
```
- 但是需要注意，包含表达式时，会先计算值再进行赋值
```go
a, b, c := 0, 1, 1
a, b, c = b, c, a + b
// 结果是 1，1，（0+1），也就是1，1，1
```

## 比较

两个变量要进行比较，它们的类型**必须相同**。

**可比较的类型：**

- 布尔、数字、字符、指针、通道（仅支持判断是否相等）
- **元素是可比较类型的数组**（仅支持判断是否相等）（仅支持相同长度的数组间的比较，因为数组长度也是类型的一部分，而不同类型不可比较）
- **字段类型都是可比较类型的结构体**（仅支持判断是否相等）

**不可比较的类型：**

- **切片不可比较**，切片是引用类型，比较会检查底层数组地址
- 映射底层是哈希表，比较无意义
- 函数：函数值是引用，无法比较

**类型转换：**

- Go 不存在隐式类型转换
- 但是可以使用强制类型转换：`type(varname)`
- Go 提供了 `min` 和 `max` 函数，用来取多个值中的最大最小值：

```go
min_v := min(1,2,3) // 1
max_V := max(1,2,3) // 3
```

## 代码块

使用花括号。与其他语言类似，块内的局部变量作用域相互独立。

## 输入输出

建议练习 ACM_IO。

### 输入

输入使用 `fmt` 包：
```go
// 扫描从os.Stdin读入的文本，根据空格分隔，换行也被当作空格
func Scan(a ...any) (n int, err error)
// 与Scan类似，但是遇到换行停止扫描
func Scanln(a ...any) (n int, err error)
// 根据格式化的字符串扫描
func Scanf(format string, a ...any) (n int, err error)
```
### 输出

- 输出使用 `fmt.Println("youroutput!")` 或者 `os.Stdout.WriteString("yourinput")`
- 更常用的是 `fmt.Printf("format %s", var)`

```go
func Printf(format string, a ...any) (n int, err error) {
  return Fprintf(os.Stdout, format, a...)
}
```

**注意事项：**

- 注意 `print` 和 `println` 这两个函数要和 `Println` 区分大小写，它们是用来输出到 `stderr` 的
- 错误输出使用 `fmt.Errorf`，类似于 `fmt.Sprintf`，但返回 `error` 类型而非字符串
- `fmt.Errorf` 不输出到控制台，只是创建 `error` 对象；打印用 `fmt.Println(err)` 来打印返回的 `error`，或者 `fmt.Fprintln(os.Stderr, "error message")` 或使用 log 库 `log.Println("error")`
- 另外 `log.Fatal("fatal error")` 会在输出错误后退出程序

```go
func Errorf(format string, a ...interface{}) error

import "fmt"

// 简单错误
err := fmt.Errorf("something went wrong")

// 格式化错误
err := fmt.Errorf("failed to open file %s: %v", filename, originalErr)

// 包装错误（Go 1.13+ 支持 %w 用于错误包装）
// 前提是使用格式化动词 %w 并且参数 err 一定有效
err := fmt.Errorf("wrap error: %w", originalErr)
```

### 格式化动词

`Printf` 函数同样有格式化，错误格式化：参数列表与格式化数量不匹配/类型不匹配。

- `%` 之后跟一个空格再跟指定格式化符号，能够做到分隔输出
- `%` 前加 `0`，可以做到自动补零

**常见格式化动词：**

| 序号 | 动词 | 说明 | 适用类型 |
|:----:|:----:|:-----|:---------|
| 1 | `%%` | 输出百分号 `%` | 任意 |
| 2 | `%s` | 输出 `string`/`[]byte` 值 | `string`, `[]byte` |
| 3 | `%q` | 格式化字符串，输出的字符串两端有双引号 `""` | `string`, `[]byte` |
| 4 | `%d` | 输出十进制整型值 | 整型 |
| 5 | `%f` | 输出浮点数 | 浮点 |
| 6 | `%e` | 输出科学计数法形式，也可以用于复数 | 浮点 |
| 7 | `%E` | 与 `%e` 相同 | 浮点 |
| 8 | `%g` | 根据实际情况判断输出 `%f` 或者 `%e`，会去掉多余的 0 | 浮点 |
| 9 | `%b` | 输出整型的二进制表现形式 | 数字 |
| 10 | `%#b` | 输出二进制完整的表现形式 | 数字 |
| 11 | `%o` | 输出整型的八进制表示 | 整型 |
| 12 | `%#o` | 输出整型的完整八进制表示 | 整型 |
| 13 | `%x` | 输出整型的小写十六进制表示 | 数字 |
| 14 | `%#x` | 输出整型的完整小写十六进制表示 | 数字 |
| 15 | `%X` | 输出整型的大写十六进制表示 | 数字 |
| 16 | `%#X` | 输出整型的完整大写十六进制表示 | 数字 |
| 17 | `%v` | 输出值原本的形式，多用于数据结构的输出 | 任意 |
| 18 | `%+v` | 输出结构体时将加上字段名 | 任意 |
| 19 | `%#v` | 输出完整 Go 语法格式的值 | 任意 |
| 20 | `%t` | 输出布尔值 | 布尔 |
| 21 | `%T` | 输出值对应的 Go 语言类型值 | 任意 |
| 22 | `%c` | 输出 Unicode 码对应的字符 | `int32` |
| 23 | `%U` | 输出字符对应的 Unicode 码 | `rune`, `byte` |
| 24 | `%p` | 输出指针所指向的地址 | - |

### bufio 包

`bufio` 提供了可缓冲的输出方法，它会先将数据写入到内存中，积累到了一定阈值再输出到指定的 `Writer` 中，默认缓冲区大小是 4KB。在文件 IO，网络 IO 的时候建议使用这个包。
```go
func main() {
  writer := bufio.NewWriter(os.Stdout)
  defer writer.Flush()
  fmt.Fprintln(writer, "hello world!")
}
func main() {
    reader := bufio.NewReader(os.Stdin)
    var a, b int
    fmt.Fscanln(reader, &a, &b)
    fmt.Printf("%d + %d = %d\n", a, b, a+b)
}
func main() {
  scanner := bufio.NewScanner(os.Stdin)
  for scanner.Scan() {
    line := scanner.Text()
    if line == "exit" {
      break
    }
    fmt.Println("scan", line)
  }
}
```

- 在os包下有三个外暴露的文件描述符，其类型都是*os.File，分别是：
- os.Stdin
- os.Stdout 
- os.Stderr
- 可以结合
```go
var (
   Stdin  = NewFile(uintptr(syscall.Stdin), "/dev/stdin")
   Stdout = NewFile(uintptr(syscall.Stdout), "/dev/stdout")
   Stderr = NewFile(uintptr(syscall.Stderr), "/dev/stderr")
)
```

## 控制语句

### if/else/else if

`expr` 必须是 `bool` 表达式。
```go
if expr{

}
else{

}
```
### switch

与其他语言不同，若要继续执行当前分支后续的所有分支，必须为每个分支使用 `fallthrough` 关键字。
```go
switch expr {
  case case1:
    statement1
  case case2:
    statement2
  case case3: // 若进入case 3 ，则case 4 也会执行
    statement3
    fallthrough
  case case4:
    statement4
  default:
    default statement
}
```
### 标签（label）

给每一个代码块打上标签，可以是 `goto`/`break`/`continue`。

- 与其他语言类似，不建议使用 `goto`
```go
func main() {
   a := 1
   if a == 1 {
      goto A
   } else {
      fmt.Println("b")
   }
A:
   fmt.Println("a")
}
```
### for

整合了 `for` 与 `while`。
```go
for init statement; expression; post statement {
  execute statement
}
for i := 0; i <= 20; i++ {
    fmt.Println(i)
}
```
**如果要使用 while：**
```go
for expr{
    exec
}
```
**如果要使用 while(true)/for(::)：**
```go
for{ // 省略循环条件

}
```
**范围 for 循环：**

用于遍历数组/切片/映射/字符串等。

- 注意 `range` 会返回一个副本，该副本的值是每次遍历对应元素的值，而不是返回该元素的引用
- 比如试图返回切片的元素地址应该使用 `slice[i]` 而不是 `&value`，`value` 变量地址固定而值是切片各元素的值
```go
for index, value := range iterable {
  // body
}
func main() {
   sequence := "hello world"
   for index, value := range sequence {
      fmt.Println(index, value)
   }
}
```
### break/continue

与其他语言相同。

## 数组

如果事先就知道了要存放数据的长度，且后续使用中不会有扩容的需求，就可以考虑使用数组。

**特性：**

- Go 中的数组是值类型，而非引用，并不是指向头部元素的指针
- 因此函数传参将会拷贝整个数组而非数组首地址
- 数组长度只能是常量，不能定义一个变量作为数组长度

**初始化：**

- 可以用花括号初始化列表来为数组元素初始化

```go
var arr_name [n]type
```

- 可以使用省略号来自动推断数组大小，但省略号必须存在，否则生成的是切片，不是数组

```go
nums := [...]int{1, 2, 3, 4, 5} 
// 等价于nums := [5]int{1, 2, 3, 4, 5}
```

- 可以使用 `new` 函数来获得指向数组的指针

```go
nums := new([5]int)
```

**操作：**

- 使用数组名与下标 `[idx]` 来读写数组
- 使用 `len(arr)/cap(arr)` 来获取数组大小与数组容量
- 对于数组，它的大小和容量始终一致
- 数组可以切割，`arr[startIndex : endIndex]`，切割后便成为左闭右开的切片，并且和原数组指向同一内存
```go
nums := [5]int{1, 2, 3, 4, 5}
nums[1:] // 子数组范围[1,5) -> [2 3 4 5]
nums[:5] // 子数组范围[0,5) -> [1 2 3 4 5]
nums[2:3] // 子数组范围[2,3) -> [3]
nums[1:3] // 子数组范围[1,3) -> [2 3]
```
- 可以将数组复制到一个切片：
```go
func main() {
  arr := [5]int{1, 2, 3, 4, 5}
  slice := slices.Clone(arr[:])
  slice[0] = 0
  fmt.Printf("array: %v\n", arr)
  fmt.Printf("slice: %v\n", slice)
}
```

## 切片

在 Go 中，数组和切片两者看起来长得几乎一模一样，但功能有着不小的区别。

**区别：**

- 数组是**定长**的数据结构，长度被指定后就不能被改变
- 而切片是**不定长**的，切片在容量不够时会**自行扩容**
- 切片的底层实现依旧是数组，是引用类型，可以简单理解为是指向底层数组的指针

**扩容策略：**

- 在 golang 1.18 版本更新之前：当原 slice 容量小于 1024 的时候，新 slice 容量变成原来的 2 倍；原 slice 容量超过 1024，新 slice 容量变成原来的 1.25 倍
- 在 1.18 版本更新之后：当原 slice 容量(oldcap)小于 256 的时候，新 slice(newcap)容量为原来的 2 倍；原 slice 容量超过 256，新 slice 容量 `newcap = oldcap+(oldcap+3*256)/4`
- 在此之上还需要做内存对齐，实际上新切片容量要大于等于上述计算值

**初始化：**

- 推荐使用函数 `make(type,len,cap)`
- 通过 `var slices_name []type` 初始化的切片，默认值是 `nil`，大小和容量均与初始化列表元素数量相同
- 空切片在底层数组包含 0 个元素，也没有分配任何存储空间
```go
var nums []int // 值
nums := []int{1, 2, 3} // 值
nums := make([]int, 0, 0) // 值
nums := new([]int) // 指针
```
- append函数插入/删除元素：`func append(slice []type, elems, ...type) []type`
```go
nums := []int{1, 2, 3, 4, 5, 6, 7, 8, 9, 10}

nums = append([]int{-1, 0}, nums...) // 从头部插入
fmt.Println(nums) // [-1 0 1 2 3 4 5 6 7 8 9 10]

nums = append(nums[:i+1], append([]int{999, 999}, nums[i+1:]...)...) // 从i之后插入
fmt.Println(nums) // i=3，[1 2 3 4 999 999 5 6 7 8 9 10]

nums = append(nums, 99, 100) // 从尾部插入
fmt.Println(nums) // [1 2 3 4 5 6 7 8 9 10 99 100]

nums = nums[n:] // 从头部删除n个
fmt.Println(nums) //n=3 [4 5 6 7 8 9 10]

nums = append(nums[:i], nums[i+n:]...) // 从i之后删除n个
fmt.Println(nums)// i=2，n=3，[1 2 6 7 8 9 10]

nums = nums[:len(nums)-n] // 从尾部删除n个（从len-n处开始删除）
fmt.Println(nums) //n=3 [1 2 3 4 5 6 7]

nums = nums[:0] //清空切片
fmt.Println(nums) // []
```
- 拷贝一个切片要保证目标切片有足够的**长度**
```go
func main() {
  dest := make([]int, 10) // 初始化为10个0
  src := []int{1, 2, 3, 4, 5, 6, 7, 8, 9}
  fmt.Println(src, dest) // [1...9] [0...0]
  fmt.Println(copy(dest, src)) // 返回拷贝元素个数
  fmt.Println(src, dest) // [1...9] [1...9,0]
}
```
- 多维切片:同样是二维的数组和切片，其内部结构是不一样的。数组在初始化时，其一维和二维的长度早已固定，而切片的长度是不固定的，切片中的每一个切片长度都可能是不相同的，所以必须要单独初始化
```go
var nums [5][5]int
for _, num := range nums {
   fmt.Println(num)
}
fmt.Println()
slices := make([][]int, 5)
for i := 0; i < len(slices); i++ {
   slices[i] = make([]int, 5)
}
/*
[0 0 0 0 0]
[0 0 0 0 0]
[0 0 0 0 0]
[0 0 0 0 0]
[0 0 0 0 0]

[0 0 0 0 0]
[0 0 0 0 0]
[0 0 0 0 0]
[0 0 0 0 0]
[0 0 0 0 0]
*/
```
- 切割切片：简单表达式`slice[startIndex, endIndex]`，切割后的切片与原切片共享同一内存
- 容量则是`原切片容量 cap(src)- startIndex`
- 拓展表达式：切片与数组都可以使用简单表达式来进行切割，但是拓展表达式只有切片能够使用，主要是为了解决切片共享底层数组的读写问题: `slice[startIndex, endIndex, maxCap]`
- startIndex <= endIndex <= maxCap <= cap(src)
- 如果新切片的容量 maxCap 大于原切片的容量 cap(src) 无法通过编译
- 如果切割切片时设置的大小与容量一样，那么当进行append操作时就能强行内存重分配
```go
s1 := []int{1, 2, 3, 4, 5, 6, 7, 8, 9} // cap_S1 = 9
s2 := s1[3:4]                          // cap_s2 = 9 - 3 = 6
// 添加新元素，由于容量为6.所以没有扩容，直接修改底层数组
s2 = append(s2, 1)
fmt.Println(s2) // [4, 1]
fmt.Println(s1) // [1, 2]

func main() {
   s1 := []int{1, 2, 3, 4, 5, 6, 7, 8, 9} // cap_s1 = 9
   s2 := s1[3:4:4]                        // cap_s2 = 4 - 3 = 1
   // 容量不足，分配新的底层数组(重新分配内存空间)
   s2 = append(s2, 1)
   fmt.Println(s2)
   fmt.Println(s1)
}
```
- `clear(slice)` 能够将切片内设置为类型零值
- 如果要彻底清空切片可以删除并设置容量为0：
```go
func main() {
  s := []int{1, 2, 3, 4}
    s = s[:0:0]
  fmt.Println(s) 
}
```

## 字符串

- 本质是不可修改的只读字符数组，但是可以替换为另一个字符串
- `""` 双引号字符串支持转义，但不支持多行
- `` `反引号字符串` ``，也即 raw string，不支持转义
- 字符串长度本质是字节数组的长度，也就是字节数量而非字符数量
- 对于 ASCII 字符，一个字符能用一个字节表示，对于中文汉字则是 3 个字节
- 可以和数组一样进行下标访问，切割
- 如果不进行格式化输出将会得到字节而不是字符
- 可以和字节切片相互转换,字符串转切片将复制并得到一个存储在别处的字符切片
```go
func main() {

  func main() {
   str := "this is a string"
   fmt.Println(str[0])  // 116 字节而非字符
}
   str := "this is a string"
   // 显式类型转换为字节切片
   bytes := []byte(str)
   fmt.Println(bytes)
   // 显式类型转换为字符串
   fmt.Println(string(bytes))
}
func main() {
  // 使用unsafe库来实现无复制转换
  s1 := "hello world"
  b1 := unsafe.Slice(unsafe.StringData(s1), len(s1))
  fmt.Printf("%p %p", unsafe.StringData(s1), unsafe.SliceData(b1))
}
```
- 字符串的拷贝实际上是字节切片拷贝,先转为字节切片，切片复制以后再转为字符串
```go
func main() {
    var dst, src string
    src = "this is s string"
    desBytesSlice := make([]byte, len(src))
    copy(desBytesSlice, src)
    dst = string(desBytesSlice)
    fmt.Println(src,dst)
}

func main() {
   var dst, src string
   src = "this is a string"
   dst = strings.Clone(src)
   fmt.Println(src, dst)
}
```
- 字符串拼接，可以使用`+`运算，可以转字节切片使用append，但建议使用strings.Builder
```go
func main() {
	builder := strings.Builder{}
	builder.WriteString("string a")
	builder.WriteString("string b")
	fmt.Println(builder.String())
}
 
```
- 遍历字符串建议使用range for而不是普通for，当然也可以转换为rune切片
- 因为range for 将字符串按rune类型遍历字符串而不是单个字符，支持utf8
- rune本质是int32，能够存储4个字节，utf8的字符最大也只要3个字节表示
```go
func main() {
   str := "hello 世界!"
   for _, r := range str {
      fmt.Printf("%d,%x,%s\n", r, r, string(r))
   }
}

func main() {
   str := "hello 世界!"
   runes := []rune(str)
   for i := 0; i < len(runes); i++ {
      fmt.Println(string(runes[i]))
   }
}
func main() {
  str := "hello 世界!"
  for i, w := 0, 0; i < len(str); i += w {
    r, width := utf8.DecodeRuneInString(str[i:])
    fmt.Println(string(r)) // 按空格分隔输出两个串
    w = width
  }
}
```

## 映射（map）

在 Go 语言中，映射底层是哈希表，所以是无序的。

- 键的类型必须是可比较类型
- 初始化可以是 `map_name := map[key_type]value_type {key:value, ...}`
- 也可以用 `make(map[key_type]value_type, cap)`，前提是已经分配内存
- map 使用下标访问，返回 value 值和一个表示对应键是否存在的 `bool` 值，如果不存在，相应的 value 为类型零值
- 可以使用 `len(map_name)` 求大小
- 同样使用下标来修改对应值
- 尽量避免使用 `NaN` 作为 map 的键
- 因为任何数字都不等于 `NaN`，`NaN` 也不等于自身，这也造成了每次哈希值都不相同
- map 并不是一个并发安全的数据结构，引入互斥锁会极大的降低性能
- map 内部有读写检测机制，如果冲突会触发 `fatal error`
- 如果需要在并发场景使用 map，改用 `sync.Map`
```go
func main() {
  mp := make(map[float64]string, 10)
  mp[math.NaN()] = "a"
  mp[math.NaN()] = "b"
  mp[math.NaN()] = "c"
  _, exist := mp[math.NaN()]
  fmt.Println(exist)
  fmt.Println(mp)
}
```
**操作：**

- map 删除使用 `func delete(map_name, key)`
- 如果值为 `NaN`，甚至没法删除该键值对
- 遍历 map 使用 `range for`，`NaN` 键在这种情况下能够正常遍历对应值
- 使用 `clear(map_name)` 来清空 map

## 集合

- 可以使用 `set := make(map[int]struct{}, 10)`，也就是 keyType-空结构体来模拟集合
- 空结构体不同于 C/C++，它不占内存
```go
func main() {
  set := make(map[int]struct{}, 10)
  for i := 0; i < 10; i++ {
    set[rand.Intn(100)] = struct{}{}
  }
  fmt.Println(set)
}
```

## 指针

- Go 语言中指针只有取址和解引用操作
- 指针声明可以不立即初始化，但空指针无法使用
- 可以使用 `new(Type)` 来为指针分配一个指向内存的地址，并且内存中的值初始化为类型零值
- 在 `unsafe` 库中可以使用指针运算

## new 与 make

- `func new(Type) *Type`：返回值是类型指针，接收参数是类型，专用于给指针分配内存空间
- `func make(t Type, size ...IntegerType) Type`：返回值是值，不是指针，接收的第一个参数是类型，不定长参数根据传入类型的不同而不同，专用于给切片，映射表，通道分配内存
```go
new(int) // int指针
new(string) // string指针
new([]int) // 整型切片指针
make([]int, 10, 100) // 长度为10，容量100的整型切片
make(map[string]int, 10) // 容量为10的映射表
make(chan int, 10) // 缓冲区大小为10的通道
```

## 结构体

没有类与继承特性，没有构造函数。
```go
type struct_name struct{
    member_1 type
    member_2 type
    member_3 type
    member_slice []type
}
```
- 成员同样按首字母大小写区分公有/私有，对于一些类型相同的相邻字段，可以不需要重复声明类型
- 成员函数不得与成员变量重名
- 结构体本身没有构造函数，但可以自定义一个函数来实例化结构体
- 实例化一个结构体建议使用option模式,能够以不同参数来实例化，也不需要改变函数签名
- 也可以使用初始化列表，或者定义一个构造函数（但不如option）
```go
type struct_name struct{
    member_1 type
    member_2 type
    member_3 type
    member_slice []type
}
// 1. 声明一个options类型为函数指针
type struct_nameOptions func (s *struct_name)
// 2. 创建选项函数，With+成员名, 返回值是一个闭包 struct_nameOptions
func Withmember_1(member_1 type) struct_nameOptions {
    return func (p *struct_name) {
        
        p.member_1 = member_1
    }
}
// 3. 创建构造函数, 参数是为各个成员初始化的option闭包
func Newstruct_name(options ...struct_nameOptions) *struct_name {
    // 优先应用options
  p := &struct_name{}
    for _, option := range options {
        option(p)
    }

  // 默认值处理
  if p.Age < 0 {
    p.Age = 0
  }
  ......
    return p
}
//4. 初始化结构体
func main() {
  pl := Newstruct_name(
    Withmember_1(arg),
    Withmember_2(arg),
    Withmember_3(arg),
  )

  p2 := Newstruct_name(
    Withmember_1(arg),
    Withmember_2(arg),
  )
}
```
- 结构体嵌套：直接在内部声明另一个结构体类型的成员，也可以匿名声明该成员，只写类型
- 显式声明在使用结构体时需要指明该嵌套结构体的名称，匿名声明则用类型代替
- 嵌入类型是将已有的类型直接声明在新的结构类型里。被嵌入的类型被称为新的外部类型的内部类型。 
- 通过嵌入类型，与内部类型相关的标识符会提升到外部类型上。这些被提升的标识符就像直接声明在外部类型里的标识符一样，也是外部类型的一部分。这样外部类型就组合了内部类型包含的所有属性，并且可以添加新的字段和方法。
- 外部类型也可以通过声明与内部类型标识符同名的标识符来**覆盖**内部标识符的字段或者方法
```go
type Person struct {
   name string
   age  int
}

type Student struct {
   p      Person // 可以说 Person 是外部类型 Student 的内部类型
   school string
}

type Employee struct {
   p   Person
   job string
}
student := Student{
   p:      Person{name: "jack", age: 18},
   school: "lili school",
}
fmt.Println(student.p.name)
type Person struct {
  name string
  age  int
}

type Student struct {
  Person
  school string
}

type Employee struct {
  Person
  job string
}
student := Student{
   Person: Person{name: "jack",age: 18},
   school: "lili school",
}
fmt.Println(student.name)
```
- 结构体访问成员：使用`.`运算符，不论是实例化对象还是指向结构体的指针
- 因为编译时底层会自动进行解引用
- 结构体标签：标签是一种键值对的形式，使用空格进行分隔
```go
type Programmer struct {
    Name     string `json:"name"`
    Age      int `yaml:"age"`
    Job      string `toml:"job"`
    Language []string `properties:"language"`
}
```
- 结构体同其他语言一样存在内存对齐
- 空结构图不占内存，可以作为map的值类型，可以将map作为set来进行使用，又或者是作为通道的类型，表示仅做通知类型的通道
```go
func main() {
   type Empty struct {}
   fmt.Println(unsafe.Sizeof(Empty{})) // 0
}
```

## 方法

类似于调用一个类的成员方法，先声明，再初始化，再调用。

- 只允许为命名的用户定义的类型声明方法
```go
func (recv recv_type) methodname(arg Type) returnType {}
```
- 方法与函数的区别在于，方法拥有接收者，而函数没有，且只有自定义类型能够拥有方法
- 接收者就类似于this或self，只不过在 Go 中需要显式的指明。
```go
type IntSlice []int

func (i IntSlice) Get(index int) int {
  return i[index]
}
func (i IntSlice) Set(index, val int) {
  i[index] = val
}

func (i IntSlice) Len() int {
  return len(i)
}
```
- 接收者类型分值接收者和指针接收者，前者不能改变对象的值（因为获得了一份拷贝），但后者通过指针解引用可以
```go
type MyInt int

func (i MyInt) Set(val int) {
   i = MyInt(val) // 修改了形参arg，但是不会造成任何影响
}

func main() {
   myInt := MyInt(1)
   myInt.Set(2)
   fmt.Println(myInt)
}

type MyInt int

func (i *MyInt) Set(val int) {
   *i = MyInt(val) // 解引用 实参para
}

func main() {
   myInt := MyInt(1)
   myInt.Set(2)
   fmt.Println(myInt)
}
```

## 接口

一组类型的集合。当一个类型位于一个接口的类型集内，且该类型的值可以由该接口类型的变量存储，那么称该类型实现了该接口。
- 当如下情况时，可以称类型 T 实现了接口 I
- 1. T 不是一个接口，并且是接口 I 类型集中的一个元素
- 2. T 是一个接口，并且 T 的类型集是接口 I 类型集的一个子集
- 如果 T 实现了一个接口，那么 T 的值也实现了该接口。
- 一般分为**只包含方法集**的接口：基本接口 和 **只要包含类型集**的接口：通用接口
- 方法集就是一组方法的集合，同样的，类型集就是一组类型的集合
- 类型 T 定义了一个拥有方法 A 和 B 的接口，同时类型 T 还拥有一个结构体
- 该结构体类型又有方法 A 和 方法 B 的实现，接收者是该类型
- 那么类型 T 实现了方法 A与方法 B ,也就实现了该接口、
- T 类型的值的方法集只包含值接收者声明的方法。而指向T类型的指针的方法集既包含值接收者声明的方法，也包含指针接收者声明的方法。
- 如果使用**指针接收者**来实现一个接口，那么**只有指向那个类型的指针**（值不会自动取地址）才能够实现对应的接口。如果使用**值接收者**来实现一个接口，那么**那个类型的值和指针**（指针可以自动解引用）都能够实现对应的接口。
```go
type InterfaceName interface {
    MethodName1(parameters) (returnTypes)
    MethodName2(parameters) (returnTypes)
    // ...
}

type File struct{}

func (f *File) Read(p []byte) (n int, err error) {
    // 实现细节...
}

func (f *File) Write(p []byte) (n int, err error) {
    // 实现细节...
}

func (f *File) Close() error {
    // 实现细节...
}

var _ ReadWriteCloser = (*File)(nil) // File类型隐式实现了ReadWriteCloser接口
```
- 空接口：不包含任何方法，因此所有类型都实现了空接口。空接口常用于需要处理任意类型值的场景，如函数参数、返回值、集合元素等

## 类型与泛型

### 泛型

通过类型参数化来实现代码的复用与灵活性。
- 对于同种内存形状（形状怎么看由内存分配器决定）的类型会使用单态化，为其生成同一份代码
- 比如 type Int int 与 int 其实是同一个类型，所以共用一套代码。
- 但是对于指针而言，虽然所有的指针类型都是同一个内存形状，比如 *int， *Person 都是一个内存形状
- 但是它们是无法共用一套代码的，因为解引用时操作的目标类型内存布局完全不同​​
- 为此，Go 同时也会使用字典在运行时获取类型信息，所以 Go 的泛型也存在运行时开销。
- GO 支持新类型的声明，`type MyInt int64`
- 但通过类型声明的两种新类型，即便底层使用相同的基础类型，也无法直接进行运算 `type MyInt int64 无法与 int64 直接运算`
- 需要进行显式的类型转换，并且被转换类型必须是可以被目标类型代表的（Representability）
- 例如int可以被int64类型所代表，也可以被float64类型代表，所以它们之间可以进行显式的类型转换
- 但是int类型无法被string和bool类型代表，因为也就无法进行类型转换
- 类型别名与类型声明则不同，类型别名仅仅只是一个别名，并不是创建了一个新的类型 `type Int = int`
- 内置类型`any`就是`interface{}`的类型别名
- 由于只是新的别名，使用该别名的类型可以和原类型名运算
- 泛型的语法如下：
- 类型形参：T 就是一个类型形参，形参具体是什么类型取决于传进来什么类型
- 类型约束：type1 | type2 | ... 构成了一个类型约束，这个类型约束内规定了哪些类型是允许的，约束了类型形参的类型范围
```go
func funcname[T type1 | type2 | ...](arg1, arg2 T) returnType {}
```
- 类型实参：`funcname[int](1,0,...)` 中的 int 类型即为类型实参，决定了函数传入参数的规范类型
- 也可以不指定，自动推导类型
- 类型断言通常用于判断某一接口类型的变量是否属于某一个类型
- 典型应用是对象池
- 类型断言语句有两个返回值，一个是类型转换过后的值，另一个是转换结果的布尔值
```go
var b int = 1
var a interface{} = b
if intVal, ok := a.(int); ok {
   fmt.Println(intVal)
} else {
   fmt.Println("error type")
   // 由于interface{}是空接口类型，空接口类型可以代表所有的类型
   // 但是int类型无法代表interface{}类型，所以无法使用类型转换。
}
```
类型判断则可以利用switch语句根据case做出不同的逻辑处理,前提是入参必须是接口类型
```go
var a interface{} = 2
switch a.(type) {
    case int: fmt.Println("int")
    case float64: fmt.Println("float")
    case string: fmt.Println("string")
}
```
- 泛型不能作为一个类型的基本类型，泛型类型无法使用类型断言
- 泛型是为了解决执行逻辑与类型无关的问题，如果一个问题需要根据不同类型做出不同的逻辑，那么就根本不应该使用泛型而是interface{}
- 匿名结构不支持泛型
- 匿名函数不支持自定义泛型，但是可以 使用 已有的泛型类型
- 方法是不能拥有泛型形参的，但是 接收者 可以拥有泛型形参
- 类型集只能用于泛型中的类型约束，不能用作类型声明，类型转换，类型断言
- 带有类型集的接口，都无法当作类型实参
- 类型集无法直接或间接的并入自身
- 类型集有交集并集空集三种情况：
- 交集：非空接口的类型集是其所有元素的类型集的交集，也就是说如果一个接口包含多个非空类型集，那么该接口就是这些类型集的交集
- 对于非接口类型，类型并集中不能有交集，但是对于接口类型的话，就允许有交集
```go
type itfc_name_1 interface{
  type_1 | type_2 | type_3
}
type itfc_name_2 interface{
  type_1 | type_2 | type_3 | type_4 | type_5
}
type itfc interface {
  itfc_name_1
  itfc_name_2
}
```
- 并集：一个接口中的所有类型的并集是这个接口类型集
-  类型集无法直接或间接的并入自身，也就是不能将自己作为自己的类型
- comparable 接口无法并入类型集，也无法并入类型约束中
- 方法集无法并入类型集，任何包含方法的接口，都不能并入类型集合
```go
type itfc_name_1 interface{
  type_1 | type_2 | type_3
  // 三个类型的并集是 itfc_name_1
}
```
- 空集：两个接口类型集没有共同的类型，它们的交集是空集
- 与空接口不同，空接口是所有类型集的集合，即包含所有类型
 ```go
type itfc_name_1 interface{
  type_1 | type_2 | type_3
}
type itfc_name_2 interface{
  type_4 | type_5
}
type itfc interface {
  itfc_name_1
  itfc_name_2
  // 空集
}
```
- 当使用 type 关键字声明了一个新的类型时，即便其底层类型包含在类型集内，当传入时也依旧会无法通过编译
- 可以使用 ~ 符号，来表示底层类型，如果一个类型的底层类型属于该类型集，那么该类型就属于该类型集

## 错误处理

- `error` 本身是一个预定义的接口，该接口下只有一个方法 `Error()`
- 该方法的返回值是字符串，用于输出错误信息 `type error interface {Error() string}`
- 大部分情况为了更好的维护性，一般都不会临时创建 error, 将常用的 error 当作全局变量使用
- 可以有多种方法来创建一个error,
```go
err := errors.New("this is an error")
err := fmt.Errorf("this is %d fmt error", 1)
```
- 而通过实现 Error() 方法能够自定义error
```go
func New(text string) error {
  return &errorString{text}
}
type errorString struct {
  s string
}
func (e *errorString) Error() string {
  return e.s
}
```
### 错误传递

- 调用函数向调用者返回了错误但没有处理，向上层层传递会导致多次包装，无法判别错误
- 解决方案是使用链式处理，使用 `errors` 的 `Unwrap` 函数 `func Unwrap(err error) error` 处理错误
- `func Is(err, target error) bool` 的作用是判断错误链中是否包含指定的错误
- `func As(err error, target any) bool` 的作用是在错误链中寻找第一个类型匹配的错误，并将值赋值给传入的 err。有些情况下需要将 `error` 类型的错误转换为具体的错误实现类型，以获得更详细的错误细节，而对一个错误链使用类型断言是无效的，因为原始错误是被结构体包裹起来的
### panic

- `panic` 是 Go 运行时异常的表达形式，程序中存在多个协程时，只要任一协程发生 panic，如果不将其捕获的话，整个程序都会崩溃
- `func panic(v any)` 创建 panic，当输出错误堆栈信息时，v 也会被输出
```go
// 数据库
func main() {
  initDataBase("", 0) // localhost, 3306
}

func initDataBase(host string, port int) {
  if len(host) == 0 || port == 0 {
    panic("非法的数据链接参数")
  }
    // ...其他的逻辑
}
```
### recover

- 当发生 panic 时，使用内置函数 `recover()` 可以及时的处理并且保证程序继续运行，必须要在 `defer` 语句中运行，多次使用也只会有一个能恢复
- 闭包 `recover` 不会恢复外部函数的任何 panic
- `recover()` 必须直接在 `defer` 修饰的函数中调用，才能捕获到当前 goroutine 的 panic
- 如果 `recover()` 不是直接在 `defer` 函数里，而是在 `defer` 函数内部再嵌套的函数中调用，就无法捕获到 panic（因为嵌套函数属于新的函数栈帧，脱离了 `defer` 函数的直接上下文）
```go
func main() {
   dangerOp()
   fmt.Println("程序正常退出")
}

func dangerOp() {
   defer func() {
      if err := recover(); err != nil {
         fmt.Println(err)
         fmt.Println("panic恢复")
      }
   }()
   panic("发生panic")
}
```
- 在 `defer` 中再次闭包使用 `recover`，闭包函数可以看作调用了一个函数，panic 是向上传递而不是向下，自然闭包函数也就无法恢复 panic
- panic 的恢复只和 `recover()` 所在的上下文有关：只有在 `defer` 函数的直接作用域中调用 `recover()`，才能捕获当前 goroutine 的 panic
- 函数栈传递规则：panic 向上传递时，只会触发当前函数栈帧中已注册的 `defer` 函数，且只有这些 `defer` 函数的直接代码中的 `recover()` 能捕获 panic
- `panic()` 的参数是 `nil`，这种情况 panic 确实会恢复，但是不会输出任何的错误信息

### fatal

- 当发生 fatal 时，程序需要立刻停止运行，不会执行任何善后工作，通常情况下是调用 `os` 包下的 `Exit` 函数退出程序
- 一般很少会显式的去触发，大多数情况都是被动触发
```go
func main() {
  dangerOp("")
}

func dangerOp(str string) {
  if len(str) == 0 {
    fmt.Println("fatal")
    os.Exit(1)
  }
  fmt.Println("正常逻辑")
}
```

## 反射

反射与 `interface{}` 密切相关，很大程度上，只要有 `interface{}` 出现的地方，就会有反射。Go 中的反射 API 是由标准库 `reflect` 包提供的。
### 接口的运行时表示

- 在 Go 中，接口本质上是结构体，Go 在运行时将接口分为了两大类，一类是没有方法集的接口，另一个类则是有方法集的接口
- 对于含有方法集的接口来说，在运行时由如下的结构体 `iface` 来进行表示，在 `reflect` 包下有与其对应的结构体类型，`iface` 对应的是 `nonEmptyInterface`，而 `eface` 对应的是 `emptyInterface`
```go
type iface struct {
   tab  *itab // 包含 数据类型，接口类型，方法集等
   data unsafe.Pointer // 指向值的指针
}
type eface struct {
   _type *_type // 类型
   data  unsafe.Pointer // 指向值的指针
}
```
### reflect.Type 和 reflect.Value

- `reflect` 包中有两个重要的类型，`reflect.Type` 接口类型来表示**Go 中的类型**，`reflect.Value` 结构体类型来表示**Go 中的值**
- 同时 `reflect` 包提供了两个函数来将 Go 中的类型转换为上述的两种类型以便进行反射操作，分别是 `reflect.TypeOf` 函数 `func TypeOf(i any) Type` 与 `reflect.ValueOf` 函数 `func ValueOf(i any) Value`
- 两个函数的参数是 `any` 类型，也就是空接口类型，反射离不开空接口，如果要反射得先将类型转换为 `interface{}`

**反射的基本操作：**

1. **反射可以将 `interface{}` 类型变量转换成反射对象**
2. **反射可以将反射对象还原成 `interface{}` 类型变量**
3. **要修改反射对象，其值必须是可设置的**

**当需要访问类型相关信息时，便需要用到 `reflect.TypeOf`，当需要修改反射值时，就需要用到 `reflect.ValueOf`**

### Kind

- `Kind` 是 `reflect` 的一种类型，本质是 `uint`，它通过 `const & iota` 枚举出了 Go 中所有的基础类型常量
- 通过 `Kind`，可以知晓空接口 `any` 存储的值究竟是什么基础类型
```go
func main() {
    // 声明一个any类型的变量
  var eface any
    // 赋值
  eface = 100
    // 通过Kind方法，来获取其类型
  fmt.Println(reflect.TypeOf(eface).Kind())
}
```
### 类型常用方法

- `Type.Elem()` 方法，可以判断类型为 `any` 的数据结构所存储的元素类型，可接收的底层参数类型必须是指针，切片，数组，通道，映射表其中之一，否则会 panic
- 指针使用 `Elem()` 会获得其指向元素的反射类型，数组，切片，通道使用起来都是类似的
- `Kind` 关注类型的分类，适用于所有类型，`Elem()` 关注复合类型的内部元素，只对特定复合类型有效；它们可以结合使用，例如先用 `Kind()` 检查是否为指针，然后用 `Elem()` 获取指向类型
```go
type Type interface{
    Elem() Type
}

func main() {
  var eface any
  eface = map[string]int{}
  rType := reflect.TypeOf(eface)
    // key()会返回map的键反射类型
  fmt.Println(rType.Key().Kind())
  fmt.Println(rType.Elem().Kind())
}
```
- `Size()` 方法可以获取对应类型所占的字节大小，不包括动态分配的部分，如切片的底层数组
- 使用 `unsafe.Sizeof()` 可以达到同样的效果
```go
func main() {
  fmt.Println(reflect.TypeOf(0).Size()) // 8 int64
  fmt.Println(reflect.TypeOf("").Size()) // 16 string结 构体{*str, len int64} 8+8
  fmt.Println(reflect.TypeOf(complex(0, 0)).Size()) // 16 complex128(2个float64)
  fmt.Println(reflect.TypeOf(0.1).Size()) // 8 float64
  fmt.Println(reflect.TypeOf([]string{}).Size()) // 24
  // 切片（[]string）是结构体，包含指向底层数组的指针（8字节）、长度（8字节）和容量（8字节）
}
```
- 可比较类型：通过 `Comparable` 方法可以判断一个类型是否可以被比较
```go
type Type interface{
    Comparable() bool
}
func main() {
  fmt.Println(reflect.TypeOf("hello world!").Comparable()) // T str
  fmt.Println(reflect.TypeOf(1024).Comparable()) // T int64
  fmt.Println(reflect.TypeOf([]int{}).Comparable()) // F slice
  fmt.Println(reflect.TypeOf(struct{}{}).Comparable()) // T empty struct
}
```
- 通过 `Implements` 方法可以判断一个类型是否实现了某一接口
```go
type MyInterface interface {
  My() string
}

type MyStruct struct {
}

func (m MyStruct) My() string {
  return "my"
}

type HisStruct struct {
}

func (h HisStruct) String() string {
  return "his"
}

func main() {
  rIface := reflect.TypeOf(new(MyInterface)).Elem()
  fmt.Println(reflect.TypeOf(new(MyStruct)).Elem().Implements(rIface))
  fmt.Println(reflect.TypeOf(new(HisStruct)).Elem().Implements(rIface))
}
```
- `ConvertibleTo` 方法可以判断一个类型是否可以被转换为另一个指定的类型
```go
type Type interface{
    ConvertibleTo(u Type) bool
}

type MyInterface interface {
  My() string
}

type MyStruct struct {
}

func (m MyStruct) My() string {
  return "my"
}

type HisStruct struct {
}

func (h HisStruct) String() string {
  return "his"
}

func main() {
  rIface := reflect.TypeOf(new(MyInterface)).Elem()
  fmt.Println(reflect.TypeOf(new(MyStruct)).Elem().ConvertibleTo(rIface))
  fmt.Println(reflect.TypeOf(new(HisStruct)).Elem().ConvertibleTo(rIface))
}
```
### 值常用方法

- `Type()` 方法可以获取一个反射值的类型
```go
func (v Value) Type() Type
func main() {
   num := 114514
   rValue := reflect.ValueOf(num)
   fmt.Println(rValue.Type())
}
```
- `Elem()` 可以获取一个反射值的元素反射值
```go
func (v Value) Elem() Value
func main() {
   num := new(int)
   *num = 114514
   // 以指针为例子
   rValue := reflect.ValueOf(num).Elem()
   fmt.Println(rValue.Interface())
}
```
### 获取指针的反射值
```go
// 返回一个表示v地址的指针反射值
func (v Value) Addr() Value

// 返回一个指向v的原始值的uintptr 等价于 uintptr(Value.Addr().UnsafePointer())
func (v Value) UnsafeAddr() uintptr

// 返回一个指向v的原始值的uintptr
// 仅当v的Kind为 Chan, Func, Map, Pointer, Slice, UnsafePointer时，否则会panic
func (v Value) Pointer() uintptr

// 返回一个指向v的原始值的unsafe.Pointer
// 仅当v的Kind为 Chan, Func, Map, Pointer, Slice, UnsafePointer时，否则会panic
func (v Value) UnsafePointer() unsafe.Pointer

func main() {
   num := 1024
   ele := reflect.ValueOf(&num).Elem()
   fmt.Println("&num", &num)
   fmt.Println("Addr", ele.Addr())
   fmt.Println("UnsafeAddr", unsafe.Pointer(ele.UnsafeAddr()))
   fmt.Println("Pointer", unsafe.Pointer(ele.Addr().Pointer()))
   fmt.Println("UnsafePointer", ele.Addr().UnsafePointer())
   // fmt.Println会反射获取参数的类型，如果是reflect.Value类型的话，会自动调用Value.Interface()来获取其原始值。
}
```
- `Interface()` 方法可以获取反射值原有的值
```go
func main() {
   var str string
   str = "hello"
   rValue := reflect.ValueOf(str)
   if v, ok := rValue.Interface().(string); ok {
      fmt.Println(v)
   }
}
```
- `Set()` 方法能够修改反射值，如果要通过反射来修改反射值，那么它的值必须是可以取址的，这时应该通过指针来修改其元素值，而不是直接修改
```go
func (v Value) Set(x Value)
func main() {
   // *int
   num := new(int)
   *num = 114514
   rValue := reflect.ValueOf(num)
    // 获取指针指向的元素
   ele := rValue.Elem()
   fmt.Println(ele.Interface())
   ele.SetInt(11)
   fmt.Println(ele.Interface())
}
```
### 反射与函数

通过反射可以获取函数的一切信息，也可以反射调用函数：
```go
func Max(a, b int) int {
   if a > b {
      return a
   }
   return b
}

func (v Value) Call(in []Value) []Value
func main() {
   // 获取函数的反射值
   rType := reflect.ValueOf(Max)
   // 传入参数数组
   rResValue := rType.Call([]reflect.Value{reflect.ValueOf(18), reflect.ValueOf(50)})
   for _, value := range rResValue {
      fmt.Println(value.Interface())
   }
}

func main() {
  
   rType := reflect.TypeOf(Max)
   // 输出函数名称,字面量函数的类型没有名称
   fmt.Println(rType.Name())
   // 输出参数，返回值的数量
   fmt.Println(rType.NumIn(), rType.NumOut())
   rParamType := rType.In(0)
   // 输出第一个参数的类型
   fmt.Println(rParamType.Kind())
   rResType := rType.Out(0)
   // 输出第一个返回值的类型
   fmt.Println(rResType.Kind())
}
```
### 构造新的值

通过反射可以构造新的值，`reflect` 包同时根据一些特殊的类型提供了不同的更为方便的函数：
```go
// 返回指向反射值的指针反射值
func New(type Type) Value
func MakeSlice(typ Type, len, cap int) Value
func MakeMapWithSize(typ Type, n int) Value
func MakeChan(typ Type, buffer int) Value
func MakeFunc(typ Type, fn func(args []Value) (results []Value)) Value

func main() {
   rValue := reflect.New(reflect.TypeOf(*new(string)))
   rValue.Elem().SetString("hello world!")
   fmt.Println(rValue.Elem().Interface())
}
```
### reflect.DeepEqual

`reflect.DeepEqual` 是反射包下提供的一个用于判断两个变量是否完全相等的函数：
```go
func DeepEqual(x, y any) bool
```
- 数组：数组中的每一个元素都完全相等
- 切片：都为nil时，判为完全相等，或者都不为空时，长度范围内的元素完全相等
- 结构体：所有字段都完全相等
- 映射表：都为nil时，为完全相等，都不为nil时，每一个键所映射的值都完全相等
- 指针：指向同一个元素或指向的元素完全相等
- 接口：接口的具体类型完全相等时
- 函数：只有两者都为nil时才是完全相等，否则就不是完全相等

## 文件操作

- `os` 库：负责 OS 文件系统交互的具体实现
- `io` 库：读写 IO 的抽象层
- `fs` 库：文件系统的抽象层
- `func Open(name string) (*File, error)` 和 `func OpenFile(name string, flag int, perm FileMode) (*File, error)`用于打开文件，参数类型与系统调用open类似
- `defer file.Close()` 关闭文件
```go
func main() {
  file, err := os.OpenFile("README.txt", os.O_RDWR|os.O_CREATE, 0666)
  if os.IsNotExist(err) {
    fmt.Println("文件不存在")
  } else if err != nil {
    fmt.Println("文件访问异常")
  } else {
    fmt.Println("文件打开成功", file.Name())
    file.Close()
  }
}
```
- `os.Stat()` 函数能够用于获取文件信息

### 读取文件

`os.File` 有多种方法：
```go
// 将文件读进传入的字节切片 需要自行编写逻辑来进行读取时切片的动态扩容
func (f *File) Read(b []byte) (n int, err error)

// 相较于第一种可以从指定偏移量读取
func (f *File) ReadAt(b []byte, off int64) (n int, err error)
```
- `os.ReadFile` 而言，只需要提供文件路径即可，`io.ReadAll` 则需要提供一个 `io.Reader` 类型的实现
```go
func ReadFile(name string) ([]byte, error)
func ReadAll(r Reader) ([]byte, error)
```
### 写入文件

- `os.File` 提供多种方法，写文件必须以 `O_WRONLY` 或 `O_RDWR` 的模式打开，否则无法成功写入文件
- `os.WriteFile` 和 `io.WriteString` 也能用于写入文件
```go
// 写入字节切片
func (f *File) Write(b []byte) (n int, err error)

// 写入字符串
func (f *File) WriteString(s string) (n int, err error)

// 从指定位置开始写，当以os.O_APPEND模式打开时，会返回错误
func (f *File) WriteAt(b []byte, off int64) (n int, err error)

func WriteFile(name string, data []byte, perm FileMode) error

func WriteString(w Writer, s string) (n int, err error)
```
### 创建文件

- `os.Create` 函数用于创建文件，本质上也是对 `OpenFile` 的封装
- 在创建一个文件时，如果其父目录不存在，将创建失败并会返回错误
```go
func Create(name string) (*File, error) {
   return OpenFile(name, O_RDWR|O_CREATE|O_TRUNC, 0666)
}
```
### 复制文件

有多种方法：

- 第一种方法是将原文件中的数据读到内存中，然后写入目标文件中
- 另一种方法是使用 `os.File` 提供的方法 `ReadFrom`，打开文件时，一个只读，一个只写
```go
func (f *File) ReadFrom(r io.Reader) (n int64, err error)
```
- 另一种方法就是使用 `io.Copy` 函数，它则是一边读一边写，先将内容读到缓冲区中，再写入到目标文件中，缓冲区默认大小为 32KB
```go
func Copy(dst Writer, src Reader) (written int64, err error)
```
### 重命名

- `func Rename(oldpath, newpath string) error` 重命名也可以理解为移动文件，该函数对于文件夹也是同样的效果

### 删除文件
```go 
// 删除单个文件或者空目录，当目录不为空时会返回错误
func Remove(name string) error
// 删除指定目录的所有文件和目录包括子目录与子文件
func RemoveAll(path string) error
func main() {
  // 删除当前目录下单个文件
  err := os.Remove("README.txt")
  if err != nil {
    fmt.Println(err)
  } else {
    fmt.Println("删除成功")
  }
}
func main() {
  // 删除当前目录下所有的文件与子目录
  err := os.RemoveAll(".")
  if err != nil {
    fmt.Println(err)
  }else {
    fmt.Println("删除成功")
  }
}
```
### 文件刷盘

- `os.Sync` 这一个函数封装了底层的系统调用 `Fsync`，用于将操作系统中缓存的 IO 写到磁盘上
```go
func main() {
  create, err := os.Create("test.txt")
  if err != nil {
    panic(err)
  }
  defer create.Close()

  _, err = create.Write([]byte("hello"))
  if err != nil {
    panic(err)
  }

    // 刷盘
  if err := create.Sync();err != nil {
    return
  }
}
```
### 文件夹操作
```go
//os.ReadDir
func ReadDir(name string) ([]DirEntry, error)

// n < 0时，则读取文件夹下所有的内容 *os.File.ReadDir
func (f *File) ReadDir(n int) ([]DirEntry, error)

//os包的创建文件夹
// 用指定的权限创建指定名称的目录
func Mkdir(name string, perm FileMode) error

// 相较于前者该函数会创建一切必要的父目录
func MkdirAll(path string, perm FileMode) error

func Walk(root string, fn WalkFunc) error
type WalkFunc func(path string, info os.FileInfo, err error) error
// filepath.Walk会递归遍历整个文件夹 复制逻辑需在 fn 中实现
```

## 协程（Goroutine）

创建一个协程十分的简单，仅需要一个 `go` 关键字，就能够快速开启一个协程，`go` 关键字后面必须是一个函数调用，具有返回值的内置函数不允许跟随在 `go` 关键字后面。

### 和线程的区别
- 管理方式：Goroutine由Go运行时（runtime）在用户态管理；线程由操作系统内核管理。
- 资源占用：Goroutine初始栈小（2KB，可动态增长）；线程栈大（1-8MB，不易调整）。
- 切换成本：Goroutine切换快（用户态，无系统调用）；线程切换慢（涉及内核，上下文切换开销大）。
- 并发模型：Goroutine支持数千个并发（轻量级）；线程适合CPU密集型，但过多线程耗资源。
- 调度：Goroutine由Go调度器分配到线程上运行；线程直接由OS调度。
- 创建：Goroutine用 go 关键字创建；线程需系统调用。
- Goroutine更高效，适合I/O密集和高并发场景，但不是真正的并行（依赖线程）。在Go中，一个程序可有多个线程运行Goroutine。
```go
func main() {
  go fmt.Println("hello world!")
  go hello()
  go func() {
    fmt.Println("hello world!")
  }()
}

func hello() {
  fmt.Println("hello world!")
}
```
### 并发控制方法

常用的并发控制方法有三种：

- **channel（管道）**：更适合协程间通信
- **WaitGroup（信号量）**：可以动态的控制一组指定数量的协程
- **Context（上下文）**：更适合子孙协程嵌套层级更深的情况

对于较为传统的锁控制，Go 也对此提供了支持：

- **Mutex**：互斥锁
- **RWMutex**：读写互斥锁

## 管道（Channel）

通过消息来进行内存共享，也可以用于并发控制，通过关键字 `chan` 来代表管道类型，同时也必须声明管道的存储类型，来指定其存储的数据是什么类型。

- `var ch chan int` 该管道未初始化，值 `nil` 无法使用
- 创建管道只能使用 `make` 方法，对于管道而言，`make` 函数接收两个参数，第一个是管道的类型，第二个是可选参数为管道的缓冲大小：`strCh := make(chan string, 1)`
- 在使用完一个管道后一定要关闭该管道，使用内置函数 `close` 来关闭一个管道：`func close(c chan<- Type)`
- 关于管道关闭的时机，应该尽量在向管道发送数据的那一方关闭管道，而不要在接收方关闭管道，因为大多数情况下接收方只知道接收数据，并不知道该在什么时候关闭管道
```go
func main() {
  intCh := make(chan int)
  // do something
  close(intCh)
} 
```
### 管道读写

对于一个管道而言，Go 使用了两种很形象的操作符来表示读写操作：

- `ch <-`：表示对一个管道写入数据
- `<- ch`：表示对一个管道读取数据，对于读取操作而言，还有个布尔类型返回值用于表示数据是否读取成功
- 通过内置函数 `len` 可以访问管道缓冲区中数据的个数，通过 `cap` 可以访问管道缓冲区的大小
- 在某一个时刻，只有一个协程能够对其写入数据，同时也只有一个协程能够读取管道中的数据

**无缓冲管道：**

- 因为缓冲区容量为 0，所以不会临时存放任何数据
- 正因为无缓冲管道无法存放数据，在向管道写入数据时必须立刻有其他协程来读取数据，否则就会阻塞等待，读取数据时也是同理

**有缓冲管道：**

- 写入数据时，会先将数据放入缓冲区里，只有当缓冲区容量满了才会阻塞的等待协程来读取管道中的数据
- 读取时，会先从缓冲区中读取数据，直到缓冲区没数据了，才会阻塞的等待协程来向管道中写入数据
- 即便管道已经关闭，依旧可以读取数据，并且第二个返回值仍然为 `true`
- 在单协程对有缓冲管道读写时，因为没有其他协程来向管道中写入或读取数据，一旦管道缓冲区空了或者满了，将会永远阻塞下去

**其他特性：**

- `chan` 是引用类型，即便 Go 的函数参数是值传递，但其引用依旧是同一个
- 可以利用大小为 1 的管道实现 `lock/unlock` 函数，写一个简单的 mutex
```go
func main() {
    // 如果没有缓冲区则会导致死锁，直到有接收者 <-ch 执行读取
    // 但没有其他协程，所以导致死锁 
  intCh := make(chan int, 1)
  defer close(intCh)
    // 写入数据
  intCh <- 114514
  /*
    intCh := make(chan int)
    无缓冲管道不应该同步的使用，正确来说应该开启一个新的协程来发送数据
    go func() {
      ch <- 114514
    }()

  */
    // 读取数据
  fmt.Println(<-intCh)
}
```
- 通过 for range 语句，可以遍历读取缓冲管道中的数据
- for range 遍历其他可迭代数据结构时，会有两个返回值，第一个是索引，第二个元素值，但是对于管道而言，有且仅有一个返回值，for range 会不断读取管道中的元素，当管道缓冲区为空或无缓冲时，就会阻塞等待，直到有其他协程向管道中写入数据才会继续读取数据
```go
func main() {
   ch := make(chan int, 10)
   go func() {
      for i := 0; i < 10; i++ {
         ch <- i
      }
      // 关闭管道
      close(ch)
   }()
   for n := range ch {
      fmt.Println(n)
   }
}
```
### 管道阻塞

- 当对一个无缓冲管道直接进行同步读写操作都会导致该协程阻塞
- 当读取一个缓冲区为空的管道时，会导致该协程阻塞
- 当管道的缓冲区已满，对其写入数据会导致该协程阻塞
- 当管道为 `nil` 未初始化时，无论怎样读写都会导致当前协程阻塞

### 管道错误

- 当管道为 `nil` 时，使用 `close` 函数对其进行关闭操作会导致 `panic`
- 对一个已关闭的管道写入数据会导致 `panic`
- 在一些情况中，管道可能经过层层传递，调用者或许也不知道到底该由谁来关闭管道，如此一来，可能会发生关闭一个已经关闭了的管道，就会发生 `panic`

## WaitGroup

`sync.WaitGroup` 是 `sync` 包下提供的一个结构体，WaitGroup 即等待执行，使用它可以很轻易的实现等待一组协程的效果。该结构体只对外暴露三个方法：
- `Add` 方法用于指明要等待的协程的数量
- `Done` 方法表示当前协程已经执行完毕
- `Wait` 方法等待子协程结束，否则就阻塞
- 内部的实现是计数器+信号量，程序开始时调用 `Add` 初始化计数，每当一个协程执行完毕时调用 `Done`，计数就 -1，直到减为 0，而在此期间，主协程调用 `Wait` 会一直阻塞直到全部计数减为 0，然后才会被唤醒
- 当计数变为负数，或者计数数量大于子协程数量时，将会引发 panic
- `WaitGroup` 通常适用于可动态调整协程数量的时候，例如事先知晓协程的数量，又或者在运行过程中需要动态调整
- `WaitGroup` 的值不应该被复制，复制后的值也不应该继续使用，尤其是将其作为函数参数传递时，应该传递指针而不是值
```go
func (wg *WaitGroup) Add(delta int)
func (wg *WaitGroup) Done()
func (wg *WaitGroup) Wait()
```

## Context

相比于管道和 WaitGroup，它可以更好的控制子孙协程以及层级更深的协程。Context 本身是一个接口，只要实现了该接口都可以称之为上下文。
- 上下文也是一种资源，如果创建了但从来不取消，一样会造成上下文泄露
- context 标准库也提供了几个实现，分别是：emptyCtx,cancelCtx,timerCtx,valueCtx
```go
type Context interface {

   Deadline() (deadline time.Time, ok bool)
  //该方法具有两个返回值，deadline 是截止时间，即上下文应该取消的时间。第二个值是是否设置 deadline，如果没有设置则一直为 false
   Done() <-chan struct{}
  //其返回值是一个空结构体类型的只读管道，该管道仅仅起到通知作用，不传递任何数据。当上下文所做的工作应该取消时，该通道就会被关闭，对于一些不支持取消的上下文，可能会返回 nil。
   Err() error
  // 该方法返回一个 error，用于表示上下文关闭的原因。当 Done 管道没有关闭时，返回 nil，如果关闭过后，会返回一个 err 来解释为什么会关闭。
   Value(key any) any
  // 该方法返回对应的键值，如果 key 不存在，或者不支持该方法，就会返回 nil。
}
```
### emptyCtx

- 空的上下文，`context` 包下所有的实现都是不对外暴露的，但是提供了对应的函数来创建上下文
- `emptyCtx` 就可以通过 `context.Background` 和 `context.TODO` 来进行创建
- 底层类型实际上是一个 `int`，之所以不使用空结构体，是因为 `emptyCtx` 的实例必须要有不同的内存地址，它没法被取消，没有 deadline，也不能取值，实现的方法都是返回零值
- 通常是用来当作最顶层的上下文，在创建其他三种上下文时作为父上下文传入
```go
var (
  background = new(emptyCtx)
  todo       = new(emptyCtx)
)

func Background() Context {
  return background
}

func TODO() Context {
  return todo
}
type emptyCtx int

func (*emptyCtx) Deadline() (deadline time.Time, ok bool) {
   return
}

func (*emptyCtx) Done() <-chan struct{} {
   return nil
}

func (*emptyCtx) Err() error {
   return nil
}

func (*emptyCtx) Value(key any) any {
   return nil
}
```
### valueCtx

- `valueCtx` 内部只包含一对键值对，和一个内嵌的 `Context` 类型的字段。其本身只实现了 `Value` 方法，当前上下文找不到就去父上下文找
- 多用于在多级协程中传递一些数据，无法被取消，因此 `ctx.Done` 永远会返回 `nil`，`select` 会忽略掉 `nil` 管道
```go
type valueCtx struct {
   Context
   key, val any
}
func (c *valueCtx) Value(key any) any {
   if c.key == key {
      return c.val
   }
   return value(c.Context, key)
}
```
### cancelCtx

- 可取消的上下文，创建时，如果父级实现了 `canceler`，就会将自身添加进父级的 children 中，否则就一直向上查找
- 如果所有的父级都没有实现 `canceler`，就会启动一个协程等待父级取消，然后当父级结束时取消当前上下文
- 当调用 `cancelFunc` 时，`Done` 通道将会关闭，该上下文的任何子级也会随之取消，最后会将自身从父级中删除
- `cancel` 方法不对外暴露，在创建上下文时通过闭包将其包装为返回值以供外界调用
```go
type canceler interface {
    // removeFromParent 表示是否从父上下文中删除自身
    // err 表示取消的原因
  cancel(removeFromParent bool, err error)
    // Done 返回一个管道，用于通知取消的原因
  Done() <-chan struct{}
}
``` 
### timerCtx

- `timerCtx` 在 `cancelCtx` 的基础之上增加了超时机制，`context` 包下提供了两种创建的函数，分别是 `WithDeadline` 和 `WithTimeout`，两者功能类似，前者是指定一个具体的超时时间，后者是指定一个超时的时间间隔
- `timerCtx` 会在时间到期后自动取消当前上下文，取消的流程除了要额外的关闭 timer 之外，基本与 `cancelCtx` 一致
```go
func WithDeadline(parent Context, d time.Time) (Context, CancelFunc)

func WithTimeout(parent Context, timeout time.Duration) (Context, CancelFunc) {
   return WithDeadline(parent, time.Now().Add(timeout))
}
```
- `WithTimeout` 其实与 `WithDeadline` 非常相似，它的实现也只是稍微封装了一下并调用 `WithDeadline`
- 尽管 `timerCtx` 到期会自动取消，但是为了保险起见，在相关流程结束后，最好手动取消上下文

## select

多路复用，但是管理管道，语法与 `switch` 相似。
- `default` 分支可以省略但不建议
- 每一个 `case` 只能操作一个管道，且只能进行一种操作，要么读要么写，当有多个 `case` 可用时，`select` 会伪随机的选择一个 `case` 来执行
- `select` 只执行非 `nil` 且就绪的 `case`
- 如果所有 `case` 都不可用，就会执行 `default` 分支，倘若没有 `default` 分支，将会阻塞等待，直到至少有一个 `case` 可用
- 如果 `select` 语句为空，就会永久阻塞
- 在 `select` 的 `case` 中对值为 `nil` 的管道进行操作的话，并不会导致阻塞，该 `case` 则会被忽略，永远也不会被执行
- 可以在一个新协程中开启死循环来监听所有管道，还可以结合 `func After(d Duration) <-chan Time` 函数，该函数返回一个只读管道，实现超时退出循环
- 可以在函数中使用 `select` 监听管道，没有数据返回函数，实现非阻塞
- 还可以将 `Ctx` 的 `Done` 定向到 `case`，没有监听到空结构体则说明上下文还未结束
```go
func main() {
  // 创建三个管道
  chA := make(chan int)
  chB := make(chan int)
  chC := make(chan int)
  defer func() {
    close(chA)
    close(chB)
    close(chC)
  }()
  select {
  case n, ok := <-chA:
    fmt.Println(n, ok)
  case n, ok := <-chB:
    fmt.Println(n, ok)
  case n, ok := <-chC:
    fmt.Println(n, ok)
  default:
    fmt.Println("所有管道都不可用")
  }
}
```

## 锁

`sync` 包下的 `Mutex` 与 `RWMutex` 提供了互斥锁与读写锁两种实现，加锁只需要 `Lock()`，解锁也只需要 `Unlock()`。
- 都是非递归锁，也就是不可重入锁，所以重复加锁或重复解锁都会导致 `fatal`
- 和管道与上下文一样，锁在离开临界区后需要解锁
- 对于锁而言，不应该将其作为值传递和存储，应该使用指针

### Mutex

`sync.Mutex` 是 Go 提供的互斥锁实现，其实现了 `sync.Locker` 接口
```go
type Locker interface {
   // 加锁
   Lock()
   // 解锁
   Unlock()
}
```

- 互斥锁适合读操作与写操作频率都差不多的情况，对于一些读多写少的数据，如果使用互斥锁，会造成大量的不必要的协程竞争锁

### RWMutex

对于一个协程而言：
- 如果获得了读锁，其他协程进行写操作时会阻塞，其他协程进行读操作时不会阻塞
- 如果获得了写锁，其他协程进行写操作时会阻塞，其他协程进行读操作时会阻塞
- `TryRlock` 与 `TryLock` 两个尝试加锁的操作是非阻塞式的，成功加锁会返回 `true`，无法获得锁时并不会阻塞而是返回 `false`
- 注意读写互斥锁内部实现**依旧是互斥锁**，并不是说分读锁和写锁就有两个锁，从始至终都只有**一个锁**
- `RWMutex` 用计数器跟踪读锁数和写锁状态。当有写锁时，读锁阻塞；无写锁时，读锁并发。底层用一个 `Mutex` 保护这些状态
```go
// 加读锁
func (rw *RWMutex) RLock()

// 尝试加读锁
func (rw *RWMutex) TryRLock() bool

// 解读锁
func (rw *RWMutex) RUnlock()

// 加写锁
func (rw *RWMutex) Lock()

// 尝试加写锁
func (rw *RWMutex) TryLock() bool

// 解写锁
func (rw *RWMutex) Unlock()
```

### 条件变量

`sync.Cond` 对此提供了实现：
- 创建一个条件变量前提就是需要创建一个锁
- 对于条件变量，应该使用 `for` 而不是 `if`，应该使用循环来判断条件是否满足，因为协程被唤醒时并不能保证当前条件就已经满足了，类似于 C++ 中使用 `while` 循环判断线程是否满足条件
```go
func NewCond(l Locker) *Cond
// 阻塞等待条件生效，直到被唤醒
func (c *Cond) Wait()

// 唤醒一个因条件阻塞的协程
func (c *Cond) Signal()

// 唤醒所有因条件阻塞的协程
func (c *Cond) Broadcast()
```
- 条件变量与读写互斥锁：在创建条件变量时，因为在这里条件变量作用的是读协程，所以将读锁作为互斥锁传入，如果直接传入读写互斥锁会导致写协程重复解锁的问题
```go
var wait sync.WaitGroup
var count = 0

var rw sync.RWMutex

// 条件变量
var cond = sync.NewCond(rw.RLocker())

func main() {
  wait.Add(12)
  // 读多写少
  go func() {
    for i := 0; i < 3; i++ {
      go Write(&count)
    }
    wait.Done()
  }()
  go func() {
    for i := 0; i < 7; i++ {
      go Read(&count)
    }
    wait.Done()
  }()
  // 等待子协程结束
  wait.Wait()
  fmt.Println("最终结果", count)
}

func Read(i *int) {
  time.Sleep(time.Millisecond * time.Duration(rand.Intn(500)))
  rw.RLock()
  fmt.Println("拿到读锁")
  // 条件不满足就一直阻塞
  for *i < 3 {
    cond.Wait()
  }
  time.Sleep(time.Millisecond * time.Duration(rand.Intn(1000)))
  fmt.Println("释放读锁", *i)
  rw.RUnlock()
  wait.Done()
}

func Write(i *int) {
  time.Sleep(time.Millisecond * time.Duration(rand.Intn(1000)))
  rw.Lock()
  fmt.Println("拿到写锁")
  temp := *i
  time.Sleep(time.Millisecond * time.Duration(rand.Intn(1000)))
  *i = temp + 1
  fmt.Println("释放写锁", *i)
  rw.Unlock()
  // 唤醒所有因条件变量阻塞的协程
  cond.Broadcast()
  wait.Done()
}
```

## Log 库
```go
func main() {
   log.Println("日志")
   log.Panicln("panic日志")
   log.Fatalln("错误日志")
}
```
- 日志前缀
```go
func (l *Logger) Prefix() string //获取前缀
func (l *Logger) SetPrefix(prefix string) //设置前缀

func main() {
  log.SetPrefix("[main]")
  log.Println("日志")
  log.Panicln("panic日志")
}
```
- 日志方法
```go
func (l *Logger) Flags() int //访问
func (l *Logger) SetFlags(flag int) //设置
```
- 当然也可以使用 `log.SetOutput(w io.Writer)` 来设置日志的输出路径，也可以通过 `func New(out io.Writer, prefix string, flag int) *Logger` 方法创建自己的实例