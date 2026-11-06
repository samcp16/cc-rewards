/**
 * 路由装配 —— 只做组装，不含业务逻辑。
 *
 * 五个路由（SPEC §7 锁定）：
 *   /            算一笔（主查询页，打开即用）
 *   /cards       我的卡（卡库管理 + 额度，两 tab）
 *   /cards/new   模板选择器（新建卡）
 *   /cards/:id   卡详情 / 编辑
 *   /settings    设置
 *
 * 额度为什么并在 /cards 内部做 tab 而不独立成路由：
 * 额度是「这张卡的额度」的聚合视图，跟卡库是同一份数据的两面。
 * 独立成一级 tab 会让底部导航变成 4 项，而设计师的结论是
 * 「8 张卡的用户用 3 项导航最省认知」（MASTER §7.1）。
 * 但保留 /cards/limits 深链，供答案卡「额度快用尽」跳转直达。
 */

import { Navigate, Route, Routes } from 'react-router-dom';
import { ToastHost } from './components/common/Toast';
import { UpdateBanner } from './components/common/UpdateBanner';
import { CardDetailPage } from './pages/CardDetailPage';
import { CardsPage } from './pages/CardsPage';
import { DecidePage } from './pages/DecidePage';
import { NewCardPage } from './pages/NewCardPage';
import { SettingsPage } from './pages/SettingsPage';

export function App(): React.JSX.Element {
  return (
    <>
      <Routes>
        <Route path="/" element={<DecidePage />} />
        <Route path="/cards" element={<CardsPage />} />
        <Route path="/cards/new" element={<NewCardPage />} />
        <Route path="/cards/limits" element={<CardsPage view="limits" />} />
        <Route path="/cards/:id" element={<CardDetailPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <ToastHost />
      {/* 新版本提示：放在 Routes 之外，任何页面都能收到（用户在设置页
          停留时也可能检测到更新）。z 层级与 Toast 同级，二者不会同时出现 */}
      <UpdateBanner />
    </>
  );
}
