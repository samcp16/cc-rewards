/**
 * 构建信息。
 *
 * 为什么需要「构建时间」而不只是一个版本号：
 * 这个 app 装在手机上，用户没有任何办法判断自己跑的是哪一次发布。
 * 「有没有更新」于是变成一个只能靠猜的问题 —— 而它恰恰是用户会来问的事。
 * 显示到分钟的时间戳，让「我是不是新版」变成一次可核对的事实。
 *
 * 为什么用 define 注入而不是读 package.json：
 * version 要人手改，忘了改就会出现「代码是新版、版本号是旧的」。
 * 构建时间不可能忘记，它由构建机器当场写下。
 */

declare const __BUILD_STAMP__: string;

/** 形如 `2026-11-06 16:52`（UTC+8）。构建期由 vite.config.ts 写入。 */
export const BUILD_STAMP: string =
  // typeof 未定义标识符不会抛错，所以 vitest / 未经 define 的环境能安全拿到兜底值
  typeof __BUILD_STAMP__ === 'string' ? __BUILD_STAMP__ : '开发构建';

/** 面向用户的功能版本，随「有意义的发布」递增。 */
export const APP_VERSION = '1.3.0';
