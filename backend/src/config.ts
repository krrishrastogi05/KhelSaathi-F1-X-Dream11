// Settings from the environment. Everything has a local default; the LLM keys are optional (without them the app
// answers from the deterministic fallback and says so).
import path from 'node:path';

export interface Provider { url: string; key: string; model: string }

export function config() {
  const env = process.env, root = path.resolve(import.meta.dirname, '../..');
  const providers: Provider[] = ['', '2', '3']
    .map((i) => ({ url: env[`LLM${i}_BASE_URL`] ?? '', key: env[`LLM${i}_API_KEY`] ?? '', model: env[`LLM${i}_MODEL`] ?? '' }))
    .filter((p) => p.url && p.key && p.model);
  return {
    port: Number(env.PORT ?? 8797),
    root,
    dataDir: path.resolve(env.DATA_DIR ?? path.join(root, 'data')),
    distDir: path.join(root, 'dist'),
    /** optional public origin for the QR code, e.g. https://khel-saathi.onrender.com; otherwise the request host */
    publicUrl: (env.PUBLIC_URL ?? '').replace(/\/+$/, ''),
    /** origins allowed to call the API when the app is hosted apart from it (comma list, * for any) */
    allowOrigin: env.ALLOW_ORIGIN || '*',
    providers,
    llmTimeoutMs: Number(env.LLM_TIMEOUT_MS ?? 9000),
    tickMs: 250,
    sessionTtlMs: 24 * 3600_000,
  };
}
export type Config = ReturnType<typeof config>;
