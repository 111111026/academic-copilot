/** @type {import('next').NextConfig} */
// trailingSlash 让导出产出 out/skills/run/index.html 而非 out/skills/run.html：
// 通用静态服务器不会把 /skills/run 自动解析到同名 .html，否则刷新即 404
const nextConfig = { output: 'export', trailingSlash: true };

export default nextConfig;
