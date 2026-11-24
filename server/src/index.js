import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { config, isLoopbackBind, isMockOnly } from './config.js';

if (!isMockOnly()) try { process.loadEnvFile(fileURLToPath(new URL('../../.env', import.meta.url))); } catch { /* no .env */ }
const { port, host, registryPath, localPath, shelfPath, mockOnly, allowedHosts } = config();
const app = await createApp({ mockOnly, registryPath, localPath, shelfPath, loopbackOnly: isLoopbackBind(host), allowedHosts });
app.listen(port, host, () => console.log(`[learning-hub] listening on http://${host}:${port}${mockOnly ? ' (MOCK_ONLY)' : ''}`));
