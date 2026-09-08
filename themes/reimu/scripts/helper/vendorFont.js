const { htmlTag } = require("hexo-util");
hexo.extend.helper.register("vendorGoogleFont", () => {
  const fontDisplay = "&display=swap";
  const fontStyles = ":400,400italic,700,700italic";
  const fontHost = "https://fonts.googleapis.com";

  const basicConfigFontFamilies = [
    ...(hexo.theme.config.font?.article ?? []),
    ...(hexo.theme.config.font?.code ?? []),
  ];

  const fontFamilies = basicConfigFontFamilies
    .map((item) => item + fontStyles)
    .filter((item) => item !== "")
    .join("|");

  return (
    `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>` +
    `<link rel="preload" as="style" href="${fontHost}/css?family=${fontFamilies.concat(
      fontDisplay
    )}">` +
    `<link rel="stylesheet" href="${fontHost}/css?family=${fontFamilies.concat(
      fontDisplay
    )}" media="print" onload="this.media='all'">`
  );
});
hexo.extend.helper.register("vendorFont", () => {
  // 本地自托管字体 css 用同步 <link rel=stylesheet> 而非 preload+onload：
  // 1) 字体是首屏必需，preload 转换依赖 JS onload，SW 激活后会产生 cross-world mismatch 警告；
  // 2) css 极小（仅 @font-face 声明），同步加载不阻塞渲染且无 preload 未消费噪音。
  const fontStyle = [];
  for (const customBasic of hexo.theme.config.custom_font?.article ?? []) {
    const css = customBasic.css;
    if (css) {
      fontStyle.push(`<link rel="stylesheet" href="${css}">`);
    }
  }

  for (const customCode of hexo.theme.config.custom_font?.code ?? []) {
    const css = customCode.css;
    if (css) {
      fontStyle.push(`<link rel="stylesheet" href="${css}">`);
    }
  }
  return fontStyle.join("");
});
