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
// Advertised-capability ledger (MAP-01/MAP-02): every capability the product
// promises in copy, navigation, notifications or store text, mapped to
// requirements, journeys, implementation and evidence. `advertisedAt` entries
// locate the promise by a verbatim `match` snippet; `--inventory` refreshes
// their line numbers. A snippet that no longer exists means the copy changed
// and the row must be re-mapped: a warning here, a blocker under `--gate`.
const advertised = candidate.advertisedCapabilities || [];
const advertisedIds = new Set(),
  drift = [];
const platforms = new Set(['web', 'ios', 'android']);
const evidenceKeys = [
  'commit',
  'build',
  'environment',
  'platform',
  'scenario',
  'expected',
  'observed',
  'link',
  'date',
];
for (const row of advertised) {
  if (!/^ADV-\d{2}$/.test(row.id) || advertisedIds.has(row.id))
    errors.push(`Unknown/duplicate advertised capability ${row.id}`);
  advertisedIds.add(row.id);
  if (!['claim', 'supporting'].includes(row.kind))
    errors.push(`Invalid kind ${row.id}`);
  if (!statuses.has(row.status)) errors.push(`Invalid status ${row.id}`);
  if (!row.requirementIds?.length)
    errors.push(`Advertised capability ${row.id} maps to no requirement`);
  for (const id of row.requirementIds || [])
    if (!expected.has(id)) errors.push(`Unknown requirement ${id} in ${row.id}`);
  for (const j of row.journeys || [])
    if (!/^J(0[1-9]|1[0-4])$/.test(j))
      errors.push(`Unknown journey ${j} in ${row.id}`);
  if (!row.platforms?.length || row.platforms.some((p) => !platforms.has(p)))
    errors.push(`Invalid platforms ${row.id}`);
  if (row.kind === 'claim' && !row.advertisedAt?.length)
    errors.push(`Claim ${row.id} has no advertised location`);
  for (const at of row.advertisedAt || []) {
    const source = path.join(root, at.source || '');
    if (!at.source || !at.match || !fs.existsSync(source)) {
      errors.push(`Missing advertised source ${row.id}: ${at.source}`);
      continue;
    }
    const content = fs.readFileSync(source, 'utf8');
    const index = content.indexOf(at.match);
    if (index < 0) drift.push(`${row.id} ${at.source}: "${at.match}"`);
    else if (process.argv.includes('--inventory'))
      at.line = content.slice(0, index).split('\n').length;
  }
  for (const source of [
    ...(row.implementation || []),
    ...(row.automatedEvidence || []),
  ])
    if (!fs.existsSync(path.join(root, source)))
      errors.push(`Missing file ${source} in ${row.id}`);
  if (row.status === 'Verified' && (!row.owner || !row.evidence?.length))
    errors.push(`Missing owner/evidence for ${row.id}`);
  for (const evidence of row.evidence || [])
    if (!evidenceKeys.every((key) => evidence[key]))
      errors.push(`Incomplete evidence for ${row.id}`);
  if (
    row.mismatch &&
    !['severity', 'finding', 'recommendation', 'status'].every(
      (key) => row.mismatch[key],
    )
  )
    errors.push(`Incomplete mismatch record ${row.id}`);
}
if (drift.length)
  console.warn(
    `Advertised copy moved or changed; re-map these rows:\n${drift.join('\n')}`,
  );
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
  for (const row of advertised) {
    if (row.status !== 'Verified' || !row.scenarioIds?.length)
      errors.push(`Unverified advertised capability ${row.id}: ${row.status}`);
    if (row.mismatch && row.mismatch.status !== 'Resolved')
      errors.push(
        `Open advertised mismatch ${row.id}: ${row.mismatch.severity}`,
      );
  }
  for (const item of drift) errors.push(`Unmapped advertised copy ${item}`);
}
const openMismatches = advertised.filter(
  (row) => row.mismatch && row.mismatch.status !== 'Resolved',
).length;
if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else
  console.log(
    `Ledger valid: ${expected.size} requirements, ${inventory.length} route/screen declarations, ${advertised.length} advertised capabilities (${openMismatches} open mismatches). Release decision: ${candidate.decision}. Validation alone does not establish readiness.`,
  );
