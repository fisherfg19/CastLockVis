import { useEffect, useState } from 'react';

/**
 * 脚手架冒烟测试（S0）。
 * 仅验证三件事：React 渲染正常、CSS token 生效、`public/data/*.json` 在
 * Vite base 路径下可达。真正的布局壳与四视图见 TODO 的 S1+（届时替换本文件）。
 */
export function App() {
  const [status, setStatus] = useState('加载中…');

  useEffect(() => {
    const url = `${import.meta.env.BASE_URL}data/genres.json`;
    fetch(url)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((genres: string[]) => setStatus(`✅ 数据契约可达：genres.json 含 ${genres.length} 个类型`))
      .catch((e: unknown) => setStatus(`❌ 数据加载失败：${String(e)}`));
  }, []);

  return (
    <main style={{ padding: 'var(--space-8)' }}>
      <h1 style={{ fontSize: 'var(--fs-lg)' }}>CastLock-Vis</h1>
      <p style={{ color: 'var(--color-text-dim)' }}>
        开发环境就绪 · 演员类型锁定与转型窗口期可视分析系统
      </p>
      <p>{status}</p>
    </main>
  );
}
