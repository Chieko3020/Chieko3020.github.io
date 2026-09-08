hexo.extend.generator.register("json", function (locals) {
  const { stripHTML } = require("hexo-util");
  const hexoConfig = hexo.config;
  const searchConfig = hexo.theme.config.generator_search;
  if (!searchConfig?.enable) return;
  let searchfield = searchConfig.field || "post";
  const content = searchConfig.content || true;
  // 索引正文长度上限（字符）：前端仅用 title 展示、content 参与关键词匹配，
  // 存全文 markdown 会把 search.json 撑到 1.8MB，此处保留渲染后纯文本前 N 字符即可。
  const contentLimit = searchConfig.content_limit || 3000;

  const toIndexText = (raw) => {
    if (!raw) return "";
    // raw 是渲染后的 HTML（post.content）时先剥标签；_content 则是 markdown 源
    const plain = /<[a-z][\s\S]*>/i.test(raw) ? stripHTML(raw) : raw;
    return plain
      .replace(/```[\s\S]*?```/g, " ") // 去掉代码块（通常可通过标题/摘要搜到）
      .replace(/`([^`]*)`/g, "$1")
      .replace(/!\[[^\]]*\]\([^)]*\)/g, " ") // 图片
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // 链接保留文字
      .replace(/[#>*_~|]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, contentLimit);
  };

  let posts, pages;

  if (searchfield.trim() !== "") {
    searchfield = searchfield.trim();
    if (searchfield == "post") {
      posts = locals.posts.sort("-date");
    } else if (searchfield == "page") {
      pages = locals.pages;
    } else {
      posts = locals.posts.sort("-date");
      pages = locals.pages;
    }
  } else {
    posts = locals.posts.sort("-date");
  }

  const res = [];
  let index = 0;

  if (posts) {
    posts.each((post) => {
      if (post.indexing != undefined && !post.indexing) return;
      const temp_post = {};
      if (post.title) {
        temp_post.title = post.title;
      }
      if (post.path) {
        if (post.lang) {
          temp_post.url = `${hexoConfig.root}${post.lang}/${post.path}`;
        } else {
          temp_post.url = `${hexoConfig.root}${post.path}`;
        }
      }
      if (content != false && post._content) {
        // 优先用渲染后 HTML 提取纯文本；取不到再用 markdown 源
        temp_post.content = toIndexText(post.content || post._content);
      }
      if (post.tags && post.tags.length > 0) {
        const tags = [];
        post.tags.forEach((tag) => {
          tags.push(tag.name);
        });
        temp_post.tags = tags;
      }
      if (post.categories && post.categories.length > 0) {
        const categories = [];
        post.categories.forEach((cate) => {
          categories.push(cate.name);
        });
        temp_post.categories = categories;
      }
      res[index] = temp_post;
      index += 1;
    });
  }
  if (pages) {
    pages.each((page) => {
      if (page.indexing != undefined && !page.indexing) return;
      const temp_page = {};
      if (page.title) {
        temp_page.title = page.title;
      }
      if (page.path) {
        temp_page.url = hexoConfig.root + page.path;
      }
      if (content != false && page._content) {
        temp_page.content = toIndexText(page.content || page._content);
      }
      res[index] = temp_page;
      index += 1;
    });
  }

  return {
    path: "search.json",
    data: JSON.stringify(res),
  };
});
