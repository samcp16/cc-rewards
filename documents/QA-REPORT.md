# QA 报告 — 刷卡决策器 v1.0（Phase 4 独立验收）

- 验收人：严过关（质量工程师，与 Phase 3 开发上下文解耦，未复用开发方测试期望值）
- 验收依据：`docs/SPEC.md`（规格契约，唯一验收依据）+ EARS §9 共 34 条 + §12 端到端步骤
- 验收日期：2026-10-31
- 验证方式：独立运行全部门禁与测试；自写黑盒探针 `scripts/qa-probe.ts`（期望值全部按 SPEC 手算，未抄任何现有测试断言）；WebSearch 核实 3 张卡官方条款；Playwright 真实 Chromium 打开页面做 E2E 走查

---

## verdict

```
verdict: fail
blocking: 3
advisory: 5
```

---

## blocking（必须修复才能上线）

### B1 门槛机制整体失效，6 张卡一律按最高档计收益（正确性缺陷，沉默逻辑错误）

- 违反项：SPEC AC-F5-02「系统必须先定档再封顶」、F5 功能定义「门槛定档」、§6.2 执行次序第 1 步。
- 证据：
  - `src/domain/engine/earn.ts:101-105`：`const fromThreshold = threshold.tier?.earn ?? []` — 当 tier 无 `earn` 字段时直接沿用类别基础费率，定档结果不影响任何数字。
  - `data/cards-hk-mo.json`：全库 6 张带 `thresholds` 的卡（boc-hk-chill / boc-hk-cheers / wewa-unionpay / bea-world-mc / dbs-black-world / hsbc-everymile），**所有 tier 均无 `earn` 字段**。`src/domain/types.rules.ts:117` 中 `earn` 是可选字段，数据层与引擎层各让一步，结果两头都没接住。
  - 实测（黑盒探针，独立复算）：wewa-unionpay 未达「月满 HK$1,500」门槛时引擎给 4%（官方条款未达门槛仅 0.4% 基础档），**高估 10 倍**；boc-hk-chill 在月累计未满 HK$1,500 时按 10% 计（thresholdNote 自己显示「Chill 商户 8%（需月实体签账满 HK$1,000）」，但毛返现仍按 10% 算出 gross=100/MOP1000）。
  - 测试盲区证据：`src/domain/engine/branches.test.ts:70-80` 与 `index.test.ts:162` 均只断言 `thresholdNote` 文案与 cap 告警，**全测试套件无任何断言验证「达门槛后收益数值变化」**（`grep "earn:" tests` 零命中）。这是「测试绿但产品错」的典型案例。
- 期望：tier 未声明 `earn` 时应回落到该 tier note 声明的**低档费率**（或至少把「未达门槛仍按高档计」显式暴露为数据缺口拒绝计算），且存在能杀死该缺陷的测试断言。
- 影响：涉及 6 张卡、覆盖 3 张预置精选（Chill/Cheers/wewa 同类），主推荐位系统性高估，方向性错误。

### B2 EarnMORE 年度上限误存为月度，超额后次月重置满额（数据契约破坏）

- 违反项：SPEC §3.2 #12「earnmore-unionpay：period = year 分支（上限按年/半年计）」、§11 已知坑「上限按自然月归集会算错按年上限的卡」、§13 变更记录「CapDefinition.period 扩为 month/year/half_year（卡库实测 EarnMORE 按年计）」。
- 证据：
  - `data/cards-hk-mo.json`：`earnmore-unionpay:annual-2pct` 的 `period: "month"`（id 里自己都写着 annual）；全库 38 张卡 `period` 分布为 `{'month': 8}`，**year / half_year 零张**。
  - 实测：账本记录 2026-01 用满 HKD 3000 回赠额度后，10 月本笔 CNY 消费仍拿满 2%（gross=20），caps 显示 remaining=2760 全新满额。若 period=year 正确生效，应只剩 fallback 1%。
- 期望：period 修正为 year（或按官方口径核实后修正），回归测试断言「跨月不重置」。
- 影响：SPEC 声称的 period 分支覆盖实际为零，该卡年度上限形同虚设，收益被高估。

### B3 SPEC 声称的 splitRates 分支在数据层零存在（需求未满足）

