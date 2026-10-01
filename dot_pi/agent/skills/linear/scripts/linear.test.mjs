import test from 'node:test';
import assert from 'node:assert/strict';
import { execute } from './linear.mjs';

const context = { organization: { name: 'Oler Health', urlKey: 'olerhealth' }, teams: { nodes: [{ id: 'team-id', key: 'OLE', name: 'OLE' }] } };
const projectUrl = 'https://linear.app/olerhealth/project/completion-mvp-5aeca2ae89c2/overview';
const project = {
  id: 'project-id', name: 'Completion MVP', slugId: '5aeca2ae89c2',
  url: projectUrl.replace('/overview', ''), teams: { nodes: context.teams.nodes },
};

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
  for (const payload of ['null', '[]', '{}', '{"title":" "}', '{"title":"ok","teamId":"other"}', '{"title":"ok","projectId":"guessed"}', '{"title":"ok","description":3}', '{"title":"ok","projectUrl":null}', '{"title":"ok","projectUrl":3}', 'not json']) {
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

test('project lookup verifies workspace/team without creating an issue', async () => {
  const calls = [];
  const result = await execute(['project', projectUrl], { api: async (query, variables) => {
    calls.push({ query, variables });
    return calls.length === 1 ? context : { project };
  } });
  assert.deepEqual(result, project);
  assert.deepEqual(calls[1].variables, { id: '5aeca2ae89c2' });
  assert.equal(calls.length, 2);
  assert.ok(calls.every(call => !call.query.includes('mutation')));
});

test('creation resolves the project URL to its UUID and confirms assignment', async () => {
  const calls = [];
  const issue = { identifier: 'OLE-123', url: 'https://linear.app/olerhealth/issue/OLE-123', project };
  const result = await execute(['create'], {
    input: async () => JSON.stringify({ title: ' Test ', projectUrl }),
    api: async (query, variables) => {
      calls.push({ query, variables });
      if (calls.length === 1) return context;
      if (calls.length === 2) return { project };
      return { issueCreate: { success: true, issue } };
    },
  });
  assert.deepEqual(result, issue);
  assert.equal(calls.length, 3);
  assert.deepEqual(calls[2].variables.input, { title: 'Test', teamId: 'team-id', projectId: 'project-id' });
});

test('invalid project URLs fail before any network request', async () => {
  for (const invalid of [
    '', 'not-a-url', projectUrl.replace('https:', 'http:'),
    projectUrl.replace('linear.app', 'example.com'),
    projectUrl.replace('olerhealth', 'other'),
    projectUrl.replace('project/', 'issue/'),
    projectUrl.replace('5aeca2ae89c2', 'guessed-id'),
    projectUrl.replace('linear.app', 'user:password@linear.app'),
  ]) {
    const api = async () => assert.fail('Network must not be called');
    await assert.rejects(execute(['project', invalid], { api }));
    await assert.rejects(execute(['create'], {
      input: async () => JSON.stringify({ title: 'Test', projectUrl: invalid }), api,
    }));
  }
});

test('unknown, mismatched, foreign-workspace, and non-OLE projects cannot create', async () => {
  for (const invalid of [
    null,
    { ...project, slugId: '000000000000' },
    { ...project, url: project.url.replace('olerhealth', 'other') },
    { ...project, teams: { nodes: [] } },
    { ...project, teams: { nodes: [{ id: 'other-id', key: 'OLE' }] } },
  ]) {
    let calls = 0;
    await assert.rejects(execute(['create'], {
      input: async () => JSON.stringify({ title: 'Test', projectUrl }),
      api: async (query) => {
        assert.ok(!query.includes('mutation'));
        return ++calls === 1 ? context : { project: invalid };
      },
    }));
    assert.equal(calls, 2);
  }
});

test('unconfirmed project assignment reports the created issue without retrying', async () => {
  let calls = 0;
  await assert.rejects(execute(['create'], {
    input: async () => JSON.stringify({ title: 'Test', projectUrl }),
    api: async () => {
      if (++calls === 1) return context;
      if (calls === 2) return { project };
      return { issueCreate: { success: true, issue: { identifier: 'OLE-123', url: 'https://linear.app/olerhealth/issue/OLE-123', project: null } } };
    },
  }), /Issue OLE-123 was created.*project assignment was not confirmed/);
  assert.equal(calls, 3);
});

test('creation errors with a project are not retried', async () => {
  let calls = 0;
  await assert.rejects(execute(['create'], {
    input: async () => JSON.stringify({ title: 'Test', projectUrl }),
    api: async () => {
      if (++calls === 1) return context;
      if (calls === 2) return { project };
      throw new Error('Timed out; outcome unknown');
    },
  }), /outcome unknown/);
  assert.equal(calls, 3);
});

test('failed creation is not retried', async () => {
  let calls = 0;
  await assert.rejects(execute(['create'], {
    input: async () => '{"title":"Test"}',
    api: async () => ++calls === 1 ? context : { issueCreate: { success: false } },
  }), /not confirmed/);
  assert.equal(calls, 2);
});
