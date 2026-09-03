/** 触发浏览器下载。对比页导出表格、Skills 导出 Markdown / JSON 共用 */
export function downloadTextFile(filename: string, content: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: `${mime};charset=utf-8` }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // 同步 revoke 会在部分浏览器上中断尚未真正开始的下载
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** 本地时区的 YYYY-MM-DD。toISOString 是 UTC，东八区凌晨会导出成前一天的日期 */
export function localDateStamp(date = new Date()): string {
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}
