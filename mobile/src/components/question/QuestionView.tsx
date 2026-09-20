import React from 'react';
import { Text, TextInput, View } from 'react-native';
import { validate, type Block, type CompiledQuestion, type Response, type Widget } from '../../utils/question';
import MathText from '../MathText';
import ExamFigure from '../ExamFigure';
import { MathChips, MathPreview } from '../ExamAnswerInput';
import useStore from '../../contexts/store';
import { useColors, useTheme, typeScale } from '../../theme/theme';
import { mathToText } from '../../utils/mathText';

/**
 * Renders a compiled question: the prompt is a document, and each answer is a
 * hole in it.
 *
 * The app used to draw the question text as one block and put a box underneath,
 * whatever the question was. A sentence with two blanks ("unis par une ____
 * liaison tandis qu'on trouve une ____ liaison") got one box, so one of the two
 * answers was literally impossible to give. 1,796 questions carry blanks and
 * 619 of them sit mid-sentence, which is why the prompt has to be able to hold
 * its own inputs rather than being a string to append a field to.
 *
 * Every decision about what input to show comes from the compiled widget, not
 * from re-reading `type` and `correct` here. That re-derivation, repeated
 * slightly differently on each surface, is what kept producing the same class
 * of bug in a new place after it was fixed in another.
 */

// A field inline in a sentence has to be wide enough to read what you typed but
// narrow enough that the sentence still reads as a sentence.
const INLINE_MIN_WIDTH = 96;

function useT() {
  const language = useStore((s) => s.language);
  return (fr: string, ht: string) => (language === 'ht' ? ht : fr);
}

/** The label a widget shows above itself, if it has one worth showing. */
function widgetLabel(w: Widget): string {
  return 'label' in w && w.label ? mathToText(String(w.label)) : '';
}

function ValidityNote({ widget, value }: { widget: Widget; value: Response[string] }) {
  const colors = useColors();
  const t = useT();
  const v = validate(widget, value);
  if (v.state !== 'invalid') return null;
  // Telling a student "wrong" for typing "douze" into a number field teaches
  // them nothing — they have not answered wrongly, they have not answered yet.
  const message = v.reason === 'not-a-number'
    ? t('Entre un nombre, par exemple 12 ou 3,5', 'Antre yon nimewo, tankou 12 oswa 3,5')
    : t('Complète toutes les parties', 'Konplete tout pati yo');
  return (
    <Text style={[typeScale.caption, { color: colors.warn, marginTop: 4 }]}>
      {message}
    </Text>
  );
}

