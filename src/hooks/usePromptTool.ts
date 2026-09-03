'use client';

import { useState } from 'react';
import { chat } from '@/lib/llm';
import type { PromptRequest } from '@/lib/prompt';
import type { Settings } from '@/types';

export interface PromptTool<M extends string> {
  mode: M;
  setMode: (mode: M) => void;
  /** 当前模式的结果 */
  result: string;
  results: Record<M, string>;
  /** 正在生成的模式；生成中允许切走看别的模式，故不等于「当前模式在生成」 */
  activeGen: M | null;
  generating: boolean;
  error: string;
  clearError: () => void;
  /** 成功返回完整文本，失败返回 null（错误已写入 error） */
  run: (request: PromptRequest, temperature: number) => Promise<string | null>;
}

/**
 * 润色/对比/代码/邮件这些工具页共用同一套状态机：每种模式各存一份结果、
 * 流式增量写回发起时的模式、失败时不能把上一次的成功结果一起清掉。
 * 最后一条是阶段4 实测出来的坑——结果不落库时，清空后再失败等于用户白等一次。
 */
export function usePromptTool<M extends string>(
  modes: readonly M[],
  llm: Settings['llm'],
): PromptTool<M> {
  const [mode, setModeState] = useState<M>(modes[0]);
  const [results, setResults] = useState<Record<M, string>>(() => {
    const initial = {} as Record<M, string>;
    for (const m of modes) initial[m] = '';
    return initial;
  });
  const [activeGen, setActiveGen] = useState<M | null>(null);
  const [error, setError] = useState('');

  const setMode = (next: M) => {
    setModeState(next);
    setError('');
  };

  const run = async (request: PromptRequest, temperature: number): Promise<string | null> => {
    if (activeGen !== null) return null;
    // 生成过程中切到别的模式，增量仍写回发起时那个模式的槽位
    const target = mode;
    const previous = results[target];
    setActiveGen(target);
    setError('');
    setResults((prev) => ({ ...prev, [target]: '' }));
    try {
      const full = await chat(llm, {
        messages: [
          { role: 'system', content: request.system },
          { role: 'user', content: request.user },
        ],
        temperature,
        onDelta: (delta) =>
          setResults((prev) => ({ ...prev, [target]: prev[target] + delta })),
      });
      setResults((prev) => ({ ...prev, [target]: full }));
      return full;
    } catch (e) {
      setError((e as Error).message);
      // 结果不落库，失败时若沿用清空后的空槽，上一次的成功输出会连带丢失
      setResults((prev) => ({ ...prev, [target]: previous }));
      return null;
    } finally {
      setActiveGen(null);
    }
  };

  return {
    mode,
    setMode,
    result: results[mode],
    results,
    activeGen,
    generating: activeGen !== null,
    error,
    clearError: () => setError(''),
    run,
  };
}