- 违反项：SPEC §3.2 #10「bcm-world-mc：splitRates 分支：外币 0.5% + 跨域 1.0% 两项独立收费」、§11 已知坑「单一 rate 存不下 BCM 的外币/跨域分项费率 → 修法 FxFeeRule.splitRates」。
- 证据：
  - `data/cards-hk-mo.json`：全库 38 张卡 **0 张带 `splitRates` 字段**。bcm-world-mc 的 fxFee 是单值 `rate: 1.5`，note 自述「外币 0.5% + 跨域 1.0% = 合计最高 1.5%，rate 取上限合计值」。
  - `src/domain/fx/resolveFx.ts:69-74` 实现了 splitRates 逻辑但永远走不到（无数据支撑），对应的 SPEC 声称分支未被任何真实数据验证。
- 期望：二选一并写回 SPEC：(a) 按 SPEC 补数据，BCM 分项存储 0.5%/1.0%，让实现的分支真正被覆盖；(b) 修订 SPEC，明确记录「合并取上限」的数据裁定及其对跨域交易成本高估的影响。当前状态是 SPEC 契约与数据各说各话。
- 影响：SPEC 的分支覆盖声明失真；BCM 卡在跨域场景成本取 1.5% 而实际外币签账仅 0.5%，收益被低估最多 1pp。

---

## advisory（不阻断，记入待办）

1. **Chill 上限口径与官方条款差约 4%（保守方向）**。官方 T&C（bochk.com `chill_tnc_SC.pdf` 第 20 条）为「基础 0.4% 无上限 + 额外 9.6% 合计上限 HK$150/月」，MOP 2000 官方口径约合 162.50 MOP；引擎给 156.32。实现是自洽的、方向保守，但 `src/domain/engine/caps.ts:130-133` 注释里自己写的例子（合计 162.5）与实际输出（156.32）矛盾，且 `src/domain/engine/index.test.ts:129` 注释采用另一口径——两处注释互相打架，应统一并注明真实官方口径。
2. **Chill 门槛数据混淆了两张卡**。官方条款：World 卡满 HK$1,500 得 10%，Platinum 卡满 HK$1,000 得 8%，是两款卡的各自门槛；卡库把它写成了同一张卡的两档 tier（`thresholds[0].tiers[0].note` 为「8%（需满 HK$1,000）」）。当前被 B1 掩盖（门槛不生效），修复 B1 时会浮出，需一并核对。
3. **SPEC §12 步骤 5.2 与 §3.4 内部矛盾**。§12 要求「模板选汇丰 PULSE 银联双币」，但 §3.4 已将 PULSE 剔除预置（7 类别全 unknown）。实现跟随 §3.4（`presetTemplates()` 返回 12 张，PULSE 不可选）是正确取舍，建议在 SPEC 变更记录里注销 5.2 该步骤。
4. **卡片详情页「正在读这张卡…」快照曾出现疑似停留**（`.playwright-cli/page-2026-10-31T06-26-21-*.yml`）。代码路径 `CardDetailPage.tsx:89` 与 `useDb.ts` 的 loaded 语义自洽（null 与 undefined 已区分），主流程浏览器实测未见复现，判断为快照时机瞬时态；建议后续加一条 E2E 断言「详情页 1s 内脱离加载态」以防回归。
5. **playwright 残留探针文件与本次 QA 探针未清理入库**。`scripts/qa-probe.ts` 为本次验收产出（可保留作为定向回归补充，建议改造为正式测试并补 B1/B2 的杀手断言）；`.playwright-cli/` 快照目录建议加入 .gitignore。

---

## 第一优先核查项逐项结论（用户指定的 6 个高风险点）