/** One typed input. Inline fields sit in the sentence; block fields sit under a label. */
function WidgetInput({ widget, value, onChange, inline, mathy }: {
  widget: Widget;
  value: Response[string];
  onChange: (v: string) => void;
  inline?: boolean;
  mathy?: boolean;
}) {
  const colors = useColors();
  const { radius } = useTheme();
  const t = useT();
  const text = typeof value === 'string' ? value : value == null ? '' : String(value);

  const numeric = widget.kind === 'numeric';
  const field = {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: text ? colors.azure : colors.border,
    borderRadius: radius.control,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 16,
    color: colors.ink,
    minHeight: 44,
  } as const;

  if (inline) {
    return (
      <TextInput
        value={text}
        onChangeText={onChange}
        // A decimal-capable keypad, not the full keyboard: our numbers are
        // written with a comma as often as a dot, so `decimal-pad` (which is
        // locale-aware) beats `numeric`.
        keyboardType={numeric ? 'decimal-pad' : 'default'}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder={numeric ? '0' : '…'}
        placeholderTextColor={colors.faint}
        accessibilityLabel={widgetLabel(widget) || t('Réponse à compléter', 'Repons pou konplete')}
        style={[field, { minWidth: INLINE_MIN_WIDTH, textAlign: 'center', marginHorizontal: 2 }]}
      />
    );
  }

  const unit = numeric && widget.unit ? String(widget.unit) : '';
  return (
    <View style={{ gap: 6 }}>
      {widgetLabel(widget) ? (
        <Text style={[typeScale.label, { color: colors.muted }]}>{widgetLabel(widget)}</Text>
      ) : null}
      {mathy && !numeric ? <MathChips onInsert={(c) => onChange(text + c)} /> : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <TextInput
          value={text}
          onChangeText={onChange}
          keyboardType={numeric ? 'decimal-pad' : 'default'}
          autoCapitalize="none"
          autoCorrect={false}
          multiline={!numeric}
          placeholder={numeric ? t('Votre résultat…', 'Rezilta ou…') : t('Votre réponse…', 'Repons ou…')}
          placeholderTextColor={colors.faint}
          style={[field, { flex: 1, minHeight: numeric ? 48 : 96, paddingVertical: 12 }]}
          textAlignVertical={numeric ? 'center' : 'top'}
        />
        {unit ? (
          // The unit is shown, never demanded: the answer is the number, and a
          // student who types "3,14 m" is not wrong for saying the unit too.
          <Text style={[typeScale.body, { color: colors.muted }]}>{unit}</Text>
        ) : null}
      </View>
      {!numeric ? <MathPreview value={text} /> : null}
      <ValidityNote widget={widget} value={value} />
    </View>
  );
}

/**
 * The prompt, with its inputs in place. Text runs and inline fields are laid
 * out in one wrapping row so a field sits in the sentence rather than under it.
 */
function Prompt({ blocks, widgets, response, onChange }: {
  blocks: Block[];
  widgets: Record<string, Widget>;
  response: Response;
  onChange: (id: string, v: string) => void;
}) {
  const colors = useColors();
  const hasHole = blocks.some((b) => b.type === 'widget');

  return (
    <View style={{ flexDirection: hasHole ? 'row' : 'column', flexWrap: 'wrap', alignItems: 'center' }}>
      {blocks.map((block, i) => {
        if (block.type === 'text') {
          return (
            <MathText
              key={`t${i}`}
              // Raw: MathText typesets delimited LaTeX and falls back to
              // mathToText itself. Transforming first strips the `$…$` and
              // makes the KaTeX path unreachable.
              text={block.content}
              style={{ fontSize: 16, color: colors.ink, lineHeight: hasHole ? 32 : 24 }}
            />
          );
        }
        if (block.type === 'figure') {
          return <ExamFigure key={`f${i}`} description={block.description} />;
        }
        const widget = widgets[block.id];
        if (!widget) return null;
        return (
          <WidgetInput
            key={block.id}
            widget={widget}
            value={response[block.id] ?? ''}
            onChange={(v) => onChange(block.id, v)}
            inline
          />
        );
      })}
    </View>
  );
}

export default function QuestionView({ question, response, onChange, mathy }: {
  question: CompiledQuestion;
  response: Response;
  onChange: (id: string, value: string) => void;
  mathy?: boolean;
}) {
  const colors = useColors();
  const { radius, shadow } = useTheme();

  // Widgets already placed in the prompt are answered there; the rest get a
  // field below it.
  const inPrompt = new Set(
    question.prompt.filter((b): b is Extract<Block, { type: 'widget' }> => b.type === 'widget').map((b) => b.id),
  );
  const below = Object.keys(question.widgets).filter((id) => !inPrompt.has(id));

  return (
    <View style={{ gap: 16 }}>
      <View style={[
        { backgroundColor: colors.surface, borderRadius: radius.card, padding: 16, borderWidth: 1, borderColor: colors.border },
        shadow.sm,
      ]}>
        <Prompt
          blocks={question.prompt}
          widgets={question.widgets}
          response={response}
          onChange={onChange}
        />
      </View>

      {below.map((id) => (
        <WidgetInput
          key={id}
          widget={question.widgets[id]}
          value={response[id] ?? ''}
          onChange={(v) => onChange(id, v)}
          mathy={mathy}
        />
      ))}
    </View>
  );
}
