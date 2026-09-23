import React from 'react';
import type { Icon as PhosphorIcon } from '@phosphor-icons/react';
import {
  MathOperationsIcon, FlaskIcon, DnaIcon, TextAaIcon, BankIcon, CoinsIcon, FlagBannerIcon,
  ScrollIcon, MapTrifoldIcon, MusicNotesIcon, UserFocusIcon, ChatTeardropTextIcon,
  MicroscopeIcon, ShieldStarIcon, SoccerBallIcon, TargetIcon,
} from '@phosphor-icons/react';

/**
 * The trivia themes' icons. They used to be emoji (➗ ⚗️ 🧬 🇭🇹 …), which render
 * differently on every phone and read as placeholder art; these are the app's
 * own duotone set. Unknown ids fall back to a target.
 */
const BY_ID: Record<string, PhosphorIcon> = {
  maths_eclair: MathOperationsIcon,
  chimie_symboles: FlaskIcon,
  bio_corps: DnaIcon,
  anglais_vocab: TextAaIcon,
  capitals: BankIcon,
  currencies: CoinsIcon,
  flags: FlagBannerIcon,
  histoire_haiti: ScrollIcon,
  geo_haiti: MapTrifoldIcon,
  culture_haiti: MusicNotesIcon,
  personnalites_haiti: UserFocusIcon,
  proverbes_haiti: ChatTeardropTextIcon,
  sciences: MicroscopeIcon,
  symboles_haiti: ShieldStarIcon,
  sport_haiti: SoccerBallIcon,
};

export default function CategoryIcon({ id, size = 18, className }: { id?: string; size?: number; className?: string }) {
  const C = (id && BY_ID[id]) || TargetIcon;
  return <C size={size} weight="duotone" className={className} aria-hidden="true" />;
}
