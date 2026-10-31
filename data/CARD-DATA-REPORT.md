# 港澳信用卡卡库 · 数据核查报告

**版本**：v1.0
**核查日期**：2026-10-31
**核查人**：许清楚（产品经理）
**产物**：`data/cards-hk-mo.json`（38 张，合法 JSON，已通过 `python3 -m json.tool`）
**范围**：仅中国澳门发卡 + 中国香港发卡（美国卡已按用户决定移除）

---

## 0. 一句话结论

**38 张卡里，只有 6 张的返现结构达到「可直接参与推荐排序」的可信度（confidence: high）；13 张卡的 0% 外币手续费是可用的硬结论；剩下 19 张的返现侧是空白。**

这个比例听起来不高，但它如实反映了公开信息的真实可得性——港澳发卡行普遍把费率埋在 PDF 收费表和限时推广页里，结构性返现率很少完整公开。**我选择让 19 张卡"空着"，而不是用 1.95% 这种行业值去填满它们。** 因为填空会让工具看起来完整，但推荐会静默出错，而静默出错比明显的空白危险得多。

---

## 1. 采集总览

### 1.1 按发卡行分布

| 地区 | 发卡行 | 张数 | 说明 |
|---|---|---|---|
| 中国澳门 | 大西洋银行 BNU | 3 | World MC / Visa Signature / 银联 |
| 中国澳门 | 中国银行澳门分行 | 3 | 全币种 / VISA 商务 / 淘宝 |
| 中国澳门 | 工银澳门 ICBC | 1 | 积分型（无分品类返现） |
| 中国澳门 | 大丰银行 | 2 | 银联双币钻石（大湾区）/ Visa |
| 中国澳门 | 澳门商业银行 BCM | 2 | World MC / 银联双币 |
| 中国澳门 | 澳门国际银行 MIB | 3 | 大湾区白金 / 银联三币 / 港币 Visa 白金 |
| 中国澳门 | 华侨永亨 OCBC | 2 | 宏富理财 / 银联 |
| 中国澳门 | 立桥银行 | 1 | VISA 金卡 |
| **澳门小计** | **8 家** | **17** | 目标 10-15，超额完成 |
| 中国香港 | 汇丰 HSBC | 5 | Visa Signature / Red / PULSE 银联双币 / EveryMile / VS-extra |
| 中国香港 | 恒生 | 1 | enJoy |
| 中国香港 | 渣打 | 2 | Simply Cash / Smart |
| 中国香港 | 花旗 Citi | 2 | Cash Back / PremierMiles |
| 中国香港 | 中银香港 BOCHK | 3 | Chill / i-card / Cheers |
| 中国香港 | 东亚 BEA | 1 | World Mastercard |
| 中国香港 | 星展 DBS | 1 | Black World MC |
| 中国香港 | 美国运通 Amex HK | 1 | Explorer |
| 中国香港 | AEON | 3 | WAKUWAKU / Premium 银联 / 标准卡 |
| 中国香港 | Mox | 1 | Mox 信用卡 |
| 中国香港 | 安信 PrimeCredit | 2 | WeWa 银联 / EarnMORE 银联 |
| **香港小计** | **11 家** | **21** | 目标 20-35，达标（下限） |

> 注：发卡行统计中 HSBC 记 5 张，因「Visa Signature」与「Visa Signature（额外 3X 推广）」是同一张卡的两个视角，后者用于承载限时推广，不重复计入主卡。

### 1.2 confidence 分布

| confidence | 张数 | 占比 | 含义 |
|---|---|---|---|
| high | 6 | 15.8% | 手续费 + 7 类别返现 + 上限全部有官方或官方等价来源 |
| medium | 20 | 52.6% | 核心字段（手续费或主要类别）有据，存在 1-2 处非官方来源或未取得的次要字段 |
| low | 10 | 26.3% | 仅手续费或仅部分类别有据，返现结构大面积缺失或存在来源冲突 |
| unknown | 2 | 5.3% | 仅有手续费，返现结构完全未取得 |

**6 张 high 的卡**：BNU World MC、大丰银联双币钻石、恒生 enJoy、渣打 Simply Cash、Citi Cash Back、Amex Explorer。

这 6 张恰好覆盖了四种截然不同的费率结构（本地/海外差异化返现、移动支付渠道返现、无上限统一返现、外币费 0% / 外币费 2%），**用作 MVP 的推荐排序测试集已经足够**。