| # | 核查项 | 结论 | 证据 |
|---|--------|------|------|
| 1 | 测试自证循环 | **基本排除，存在 1 个系统性盲区** | 抽查 12 条断言：`index.test.ts` 六组断言的期望数字（20 / 19.5 / 0.5 / 156.32 / 8 等）均能追溯到 SPEC §12 第 6 节手算与官方条款，非实现输出反抄；`settlementRoute.test.ts` 按 §6.2.1 判定表逐行断言。盲区：门槛收益变化零断言（见 B1）；另外 345 个测试中无一条覆盖「threshold 达标 → 数值改变」 |
| 2 | 卡数据真实性（抽 3 张联网核实） | **2 张准确，1 张部分偏差** | sc-simply-cash：官网确认「本地 1.5% / 外币 2.0%」，FTF 1.95%（MoneySmart/debitbaba 双源），与卡库完全一致；boc-hk-chill：官方为「基础 0.4% 无上限 + 额外 9.6% 上限 HK$150」，卡库口径近似但差 4%（见 advisory-1），且门槛混淆两款卡（advisory-2）；aeon-wakuwaku：官方 FTF 实为**豁免**（MoneySmart：「凭 AEON 信用卡于海外签账，不会收取任何外币交易之费用」），卡库存 1.95%——成本被高估 1.95pp，因 AEON 主打类别 online 6% 无 foreign 档靠回落机制侥幸拿到正确收益，但 FTF 项算错会压低其排序位置（未达 blocking 定级阈值，因需逐卡复核才能确认是否 AEON 官网现行条款已变更，置信度中等） |
| 3 | 双档费率误取 local 档时测试会不会红 | **会红** | 变异验证：SC MOP1000 若取 local 档得 15，`index.test.ts:22` 断言 `grossCashback===20` 必红；黑盒实测三种路由（foreign/crossBorder/local）返现档与 FTF 均正确联动（probe D1）；且引擎有运行时 `assertRouteConsistency` 双保险 |
| 4 | cap basis=value 是否真生效 | **生效** | caps.ts:138 `basis ?? 'value'`；实测 Chill 曲线：MOP≤1500 线性 10%，MOP2000 封顶 156.32（154.50+455×0.4%），MOP10000 得 188.32（154.5+8455×0.4%），与官方语义吻合（advisory-1 的 4% 口径差除外）；spend 口径会得 22.83，7 倍差被正确避免 |
| 5 | unknown 绝不按 0 计 | **通过** | probe D3：bnu-world-mc fuel → status=unknown + unknown_rate 警告，不进 ranked；全库 fuel 场景 ranked 18 / unranked 20 恰好对应卡库缺口；UI 层 `CompareRow.tsx:97` unknown 显示「未知」文字而非 0.00 |
| 6 | 跨币种折算不作为成本项 | **通过** | probe D4：Chill MOP2000 breakdown kinds=[cashback, fx_fee, channel_fee]，无任何汇率成本项；折算说明只出现在 capsAffected.fxNote 与全局 fxNotes（「按参考汇率 HKD 1 = MOP 1.03 折算」），UI 实测该标注正常显示 |

---

## SPEC §9 逐条验收表（34 条 AC）

