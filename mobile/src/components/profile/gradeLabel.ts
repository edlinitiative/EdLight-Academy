/**
 * Short class labels for Profil and the welcome sheet: "NS I" … "NS IV",
 * "9e année". Never the old-system names (Seconde, Rhéto, Philo, Terminale):
 * the Nouveau secondaire levels stand on their own.
 */
const SHORT: Record<string, { fr: string; ht: string }> = {
  '7e': { fr: '7e année', ht: '7yèm ane' },
  '8e': { fr: '8e année', ht: '8yèm ane' },
  '9e': { fr: '9e année', ht: '9yèm ane' },
  NS1: { fr: 'NS I', ht: 'NS I' },
  NS2: { fr: 'NS II', ht: 'NS II' },
  NS3: { fr: 'NS III', ht: 'NS III' },
  NS4: { fr: 'NS IV', ht: 'NS IV' },
  POSTBAC: { fr: 'Après le Bac', ht: 'Apre Bak' },
};

export function gradeShortLabel(code: string | null | undefined, isCreole: boolean): string | null {
  const g = code ? SHORT[code] : undefined;
  return g ? (isCreole ? g.ht : g.fr) : null;
}

/** "1er" / "4e" (fr) · "1ye" / "4yèm" (ht). */
export function ordinal(n: number, isCreole: boolean): string {
  if (isCreole) return n === 1 ? '1ye' : `${n}yèm`;
  return n === 1 ? '1er' : `${n}e`;
}