### 1.3 网络分布

| 卡组织 | 张数 |
|---|---|
| Visa | 18 |
| 银联 unionpay | 12 |
| Mastercard | 7 |
| Amex | 1 |

银联占 12 张（31.6%），是澳门与内地场景的实际主力，符合"优先选在澳门/内地有意义的卡"的选卡原则。

### 1.4 0% 外币手续费卡（本产品的价值支点）

**13 张卡的 `fxFee.rate = 0`**，全部有来源：

| 卡 | 0% 的适用条件 | 时效风险 |
|---|---|---|
| BNU 银联信用卡 | MOP/HKD/CNY | 无（官方收费表明文豁免） |
| 中银澳门全币种 | MOP/HKD/CNY | **至 2026-12-31** |
| 中银澳门淘宝卡 | MOP/HKD/CNY | **至 2026-12-31** |
| 大丰银联双币钻石 | MOP/HKD/CNY | 无 |
| BCM 银联双币 | MOP/HKD/CNY | 无 |
| MIB 大湾区白金 | MOP/HKD/CNY | 无 |
| MIB 银联三币钻石 | MOP/HKD/CNY | 无 |
| 华侨永亨宏富理财 | MOP/HKD/CNY | 无 |
| 华侨永亨银联 | MOP/HKD/CNY | 无 |
| 汇丰 PULSE 银联双币 | **MOP/HKD/CNY**（官方 FAQ 明文） | 无 |
| 渣打 Smart | 全部外币 | 无（官方明示不设海外签账手续费） |
| AEON Premium 银联 | MOP/HKD/CNY | 无 |
| 立桥 VISA 金卡 | 全部外币 | **推广期 2026-06-30 已过期** |

---

## 2. 三地交叉场景核实结论（本次最重要的产出）

用户明确要求重点核实四个场景。以下每条都有来源。

### 2.1 港卡在澳门以 MOP 结算

**走「外币交易」，收 FTF（多数港卡 1.95%）。** 唯一例外是银联双币卡：

> **汇丰官方 FAQ 原文**：「就使用滙豐PULSE銀聯雙幣鑽石信用卡並以**澳門幣**計算之信用卡款項，此交易費用則會被豁免。」

这是整个核查中价值最高的一条证据——**一句话证实了「港卡 + 澳门 MOP 结算 + 0% 手续费」的存在**，且是官方来源而非第三方推测。PULSE 卡因此是「港卡在澳门」场景的最优解。

其他港卡（Visa/MC 单币卡）在澳门刷 MOP 一律 1.95%，包括所有返现率看起来很美的卡。

### 2.2 港卡在澳门以 HKD 结算

**走「跨境港币交易费」（CBF），多数港卡收 1%。** 关键差异：

| 卡组织 | CBF | 说明 |
|---|---|---|
| Visa / Mastercard | **1%** | HSBC、Citi、BEA、渣打均确认 1% |
| **American Express** | **0%** | Amex 官方 KFS 未列 CBF，实际不收 |
| 银联双币 | **0%** | HKD 属豁免币种 |

**Amex 在这个场景下是特例：** 澳门商户以 HKD 结算时，Amex 收 0% CBF（但因刷卡到澳门，若商户注册地为澳门，仍需注意是否按外币处理）。这意味着 **Amex Explorer 在澳门 HKD 结算 = 0%，MOP 结算 = 2%**，同一张卡在同一个城市两个费率，完全取决于终端按什么币种结账。

**这就是 §3.5 所说「手续费取决于结算币种，不是发卡地」的实证。**

### 2.3 港澳卡在中国内地消费

**银联通道 vs Visa/MC 通道费率完全不同：**

| 通道 | 手续费 | 来源 |
|---|---|---|
| 银联通道（云闪付绑港银联卡） | **0** | 云闪付官方 |
| 内地微信/支付宝绑境外 Visa/MC | **200 元以上收 3%** | 渠道侧收费，非卡侧 |
| 澳门发卡银联卡内地消费 | **0**（银联卡跨境豁免） | BNU 官方收费表 |

**重要区分：** 第 2 行的 3% 是**渠道服务费**，不是卡的外币手续费。用户如果误以为"绑支付宝就没有外币手续费"，会忽略这 3%。这正是架构 §12.2 `ChannelFeeRule` 要建模的东西——**渠道费和卡费是两笔独立的钱，必须分开算再相加。**