| AC | 结论 | 验证方式 | 证据 |
|----|------|----------|------|
| F1-01 对每张卡算净回报并降序 | 通过 | 黑盒探针 D7（380/12000 两金额，全卡库降序单调性校验） | probe D7 输出 sortedDesc=true |
| F1-02 手续费参与排序 | 通过 | 探针 D9：hsbc-everymile 等因 FTF 净负排末位 | probe D9 末 3 名均负 |
| F1-03 unknown 不按 0 排序 | 通过 | 探针 D3 + `rank.ts:42` splitUnknown | probe D3 |
| F1-04 排他组同组取最优 | 通过 | `earn.ts:194-216` applyExclusivity + earn.test 覆盖 | 代码审查 + 测试 |
| F1-05 金额 0/负拒绝 | 通过 | 探针 D5：0/-1/-0.0001/NaN/Infinity 全拒 | probe D5 |
| F2-01 模板选择器 | 通过 | 代码审查 + 浏览器页面 | `NewCardPage.tsx:32` + PRESET_CARD_IDS 测试 |
| F2-02 模板预填且可编辑 | 通过 | `cardFromTemplate` + NewCardPage 全字段表单 | 代码审查（浏览器未逐一填字段，表单组件齐全） |
| F2-03 二维默认 FTF | 通过 | `defaultFxTable.ts:108` getDefaultFx(issuerRegion, network)，HK Visa/MC=1.95%、Amex 2.0% 等齐全 | 代码审查 |
| F2-04 空 FTF 阻止保存 | 通过 | `CardDetailPage.tsx:124` + fxError 就近提示 | 代码审查 |
| F2-05 删除二次确认 | 通过 | `DeleteConfirm` 组件 + `CardDetailPage.tsx:282` | 代码审查 |
| F2-06 保存即时生效 | 通过 | useLiveQuery 订阅链（`useDb.ts` 文档注释 + e2e-pipeline.test 走真实链路） | 代码审查 + e2e 测试 7/7 |
| F3-01 无点击出默认答案 | 通过 | 浏览器实测 | /tmp/home.png：打开即显示 Chill 推荐 +MOP 40.25 |
| F3-02 200ms 内更新无按钮 | 通过 | 输入即算架构（无计算按钮存在于 DOM）+ 纯同步引擎（20 文件测试总时长 1.16s） | 浏览器 DOM 无「计算」按钮；引擎单卡 <1ms |
| F3-03 sticky 底部 | 通过 | `DecidePage.tsx:55` sticky + 截图答案卡固定底部 | /tmp/home.png |
| F3-04 一次点击开始输入 | 通过 | 浏览器实测金额输入框直接可点 | /tmp/home.png |
| F4-01 逐项至少四项 | 通过 | 浏览器展开实测：毛返现/外币手续费/渠道服务费/净额 | 浏览器正文输出 |
| F4-02 每项带来源与日期 | 通过 | 浏览器实测「bochk.com 2026-10-31 核实」逐项显示 | 浏览器正文输出 |
| F4-03 low/unknown 提示偏差 | 通过 | `AnswerCard.tsx:214-219` needsCaution + CompareRow「待核对」 | 代码审查 + 浏览器（wewa low 卡显示待核对） |
| F5-01 超限按 fallback | 通过 | `caps.ts:166` + `index.test.ts:156-168`（用满后 gross=8） | 测试 + 探针 Chill 曲线 |
| F5-02 先定档再封顶 | **失败（B1）** | 黑盒探针 D8：门槛达标与否 gross 无差异 | probe D8 |
| F5-03 双档净收益展示 | 通过 | `evaluateCard.ts:207-208` + `AnswerCard.tsx:208-211`「额度用尽后降为」 | 代码审查（浏览器主流程未触发双档差异场景，逻辑链路有单测覆盖） |
| F5-04 记一笔立即重算 | 通过 | e2e-pipeline.test 走真实 rankCards→buildLedgerEntry→db.ledger.put 链路 7/7 | 测试文件 |
| F6-01 显示上次确认日期 | 通过 | `CardDetailPage.tsx:269`「上次核对 {verifiedAt}」+ 列表 ConfidenceTag | 代码审查 |
| F6-02 90 天过期提醒 | 通过 | `evaluateCard.ts:24` STALE_DAYS=90 + `CardStatusBands` 一键确认 touchVerified | 代码审查 |
| F6-03 60 天即将到期 | 通过 | `resolveFx.ts:29` EXPIRING_SOON_DAYS=60 + fx_fee_exempt_expiring 警告 | 代码审查 + 测试 |
| F6-04 过期豁免失效 | 通过 | `index.test.ts` 断言 6：立桥过期后回落 1.95% 并警告 | 测试 |
| F7-01 刷新不丢 | 通过 | Dexie 持久化 + 浏览器两次会话快照数据留存（Chill 33.33% 已用额跨快照保留） | .playwright-cli 快照序列 |
| F7-02 导出 JSON | 通过 | 浏览器设置页「导出备份」按钮 + backup.ts | 快照 + 代码审查 |
| F7-03 格式错误拒绝并说明 | 通过 | `backup.ts` 校验 + ImportSheet error phase | 代码审查 |
| F7-04 冲突三选不静默覆盖 | 通过 | `ImportSheet.tsx:21` conflict phase（覆盖/保留两者/取消） | 代码审查 + 快照 |
| F7-05 失败整体回滚 | 通过 | `backup.ts` 事务性导入设计 | 代码审查 |
| F11-01 iOS 安装引导 | 通过 | 设置页「安装到主屏幕」+ 7 天清除说明 + InstallGuide | 浏览器快照 |
| F11-02 storage.persist | 通过 | `bootstrap.ts:41` navigator.storage.persist 调用 | 代码审查 |
| F11-03 数据安全声明 | 通过 | 设置页实测四条声明（不存卡号/不上传/无账号/7 天风险） | 浏览器快照 |

---

## 第三优先：实际运行记录

| 步骤 | 结果 | 证据 |
|------|------|------|
| `npm run verify`（gate→typecheck→lint→test:coverage→build） | **exit 0**，345/345 通过，20 文件，覆盖率语句 98.19% / 分支 91.75% / 函数 99.23% / 行 99.15% | 本机独立运行输出（15:12:48 完成，1.16s） |
| P0 emoji 门禁（独立 grep，非项目脚本） | src/ 零命中 | `grep -rPn '[\x{1F300}-\x{1F9FF}...]' src/` exit=1 |
| P0 紫粉 / 硬编码色 / AI 模板味（独立 grep） | 全部零命中 | 独立执行输出 |
| 门禁脚本变异验证 | 插入「🎉 + #7C3AED purple」探针 → 两个 gate 均拦截并定位行号；还原后通过 | 变异测试输出 |
| `npm run dev` + Playwright Chromium 390x844 | 页面正常渲染，无欢迎页，打开即出答案（Chill +MOP 40.25 / 8.05%），答案卡 sticky 底部，**零外部网络请求**，零 console 错误 | /tmp/home.png + 浏览器脚本输出 |
| 环境限制判定 | **沙箱 Chromium 可用 IndexedDB**（Dexie 正常读写，设置页/额度页正常），phase-state.md 中「沙箱 headless Chromium 不提供 IndexedDB」的表述与本机实测不符——E2E 在本环境实际可跑 | 浏览器实测 + 快照序列 |
| 边界输入 | 0/负/NaN/Infinity 拒绝；1e12 接受并正常排序；非法 category 拒绝；账本幽灵 cardId 不崩溃 | probe D5/D6/D6b |

