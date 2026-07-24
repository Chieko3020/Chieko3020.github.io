---
title: 友情链接
comments: true
---
## 网易云链接

[主页](https://music.163.com/#/user/home?id=646644289) 自己的网易云音乐个人主页

## 网易云api说明

- [api](https://music.chieko3020.xyz/) 自建 api
- 基于 [NeteaseCloudMusicApiEnhanced](https://github.com/neteasecloudmusicapienhanced/api-enhanced) 实现的网易云音乐 API, 支持跨域请求，返回 APlayer 格式并缓存。

| 参数 | 必传 | 取值范围 | 说明 |
| :--- | :--- | :--- | :--- |
| **type** | 是 | `song`, `playlist`, `radio`, `search`, `album`, `artist`, `lrc`, `url`, `pic` | 请求资源类型 |
| **id** | 是* | 数字 | 资源 ID（`search` 类型除外） |
| **keyword** | 否 | 字符串 | 搜索关键词（仅 `search` 类型必传） |

> **注**：当 `type=search` 时，必须传入 `keyword` 参数而非 `id`。
- **单曲解析**: `https://music.chieko3020.xyz/?type=song&id=2733777862`
- **歌单解析**: `https://music.chieko3020.xyz/?type=playlist&id=14424322349`
- **播客解析**: `https://music.chieko3020.xyz/?type=radio&id=1228381556`
- **歌曲搜索**: `https://music.chieko3020.xyz/?type=search&keyword=初音ミク`
- **歌词获取**: `https://music.chieko3020.xyz/?type=lrc&id=2733777862`

- 如果你需要通过 NeteaseCloudMusicApiEnhanced 获取网易云原始的 JSON 数据，请在路径前加上 `/raw/`：
- 当请求失败、参数缺失或资源不存在时，接口将返回：

```json
{
  "code": 500,
  "message": "错误详情说明"
}
```

## Live2d 模型原作者

[三月七](https://www.bilibili.com/video/BV1oP411X77B/)
[长夜月](https://www.bilibili.com/video/BV1vpn3zfE5f/)

## 主题原作者

{% friendsLink friend/_data.yml %}