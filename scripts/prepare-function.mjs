// Готовит серверную функцию к публикации: копирует игровую логику и content.json
// в supabase/functions/_shared. Запускается автоматически в GitHub Actions.
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const out = 'supabase/functions/_shared';
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync('src/core', `${out}/core`, { recursive: true });
const content = JSON.parse(readFileSync('content/content.json', 'utf8'));
writeFileSync(`${out}/content.ts`, `// Создано автоматически из content/content.json\nexport default ${JSON.stringify(content)};\n`);
console.log('Готово: supabase/functions/_shared');
