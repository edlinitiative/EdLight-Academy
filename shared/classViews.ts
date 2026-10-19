/**
 * Presentation helpers shared by the web page and the native screen for class
 * spaces: one wording for fixture phases, aggregates, mastery levels and houses.
 * Pure: no React, no platform imports. `ht` selects Haitian Kreyòl.
 */
import { HOUSE_COLORS, type FixtureView, type MasteryLevelName } from './classes';
import { masteryLabel } from './mastery';

export type Tr = (fr: string, ht: string) => string;
export const LEVELS: MasteryLevelName[] = ['mastered', 'proficient', 'familiar', 'seen', 'none'];
export const levelLabel = (level: MasteryLevelName, ht: boolean) => (level === 'none' ? (ht ? 'Poko kòmanse' : 'Pas commencé') : masteryLabel(level, ht));
/** Fill colours for the distribution bar (non-text, each segment also labelled in text). */
export const LEVEL_HEX: Record<MasteryLevelName, string> = { mastered: '#15803D', proficient: '#1B6FE0', familiar: '#B45309', seen: '#8996A5', none: '#D5DCE5' };

export const aggregateLabel = (aggregate: string, teamSize: number, t: Tr) => (aggregate === 'sum'
  ? t(`Somme des ${teamSize} meilleurs`, `Total ${teamSize} pi bon yo`)
  : t(`Moyenne des ${teamSize} meilleurs`, `Mwayèn ${teamSize} pi bon yo`));

export const aggregateHelp = (aggregate: string, t: Tr) => (aggregate === 'sum'
  ? t('Chaque classe doit aligner ce nombre de joueurs pour être classée.', 'Chak klas dwe gen kantite jwè sa a pou li klase.')
  : t('Une petite classe peut affronter une grande : seuls ses meilleurs joueurs comptent.', 'Yon ti klas ka goumen ak yon gwo klas : se sèlman pi bon jwè li yo ki konte.'));

export function fixturePhaseLabel(f: Pick<FixtureView, 'phase' | 'state' | 'outcome'>, t: Tr): string {
  if (f.phase === 'waiting') return t('En attente de l’autre professeur', 'Ap tann lòt pwofesè a');
  if (f.phase === 'upcoming') return t('À venir', 'Ap vini');
  if (f.phase === 'open') return t('Ouvert : chacun joue une fois', 'Louvri : chak moun jwe yon fwa');
  if (f.phase === 'final') {
    if (f.outcome === 'win') return t('Victoire de ta classe', 'Klas ou genyen');
    if (f.outcome === 'loss') return t('Défaite', 'Klas ou pèdi');
    if (f.outcome === 'draw') return t('Match nul', 'Match nil');
    return t('Terminé sans classe classée', 'Fini san okenn klas klase');
  }
  return f.state === 'declined' ? t('Refusé', 'Refize') : t('Annulé', 'Anile');
}

export const teamScoreLine = (s: FixtureView['mine'], teamSize: number, t: Tr) => (!s
  ? t('Aucun joueur pour l’instant', 'Poko gen jwè')
  : `${s.score} pts · ${s.counted}/${teamSize} ${t('comptés', 'konte')}${s.qualified ? '' : ` · ${t('pas encore classée', 'poko klase')}`}`);

export const haitiTime = (ms: number, ht: boolean) =>
  `${new Date(ms).toLocaleString(ht ? 'fr-HT' : 'fr-FR', { timeZone: 'America/Port-au-Prince', dateStyle: 'medium', timeStyle: 'short' })} · ${ht ? 'Lè Ayiti' : 'Heure d’Haïti'}`;

export const houseColorName = (id: string, ht: boolean) => {
  const c = HOUSE_COLORS.find((x) => x.id === id);
  return c ? (ht ? c.ht : c.fr) : '';
};

/** Default names for a fresh split: the first heroes most Haitian classes already know. */
export const DEFAULT_HOUSES = ['Toussaint', 'Dessalines', 'Christophe', 'Pétion', 'Capois', 'Catherine Flon'];
export const defaultHouses = (n: number) => DEFAULT_HOUSES.slice(0, n).map((name, i) => ({ name, color: HOUSE_COLORS[i].id as string }));

