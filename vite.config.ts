/// <reference types="vitest/config" />
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { toPublicContent } from './src/core/content.ts';
import type { Content } from './src/core/types.ts';

const contentPath = fileURLToPath(new URL('./content/content.json', import.meta.url));

/** Модуль virtual:public-content — только публичная часть content.json (без заданий и ответов). */
function publicContentPlugin(): Plugin {
  const id = 'virtual:public-content';
  return {
    name: 'public-content',
    resolveId: (s) => (s === id ? '\0' + id : null),
    load(s) {
      if (s !== '\0' + id) return null;
      this.addWatchFile(contentPath);
      const content = JSON.parse(readFileSync(contentPath, 'utf8')) as Content;
      return `export default ${JSON.stringify(toPublicContent(content))};`;
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // Боевой режим: заданы адрес и ключ Supabase. Тогда полный content.json в браузер НЕ попадает.
  const supabaseMode = !!(env.VITE_SUPABASE_URL && env.VITE_SUPABASE_ANON_KEY);
  return {
    base: env.BASE_PATH || './',
    plugins: [react(), publicContentPlugin()],
    resolve: {
      alias: {
        '@full-content': supabaseMode
          ? fileURLToPath(new URL('./src/api/noFullContent.ts', import.meta.url))
          : contentPath,
      },
    },
    test: {
      include: ['tests/**/*.test.ts'],
    },
  };
});
