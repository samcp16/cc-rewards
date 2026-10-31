# 交付说明 — 刷哪张（cc-rewards）v1.0

- 交付日期：2026-10-31
- 交付人：卜宕机（运维工程师）
- QA 结论：pass，无 blocking 项（四轮独立验收记录见 `docs/QA-REPORT.md`、`docs/QA-REVERIFY.md`、`docs/QA-REVERIFY-R3.md`）
- 生产就绪评级（对照 production-readiness-scorecard，7x3 记分卡）：**Silver**。未达 Silver 的维度与补救计划见文末「已知限制」。

---

## 1. 产品一句话描述

付款前 3 秒比较港澳信用卡的**净回报率**（返现减去货币转换费、渠道费、门槛与上限后的真实到手），告诉你「这一笔刷哪张」。

- 纯前端 PWA：React 19 + Vite 8，数据存 IndexedDB，零网络请求（CSP `connect-src 'none'`），数据不出设备。
- 单人自用，无后端、无账号、无服务器。

## 2. 使用方式

### 电脑（Chrome / Edge / Safari）

1. 部署或本地打开静态站点（见第 5 节）。
2. 地址栏右侧出现「安装」图标，点击安装，即以独立窗口运行。

### 手机（iOS Safari / Android Chrome）

1. 用浏览器打开站点。
2. iOS：分享 -> 添加到主屏幕。Android：菜单 -> 安装应用 / 添加到主屏幕。
3. 安装后以 standalone 模式启动（无地址栏），可离线使用。

> 重要（iOS）：Safari 会在 7 天未交互时清除 IndexedDB。**请务必安装到主屏幕**——安装后数据不受该机制影响。这是 SPEC F11（P0）的引导目标。

### 首次使用

1. 「我的卡」页从 12 张预置卡模板勾选你持有的卡，或手动录入。
2. 「算一笔」页选地区、类别、金额、渠道，即出主推荐与全部 12 张卡对比。
3. 设置页可导出 JSON 备份。

## 3. 功能清单（对照 SPEC §9 EARS 功能定义）

| 编号 | 功能 | 状态 |
|------|------|------|
| F1 | 净回报率比较引擎（费率 - FTF - 渠道费 - 上限 - 门槛，全精度计算、两位小数展示） | 交付 |
| F2 | 卡库管理（12 张预置模板 + 手动增删改，数据契约加载期校验） | 交付 |
| F3 | 主查询页（3 秒内出推荐，粘底答案卡） | 交付 |
| F4 | 算式展开（每张卡的毛返现/费用/净返明细可查） | 交付 |
| F5 | 上限与门槛（双档净收益：netRealistic / netOptimistic；按类别绑定的门槛增量模型 ADR-011） | 交付 |
| F6 | 数据新鲜度与时效（卡条款置信度标注，低置信卡明确提示「待核对」） | 交付 |
| F7 | 持久化与导入导出（IndexedDB + JSON 导出/导入） | 交付 |
| F11 | 安装引导与数据安全（PWA 安装引导、数据不出设备声明） | 交付 |

## 4. 数据安全声明

- **无后端**：应用为纯静态文件，没有任何服务器接收你的数据。CSP 头 `connect-src 'none'` 在浏览器层面禁止页面发起任何网络连接——这不是文案承诺，是技术强制（已在生产构建的 index.html 中验证）。
- **数据只在本地**：卡库、账本、设置全部存于设备浏览器 IndexedDB（库名 `cc-rewards`），卸载浏览器数据或清除站点数据即删除。
- **备份方式**：设置页导出 JSON 文件保存到你自己的位置；换机时导入该 JSON 即可完整迁移。建议每次大改卡库后导出一次。

## 5. 技术架构摘要

- 栈：React 19.3 + Vite 8.3 + TypeScript 7.0（pin 按 SPEC 4）+ Tailwind CSS 4 + Dexie 4（IndexedDB 封装）+ react-router 7。
- PWA：vite-plugin-pwa（generateSW 模式），registerType `prompt`（用户确认后才更新，避免编辑卡库时被静默换版）；导航请求 NetworkFirst + 3 秒超时回退缓存，静态资源 CacheFirst。
- 部署：**纯静态托管即可**（任意静态文件服务 / CDN / 对象存储静态站点）。`npm run build` 产出 `dist/`，整个目录上传即可，无需 Node 运行时。
- 引擎：`src/domain/engine` 为纯函数计算层（ earn/caps/thresholds/fx 分模块），数据契约见 `docs/ARCHITECTURE.md` 与 ADR-001 至 ADR-012。

## 6. 产物清单与体积（本机构建实测）

| 文件 | 原始 | gzip |
|------|------|------|
| index.html | 2.25 kB | 1.23 kB |
| assets/react-*.js | 249.31 kB | 79.15 kB |
| assets/index-*.js | 219.32 kB | 59.37 kB |
| assets/dexie-*.js | 106.85 kB | 34.31 kB |
| assets/index-*.css | 32.93 kB | 7.47 kB |
| assets/workbox-window.prod.es5-*.js | 5.65 kB | 2.20 kB |
| assets/rolldown-runtime-*.js | 0.59 kB | 0.36 kB |
| sw.js + workbox-*.js | 24.7 kB | — |
| manifest.webmanifest | 0.49 kB | — |
| icons（4 个 png）+ favicon.svg + boot.css | ~20 kB | — |
| **合计** | **~662 kB** | **gzip 约 184 kB** |

