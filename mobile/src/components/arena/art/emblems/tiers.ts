/** Rank emblem tiers — pure, so tests can import without react-native-svg. */
export interface EmblemTier { id: string; nameFr: string; nameHt: string; minLevel: number }

export const EMBLEM_TIERS: EmblemTier[] = [
  { id: 'bronze', nameFr: 'Bronze', nameHt: 'Bwonz', minLevel: 1 },
  { id: 'silver', nameFr: 'Argent', nameHt: 'Ajan', minLevel: 5 },
  { id: 'gold', nameFr: 'Or', nameHt: 'Lò', minLevel: 10 },
  { id: 'diamond', nameFr: 'Diamant', nameHt: 'Dyaman', minLevel: 20 },
  { id: 'legend', nameFr: 'Légende', nameHt: 'Lejand', minLevel: 35 },
];

export function emblemForLevel(level: number): EmblemTier {
  const l = Math.max(1, Math.floor(level || 1));
  return [...EMBLEM_TIERS].reverse().find((t) => l >= t.minLevel) || EMBLEM_TIERS[0];
}

/** Plain-text meaning for an emblem, e.g. "Or · niveau 12" / "Lò · nivo 12". */
export function emblemLabel(level: number, isCreole = false): string {
  const l = Math.max(1, Math.floor(level || 1));
  const tier = emblemForLevel(l);
  return isCreole ? `${tier.nameHt} · nivo ${l}` : `${tier.nameFr} · niveau ${l}`;
}
