/**
 * "Utile / Pas utile" under a reviewed Explique-moi explanation (the reply
 * /api/chat served from an admin-approved text: shared/explanationFeedback).
 * Rendered as a sibling of the Sandra bubble, not inside it: the bubble is one
 * grouped accessibility node, which would hide these buttons from VoiceOver.
 */
import React, { useState } from 'react';
import { Text, View } from 'react-native';
import Button from '../ui/Button';
import { useTheme, typeScale } from '../../theme/theme';
import { EXPLANATION_FEEDBACK } from '../../../../shared/explanationFeedback';
import { voteExplanation } from '../../services/sandraService';
import { tapLight } from '../../utils/haptics';

export default function ExplanationFeedback({ id, lang }: { id: string; lang: 'fr' | 'ht' }) {
  const { colors } = useTheme();
  const [sent, setSent] = useState(false);
  const L = EXPLANATION_FEEDBACK;
  const vote = (helpful: boolean) => {
    tapLight();
    setSent(true);
    void voteExplanation(id, helpful);
  };
  return (
    <View style={{ marginLeft: 42, marginTop: -6, marginBottom: 14, gap: 8 }}>
      <Text style={[typeScale.caption, { color: colors.muted }]}>{L.reviewed[lang]}</Text>
      {sent ? (
        <Text accessibilityRole="text" accessibilityLiveRegion="polite" style={[typeScale.caption, { color: colors.muted }]}>
          {L.thanks[lang]}
        </Text>
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          <Text style={[typeScale.caption, { color: colors.ink }]}>{L.question[lang]}</Text>
          <Button size="sm" variant="outline" label={L.helpful[lang]} onPress={() => vote(true)} />
          <Button size="sm" variant="outline" label={L.notHelpful[lang]} onPress={() => vote(false)} />
        </View>
      )}
    </View>
  );
}
