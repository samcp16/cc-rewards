/**
 * 置信度标签（MASTER §3.9）。
 *
 * 核心设计原则：区分「这张卡不好」和「我们不知道」。这两件事在视觉上必须完全不同，
 * 所以本组件永远不返回收益语义色（pos/neg）。
 *
 * high / medium **不给徽章**。给徽章会让「正常」变成「值得一提」，
 * 全屏徽章 = 没有徽章。它们只在详情页以文字形式出现。
 */

import type { ConfidenceLevel } from '../../domain/types';
import { Badge } from './Badge';

interface ConfidenceTagProps {
  confidence: ConfidenceLevel;
  /** 'list' 列表内（only low/unknown 出标签）；'detail' 详情内（全部出文字） */
  mode?: 'list' | 'detail';
}

export function ConfidenceTag({ confidence, mode = 'list' }: ConfidenceTagProps): React.JSX.Element | null {
  if (confidence === 'low') {
    return <Badge tone="warn">待核对</Badge>;
  }
  if (confidence === 'unknown') {
    return <Badge tone="muted">未知</Badge>;
  }
  if (mode === 'list') {
    // high / medium / user_provided 在列表里什么都不显示
    return null;
  }
  if (confidence === 'user_provided') {
    return <Badge tone="info">你手动填的</Badge>;
  }
  return <Badge tone="neutral">{confidence === 'high' ? '已核实' : '已核实'}</Badge>;
}
