import React, { useEffect } from 'react';
import { Text, View } from 'react-native';
import { Swords, Trophy, Minus } from 'lucide-react-native';
import PressableScale from '../ui/PressableScale';
import { useColors, useTheme, typeScale } from '../../theme/theme';
import { select } from '../../utils/haptics';
import { useMyChallenges, type Challenge } from '../../hooks/useMyChallenges';
import { duelOutcome } from '../../utils/duels';

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
  const colors = useColors();
  const { radius } = useTheme();
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  const result = duelOutcome(challenge);
  const who = challenge.opponent?.name || t('Un ami', 'Yon zanmi');

  const tone = result === 'lost' ? colors.danger : result === 'tie' ? colors.muted : colors.success;
  const Icon = result === 'tie' ? Minus : result === 'lost' ? Swords : Trophy;
  const headline = result === 'lost'
    ? t(`${who} t'a battu`, `${who} bat ou`)
    : result === 'tie'
      ? t(`Égalité avec ${who}`, `Egalite ak ${who}`)
      : t(`Tu as battu ${who}`, `Ou bat ${who}`);

  return (
    <PressableScale
      onPress={() => { select(); onRematch(challenge.categoryId); }}
      pressedScale={0.98}
      accessibilityRole="button"
      accessibilityLabel={`${headline}. ${t('Rejouer cette catégorie', 'Rejwe kategori sa a')}`}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: 12,
        borderRadius: radius.card,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: isNew ? tone : colors.border,
      }}
    >
      <View style={{
        width: 36, height: 36, borderRadius: 999,
        alignItems: 'center', justifyContent: 'center',
        backgroundColor: colors.surfaceAlt,
      }}>
        <Icon color={tone} size={18} />
      </View>

      <View style={{ flex: 1 }}>
        <Text style={[typeScale.label, { color: colors.ink }]} numberOfLines={1}>{headline}</Text>
        <Text style={[typeScale.caption, { color: colors.muted }]}>
          {challenge.opponent?.score ?? 0}/{challenge.total} {t('contre', 'kont')} {challenge.challengerScore}/{challenge.total}
        </Text>
      </View>

      <Text style={[typeScale.label, { color: colors.azure }]}>
        {result === 'lost' ? t('Revanche', 'Revanj') : t('Rejouer', 'Rejwe')}
      </Text>
    </PressableScale>
  );
}

export default function DuelResults({ isCreole, onRematch }: {
  isCreole: boolean;
  onRematch: (categoryId: string) => void;
}) {
  const colors = useColors();
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
    <View style={{ paddingHorizontal: 16, paddingBottom: 12, gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={[typeScale.overline, { color: colors.muted }]}>
          {t('Tes défis', 'Defi ou yo')}
        </Text>
        {newCodes.size > 0 && (
          <View style={{ backgroundColor: colors.danger, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2 }}>
            <Text style={[typeScale.micro, { color: '#fff' }]}>{newCodes.size}</Text>
          </View>
        )}
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
