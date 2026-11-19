import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  matchingMaterials,
  readyRecordings,
  normalizeSearch,
  hasLibraryFilters,
} from '../web/library.js';

const material = (id, extra = {}) => ({
  id,
  title: 'Delivery contract',
  text: 'We need two more weeks.',
  tags: ['商务'],
  created_at: `2026-01-0${id}`,
  owned: true,
  language: 'a',
  ...extra,
});
const defaults = { status: 'all', sort: 'new', query: '', scope: '', language: '', kind: '' };

test('search accepts multiple terms across fields and full-width Latin input', () => {
  const rows = [
    material('1'),
    material('2', { title: 'Coffee', text: 'One cup, please.', tags: ['日常'] }),
  ];
  assert.equal(normalizeSearch('  ＣＯＮＴＲＡＣＴ　 Two  '), 'contract two');
  assert.deepEqual(
    matchingMaterials(rows, new Map(), { ...defaults, query: ' 商务　ＣＯＮＴＲＡＣＴ two ' }).map(
      (x) => x.id
    ),
    ['1']
  );
  assert.equal(
    matchingMaterials(rows, new Map(), { ...defaults, query: 'coffee weeks' }).length,
    0
  );
});

test('readiness uses the latest complete full recording, excluding previews and failed work', () => {
  const latest = { id: 'latest', material_id: '1', kind: 'full', status: 'completed' };
  const rows = [
    { id: 'preview', material_id: '1', kind: 'preview', status: 'completed' },
    latest,
    { id: 'old', material_id: '1', kind: 'full', status: 'completed' },
    { id: 'failed', material_id: '2', kind: 'full', status: 'failed' },
  ];
  const ready = readyRecordings(rows);
  assert.equal(ready.get('1'), latest);
  assert.equal(ready.has('2'), false);
  assert.deepEqual(
    matchingMaterials([material('1'), material('2')], ready, { ...defaults, status: 'draft' }).map(
      (x) => x.id
    ),
    ['2']
  );
});

test('language, ownership, sharing, favorites and archive scopes compose correctly', () => {
  const rows = [
    material('1'),
    material('2', { owned: false, visibility: 'shared', favorite: true }),
    material('3', { archived: true }),
    material('4', { language: 'z', turns: [{ speaker: 'A', text: '你好' }] }),
  ];
  assert.deepEqual(
    matchingMaterials(rows, new Map(), { ...defaults, scope: 'mine' }).map((x) => x.id),
    ['4', '1']
  );
  assert.deepEqual(
    matchingMaterials(rows, new Map(), { ...defaults, scope: 'shared' }).map((x) => x.id),
    ['2']
  );
  assert.deepEqual(
    matchingMaterials(rows, new Map(), { ...defaults, scope: 'archived' }).map((x) => x.id),
    ['3']
  );
  assert.deepEqual(
    matchingMaterials(rows, new Map(), { ...defaults, kind: 'dialogue', language: 'z' }).map(
      (x) => x.id
    ),
    ['4']
  );
  assert.equal(hasLibraryFilters({ ...defaults, scope: 'favorite' }), true);
  assert.equal(hasLibraryFilters(defaults), false);
});

test('editing a cached title, text or tags immediately changes search matches', () => {
  const row = material('1');
  assert.equal(matchingMaterials([row], new Map(), { ...defaults, query: 'contract' }).length, 1);
  row.title = 'A meeting';
  row.text = 'Schedule';
  row.tags = ['准备'];
  assert.equal(matchingMaterials([row], new Map(), { ...defaults, query: 'contract' }).length, 0);
  assert.equal(
    matchingMaterials([row], new Map(), { ...defaults, query: '准备 meeting' }).length,
    1
  );
});
