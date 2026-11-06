# ADR-015: 更新可见性 —— 用户必须能决定「什么时候换版本」

## Status
Accepted (2026-11-06)

## Background

ADR-014 解决了「补好的卡库数据怎么送到老用户手上」，但紧接着暴露了
同一个链条上的第二个断点：

`vite.config.ts` 设 `registerType: 'prompt'`（有意为之 —— 卡库是用户手改的
数据，静默换版本会把正在编辑的表单清空），`registerServiceWorker.ts` 也
老实处理了 `onNeedRefresh`，把「应用更新」的动作存进 `pendingApply`。

**但 `listenForUpdate` 从来没有被任何 UI 调用过。**

于是整条链路是：SW 发现新版本 → 下载进 waiting → 回调触发 → 动作被存进一个
没人读的变量 → 用户什么也看不到。等待中的新版本只有在用户**完全关闭应用
再打开**（所有客户端销毁）时才会 activate。

上线实测确认了这个状态：线上 `index-BKp7uBvo.js` 里 `onNeedRefresh` 出现
1 次，`新版本已就绪` 出现 0 次。

这不是「体验不够好」，是**功能不存在**：更新机制装了，出厂的却是没有
提示面的半截链路。

## Decision

三层拆分，把「能不能测」当作设计约束：

| 层 | 文件 | 职责 | 可测性 |
|----|------|------|--------|
| 信号总线 | `src/platform/updateSignal.ts` | 暂存 + 补发，纯逻辑 | ✅ 6 用例 |
| SW 注册 | `src/platform/registerServiceWorker.ts` | 把 SW 回调翻译成一次 notify | 不可测（import 虚拟模块）|
| 提示 UI | `src/components/common/UpdateBanner.tsx` | 受控视图 + 订阅容器 | ✅ 4 用例 |

**为什么把时序逻辑挪出 `registerServiceWorker.ts`**：它 `import
'virtual:pwa-register'`，这个模块只在 vite 构建期存在，vitest（node 环境）
里根本没有。把唯一容易写错的「先到先存」逻辑留在那儿，等于永远没有测试
能覆盖它 —— 而它出错的形态正是这次这个 bug：事件丢了，无人察觉。

**为什么提示条常驻而非 Toast**：Toast 2.5s 自散。用会自动消失的提示传达
需要用户选择的事，等于把选择权也一起消失。

**为什么不用整屏弹窗**：「稍后」是合法选择。一个不该拦截付款流程的通知
没有资格挡住用户下一步。

**为什么补 `visibilitychange` 检查**：手机上「切回应用」比「等满一小时
interval」常见得多，且后台 interval 会被系统节流。不补这条，用户可能
整天收不到提示。

## Consequences

- 新版起，检测到更新会弹条，用户点「立即更新」才 reload。
- **老版本无法自愈**：旧 bundle 里没有提示 UI，装了就一直是那个半截链路。
  唯一的升级路径是「完全关闭应用再打开」（waiting SW 在客户端全关后
  activate）。这条路径不需要清站点数据，因此不会碰 IndexedDB（卡库安全）。
- 文案必须写明「卡库与设置都在这台手机上，不会丢」，并有测试钉住这句话。
  删掉它，提示就从「让人放心地更新」变成「让人不敢更新」。

## Related
- ADR-014（卡库版本同步）—— 同一条「数据要能到用户手上」的链条
- `documents/decisions/OPEN-DECISIONS.md`：强制更新（跳过 waiting）暂不引入
