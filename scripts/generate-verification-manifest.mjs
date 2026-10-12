import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const output = process.env.AVERON_MANIFEST_PATH;
if (!output) throw new Error('AVERON_MANIFEST_PATH is required');

function git(repositoryPath, ...args) {
  try {
    return execFileSync('git', ['-C', repositoryPath, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

const repositories = [
  ['AVERON_backend', 'backend'],
  ['AVERON_frontend', 'frontend'],
  ['AVERON_admin_panel', 'admin'],
  ['AVERON_parser', 'parser'],
  ['AVERON_security_tests', '.'],
];

const sources = repositories.map(([name, folder]) => {
  const repositoryPath = folder === '.' ? root : path.join(root, 'source-checkouts', folder);
  const sha = git(repositoryPath, 'rev-parse', 'HEAD');
  return {
    name,
    commit: sha,
    branch: git(repositoryPath, 'branch', '--show-current'),
    state: sha ? 'CHECKED_OUT' : 'NOT_CHECKED_OUT',
  };
});

const manifest = {
  schemaVersion: 1,
  kind: 'averon-cross-repository-verification',
  createdAt: new Date().toISOString(),
  workflow: {
    repository: process.env.GITHUB_REPOSITORY ?? null,
    runId: process.env.GITHUB_RUN_ID ?? null,
    runAttempt: process.env.GITHUB_RUN_ATTEMPT ?? null,
    status: process.env.AVERON_VERIFICATION_STATUS ?? 'unknown',
  },
  sources,
  release: {
    deployed: false,
    deploymentShaVerified: false,
    stagingHealthVerified: false,
    productionHealthVerified: false,
    rollbackVerified: false,
    decision: 'NOT_RELEASED',
  },
};

await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