### 2.4 银联双币卡 0% 是否真 0%、有无时间炸弹

**分两类，必须区别对待：**

**A. 结构性 0%（无到期日）** —— BNU 银联、大丰银联双币、MIB 银联三币、华侨永亨银联、汇丰 PULSE、AEON Premium 银联、BCM 银联双币。这些是卡种本身的收费规则，官方收费表写明"豁免"，不依赖促销期。

**B. 优惠期 0%（时间炸弹，已确证 3 处）**：

| 卡 | 到期日 | 状态 |
|---|---|---|
| 中银澳门全币种 / 淘宝卡 | **2026-12-31** | **仅剩 2 个月** |
| 中银香港 Chill | **2026-12-31** | 仅剩 2 个月 |
| 东亚 World MC | **2026-12-31** | 仅剩 2 个月 |
| 立桥 VISA 金卡 | **2026-06-30** | **已过期 4 个月** |

中银澳门这条尤其危险：官方原文「免收 1.95% 跨境交易手续费，**优惠期至 2026-12-31**」。如果引擎把它当永久 0%，2027 年 1 月起会给用户算出多 1.95% 的虚假收益。

---

## 3. 查不到 / 不确定字段清单

**这些字段在 JSON 中为 `null` 或 `kind: "unknown"`，UI 必须显示「待确认」，绝对不能按 0 参与计算。**

### 3.1 返现结构完全未取得的卡（10 张）

| 卡 | 已确认 | 缺失 |
|---|---|---|
| BNU Visa Signature | 1.90% FTF | 全部 7 类别返现 |
| 中银澳门全币种 | 0% FTF（至 2026-12-31） | 全部 7 类别返现 |
| 中银澳门 VISA 商务 | 1.95% FTF | 全部 7 类别返现 |
| 中银澳门淘宝卡 | 0% FTF | 全部 7 类别返现、淘宝联名权益 |
| 大丰 Visa | 1.95% FTF | 全部 7 类别返现 |
| BCM 银联双币 | 0% FTF | 全部 7 类别返现 |
| MIB 大湾区白金 | 0% FTF | 全部 7 类别返现 |
| MIB 银联三币钻石 | 0% FTF | 全部 7 类别返现 |
| MIB 港币 Visa 白金 | HKD 结算 0%，其他 1.75% | 全部 7 类别返现 |
| 华侨永亨银联 | 0% FTF | 全部 7 类别返现 |
| 汇丰 PULSE 银联双币 | MOP/HKD/CNY 0% | 全部 7 类别返现 |
| 汇丰 Visa Signature | 1.95% FTF | 全部 7 类别返现 |
| AEON Premium 银联 | 0% FTF | 全部 7 类别返现 |
| AEON 标准卡 | 1.5% FTF | 全部 7 类别返现 |

> 实际 14 张，其中 BNU World MC 只有 fuel 一类缺失，不列入上表但同样需提示。

### 3.2 存在来源冲突的字段（必须让用户知道）

| 项目 | 冲突内容 | 我的处理 |
|---|---|---|
| **BNU 外币手续费** | `smartcardmacao.com` 旧版页面（2017 及 2026-04 存档）写 **1.75%**；官方 PDF（2026-10 版第 18 页）写 **1.90%** | **采用官方 1.90%**。同时建议架构文档 §3.5 表格回改（见 §7） |
| **EarnMORE 海外手续费** | MoneySmart 早期称「免 1.95%」；points852 与 MoneySmart 2026 版均称「2025 年起收 1%」 | **采用 1%**（保守，不低估成本） |
| **WeWa 海外手续费** | 官方宣传语与早期资料暗示 0%；MoneySmart 称 2025 年起收 1% | **采用 1%**（保守），标 confidence low |
| **EarnMORE 上限口径** | 三个来源三种说法：①每年首 HK$150,000 签账享 2% ②2% 回赠年上限 HK$1,500 ③每半年首 HK$80,000 享 2% | **无法定论**，JSON 中记一种并在 `capsNote` 显式标注冲突，confidence low |
| **恒生 enJoy 餐饮 2%** | 官方写「4 yuu 积分」，是否等同 2% 取决于 yuu 200 分 = HK$1 的兑换率 | 按官方兑换率折算 2%，视为可靠 |

