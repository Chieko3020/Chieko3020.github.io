/**
 * patch-oml2d-defer.js
 *
 * 对 node_modules/hexo-oh-my-live2d 注入的脚本打「延迟加载」补丁，幂等。
 * 通过 package.json 的 postinstall 钩子自动运行；npm install/ci 后无需手动重放。
 *
 * 补丁内容（对应站点性能优化 T1-4）：
 *   1. SDK 标签 <script data-pjax src="..."> 增加 defer 属性，避免 979KB 同步阻塞首屏解析；
 *   2. 初始化脚本 OML2D.loadOml2d({...}) 包进 window load 事件，
 *      确保 defer 的 SDK 已就绪（defer 在 DOMContentLoaded 前执行完）后再初始化模型。
 *
 * 幂等：重复执行检测到特征字符串已存在时直接跳过。
 */
"use strict";
if (require.main === module) { main(); } else { module.exports = main; }

function main() {
const fs = require("fs");
const path = require("path");

const target = path.join(
  __dirname,
  "..",
  "node_modules",
  "hexo-oh-my-live2d",
  "dist",
  "index.js"
);

const MARK = "data-pjax defer src"; // 补丁特征

if (!fs.existsSync(target)) {
  console.warn("[patch-oml2d-defer] 未找到", target, "，跳过。");
  process.exit(0);
}

let src = fs.readFileSync(target, "utf8");

if (src.indexOf(MARK) !== -1) {
  console.log("[patch-oml2d-defer] 已应用，跳过。");
  process.exit(0);
}

// 备份原始文件（仅首次）
const bak = target + ".bak";
if (!fs.existsSync(bak)) {
  fs.writeFileSync(bak, src, "utf8");
}

let changed = false;

// 1) SDK script 加 defer
const oldA = '<script data-pjax src="${h.CDN}">';
if (src.includes(oldA)) {
  src = src.replace(oldA, '<script data-pjax defer src="${h.CDN}">');
  changed = true;
} else {
  console.warn("[patch-oml2d-defer] 未匹配到 SDK 标签，跳过该项。");
}

// 2) init 包进 window load
const oldOpen = '"<script>const oml2d = OML2D.loadOml2d({';
if (src.includes(oldOpen)) {
  src = src.replace(
    oldOpen,
    '"<script>window.addEventListener(\'load\',function(){const oml2d = OML2D.loadOml2d({'
  );
  changed = true;
} else {
  console.warn("[patch-oml2d-defer] 未匹配到 init 开头，跳过该项。");
}

const oldClose = '+h.then+"<\\/script>"';
if (src.includes(oldClose)) {
  src = src.replace(oldClose, '+h.then+"});<\\/script>"');
  changed = true;
} else {
  console.warn("[patch-oml2d-defer] 未匹配到 init 结尾，跳过该项。");
}

if (changed) {
  fs.writeFileSync(target, src, "utf8");
  console.log("[patch-oml2d-defer] 补丁已应用:", target);
} else {
  console.warn("[patch-oml2d-defer] 无任何替换发生，请人工检查插件版本。");
}
}
