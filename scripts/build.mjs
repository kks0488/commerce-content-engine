// Explicit public-file allowlist: never publish .env, tests, CLI or internal files.
import { cp, mkdir } from 'node:fs/promises';
await mkdir('out', { recursive: true });
for (const file of ['index.html', 'app.js', 'tournament.js', 'styles.css', 'src', 'assets']) await cp(file, `out/${file}`, { recursive: true });