### 3.3 需要「用户自查」才能用的卡

优先让用户自查这 5 张（按风险从高到低）：

1. **立桥 VISA 金卡** —— 0% 推广期已过期 4 个月，当前费率未知。若按 0% 算会低估 1.9% 成本。
2. **中银香港 i-card** —— 官方 PDF 是 2022 年版本，只采信「10X = 4%」的结构性表述，促销状态未知。
3. **汇丰 Red** —— 4% 网上回赠来自二手资讯，且缺月度上限，按无上限算会严重高估。
4. **EarnMORE 银联** —— 上限口径三源冲突，无法确定。
5. **WeWa 银联** —— 手续费 0% vs 1% 公开矛盾，且 2026-10-01 刚重构类别。

### 3.4 结构性建模缺口（不是数据缺失，是模型表达不了）

如实登记，供架构侧评估——**这些不是数据问题，是类型定义覆盖不到**：

| 缺口 | 涉及卡 | 说明 |
|---|---|---|
| 结算币种双档费率 | BCM World MC | BCM 是澳门唯一分开「外币 0.5% + 跨域 1.0%」的机构，`FxFeeRule.rate` 单值存不下两条路径。当前只存合计上限 1.5% |
| 模式切换费率 | Mox | 0% 外币费仅限 Asia Miles 模式，CashBack 模式仍 1.95%。`FxFeeRule` 无「模式」维度 |
| 商户名单型返现 | 渣打 Smart、AEON WAKUWAKU 部分 | 特约商户 5%（屈臣氏/百佳）、日本商户 6%，依赖商户黑名单，无法映射到 7 个固定类别 |
| 星期维度 | 华侨永亨宏富理财 | 「周末 3 倍」缺 `dayOfWeek` 条件 |
| 须手动登记 | 东亚 World MC、中银香港 Cheers、DBS Black | 「每月需 App 登记」不建模进费率，但**不登记就等于 0**，必须作为前置提醒 |
| 年度上限 vs 月度账本 | EarnMORE | `CapDefinition.period` 只支持 `'month'`，而本卡上限按年算 |

---

## 4. 时效风险清单（按紧迫度排序）

### P0 — 已过期，立即处理

| 卡 | 到期日 | 风险 |
|---|---|---|
| **立桥 VISA 金卡** | 2026-06-30 | 0% 手续费承诺已失效 4 个月。JSON 中 `waivedWhen.validUntil = "2026-06-30"`，引擎须能识别"已过期"并回退到保守费率 |

### P1 — 2 个月内到期（2026-12-31）

| 卡 | 影响字段 | 到期后风险 |
|---|---|---|
| 中银澳门全币种 | fxFee 0% | 可能恢复 1.95%，推荐会反向 |
| 中银澳门淘宝卡 | fxFee 0% | 同上 |
| 中银香港 Chill | 10%/8%/5% 返现 | 费率可能回落，且额外回赠月上限 HK$150 也可能调整 |
| 东亚 World MC | 12.5X = 5% | 五大类别加码可能取消 |
| 汇丰 Visa Signature | 额外 3X | 推广加码取消（本 JSON 已不计入，影响小） |

**建议：** 在卡片数据中保留 `waivedWhen.validUntil` 与 `activeTo`，引擎在 `today > validUntil - 30d` 时触发 `fx_fee_exempt_expired` 类警示（架构 §3.6 已有该 warning code），而不是等过期后才报错。

### P2 — 近期可能调整（无明确日期，但值得盯）

| 卡 | 原因 |
|---|---|
| WeWa 银联 | 2026-10-01 刚重构类别（海外签账改为预设玩乐类别），新规则才实施一个月，执行细则可能微调 |
| 中银香港 i-card | 官方资料停留在 2022 年，说明该卡可能已边缘化，随时可能调整 |
| 汇丰 PULSE | 0% 依赖官方 FAQ 表述，属长期政策但非合同承诺 |

---

## 5. 每卡来源链接表

