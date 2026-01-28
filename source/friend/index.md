---
title: 友情链接
comments: true
---
## 网易云链接

[主页](https://music.163.com/#/user/home?id=646644289) 自己的网易云音乐个人主页
[api](https://meting.chieko3020.xyz/) 自建 api

## 网易云api说明

- 基于 `@meting/core` 实现的网易云音乐解析服务，专为 APlayer/MetingJS 优化。支持通过环境变量注入 Cookie 以维持 VIP 状态。
- Runtime: Node.js
- Framework: Express
- Core: [@meting/core](https://github.com/metowolf/Meting)
- 服务地址: `https://meting.chieko3020.xyz`
- 请求方式: `GET`
- 跨域支持: 已开启 (CORS)

| 参数 | 必传 | 取值范围 | 说明 |
| :--- | :--- | :--- | :--- |
| **type** | 是 | `lrc`, `song`, `playlist`, `album`, `search`, `artist`, `url`, `pic` | 请求资源类型 |
| **id** | 是* | 数字 | 资源 ID（`search` 类型除外） |
| **keyword** | 否 | 字符串 | 搜索关键词（仅 `search` 类型必传） |

> \*注：`type=search` 时必须传入 `keyword` 而非 `id`。

- 单曲: `https://meting.chieko3020.xyz/?type=song&id=2733777862`
- 歌单: `https://meting.chieko3020.xyz/?type=playlist&id=14424322349`
- 歌词: `https://meting.chieko3020.xyz/?type=lrc&id=2733777862`
- 搜索: `https://meting.chieko3020.xyz/?type=search&keyword=初音ミク`
- 当请求失败或参数缺失时，接口返回：
```json
{
  "code": 400,
  "status": "error",
  "message": "请求参数缺失"
}
```

## Live2d 模型原作者

[三月七](https://www.bilibili.com/video/BV1oP411X77B/)
[长夜月](https://www.bilibili.com/video/BV1vpn3zfE5f/)

## 主题原作者

{% friendsLink friend/_data.yml %}