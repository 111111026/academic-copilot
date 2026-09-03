function legacyCopy(text: string): boolean {
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  // 固定在视口外，否则 iOS Safari 会因聚焦而滚动页面并放大字号
  area.style.position = 'fixed';
  area.style.top = '-1000px';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  area.remove();
  return ok;
}

/**
 * 方案要求可部署到任意静态服务器，http 环境下 navigator.clipboard 根本不存在，
 * 所以必须保留 execCommand 兜底，否则「复制结果」在自建部署上直接失效。
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // 权限被拒或页面失焦时落到兜底路径
  }
  return legacyCopy(text);
}