| # | cardId | 卡名 | 核实日期 | 来源 | confidence |
|---|---|---|---|---|---|
| 1 | bnu-world-mc | BNU World Mastercard | 2026-10-31 | bnu.com.mo PDF P18 + smartcardmacao | high |
| 2 | bnu-vs-signature | BNU Visa Signature | 2026-10-31 | bnu.com.mo PDF P18 | unknown |
| 3 | bnu-unionpay | BNU 银联信用卡 | 2026-10-31 | bnu.com.mo PDF P18 | medium |
| 4 | bocmo-allcurrency | 中银全币种信用卡 | 2026-10-31 | bocmacau.com + bankofchina.com/mo | medium |
| 5 | bocmo-visa-biz | 中银 VISA 商务卡 | 2026-10-31 | bocmacau.com | medium |
| 6 | bocmo-taobao | 中银淘宝信用卡 | 2026-10-31 | bocmacau.com | low |
| 7 | icbcmo-standard | 工银澳门信用卡 | 2026-10-31 | icbc.com.mo 积分页 + smartcardmacao | medium |
| 8 | tai-fung-unionpay-dual | 大丰银联双币钻石卡 | 2026-10-31 | taifungbank.com | high |
| 9 | tai-fung-visa | 大丰银行 Visa | 2026-10-31 | taifungbank.com | unknown |
| 10 | bcm-world-mc | BCM World Mastercard | 2026-10-31 | smartcardmacao | medium |
| 11 | bcm-dual-currency | BCM 银联双币 | 2026-10-31 | smartcardmacao | low |
| 12 | mib-gba-platinum | MIB 大湾区白金卡 | 2026-10-31 | mib.com.mo | medium |
| 13 | mib-unionpay-triple | MIB 银联三币钻石卡 | 2026-10-31 | mib.com.mo | medium |
| 14 | mib-hkd-visa-platinum | MIB 港币 Visa 白金卡 | 2026-10-31 | mib.com.mo + smartcardmacao | medium |
| 15 | ocbc-mo-premier | 华侨永亨宏富理财信用卡 | 2026-10-31 | ocbc.com.mo | low |
| 16 | ocbc-mo-unionpay | 华侨永亨银联信用卡 | 2026-10-31 | ocbc.com.mo | medium |
| 17 | wlbank-visa-gold | 立桥银行 VISA 金卡 | 2026-10-31 | wlbank.com.mo + smartcardmacao | low |
| 18 | hsbc-vs-signature | 汇丰 Visa Signature | 2026-10-31 | hsbc.com.hk | medium |
| 19 | hsbc-pulse-unionpay | 汇丰 PULSE 银联双币钻石 | 2026-10-31 | hsbc.com.hk 产品页 + FAQ | medium |
| 20 | hsbc-red | 汇丰 Red 信用卡 | 2026-10-31 | hsbc.com.hk | low |
| 21 | hsbc-everymile | 汇丰 EveryMile | 2026-10-31 | hsbc.com.hk 产品页 | medium |
| 22 | hang-seng-enjoy | 恒生 enJoy | 2026-10-31 | hangseng.com | high |
| 23 | sc-simply-cash | 渣打 Simply Cash Visa | 2026-10-31 | sc.com/hk 官方 + moneysmart | high |
| 24 | sc-smart | 渣打 Smart 信用卡 | 2026-10-31 | sc.com/hk 官方 + moneysmart | medium |
| 25 | citi-cash-back | Citi Cash Back | 2026-10-31 | citibank.com.hk | high |
| 26 | citi-premier-miles | Citi PremierMiles | 2026-10-31 | citibank.com.hk | low |
| 27 | boc-hk-chill | 中银香港 Chill | 2026-10-31 | bochk.com | medium |
| 28 | boc-hk-icard | 中银香港 i-card | 2026-10-31 | bochk.com（2022 版 PDF） | low |
| 29 | boc-hk-cheers | 中银香港 Cheers | 2026-10-31 | bochk.com | medium |
| 30 | bea-world-mc | 东亚 World Mastercard | 2026-10-31 | hkbea.com | medium |
| 31 | dbs-black-world | DBS Black World MC | 2026-10-31 | dbs.com.hk | medium |
| 32 | amex-hk-explorer | Amex Explorer | 2026-10-31 | americanexpress.com/hk 官方 KFS | high |
| 33 | aeon-wakuwaku | AEON WAKUWAKU | 2026-10-31 | aeon.com.hk + woodofinance | medium |
| 34 | aeon-unionpay-premium | AEON Premium UnionPay | 2026-10-31 | aeon.com.hk | medium |
| 35 | aeon-standard | AEON 标准卡 | 2026-10-31 | smartcardmacao | low |
| 36 | mox-credit | Mox 信用卡 | 2026-10-31 | mox.com | medium |
| 37 | wewa-unionpay | WeWa 银联信用卡 | 2026-10-31 | wewacard.com + moneysmart | low |
| 38 | earnmore-unionpay | EarnMORE 银联钻石卡 | 2026-10-31 | moneysmart + points852 | low |

