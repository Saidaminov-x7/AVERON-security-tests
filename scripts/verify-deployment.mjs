import { readFile, writeFile } from 'node:fs/promises';

const expectedShas = {
  backend: process.env.EXPECTED_BACKEND_SHA?.toLowerCase(),
  storefront: process.env.EXPECTED_STOREFRONT_SHA?.toLowerCase(),
  admin: process.env.EXPECTED_ADMIN_SHA?.toLowerCase(),
};
const environment = process.env.DEPLOYMENT_ENVIRONMENT;
const mode = process.env.VERIFICATION_MODE;
const outputPath = process.env.AVERON_MANIFEST_PATH;

for (const service of ['backend', 'storefront', 'admin']) {
  expectedShas[service] = expectedShas[service]?.toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(expectedShas[service] ?? '')) throw new Error(`EXPECTED_SHAS.${service} must be a full 40-character Git SHA.`);
}
if (!['staging', 'production'].includes(environment ?? '')) throw new Error('DEPLOYMENT_ENVIRONMENT must be staging or production.');
if (!['deployment', 'rollback'].includes(mode ?? '')) throw new Error('VERIFICATION_MODE must be deployment or rollback.');
if (!outputPath) throw new Error('AVERON_MANIFEST_PATH is required.');

const checks = [];
function requireHttps(raw, label) {
  const url = new URL(raw ?? '');
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error(`${label} must be an HTTPS URL without embedded credentials.`);
  return url;
}

async function getJson(url, label) {
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000), headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' } });
  if (!response.ok) throw new Error(`${label} returned HTTP ${response.status}.`);
  return response.json();
}

async function checkRuntime(name, rawUrl, endpoint, expectedSha, { health } = {}) {
  const base = requireHttps(rawUrl, name);
  const payload = await getJson(new URL(endpoint, base), `${name} ${endpoint}`);
  if (health && !health(payload)) throw new Error(`${name} health response is not healthy.`);
  if (payload.commit !== expectedSha) throw new Error(`${name} runtime commit mismatch: expected ${expectedSha}, received ${payload.commit ?? 'missing'}.`);
  checks.push({ name, status: 'PASS', commit: payload.commit });
}

try {
  const backend = requireHttps(process.env.BACKEND_URL, 'BACKEND_URL');
  const health = await getJson(new URL('/health', backend), 'Backend readiness');
  if (health.status !== 'ok' || health.db !== 'up' || health.redis !== 'up') throw new Error('Backend readiness requires status=ok, db=up and redis=up.');
  const live = await getJson(new URL('/health/live', backend), 'Backend liveness');
  if (live.status !== 'live' || live.commit !== expectedShas.backend) throw new Error(`Backend runtime commit/liveness mismatch: expected ${expectedShas.backend}, received ${live.commit ?? 'missing'}.`);
  checks.push({ name: 'backend', status: 'PASS', commit: live.commit, database: health.db, redis: health.redis });

  await checkRuntime('storefront', process.env.STOREFRONT_URL, '/api/release', expectedShas.storefront);
  await checkRuntime('admin', process.env.ADMIN_URL, '/release.json', expectedShas.admin);

  if (environment === 'production') {
    const stagingPath = process.env.STAGING_MANIFEST_PATH;
    if (!stagingPath) throw new Error('A successful staging verification artifact is required before production verification.');
    const staging = JSON.parse(await readFile(stagingPath, 'utf8'));
    if (staging.environment !== 'staging' || JSON.stringify(staging.expectedShas) !== JSON.stringify(expectedShas) || staging.passed !== true || staging.mode !== 'deployment') {
      throw new Error('Staging verification artifact is missing, failed, has the wrong SHA, or is not a deployment verification.');
    }
    checks.push({ name: 'staging-promotion-gate', status: 'PASS', runId: staging.workflow?.runId ?? null, commits: expectedShas });
  }

  const manifest = {
    schemaVersion: 1,
    kind: 'averon-runtime-deployment-verification',
    createdAt: new Date().toISOString(),
    expectedShas,
    environment,
    mode,
    passed: true,
    checks,
    workflow: {
      repository: process.env.GITHUB_REPOSITORY ?? null,
      runId: process.env.GITHUB_RUN_ID ?? null,
      runAttempt: process.env.GITHUB_RUN_ATTEMPT ?? null,
    },
  };
  await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(manifest, null, 2));
} catch (error) {
  const manifest = {
    schemaVersion: 1,
    kind: 'averon-runtime-deployment-verification',
    createdAt: new Date().toISOString(),
    expectedShas,
    environment,
    mode,
    passed: false,
    checks,
    failure: error instanceof Error ? error.message : 'Unknown verification failure',
    workflow: {
      repository: process.env.GITHUB_REPOSITORY ?? null,
      runId: process.env.GITHUB_RUN_ID ?? null,
      runAttempt: process.env.GITHUB_RUN_ATTEMPT ?? null,
    },
  };
  await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  console.error(manifest.failure);
  process.exitCode = 1;
}
