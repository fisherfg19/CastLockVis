import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages 子路径：部署到 https://<user>.github.io/<repo>/ 时必须设置 base。
// 本地开发 base 取 '/' 即可；通过环境变量切换，避免改代码。
// 部署仓库名若不是 CastLockVis，改这里或设 VITE_BASE。
const base = process.env.VITE_BASE ?? '/CastLockVis/';

export default defineConfig({
  base,
  plugins: [react()],
  build: {
    outDir: 'dist',
    // public/data/*.json 会被原样拷贝进 dist/data/，无需运行时服务
    assetsInlineLimit: 0,
  },
});