**说明**：`smartcardmacao.com` 是澳门本地信用卡信息聚合站，对被多家澳门银行交叉引用，在缺少官方 PDF 时作为次级来源使用，此类卡的 confidence 已相应降级，未标 high。

---

## 6. 数据可信度分级说明

### 分级定义

| 级别 | 判定标准 | UI 建议 |
|---|---|---|
| **high** | 手续费、7 类别返现、上限均有官方页面/官方 PDF 支撑，或官方 + 第三方完全一致 | 可正常参与推荐排序，正常显示数值 |
| **medium** | 核心字段有官方支撑，但存在 1 处非官方来源，或 1-2 个次要字段缺失 | 可参与排序，但对缺失类别显示「待确认」，不按 0 计 |
| **low** | 仅手续费或部分类别有据；存在来源冲突；官方资料已过期 | **不参与推荐排序**，或参与但必须显示显著警示 |
| **unknown** | 仅有手续费，返现完全未取得 | 只可用于「手续费对比」，不可用于「净回报推荐」 |

### 为什么不用行业均值填充空白

以「港卡 Visa 外币手续费」为例，行业值是 1.95%。看起来填进去很安全，但：

- 渣打 Smart 是 0%，填 1.95% 会让它从第一名掉到最后一名；
- Amex 是 2.0%，填 1.95% 会低估它 0.05%；
- AEON 标准卡是 1.5%，填 1.95% 会低估 0.45%；
- 立桥当前状态未知，填任何值都是猜。

**一张卡费率写错，推荐就反向。** 而"待确认"虽然难看，但它不会骗人。所以：**`null` 是产品资产，不是缺陷。**

### 计算侧的强制要求

1. `fxFee.rate` 为 `null` 的卡 —— **不允许进入推荐排序**。
2. `categories[x].kind === 'unknown'` —— **该类别按不可计算处理**，UI 显示「待确认」，不显示 0%。
3. 一张卡某类别 unknown，用户查询该类别时该卡应被**过滤掉**，而不是排在末尾。
4. `confidence === 'low'` 的卡，即使有数值也必须附警示图标 + 「数据待确认」。

---

## 7. 对架构文档的修正建议

| # | 位置 | 现状 | 建议改为 | 依据 |
|---|---|---|---|---|
| 1 | `ARCHITECTURE.md` §3.5 表格「中国澳门 / Visa·Mastercard」行 | 「大西洋银行 **1.75%**；工银澳门 1.95%；大丰 1.95%；国际银行 1.75%；华侨永亨 1.75%」 | 「大西洋银行 **1.90%**；工银澳门 1.95%；大丰 1.95%；国际银行 1.75%；华侨永亨 1.75%」 | 官方 `BNU_PricingList_CN.pdf` 2026-10 版第 18 页：Visa/MC/Amex 金卡 = **1.90%**。`smartcardmacao.com` 2026-10-26 版也已更新为 1.9%，旧版 1.75% 已过时 |

> 这是本次核查中**唯一一处需要回改架构文档的实质错误**。因为架构文档的表格会成为 `defaultFxTable.ts` 的数据源，1.75% 与 1.90% 相差 0.15%，虽不至于让推荐反向，但会让所有 BNU 卡的净回报系统性偏高 0.15%。

### 另有 2 项建议（非错误，是模型表达力不足）

| # | 建议 | 理由 |
|---|---|---|
| 2 | `FxFeeRule` 增加可选的 `splitRates?: { foreign: number; crossBorder: number }` | BCM 的「外币 0.5% + 跨域 1.0%」双档结构，用单值 `rate` 只能存合计上限，无法区分 MOP 结算与 HKD 结算两条路径。而这正是产品核心场景 |
| 3 | `CapDefinition.period` 增加 `'year'` / `'half-year'` | EarnMORE 的上限按年（或每半年）计，当前只有 `'month'`，只能用折算近似，造成口径失真 |

---

## 8. 数据层面最大风险（按严重度）

