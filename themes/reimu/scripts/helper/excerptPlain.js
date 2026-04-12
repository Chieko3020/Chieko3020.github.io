const { stripHTML, unescapeHTML } = require("hexo-util");

function stripScriptsStylesNoscript(html) {
  if (!html) return "";
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, "");
}

/**
 * 首页/列表摘要：去掉 script/style 后再 stripHTML，并解码常见 HTML 实体（如 &#x3D; → =）。
 * 优先使用 front-matter 的 description（纯文案摘要，不经过正文里的标签脚本）。
 */
hexo.extend.helper.register("excerptPlain", (post) => {
  if (!post) return "";
  if (post.description) {
    return unescapeHTML(stripHTML(stripScriptsStylesNoscript(String(post.description))));
  }
  const src = post.excerpt || post.content || "";
  return unescapeHTML(stripHTML(stripScriptsStylesNoscript(src)));
});
