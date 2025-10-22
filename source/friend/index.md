---
title: 友情链接
comments: true
---
## 网易云链接
[主页](https://music.163.com/#/user/home?id=646644289) 自己的网易云音乐个人主页
[api](https://music-api.chieko3020.xyz/api?) 自建 api 非网易云则使用公共 api

API 链接说明 ：https://music-api.chieko3020.xyz/api?

### 请求参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `server` | string | 是 | 音乐平台:`netease`/`tencent`/`kugou`/`xiami`/`baidu`/`kuwo` |
| `type` | string | 是 | 操作类型:`search`/`song`/`album`/`artist`/`playlist`/`lrc`/`url`/`pic` |
| `id` | string | 是 | 资源 ID |
| `token` 或 `auth` | string | 条件 | 认证令牌(仅 `lrc`/`url`/`pic` 类型需要) |

### 操作类型说明

| type | 说明 | 需要鉴权 | 返回格式 |
|------|------|----------|----------|
| `search` | 搜索歌曲 | 否 | JSON 数组 |
| `song` | 获取歌曲详情 | 否 | JSON 数组 |
| `album` | 获取专辑 | 否 | JSON 数组 |
| `artist` | 获取歌手 | 否 | JSON 数组 |
| `playlist` | 获取歌单 | 否 | JSON 数组 |
| `lrc` | 获取歌词 | 是 | 纯文本(LRC 格式) |
| `url` | 获取播放链接 | 是 | 302 重定向 |
| `pic` | 获取封面图片 | 是 | 302 重定向 |

### 响应格式

**列表数据** (search/song/album/artist/playlist):

```json
[
  {
    "title": "歌曲名称",
    "author": "艺术家1 / 艺术家2",
    "url": "https://music-api.chieko3020.xyz/api?server=netease&type=url&id=xxx&auth=xxx",
    "pic": "https://music-api.chieko3020.xyz/api?server=netease&type=pic&id=xxx&auth=xxx",
    "lrc": "https://music-api.chieko3020.xyz/api?server=netease&type=lrc&id=xxx&auth=xxx"
  }
]
```

**歌词数据** (lrc):

```
[00:00.000] 歌词第一行
[00:05.123] 歌词第二行 (翻译内容)
[00:10.456] 歌词第三行
```

**音频/图片** (url/pic):
- 成功:302 重定向到实际资源 URL
- 失败:404 Not Found

### 请求示例

搜索歌曲: https://music-api.chieko3020.xyz/api?server=netease&type=search&id=初音ミク

获取歌单: https://music-api.chieko3020.xyz/api?server=netease&type=playlist&id=14424322349


## Live2d 模型原作者
[三月七](https://www.bilibili.com/video/BV1oP411X77B/)
[长夜月](https://www.bilibili.com/video/BV1vpn3zfE5f/)

## 主题原作者
{% friendsLink friend/_data.yml %}