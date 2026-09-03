/** 各类 AI 工具页共用的 prompt 装配与输入约束 */

/** 与 TextArea 的 maxLength 共用，超长文本会直接撑爆上下文窗口 */
export const MAX_INPUT_CHARS = 12000;

/**
 * 用带函数的 replace 做单趟替换：
 * 传字符串时 replace 只替换第一处，且替换串里的 `$&`、`$1` 会被当成特殊模式，
 * 用户文本或题录里出现 `$` 就会拼出错乱的 prompt；
 * 单趟扫描也保证用户内容里万一含 `{style}` 这类字面量不会被二次替换。
 * 未在 vars 中的占位符原样保留，让装配漏洞暴露出来而不是静默变成空串。
 */
export function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : match,
  );
}

export interface PromptRequest {
  system: string;
  user: string;
}
