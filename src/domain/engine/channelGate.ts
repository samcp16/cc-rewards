/**
 * 渠道门控：把「本轨道的渠道适用域」变成候选级结论（ADR-010）。
 *
 * 为什么单独成文件而不写进 earn.ts：earn.ts 已接近 300 行门禁，且「渠道是否适用」
 * 与「这一笔值多少」是两个判断 —— 前者决定有没有候选，后者决定候选值多少。
 * 混在一个函数里会让 earn.ts 同时承担筛选与估值，两者的测试也无法分别变异验证。
 *
 * 语义是筛选，不是加成：
 * - 适用   → 轨道进候选，照常估值
 * - 不适用 → 轨道**被移除**，不参与排他组比较（不是「值 0」）
 *
 * 「值 0」为什么会错：0 值会进排他组并可能被取用，于是用户看到「这张卡这笔不赚钱」，
 * 而事实是「这张卡这笔的费率我们不知道」。前者的用户动作是换卡，后者是换渠道。
 */

import type { EarnTrack, PaymentChannel } from '../types';

/** 轨道是否适用于该渠道。缺省 scope = 全渠道适用（既有卡库语义不变）。 */
export function trackAppliesToChannel(track: EarnTrack, channel: PaymentChannel): boolean {
  return track.channelScope === undefined || track.channelScope.includes(channel);
}

/** 卡在该渠道下的可用轨道。空数组 = 全部轨道都被渠道挡掉。 */
export function filterByChannel(tracks: EarnTrack[], channel: PaymentChannel): EarnTrack[] {
  return tracks.filter((t) => trackAppliesToChannel(t, channel));
}
