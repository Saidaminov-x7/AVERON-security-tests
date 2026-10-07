import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDocument } from 'yaml';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const workflowDirectory = path.join(root, '.github/workflows');

test('every GitHub Actions workflow is valid YAML with unique keys and a jobs map', async () => {
  const files = (await readdir(workflowDirectory)).filter((name) => /\.(?:yml|yaml)$/.test(name));
  assert.ok(files.length > 0);

  for (const filename of files) {
    const source = await readFile(path.join(workflowDirectory, filename), 'utf8');
    const document = parseDocument(source, { uniqueKeys: true, version: '1.2' });
    assert.deepEqual(document.errors, [], `${filename} must parse without YAML errors`);
    const workflow = document.toJS();
    assert.ok(workflow.on, `${filename} is missing workflow triggers`);
    assert.ok(workflow.jobs && typeof workflow.jobs === 'object', `${filename} is missing jobs`);
  }
});
