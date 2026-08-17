// Subject identity (name + glyph) per course code, shared by every surface
// that renders a course tile. One map so Home, Cours and CourseDetail can't
// drift — and no course ever falls back to a generic book icon when its
// subject is known (TestFlight feedback: "for chimie NSI I want a better icon").
import {
  BookOpen, Calculator, Atom, FlaskConical, TrendingUp, Leaf, PenLine, Globe,
} from 'lucide-react-native';

export const SUBJECT_META: Record<string, { name: string; nameHt: string; Icon: any }> = {
  MATH: { name: 'Mathématiques', nameHt: 'Matematik', Icon: Calculator },
  PHYS: { name: 'Physique', nameHt: 'Fizik', Icon: Atom },
  CHEM: { name: 'Chimie', nameHt: 'Chimi', Icon: FlaskConical },
  ECON: { name: 'Économie', nameHt: 'Ekonomi', Icon: TrendingUp },
  SVT: { name: 'SVT', nameHt: 'SVT', Icon: Leaf },
  FR: { name: 'Français', nameHt: 'Franse', Icon: PenLine },
  EN: { name: 'Anglais', nameHt: 'Angle', Icon: Globe },
};

// Course names carry the subject when `code` is missing ("Chimie NS1").
const NAME_HINTS: Array<[RegExp, string]> = [
  [/chimie|chimi/i, 'CHEM'],
  [/math|matematik/i, 'MATH'],
  [/physique|fizik/i, 'PHYS'],
  [/écono|econo|ekono/i, 'ECON'],
  [/svt|biologie/i, 'SVT'],
  [/français|franse/i, 'FR'],
  [/anglais|angle/i, 'EN'],
];

/** Resolve a course to its subject code (CHEM, MATH, …) or null. */
export function courseSubjectCode(course: any): string | null {
  const code = String(course?.code ?? '').toUpperCase();
  if (SUBJECT_META[code]) return code;
  const name = String(course?.name ?? '');
  for (const [re, c] of NAME_HINTS) if (re.test(name)) return c;
  return null;
}

/** Lucide icon for a course's subject — BookOpen only when truly unknown. */
export function courseSubjectIcon(course: any): any {
  const code = courseSubjectCode(course);
  return code ? SUBJECT_META[code].Icon : BookOpen;
}