1. **19 张卡的返现侧是空白**（10 low + 2 unknown + 部分 medium 卡）。如果产品上线时卡库只有这 38 张，且全部按"可推荐"处理，用户会看到大量"净回报 0 或负"的结论——**这不是卡不好，是我们不知道**。必须在 UI 上把"数据不足"和"确实不划算"区分开，否则用户会流失，且流失原因是误解。

2. **3 张卡的 0% 手续费在 2026-12-31 到期**（中银澳门 ×2、中银香港 Chill 的返现）。距今仅 2 个月。如果架构侧不为 `validUntil` 做倒计时警示，2027 年 1 月 1 日起工具会开始给错误答案，且用户无法察觉。

3. **立桥卡已过期 4 个月仍被列为 0%**。这是当前卡库里唯一一个"已知可能错误"的数据点。建议：要么按行业值 1.9% 保守计算并标注，要么直接从 MVP 卡库剔除。我倾向后者——**MVP 不需要一张 0.5% 回赠的卡**。

4. **上限口径建模失真**。多张卡的"名义回赠"远高于"实际可得"（中银香港 Chill 名义 10%、月上限仅 HK$150；大丰 5%、月上限 MOP 100；WeWa 4%、月上限 HK$200）。如果引擎按费率算而不按上限截断，会把这几张卡排到不该有的高位。**§3.3 的 CapPool 机制必须实现，否则宁可不上这几张卡。**

5. **须手动登记的卡（东亚、Cheers、DBS）不登记就等于 0**。这是"用户不知道自己没达标"的典型场景，工具如果不提示，用户会拿着 5% 的期望去刷，实际拿 0.4%。

---

## 9. 建议的 MVP 卡库（从 38 张中精选 12 张）

如果 MVP 需要控制规模，建议只用以下 12 张——它们覆盖了所有关键对比维度，且数据可靠度都在 medium 以上：

| 场景价值 | 卡 | confidence |
|---|---|---|
| 港卡在澳门 MOP 最优 | 汇丰 PULSE 银联双币（0%） | medium |
| 澳门本地移动支付最优 | 大丰银联双币钻石（5%，月上限 MOP 100） | high |
| 澳门卡海外最优 | BNU World MC（1.2%，无上限） | high |
| 港卡本地统一返现 | 渣打 Simply Cash（1.5% / 外币 2%） | high |
| 港卡海外 0% 手续费 | 渣打 Smart（1.2% 无上限） | medium |
| 港卡无脑高返现 | EarnMORE 银联（2%，但有上限争议） | low |
| 积分卡代表（可算准） | 恒生 enJoy（yuu 兑换率固定） | high |
| 港卡高返现 + 低上限陷阱 | 中银香港 Chill（10% / 上限 HK$150） | medium |
| 门槛型代表 | 东亚 World MC（5%，需月签 4 千 + 登记） | medium |
| 外币费最高档代表 | Amex Explorer（2%，CBF 0%） | high |
| 澳门卡 0% 但返现未知 | MIB 大湾区白金（0%，一卡三币） | medium |
| 反例（0% 但低回赠） | 工银澳门（0.5% 积分） | medium |

这 12 张能跑通全部推荐逻辑分支：0% vs 1.95% vs 2% 的手续费对比、有上限 vs 无上限、有门槛 vs 无门槛、现金 vs 积分。

---

## 10. 自验记录

| 检查项 | 结果 |
|---|---|
| `python3 -m json.tool cards-hk-mo.json` | **PASS** |
| JSON 数组长度 | 38（MO 17 / HK 21） |
| 必填字段完整性（16 项逐卡检查） | **0 错误** |
| `fxFee.rate` 缺失或 `fxFee.source.url` 缺失 | 0 |
| `categories` 七类别齐全 | 38/38 |
| `kind: unknown` 却带 `rate` 值 | 0 |
| `kind != unknown` 却无 `rate`/`multiplier` | 0 |
| `capId` 前缀与 `cardId` 一致 | 0 错误 |
| 空 `source` 数组 | 0 |
| 重复 `cardId` | 0 |
| emoji 扫描 | **none** |
| `verifiedAt` 全为 `2026-10-31` | 38/38 |

---

*本报告所有费率均可通过第 5 节链接追溯。凡未能追溯的数字，JSON 中为 `null` 或 `unknown`，本报告中已逐条列出。*
