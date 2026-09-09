import test from 'node:test';
import assert from 'node:assert/strict';
import { execute } from './linear.mjs';

const context = { organization: { name: 'Oler Health', urlKey: 'olerhealth' }, teams: { nodes: [{ id: 'team-id', key: 'OLE', name: 'OLE' }] } };

test('help needs no credentials', async () => {
  assert.equal((await execute(['--help'])).team, 'OLE');
});

test('creation resolves team and returns confirmed issue', async () => {
  const calls = [];
  const issue = { identifier: 'OLE-123', url: 'https://linear.app/olerhealth/issue/OLE-123' };
  const result = await execute(['create'], {
    input: async () => JSON.stringify({ title: ' Test ', description: 'Markdown\n"quoted" $text' }),
    api: async (query, variables) => {
      calls.push({ query, variables });
      return calls.length === 1 ? context : { issueCreate: { success: true, issue } };
    },
  });
  assert.deepEqual(result, issue);
  assert.deepEqual(calls[1].variables.input, { title: 'Test', description: 'Markdown\n"quoted" $text', teamId: 'team-id' });
});

test('invalid payloads fail before network access', async () => {
  for (const payload of ['null', '[]', '{}', '{"title":" "}', '{"title":"ok","teamId":"other"}', '{"title":"ok","description":3}', 'not json']) {
    await assert.rejects(execute(['create'], { input: async () => payload, api: async () => assert.fail('Network must not be called') }));
  }
});

test('wrong workspace cannot create', async () => {
  let calls = 0;
  await assert.rejects(execute(['create'], {
    input: async () => '{"title":"Test"}',
    api: async () => { calls++; return { ...context, organization: { urlKey: 'other' } }; },
  }), /Wrong Linear workspace/);
  assert.equal(calls, 1);
});

test('search is scoped to resolved team', async () => {
  let calls = 0;
  const issues = { nodes: [], pageInfo: { hasNextPage: false } };
  const result = await execute(['search', 'login'], { api: async (query, variables) => {
    if (++calls === 1) return context;
    assert.deepEqual(variables, { teamId: 'team-id', term: 'login' });
    return { issues };
  } });
  assert.deepEqual(result.nodes, []);
});

test('failed creation is not retried', async () => {
  let calls = 0;
  await assert.rejects(execute(['create'], {
    input: async () => '{"title":"Test"}',
    api: async () => ++calls === 1 ? context : { issueCreate: { success: false } },
  }), /not confirmed/);
  assert.equal(calls, 2);
});
