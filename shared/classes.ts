/** Private, bounded classroom pilot. Class membership is never inferred from grade/school. */
export const CLASS_LIMITS = { students: 60, pending: 60, assignments: 30, perTeacher: 5, perStudent: 5, fixtures: 8, openFixtures: 3 };
/** v2 adds per-chapter mastery levels to what the teacher sees. v1 members are excluded from analytics until they re-accept. */
export const CLASS_CONSENT_VERSION = 2;
export type ClassMember = { name: string; joinedAt: number; consent?: number };
export const HOUSE_COLORS = [
  { id: 'azure', hex: '#1B6FE0', fr: 'Bleu', ht: 'Ble' },
  { id: 'amber', hex: '#B45309', fr: 'Ambre', ht: 'Jòn fonse' },
  { id: 'emerald', hex: '#15803D', fr: 'Vert', ht: 'Vèt' },
  { id: 'rose', hex: '#BE123C', fr: 'Rouge', ht: 'Wouj' },
  { id: 'violet', hex: '#6D28D9', fr: 'Violet', ht: 'Vyolèt' },
  { id: 'slate', hex: '#475569', fr: 'Ardoise', ht: 'Gri' },
] as const;
export type HouseColor = (typeof HOUSE_COLORS)[number]['id'];
export type ClassHouse = { id: string; name: string; color: HouseColor };
export const HOUSE_LIMITS = { min: 2, max: 6, name: 24 };
export const houseHex = (color: string) => (HOUSE_COLORS.find((c) => c.id === color) || HOUSE_COLORS[5]).hex;
/** Minors: classmates and other classes only ever see a first name. */
export function firstName(name: unknown): string {
  const first = typeof name === 'string' ? name.trim().split(/\s+/)[0] || '' : '';
  return first.slice(0, 24) || 'Élève';
}
export type ClassAssignment = { id: string; title: string; examId: string; level: string; createdAt: number; dueAt: number };
export type ClassRecord = {
  id: string; title: string; school: string; grade: string; teacherUid: string; code: string;
  createdAt: number; archived: boolean; memberUids: string[]; pendingUids: string[];
  members: Record<string, ClassMember>; pending: Record<string, ClassMember>;
  assignments: ClassAssignment[];
  houses?: ClassHouse[]; houseOf?: Record<string, string>;
  /** Newest first, bounded by CLASS_LIMITS.fixtures. */
  fixtureIds?: string[];
};
export type ClassWeek = { xp: Record<string, number>; completed: Record<string, number> };
export type ClassDetail = {
  classroom: Omit<ClassRecord, 'pending' | 'pendingUids' | 'members' | 'memberUids' | 'code'> & { code?: string };
  teacher: boolean; members: Array<{ uid: string; name: string; xp: number; completed: number; house?: string | null }>;
  pending: Array<{ uid: string; name: string }>; completed: string[]; completionCounts: Record<string, number>;
  week: string;
  scores: Record<string, Record<string, { completedAt: number; late: boolean; objectiveScore: number | null }>>;
  houses?: HouseStanding[]; myHouse?: string | null;
  fixtures?: FixtureView[];
  /** Student only: false when they joined under an older disclosure and have not re-accepted. */
  consentCurrent?: boolean;
  /** Teacher only: trivia decks a fixture can draw from. */
  fixtureCategories?: Array<{ id: string; name: string; nameHt: string }>;
};
export type HouseStanding = ClassHouse & { xp: number; completed: number; members: number; rank: number };

