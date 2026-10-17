/** Real-shaped fixtures: a transformed course and grouped-bank session items. */
import type { SessionItem } from '../session';

export const item = (id: string, unitNo: number | undefined, over: Partial<SessionItem> = {}): SessionItem => ({
  id,
  question: `Question ${id} ?`,
  options: [`${id}-a`, `${id}-b`, `${id}-c`],
  correctIndex: 0,
  subjectCode: 'CHEM-NSI',
  unitNo,
  ...over,
});

export const u1 = [item('r1', 1), item('r2', 1), item('r3', 1)];
/** A row whose key matches no option. */
export const ungradable = item('r9', 1, { correctIndex: -1 });
export const phys = item('p1', 1, { subjectCode: 'PHYS-NSI' });
export const items: SessionItem[] = [...u1, ungradable, phys];

export const courses = [
  {
    id: 'chem-ns1',
    code: 'CHEM-NSI',
    name: 'Chimie NS1',
    subject: 'CHEM',
    level: 'NSI',
    modules: [
      { id: 'CHEM-NSI-U1', title: 'Grandeurs et Mesures', order: 1, unit_no: 1, lessons: [
        { id: 'CHEM-NSI-U1-L1', title: 'Masse et Poids', order: 1 },
        { id: 'CHEM-NSI-U1-L2', title: 'Volume et Mole', order: 2 },
      ] },
      { id: 'CHEM-NSI-U2', title: "L'Atome", order: 2, unit_no: 2, lessons: [
        { id: 'CHEM-NSI-U2-L1', title: "L'Atome (Partie 1)", order: 1 },
      ] },
    ],
  },
  { id: 'phys-ns1', code: 'PHYS-NSI', subject: 'PHYS', level: 'NSI', modules: [{ id: 'PHYS-NSI-U1', title: 'Forces', order: 1, unit_no: 1, lessons: [] }] },
];
