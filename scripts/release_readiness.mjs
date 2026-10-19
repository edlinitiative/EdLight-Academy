import fs from 'node:fs';
import path from 'node:path';
const root = process.cwd();
const contract = fs.readFileSync(
  path.join(
    root,
    'docs/design/2026-10-18-premium-product-release-readiness.md',
  ),
  'utf8',
);
const file = path.join(root, 'docs/design/release-readiness/candidate.json');
const requirements = [
  ...contract.matchAll(/^\| ((?:MAP|PUR|CON|PAR|TRU|PRE|E2E)-\d{2}) (.+)$/gm),
].map((m) => ({
  id: m[1],
  requirement: m[2].split('|')[1]?.trim() || m[2].split('|')[0].trim(),
}));
const scan = (dir) =>
  fs
    .readdirSync(path.join(root, dir), { withFileTypes: true })
    .flatMap((e) =>
      e.isDirectory()
        ? scan(`${dir}/${e.name}`)
        : /\.[jt]sx?$/.test(e.name)
          ? [`${dir}/${e.name}`]
          : [],
    );
const inventory = [];
for (const source of ['src/App.tsx', ...scan('mobile/src/navigation')]) {
  const content = fs.readFileSync(path.join(root, source), 'utf8');
  const declarations = [
    ...[...content.matchAll(/<Route\s+(?:path="([^"]+)"|index)/g)].map((m) => ({
      match: m,
      kind: 'web-route',
      destination: m[1] || '(index)',
    })),
    ...[
      ...content.matchAll(
        /<(?:Stack|Tab|Tabs|Navigator|NativeTabs|BottomTabs)\.Screen\s+name="([^"]+)"/g,
      ),
    ].map((m) => ({ match: m, kind: 'native-screen', destination: m[1] })),
  ];
  for (const item of declarations)
    inventory.push({
      source,
      line: content.slice(0, item.match.index).split('\n').length,
      kind: item.kind,
      destination: item.destination,
      owner: null,
      scenarioIds: [],
      statesReviewed: [],
      evidence: [],
    });
}
if (process.argv.includes('--init')) {
  if (fs.existsSync(file))
    throw new Error(
      'Candidate already exists; preserve its evidence and update deliberately.',
    );
  fs.writeFileSync(
    file,
    JSON.stringify(
      {
        target: 'Full planned release: core and A–D',
        decision: 'BLOCKED',
        owners: {
          release: null,
          engineering: null,
          design: null,
          qa: null,
          operations: null,
        },
        artifacts: {
          commit: null,
          website: null,
          api: null,
          rules: null,
          indexes: null,
          ios: null,
          android: null,
        },
        requirements: requirements.map((r) => ({
          ...r,
          status: 'Not implemented',
          owner: null,
          implementation: [],
          evidence: [],
          notes:
            'Coverage audit pending; this status does not assert that all existing functionality is absent.',
        })),
        inventory,
      },
      null,
      2,
    ) + '\n',
  );
}
const candidate = JSON.parse(fs.readFileSync(file, 'utf8'));
const errors = [];
const statuses = new Set([
  'Not implemented',
  'Implemented/unverified',
  'Failed',
  'Verified',
  'Outside frozen scope',
]);
const expected = new Set(requirements.map((r) => r.id)),
  seen = new Set();
for (const row of candidate.requirements) {
  if (!expected.has(row.id) || seen.has(row.id))
    errors.push(`Unknown/duplicate requirement ${row.id}`);
  seen.add(row.id);
  if (!statuses.has(row.status)) errors.push(`Invalid status ${row.id}`);
  if (row.status === 'Verified' && (!row.owner || !row.evidence.length))
    errors.push(`Missing owner/evidence for ${row.id}`);
  for (const evidence of row.evidence || []) {
    if (
      ![
        'commit',
        'build',
        'environment',
        'platform',
        'scenario',
        'expected',
        'observed',
        'link',
        'date',
      ].every((key) => evidence[key])
    )
      errors.push(`Incomplete evidence for ${row.id}`);
  }
  if (row.status === 'Outside frozen scope' && !row.scopeDecision)
    errors.push(`Missing scope decision ${row.id}`);
}
for (const id of expected)
  if (!seen.has(id)) errors.push(`Missing requirement ${id}`);
if (process.argv.includes('--inventory')) {
  const prior = new Map(
    (candidate.inventory || []).map((i) => [`${i.source}:${i.destination}`, i]),
  );
  candidate.inventory = inventory.map((i) => ({
    ...i,
    ...prior.get(`${i.source}:${i.destination}`),
    line: i.line,
  }));
  fs.writeFileSync(file, JSON.stringify(candidate, null, 2) + '\n');
}
for (const entry of inventory)
  if (
    !candidate.inventory.some(
      (i) => i.source === entry.source && i.destination === entry.destination,
    )
  )
    errors.push(`Unmapped route/screen ${entry.source}:${entry.destination}`);
if (process.argv.includes('--gate')) {
  for (const row of candidate.requirements)
    if (row.status !== 'Verified')
      errors.push(`Unverified mandatory gate ${row.id}: ${row.status}`);
  for (const [role, owner] of Object.entries(candidate.owners))
    if (!owner) errors.push(`Unassigned ${role} owner`);
  for (const [artifact, value] of Object.entries(candidate.artifacts))
    if (!value) errors.push(`Unidentified ${artifact} artifact`);
  for (const row of candidate.inventory)
    if (!row.owner || !row.scenarioIds.length || !row.evidence.length)
      errors.push(`Unverified capability ${row.source}:${row.destination}`);
}
if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else
  console.log(
    `Ledger valid: ${expected.size} requirements, ${inventory.length} route/screen declarations. Release decision: ${candidate.decision}. Validation alone does not establish readiness.`,
  );