- 预缓存：18 项 / 609.49 KiB。**与上一次构建的 19 项差异说明**：本项目无 git 历史，无法逐项 diff；逐项核对当前清单为 14 个唯一文件（index.html、favicon.svg、boot.css、manifest.webmanifest、6 个 hash 化 assets、4 个图标 + apple-touch-icon），其中 4 个图标因 `includeAssets` 与 `globPatterns` 规则重叠各出现一次重复条目（workbox 按 URL 去重，无副作用）。上次的第 19 项最可能是一个已移除的 public 文件。清单内容与 dist 实际文件一一对应，无缺失。

## 7. 已知限制（用户可感知，摘自 docs/decisions/OPEN-DECISIONS.md）

1. **wewa 两类别合计口径**：wewa-unionpay 官方 4% 是「两个类别合计 4%」，当前按「各自 4%」建模，HK$200 上限部分缓解但不完全等价。该卡结论可能偏高，UI 已有置信度提示。
2. **消费地区无「香港」选项**：`SpendRegion` 目前只有澳门/内地。港卡在港消费时地区只能选 MO 或 CN，两者都可能路由不准。目前无卡声明地区前提，尚未产生可见错误；出现「港卡在港消费」精确建模需求时再扩。
3. **ocbc-mo-premier 周末限定**：其 dining/grocery 3% 为周末限定，应用无「星期几」输入，**平日消费时该卡被高估约 2 个百分点**。aeon-wakuwaku 的 flight「日本境内商户」前提同理（数据已保守填 0.4%）。
4. 年度/半年期门槛的账本归集已实现但全库暂无 `year`/`half_year` 门槛数据触发，待有此类卡入预置时需复测。
5. tai-fung 实体刷卡档费率官方未公开，该卡在 physical 渠道显示「数据待核对」而非给数字——这是设计行为，不是故障。
6. 仅深色主题（用户已确认）；DCC 提示不进计算（付款时永远选当地货币）。

## 8. 质量证据摘要

- **门禁**：`npm run verify` exit 0（emoji 门禁、色彩门禁、tsc、eslint、测试、构建全过）。
- **测试**：29 个测试文件、466 个用例全部通过。
- **覆盖率**：语句 96.91%、分支 90.52%、函数 99.33%、行 98.34%（domain/engine 98.64% 行覆盖）。
- **QA 四轮**：
  - R1（QA-REPORT）：fail，3 blocking（门槛机制失效 / EarnMORE 年度上限 / BCM splitRates 契约）——全部修复，机制重写为 ADR-009/010/011。
  - R2（QA-REVERIFY）：fail，遗留 B3 方向错误与 gain 恒零——修复。
  - R3（QA-REVERIFY-R3）：fail，新增 B3'（foreign 路由高估）——修复。
  - 终轮：**pass，无 blocking**。
- **部署验证**：本报告第 9 节，真实 Chromium 实测。

## 9. 部署验证记录（2026-10-31，本机执行）

| 检查项 | 结果 |
|--------|------|
| `npm run verify` | exit 0 |
| 构建产物 dist/ 完整（含 sw.js、manifest、icons） | 通过 |
| CSP `connect-src 'none'` 在 index.html 中 | 确认存在，且页面内 fetch 被 CSP 实际拦截（正向证据） |
| vite preview :4173，/ /manifest.webmanifest /sw.js /icons/* /favicon.svg /boot.css | 全部 HTTP 200 |
| 真实 Chromium（Playwright 1.58）：页面加载、标题「刷哪张」 | 通过 |
| 不停留加载态：默认推荐出现（EarnMORE 银联钻石卡，净返 2.00% / +MOP 10.00） | 通过 |
| console 错误 / pageerror | 0 |
| 外部网络请求 | 0 |
| Service Worker | registered:active |
| IndexedDB | 可用，库名 cc-rewards |
| manifest 200、icon-512.png 200 | 通过 |

## 10. 未达 Silver 维度与补救计划

- **监控/告警维度**：纯本地静态应用无服务端，Prometheus/Sentry 类方案不适用。替代：浏览器端 console 已零错误作为发布基线；用户可感知问题通过导出 JSON 复现。补位计划：后续如加版本遥测（当前 CSP 禁止，需产品决策再议）。
- **备份维度**：备份责任在用户（导出 JSON）。建议首次安装完成后立即导出一次作为基线。
- 其余维度（可回滚构建、健康验证、自包含交付）已达 Silver。

---

## 回滚方案

纯静态部署的回滚 = 保留上一个版本的 `dist/` 目录（或托管平台的历史版本/快照），发布异常时切回。本项目 `dist/` 为完全自包含产物，无迁移、无数据库 schema，回滚零副作用。建议每次发布前把当前线上 dist 打包存档（如 `dist-YYYYMMDD.tar.gz`）。

## 快速部署命令（任选其一）

```bash
# 本机使用
npx vite preview --port 4173

# 任意静态托管：上传 dist/ 全目录即可
# 注意 frame-ancestors 只能经 HTTP 头下发，如需禁止被 iframe 嵌套，
# 在托管平台补一条响应头：Content-Security-Policy: frame-ancestors 'none'
```
