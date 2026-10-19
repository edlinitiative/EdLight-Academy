/** Private, bounded classroom pilot. Class membership is never inferred from grade/school. */
export const CLASS_LIMITS = { students: 60, pending: 60, assignments: 30, perTeacher: 5, perStudent: 5 };
export type ClassMember = { name: string; joinedAt: number };
export type ClassAssignment = { id: string; title: string; examId: string; level: string; createdAt: number; dueAt: number };
export type ClassRecord = {
  id: string; title: string; school: string; grade: string; teacherUid: string; code: string;
  createdAt: number; archived: boolean; memberUids: string[]; pendingUids: string[];
  members: Record<string, ClassMember>; pending: Record<string, ClassMember>;
  assignments: ClassAssignment[];
};
export type ClassWeek = { xp: Record<string, number>; completed: Record<string, number> };
export type ClassDetail = {
  classroom: Omit<ClassRecord, 'pending' | 'pendingUids' | 'members' | 'memberUids' | 'code'> & { code?: string };
  teacher: boolean; members: Array<{ uid: string; name: string; xp: number; completed: number }>;
  pending: Array<{ uid: string; name: string }>; completed: string[]; completionCounts: Record<string, number>;
  week: string;
  scores: Record<string, Record<string, { completedAt: number; late: boolean; objectiveScore: number | null }>>;
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
/** Sanitize every response; pending names/code only go to the owning teacher. */
export function classDetail(c: ClassRecord, uid: string, week: ClassWeek, completions: Record<string, string[]>, now: number): ClassDetail {
  assertMember(c, uid);
  const teacher = c.teacherUid === uid;
  return {
    classroom: { id: c.id, title: c.title, school: c.school, grade: c.grade, teacherUid: c.teacherUid,
      createdAt: c.createdAt, archived: c.archived, assignments: c.assignments, ...(teacher ? { code: c.code } : {}) },
    teacher,
    members: Object.entries(c.members).map(([id, m]) => ({ uid: id, name: m.name, xp: week.xp[id] || 0, completed: week.completed[id] || 0 }))
      .sort((a, b) => b.xp - a.xp || a.name.localeCompare(b.name)),
    pending: teacher ? Object.entries(c.pending).map(([id, m]) => ({ uid: id, name: m.name })) : [],
    completed: completions[uid] || [],
    completionCounts: Object.fromEntries(c.assignments.map((a) => [a.id, Object.values(completions).filter((ids) => ids.includes(a.id)).length])),
    week: classWeek(now), scores: {},
  };
}
export const CLASS_PRIVACY = {
  fr: 'En rejoignant, tu partages ton nom, tes XP de pratique et tes devoirs terminés avec les membres. Le professeur voit tes scores de devoirs, jamais tes réponses ni tes discussions Sandra. Tu peux quitter à tout moment.',
  ht: 'Lè ou antre, ou pataje non ou, XP pratik ou ak devwa ou fini ak manm yo. Pwofesè a wè nòt devwa ou, men li pa wè repons ou ni konvèsasyon Sandra ou. Ou ka kite nenpòt lè.',
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
};
export function classErrorMessage(error: unknown, language: string): string {
  const code = error instanceof ClassError ? error.code : '';
  return (CLASS_ERRORS[code] || ['Connexion impossible. Réessaie.', 'Koneksyon an pa mache. Eseye ankò.'])[language === 'ht' ? 1 : 0];
}
