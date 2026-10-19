/**
 * "Explique-moi / Eksplike m" under a missed question. Renders nothing unless
 * an ExplainProvider is above it and the student is signed in.
 */
import React from 'react';
import { MessageCircle } from 'lucide-react-native';
import Button from '../ui/Button';
import useStore from '../../contexts/store';
import { useColors } from '../../theme/theme';
import { EXPLAIN_DISCLOSURE, EXPLAIN_LABEL, type QuestionContext } from '../../../../shared/explainContext';
import { useExplain } from './explainContext';

export default function ExplainButton({ context, style }: { context: QuestionContext | undefined | null; style?: any }) {
  const explain = useExplain();
  const colors = useColors();
  const isCreole = useStore((s) => s.language) === 'ht';
  if (!explain || !context) return null;
  const label = isCreole ? EXPLAIN_LABEL.ht : EXPLAIN_LABEL.fr;
  return (
    <Button
      label={label}
      onPress={() => explain(context)}
      variant="secondary"
      size="sm"
      icon={<MessageCircle color={colors.azureInk} size={16} />}
      accessibilityLabel={`${label}. ${isCreole ? EXPLAIN_DISCLOSURE.ht : EXPLAIN_DISCLOSURE.fr}`}
      style={[{ alignSelf: 'flex-start' }, style]}
    />
  );
}
