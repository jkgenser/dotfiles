import { pathToFileURL } from 'node:url';

const ENDPOINT = 'https://api.linear.app/graphql';
const TEAM_KEY = 'OLE';
const WORKSPACE = 'olerhealth';

async function request(query, variables = {}) {
  const key = process.env.LINEAR_API_KEY;
  if (!key) throw new Error('LINEAR_API_KEY is missing. Run through your interactive zsh; never print or read the secret into agent context.');
  let response;
  try {
    response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { Authorization: key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(30000),
    });
  } catch {
    throw new Error('Linear request failed or timed out. If creating an issue, outcome is unknown: check Linear before retrying.');
  }
  // Do not dump raw responses or request headers into agent context.
  if (!response.ok) throw new Error(`Linear HTTP ${response.status}. Check permissions/rate limits. Do not blindly retry creation.`);
  let body;
  try { body = await response.json(); }
  catch { throw new Error('Invalid Linear response. Check Linear before retrying creation.'); }
  if (body.errors?.length || !body.data) {
    throw new Error('Linear returned GraphQL errors. Check input and key permissions; verify whether an issue was created before retrying.');
  }
  return body.data;
}

async function readInput() {
  let text = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) text += chunk;
  return text;
}

export async function execute(args, { api = request, input = readInput } = {}) {
  const [command, ...rest] = args;
  if (!command || command === 'help' || command === '--help') {
    return { usage: ['linear.mjs team', 'linear.mjs search <title keywords>', 'linear.mjs create < issue.json'], team: TEAM_KEY, workspace: WORKSPACE };
  }
  if (!['team', 'search', 'create'].includes(command)) throw new Error('Unknown command. Use --help.');
  if (command !== 'search' && rest.length) throw new Error('Unexpected arguments. Create accepts JSON on stdin, not command-line fields.');
  const term = rest.join(' ').trim();
  if (command === 'search' && !term) throw new Error('Search requires title keywords.');
  let payload;
  if (command === 'create') {
    try { payload = JSON.parse(await input()); }
    catch { throw new Error('Expected an issue JSON object on stdin.'); }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Expected an issue JSON object.');
    const allowed = ['title', 'description'];
    if (Object.keys(payload).some(k => !allowed.includes(k))) throw new Error('Supported fields: title, description. Team is fixed to OLE; other metadata is not supported yet.');
    if (typeof payload.title !== 'string' || !payload.title.trim()) throw new Error('A nonempty title is required.');
    if (payload.description !== undefined && typeof payload.description !== 'string') throw new Error('Description must be a Markdown string.');
    payload.title = payload.title.trim();
  }
  const context = await api(`query SkillTeam($key: String!) {
    organization { name urlKey }
    teams(filter: { key: { eq: $key } }) { nodes { id key name } }
  }`, { key: TEAM_KEY });
  if (context.organization?.urlKey !== WORKSPACE) throw new Error('Wrong Linear workspace: expected olerhealth. No issue was created.');
  const teams = context.teams?.nodes ?? [];
  if (teams.length !== 1) throw new Error('Could not uniquely resolve OLE. Check team access.');
  const team = teams[0];
  if (command === 'team') return { workspace: context.organization, team };
  if (command === 'search') {
    const result = await api(`query SkillSearch($teamId: ID!, $term: String!) {
      issues(first: 25, filter: { team: { id: { eq: $teamId } }, title: { containsIgnoreCase: $term } }) {
        nodes { identifier title url state { name } }
        pageInfo { hasNextPage }
      }
    }`, { teamId: team.id, term });
    return { ...result.issues, note: 'Title substring matches only; not a comprehensive duplicate check. Refine keywords if needed.' };
  }
  const result = await api(`mutation SkillCreate($input: IssueCreateInput!) {
    issueCreate(input: $input) { success issue { id identifier title url } }
  }`, { input: { ...payload, teamId: team.id } });
  if (!result.issueCreate?.success || !result.issueCreate.issue) throw new Error('Creation not confirmed. Check Linear before retrying.');
  return result.issueCreate.issue;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  execute(process.argv.slice(2)).then(
    result => console.log(JSON.stringify(result, null, 2)),
    error => { console.error(error.message); process.exitCode = 1; },
  );
}
