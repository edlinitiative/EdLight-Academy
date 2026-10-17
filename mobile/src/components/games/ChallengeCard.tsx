import React from 'react';
import { View, Text } from 'react-native';
import { Clock, Swords } from 'lucide-react-native';
import useStore from '../../contexts/store';
import { Avatar } from '../arena/art';
import { ArenaButton } from '../arena/ArenaKit';
import { arenaColors as C, arenaType } from '../../theme/arenaTheme';
import { tapLight } from '../../utils/haptics';
import type { Challenge } from '../../services/challengeService';
import { nightType } from './night';

/**
 * ChallengeCard — the "défi reçu" presentation for a duel link, on the night.
 * Pure presentation: the host screen fetches the challenge (useChallenge) and
 * decides what accepting does (launch the same question draw, then post the
 * score). States: open (one coral "Relever le défi") · already played (result
 * recap) · expired (quiet notice).
 *
 * Faces are generated from the uid (the student's arena avatar) — the
 * challenger is a real named student, never an initial disc.
 */
export default function ChallengeCard({
  challenge,
  categoryLabel,
  onAccept,
  busy = false,
}: {
  challenge: Challenge;
  /** Localized category display name (the host resolves id → label). */
  categoryLabel: string;
  onAccept: () => void;
  busy?: boolean;
}) {
  const language = useStore((s) => s.language);
  const me = useStore((s) => s.user);
  const t = (fr: string, ht: string) => (language === 'ht' ? ht : fr);

  const name = challenge.challengerName || t('Un élève', 'Yon elèv');
  const expired = challenge.status === 'open' && challenge.expiresAt > 0 && Date.now() > challenge.expiresAt;
  const played = challenge.status === 'played' && !!challenge.opponent;
  const daysLeft = Math.max(0, Math.ceil((challenge.expiresAt - Date.now()) / 86_400_000));
  const mine = played ? challenge.opponent!.score : null;

  return (
    <View style={{ gap: 16 }}>
      <View style={{ padding: 24, gap: 18, borderRadius: 24, backgroundColor: C.surfaceRaised }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Swords color={C.coral} size={18} />
          <Text style={[nightType.meta, { color: C.muted, flex: 1 }]}>
            {categoryLabel} · {challenge.total} {t('questions', 'kesyon')}
          </Text>
          {!played && !expired ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Clock color={C.muted} size={16} />
              <Text style={[arenaType.status, { color: C.muted }]}>
                {t(`${daysLeft} j restants`, `${daysLeft} jou ki rete`)}
              </Text>
            </View>
          ) : null}
        </View>

        <Text style={[nightType.feature, { color: C.ink }]} numberOfLines={2}>
          {t(`${name} te défie`, `${name} ap defye w`)}
        </Text>

        {/* The stakes: their score against yours (or "?" until you play). */}
        <View
          accessible
          accessibilityLabel={t(
            `${name} : ${challenge.challengerScore} sur ${challenge.total}. Toi : ${mine ?? 'pas encore joué'}`,
            `${name} : ${challenge.challengerScore} sou ${challenge.total}. Ou menm : ${mine ?? 'poko jwe'}`,
          )}
          style={{ flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 20, backgroundColor: C.surface }}
        >
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Avatar seed={challenge.challengerUid || name} size={48} />
            <View style={{ flexShrink: 1 }}>
              <Text numberOfLines={1} style={[arenaType.status, { color: C.muted }]}>{name}</Text>
              <Text style={[arenaType.num, { fontSize: 20, lineHeight: 24, color: C.ink }]}>{challenge.challengerScore}/{challenge.total}</Text>
            </View>
          </View>
          <View style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: C.secondary }}>
            <Text style={[arenaType.status, { fontWeight: '700', color: C.inkSoft }]}>VS</Text>
          </View>
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 10 }}>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={[arenaType.status, { color: C.muted }]}>{t('Toi', 'Ou')}</Text>
              <Text style={[arenaType.num, { fontSize: 20, lineHeight: 24, color: C.ink }]}>{mine != null ? `${mine}/${challenge.total}` : '?'}</Text>
            </View>
            <Avatar seed={me?.uid || 'toi'} size={48} />
          </View>
        </View>

        {played ? (
          <Text style={[arenaType.body, { color: C.inkSoft }]}>
            {challenge.opponent!.score > challenge.challengerScore
              ? t('Défi relevé : victoire.', 'Defi fèt : viktwa.')
              : challenge.opponent!.score === challenge.challengerScore
                ? t('Défi relevé : égalité.', 'Defi fèt : egalite.')
                : t('Défi relevé. Bien essayé.', 'Defi fèt. Bèl efò.')}
          </Text>
        ) : expired ? (
          <Text style={[arenaType.body, { color: C.muted }]}>{t('Ce défi a expiré.', 'Defi sa a ekspire.')}</Text>
        ) : (
          <ArenaButton
            label={t('Relever le défi', 'Reponn defi a')}
            busy={busy}
            onPress={() => { tapLight(); onAccept(); }}
          />
        )}
      </View>
      {!played && !expired ? (
        <Text style={[arenaType.status, { color: C.muted, textAlign: 'center', paddingHorizontal: 12 }]}>
          {t(
            'Mêmes questions · une seule tentative · +20 XP au gagnant',
            'Menm kesyon yo · yon sèl tantativ · +20 XP pou moun ki genyen',
          )}
        </Text>
      ) : null}
    </View>
  );
}
