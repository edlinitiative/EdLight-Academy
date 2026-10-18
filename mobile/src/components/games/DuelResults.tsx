import React, { useEffect } from 'react';
import { Text, View } from 'react-native';
import PressableScale from '../ui/PressableScale';
import { Avatar } from '../arena/art';
import { arenaColors as C, arenaType } from '../../theme/arenaTheme';
import { select } from '../../utils/haptics';
import { useMyChallenges, type Challenge } from '../../hooks/useMyChallenges';
import { duelOutcome } from '../../utils/duels';
import { NightSection, NightPill, nightType } from './night';

/**
 * "Tes défis" — what came back from the duels you sent.
 *
 * The duel loop only ran one way: you shared a link and never found out what
 * happened unless you thought to re-open your own link. A rivalry needs the
 * return leg, so this is where being beaten shows up — and where the rematch
 * is one tap away, in the same category, while it still stings.
 *
 * Shows nothing at all when you have no results back. An empty "no duels yet"
 * card at the top of the tab would cost every player space to tell almost all
 * of them nothing.
 */

function DuelRow({ challenge, isCreole, isNew, onRematch }: {
  challenge: Challenge;
  isCreole: boolean;
  isNew: boolean;
  onRematch: (categoryId: string) => void;
}) {
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  const result = duelOutcome(challenge);
  const who = challenge.opponent?.name || t('Un ami', 'Yon zanmi');

  const headline = result === 'lost'
    ? t(`${who} t'a battu`, `${who} bat ou`)
    : result === 'tie'
      ? t(`Égalité avec ${who}`, `Egalite ak ${who}`)
      : t(`Tu as battu ${who}`, `Ou bat ${who}`);
  const action = result === 'lost' ? t('Revanche', 'Revanj') : t('Rejouer', 'Rejwe');

  return (
    <PressableScale
      onPress={() => { select(); onRematch(challenge.categoryId); }}
      pressedScale={0.98}
      accessibilityRole="button"
      accessibilityLabel={`${headline}. ${t('Rejouer cette catégorie', 'Rejwe kategori sa a')}`}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 72,
        paddingHorizontal: 16, paddingVertical: 12, borderRadius: 20,
        // A fresh result gets one tonal step up — a wash, never an edge.
        backgroundColor: isNew ? C.surfaceRaised : C.surface,
      }}
    >
      <Avatar seed={challenge.opponent?.uid || who} config={challenge.opponent?.avatar} size={44} mood={result === 'lost' ? 'celebrating' : 'idle'} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[nightType.cardTitle, { color: C.ink }]} numberOfLines={1}>{headline}</Text>
        <Text style={[arenaType.status, { color: C.muted }]}>
          {t('Toi', 'Ou')} {challenge.challengerScore} · {who} {challenge.opponent?.score ?? 0} · {t('sur', 'sou')} {challenge.total}
        </Text>
      </View>
      <Text style={[arenaType.name, { fontSize: 15, color: result === 'lost' ? C.coral : C.inkSoft }]}>{action}</Text>
    </PressableScale>
  );
}

export default function DuelResults({ isCreole, onRematch }: {
  isCreole: boolean;
  onRematch: (categoryId: string) => void;
}) {
  const { played, unseen, markSeen } = useMyChallenges();
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);

  // Seen once they have been on screen — the badge is "since you last looked",
  // not "since you last tapped", so it cannot nag.
  const unseenCodes = unseen.map((c) => c.code).join(',');
  useEffect(() => {
    if (!unseenCodes) return;
    const timer = setTimeout(() => markSeen(unseenCodes.split(',')), 2500);
    return () => clearTimeout(timer);
  }, [unseenCodes, markSeen]);

  if (played.length === 0) return null;
  const recent = played.slice(0, 3);
  const newCodes = new Set(unseen.map((c) => c.code));

  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <NightSection title={t('Tes défis', 'Defi ou yo')} style={{ marginBottom: 4 }} />
        {newCodes.size > 0 ? (
          <NightPill
            tone="coral"
            label={t(`${newCodes.size} nouveau${newCodes.size > 1 ? 'x' : ''}`, `${newCodes.size} nouvo`)}
            style={{ marginTop: 24 }}
          />
        ) : null}
      </View>
      {recent.map((c) => (
        <DuelRow
          key={c.code}
          challenge={c}
          isCreole={isCreole}
          isNew={newCodes.has(c.code)}
          onRematch={onRematch}
        />
      ))}
    </View>
  );
}