---

## 反作弊与完整性检查

| 检测项 | 结果 |
|--------|------|
| 测试文件删除 | 无（20 文件齐全） |
| 断言弱化/硬编码实现输出 | 未发现（抽查 12 条断言均可溯源至 SPEC/官方条款） |
| skip/xfail/.only | 零命中 |
| 测试框架配置篡改 | 无（vitest.config.ts 与 SPEC §4 版本锚定一致） |
| 覆盖率阈值放水 | 无（门槛 90% 保持，实际 98.19%） |
| 门禁脚本有效性 | 变异探针验证真实拦截 |

但注意：**测试完整性不等于测试充分性**。B1 证明存在「断言真实、手算准确、但根本没人写那条断言」的盲区——门槛收益变化在 345 个测试中零覆盖，绿灯因此对 B1 完全失明。这是本次验收最核心的教训。

---

## 失效模式核对（6 类）

| 失效模式 | 结果 | 详情 |
|----------|------|------|
| Happy-path 偏差 | 通过 | 边界/错误分支测试齐全（edge-cases 26 用例） |
| 沉默逻辑错误 | **命中（B1）** | 门槛定档跑了、note 显示了、数字没变——三层各自正确，组合起来静默算错 |
| 幻觉依赖/接口 | 通过 | 全部依赖与 SPEC §4 版本锚定一致，构建零错误 |
| 缺失系统上下文 | 通过 | CSP connect-src none、storage.persist、零网络实测达标 |
| 性能盲区 | 通过 | 全库 38 卡单次排序 <5ms（探针实测），远优于 200ms 要求 |
| 静默缺失 | 通过 | tsc --noEmit + eslint 零问题 |

---

## 生产就绪记分卡（7 维 × 3 档）

| 维度 | 档位 | 证据 |
|------|------|------|
| 测试 + 回归 | Bronze | 覆盖率高、断言真实，但 B1/B2 盲区证明关键分支未定向覆盖，回归集尚无沉淀 |
| 契约 | Bronze | SPEC 与数据层三处脱节（B2/B3、period/splitRates 声明失真） |
| 安全 | Silver | CSP、零网络、storage.persist、无敏感数据实测达标 |
| 无障碍 | Bronze | aria 标注齐全（aria-live/aria-expanded/aria-label），但无屏幕阅读走查、无对比度审计证据 |
| 性能 | Silver | 引擎 <5ms 全库排序，构建 213ms，PWA 预缓存正常 |
| 可观测 | Bronze | 无结构化日志（单人本地工具，风险可接受，记档即可） |
| 发布安全 | Bronze | PWA 可重装，但无导出提醒等发布前检查链 |
| **总档（取最低）** | **Bronze** | 未达 Silver，不满足商业生产交付线；本产品为单人自用工具，Bronze 是否可交付由主理人按用途裁定 |

---

## 回归测试优先级（修复后必测）

1. **B1 杀手测试**：对 6 张门槛卡各写一条「未达门槛 gross < 达门槛 gross」断言；变异验证：注释掉 earn.ts:101-105 的分支处理必红
2. **B2 回归**：EarnMORE 跨月不重置断言
3. B3 修复后：BCM splitRates 路由选择断言（foreign 0.5% / crossBorder 1.0%）
4. 既有 345 测试全量回归 + probe D1-D9 全部场景

---

## 上线建议

**不通过（fail）** — 3 条 blocking 全部为「测试绿灯掩盖下的正确性缺陷」：门槛机制整体失效（B1，涉及 6 卡、主推荐位系统性高估最多 10 倍）、年度上限月度重置（B2）、SPEC 分支声明与数据脱节（B3）。修复量不大（B1 需数据补 earn 字段 + 引擎回落策略二选一；B2 改一个字段；B3 补数据或修 SPEC），但都属于「用户照着错误答案刷卡」的直接正确性问题，按 P0 缺陷不归零不上线的门禁必须打回。