// ── Class-vs-class fixtures ────────────────────────────────────────────────
export const FIXTURE_AGGREGATES = ['average', 'sum'] as const;
export type FixtureAggregate = (typeof FIXTURE_AGGREGATES)[number];
export const FIXTURE_LIMITS = { teamSizes: [3, 5], windowHours: [1, 24, 48, 72, 168], questionCounts: [5, 10, 15, 20], seconds: [15, 20, 30], categoriesMax: 6 };
export type FixtureSide = { classId: string; title: string; school: string; teacherUid: string };
export type FixtureState = 'proposed' | 'accepted' | 'declined' | 'cancelled';
export type ClassFixture = {
  id: string; code: string; state: FixtureState; home: FixtureSide; away: FixtureSide | null;
  title: string; categories: string[]; questionCount: number; secondsPerQuestion: number;
  startsAt: number; windowHours: number; teamSize: number; aggregate: FixtureAggregate;
  createdAt: number; decidedAt: number | null; tid: string | null;
};
export type FixtureTeamScore = { score: number; counted: number; members: number; qualified: boolean; needed: number };
export type FixtureView = {
  id: string; state: FixtureState; side: 'home' | 'away'; title: string;
  opponent: { title: string; school: string } | null;
  /** Owning home teacher only, while waiting for the other teacher. */
  code?: string;
  startsAt: number; endsAt: number; teamSize: number; aggregate: FixtureAggregate; questionCount: number;
  tid: string | null; phase: 'waiting' | 'upcoming' | 'open' | 'final' | 'closed';
  mine: FixtureTeamScore | null; theirs: FixtureTeamScore | null;
  outcome: 'win' | 'loss' | 'draw' | 'none' | null;
  /** Student only: already entered for their class. */
  joined?: boolean;
};
export type FixturePreview = { id: string; title: string; home: { title: string; school: string }; startsAt: number; windowHours: number; teamSize: number; aggregate: FixtureAggregate; questionCount: number; secondsPerQuestion: number };

// ── Teacher analytics ──────────────────────────────────────────────────────
export type MasteryLevelName = 'none' | 'seen' | 'familiar' | 'proficient' | 'mastered';
export type LevelCounts = Record<MasteryLevelName, number>;
export type ClassAnalytics = {
  courses: Array<{ id: string; name: string }>; courseId: string | null;
  /** Approved members whose mastery is included (consent v2). */
  shared: number; notShared: number;
  chapters: Array<{ id: string; title: string; lessons: number; counts: LevelCounts; percent: LevelCounts; avgPoints: number;
    lessonRows: Array<{ id: string; title: string; counts: LevelCounts }> }>;
  students: Array<{ uid: string; name: string; points: number; levels: Record<string, MasteryLevelName> }>;
  weakest: string[];
  assignments: Array<{ id: string; title: string; dueAt: number; completed: number; onTime: number; late: number; rate: number }>;
};
export type ClassHome = { canTeach: boolean; classes: Array<{ id: string; title: string; school: string; teacher: boolean; pending: boolean; archived?: boolean }> };
export class ClassError extends Error { constructor(public code: string) { super(code); } }
export const classId = (v: unknown): string => {
  if (typeof v !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(v)) throw new ClassError('invalid_input');
  return v;
};
export function classText(v: unknown, max = 100): string {
  if (typeof v !== 'string' || !v.trim() || v.trim().length > max) throw new ClassError('invalid_input');
  return v.trim();
}
export function classWeek(now: number): string {
  const d = new Date(now);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7);
  return d.toISOString().slice(0, 10);
}
export function assertTeacher(c: ClassRecord, uid: string) {
  if (c.teacherUid !== uid) throw new ClassError('forbidden');
}
export function assertMember(c: ClassRecord, uid: string) {
  if (!c.members[uid] && c.teacherUid !== uid) throw new ClassError('forbidden');
}
/** Total and per-member weekly XP by house. Ranked by total: houses are balanced by headcount. */
export function houseStandings(c: Pick<ClassRecord, 'houses' | 'houseOf' | 'members'>, week: ClassWeek): HouseStanding[] {
  const houses = c.houses || [];
  const rows = houses.map((h) => {
    const uids = Object.keys(c.members).filter((u) => c.houseOf?.[u] === h.id);
    return { ...h, xp: uids.reduce((n, u) => n + (week.xp[u] || 0), 0), completed: uids.reduce((n, u) => n + (week.completed[u] || 0), 0), members: uids.length, rank: 0 };
  }).sort((a, b) => b.xp - a.xp || b.completed - a.completed || houses.indexOf(a) - houses.indexOf(b));
  let rank = 0;
  rows.forEach((r, i) => { rank = i > 0 && rows[i - 1].xp === r.xp && rows[i - 1].completed === r.completed ? rank : i + 1; r.rank = rank; });
  return rows;
}
/** Sanitize every response; pending names/code only go to the owning teacher. */
export function classDetail(c: ClassRecord, uid: string, week: ClassWeek, completions: Record<string, string[]>, now: number): ClassDetail {
  assertMember(c, uid);
  const teacher = c.teacherUid === uid;
  return {
    classroom: { id: c.id, title: c.title, school: c.school, grade: c.grade, teacherUid: c.teacherUid,
      createdAt: c.createdAt, archived: c.archived, assignments: c.assignments, ...(teacher ? { code: c.code } : {}) },
    teacher,
    members: Object.entries(c.members).map(([id, m]) => ({ uid: id, name: teacher || id === uid ? m.name : firstName(m.name), xp: week.xp[id] || 0, completed: week.completed[id] || 0, house: c.houseOf?.[id] || null }))
      .sort((a, b) => b.xp - a.xp || a.name.localeCompare(b.name)),
    pending: teacher ? Object.entries(c.pending).map(([id, m]) => ({ uid: id, name: m.name })) : [],
    completed: completions[uid] || [],
    completionCounts: Object.fromEntries(c.assignments.map((a) => [a.id, Object.values(completions).filter((ids) => ids.includes(a.id)).length])),
    week: classWeek(now), scores: {},
    houses: houseStandings(c, week), myHouse: teacher ? null : c.houseOf?.[uid] || null,
    ...(teacher ? {} : { consentCurrent: (c.members[uid]?.consent || 1) >= CLASS_CONSENT_VERSION }),
  };
}
export const CLASS_PRIVACY = {
  fr: 'En rejoignant, tu partages ton prénom, tes XP de pratique et tes devoirs terminés avec les membres. Le professeur voit ton nom, tes scores de devoirs et ton niveau de maîtrise par chapitre, jamais tes réponses ni tes discussions Sandra. Lors d’un match contre une autre classe, seul ton prénom apparaît. Tu peux quitter à tout moment.',
  ht: 'Lè ou antre, ou pataje premye non ou, XP pratik ou ak devwa ou fini ak manm yo. Pwofesè a wè non ou, nòt devwa ou ak nivo metriz ou pou chak chapit, men li pa wè repons ou ni konvèsasyon Sandra ou. Nan yon match kont yon lòt klas, se sèlman premye non ou ki parèt. Ou ka kite nenpòt lè.',
};
export const CLASS_ERRORS: Record<string, [string, string]> = {
  forbidden: ['Accès réservé aux membres approuvés.', 'Se sèlman manm ki apwouve ki gen aksè.'],
  teacher_required: ['Un administrateur doit valider ton compte enseignant.', 'Yon administratè dwe valide kont pwofesè ou.'],
  not_found: ['Classe ou code introuvable.', 'Nou pa jwenn klas la oswa kòd la.'],
  full: ['La limite du pilote est atteinte.', 'Limit pilòt la rive.'],
  invalid_input: ['Vérifie les champs et la date.', 'Verifye enfòmasyon yo ak dat la.'],
  not_submitted: ['Termine et enregistre cet examen après la publication du devoir, puis réessaie.', 'Fini epi anrejistre egzamen sa a apre piblikasyon devwa a, epi eseye ankò.'],
  archived: ['Cette classe est archivée.', 'Klas sa a achive.'],
  unauthorized: ['Connecte-toi pour ouvrir tes classes.', 'Konekte pou ouvri klas ou yo.'],
  rate_limit: ['Trop de demandes. Réessaie plus tard.', 'Twòp demann. Eseye pita.'],
  fixture_closed: ['Ce défi n’est plus ouvert.', 'Defi sa a pa louvri ankò.'],
  same_class: ['Choisis une autre classe que la tienne.', 'Chwazi yon lòt klas pase pa ou a.'],
  not_enough_questions: ['Pas assez de questions dans ces thèmes. Ajoute un thème.', 'Pa gen ase kesyon nan tèm sa yo. Ajoute yon tèm.'],
  timeout: ['La connexion a pris trop de temps. Réessaie.', 'Koneksyon an pran twòp tan. Eseye ankò.'],
};
export function classErrorMessage(error: unknown, language: string): string {
  const code = error instanceof ClassError ? error.code : '';
  return (CLASS_ERRORS[code] || ['Connexion impossible. Réessaie.', 'Koneksyon an pa mache. Eseye ankò.'])[language === 'ht' ? 1 : 0];
}
