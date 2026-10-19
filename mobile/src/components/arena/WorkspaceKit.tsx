/**
 * WorkspaceKit — the presentational pieces of the native competition
 * workspace (screens/arena/CompetitionWorkspaceScreen). The content itself is
 * composed by shared/competition/workspace.ts; these only draw it, in the
 * Arène's night (theme/arenaTheme.ts — the same in light and dark mode).
 *
 *  - PersonFace       a person's avatar; a neutral glyph for a deleted account
 *  - WorkspaceRow     a row of text, optionally about a person
 *  - WorkspacePanel   one builder panel: title, paragraphs, rows, links, tasks
 *  - TaskForm         one task: a button, its fields, confirm and error copy
 *
 * The uid on a Person is only the avatar seed and a hidden form value — it is
 * never printed (see the render tests in __tests__/workspaceKit.test.tsx).
 */
import React, { useEffect, useRef, useState } from 'react';
import { Text, TextInput, View, type TextStyle } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { UserRound } from 'lucide-react-native';
import { ArenaPanel, ArenaButton } from './ArenaKit';
import Avatar from './art/avatars/Avatar';
import {
  arenaColors as C,
  arenaRadius,
  arenaType,
} from '../../theme/arenaTheme';
import { fonts } from '../../theme/theme';
import {
  operationId,
  workspaceError,
  WorkspaceError,
} from '../../../../shared/competition/client';
import {
  copyFor,
  rowCopy,
  rowPerson,
  type Panel,
  type Person,
  type Row,
  type Task,
} from '../../../../shared/competition/workspace';
import { isDeletedAccount } from '../../../../shared/competition/deletedAccount';

/** Text inputs on the night: an opaque raised well, UI sans, 16pt. */
export const arenaInputStyle: TextStyle = {
  color: C.ink,
  backgroundColor: C.surfaceRaised,
  fontFamily: fonts.regular,
  fontSize: 16,
  minHeight: 48,
  paddingHorizontal: 14,
  paddingVertical: 12,
  borderRadius: arenaRadius.tile,
};

/**
 * A person's face beside their public name; decorative for screen readers
 * (the name is in the text next to it). A deleted account gets a neutral
 * glyph, not a random face seeded from its tombstone.
 */
export function PersonFace({
  person,
  size = 36,
}: {
  person: Pick<Person, 'uid' | 'name' | 'avatar'>;
  size?: number;
}) {
  const deleted = isDeletedAccount(person.uid) || isDeletedAccount(person.name);
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID={deleted ? 'person-face-deleted' : 'person-face'}
    >
      {deleted ? (
        <View
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: C.surfaceAlt,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <UserRound color={C.muted} size={Math.round(size * 0.5)} />
        </View>
      ) : (
        <Avatar seed={person.uid} config={person.avatar} size={size} still />
      )}
    </View>
  );
}

/** One builder row. With a person: their face, then the text (wraps beside it). */
export function WorkspaceRow({ row, ht }: { row: Row; ht: boolean }) {
  const person = rowPerson(row);
  const text = (
    <Text style={[arenaType.body, { color: C.ink, flexShrink: 1 }]}>
      {copyFor(rowCopy(row), ht)}
    </Text>
  );
  if (!person) return text;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <PersonFace person={person} />
      {text}
    </View>
  );
}

/** One builder panel. `renderTask` draws its tasks (the screen owns execution). */
export function WorkspacePanel({
  panel,
  ht,
  onOpen,
  renderTask,
}: {
  panel: Panel;
  ht: boolean;
  onOpen: (path: string) => void;
  renderTask: (task: Task) => React.ReactNode;
}) {
  // A section the builder left empty (no requests yet, no members…) still
  // says so, instead of standing as a lone heading.
  const empty =
    !panel.paragraphs?.length &&
    !panel.rows?.length &&
    !panel.links?.length &&
    !panel.tasks?.length;
  return (
    <ArenaPanel style={{ gap: 12 }}>
      <Text accessibilityRole="header" style={[arenaType.title, { color: C.ink }]}>
        {copyFor(panel.title, ht)}
      </Text>
      {empty ? (
        <Text style={[arenaType.body, { color: C.muted }]}>
          {ht ? 'Anyen pou kounye a.' : 'Rien pour le moment.'}
        </Text>
      ) : null}
      {panel.paragraphs?.map((p, i) => (
        <Text key={i} style={[arenaType.body, { color: C.inkSoft }]}>
          {copyFor(p, ht)}
        </Text>
      ))}
      {panel.rows?.map((r, i) => (
        <WorkspaceRow key={i} row={r} ht={ht} />
      ))}
      {panel.links?.map((link, i) => (
        <ArenaButton
          key={i}
          variant="secondary"
          label={copyFor(link.label, ht)}
          onPress={() => onOpen(link.path)}
        />
      ))}
      {panel.tasks?.map((task) => renderTask(task))}
    </ArenaPanel>
  );
}

export type ExecuteTask = (
  task: Task,
  input: Record<string, string>,
  op: string,
) => Promise<void>;

export function TaskForm({
  task,
  ht,
  uid,
  execute,
}: {
  task: Task;
  ht: boolean;
  uid?: string;
  execute: ExecuteTask;
}) {
  const storageKey = `competition-draft:${uid || 'guest'}:${task.action}:${JSON.stringify(task.values || {})}`;
  const [input, setInput] = useState<Record<string, string>>(
    Object.fromEntries((task.fields || []).map((f) => [f.key, f.value || ''])),
  );
  const [expanded, setExpanded] = useState(false),
    [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false),
    [confirmed, setConfirmed] = useState(false),
    [error, setError] = useState('');
  const pendingTask = useRef<Task | null>(null);
  const op = useRef(operationId()),
    locked = useRef(false),
    alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    let valid = true;
    AsyncStorage.getItem(storageKey)
      .then((raw) => {
        if (!valid) return;
        try {
          const draft = raw ? JSON.parse(raw) : null;
          if (draft) {
            setInput(draft.input);
            op.current = draft.operationId;
            pendingTask.current = draft.pendingTask || null;
          }
        } catch {
          /* ignore malformed local drafts */
        }
        setReady(true);
      })
      .catch(() => {
        if (valid) setReady(true);
      });
    return () => {
      valid = false;
      alive.current = false;
    };
  }, [storageKey]);
  useEffect(() => {
    if (ready)
      void AsyncStorage.setItem(
        storageKey,
        JSON.stringify({
          input,
          operationId: op.current,
          pendingTask: pendingTask.current,
        }),
      ).catch(() => undefined);
  }, [storageKey, input, ready]);
  const submit = async () => {
    if (locked.current || !ready) return;
    if (task.confirm && !confirmed) {
      setConfirmed(true);
      setExpanded(true);
      return;
    }
    locked.current = true;
    setBusy(true);
    setError('');
    try {
      pendingTask.current ??= task;
      await AsyncStorage.setItem(
        storageKey,
        JSON.stringify({
          input,
          operationId: op.current,
          pendingTask: pendingTask.current,
        }),
      ).catch(() => undefined);
      await execute(pendingTask.current, input, op.current);
      pendingTask.current = null;
      op.current = operationId();
      await AsyncStorage.removeItem(storageKey);
      if (alive.current) {
        setExpanded(false);
        setConfirmed(false);
      }
    } catch (e) {
      if (
        e instanceof WorkspaceError &&
        !['network', 'receipt_unknown'].includes(e.code)
      ) {
        pendingTask.current = null;
        op.current = operationId();
      }
      if (alive.current)
        setError(
          workspaceError(
            e instanceof WorkspaceError
              ? e.code
              : e instanceof Error
                ? e.message
                : 'network',
            ht,
          ),
        );
    } finally {
      locked.current = false;
      if (alive.current) setBusy(false);
    }
  };
  /** Any edit starts a fresh operation and drops a pending confirmation. */
  const edit = (patch: Record<string, string>) => {
    op.current = operationId();
    pendingTask.current = null;
    setConfirmed(false);
    setInput({ ...input, ...patch });
  };
  return (
    <View style={{ gap: 12, paddingVertical: 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        {task.person ? <PersonFace person={task.person} /> : null}
        <View style={{ flex: 1 }}>
          <ArenaButton
            variant="secondary"
            label={copyFor(task.label, ht)}
            busy={busy}
            disabled={!ready}
            onPress={() =>
              task.fields?.length ? setExpanded(!expanded) : void submit()
            }
          />
        </View>
      </View>
      {expanded ? (
        <>
          {task.fields?.map((f) => (
            <View key={f.key} style={{ gap: 8 }}>
              <Text style={[arenaType.label, { color: C.inkSoft }]}>
                {copyFor(f.label, ht)}
                {f.required ? ' *' : ''}
              </Text>
              {f.type === 'date' ? (
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <TextInput
                    accessibilityLabel={`${copyFor(f.label, ht)} — ${ht ? 'dat (ane-mwa-jou)' : 'date (année-mois-jour)'}`}
                    placeholder="AAAA-MM-JJ"
                    placeholderTextColor={C.muted}
                    keyboardType="numbers-and-punctuation"
                    maxLength={10}
                    value={
                      input[`${f.key}Date`] ??
                      (input[f.key]
                        ? new Date(
                            new Date(input[f.key]).getTime() -
                              new Date(input[f.key]).getTimezoneOffset() *
                                60000,
                          )
                            .toISOString()
                            .slice(0, 10)
                        : '')
                    }
                    onChangeText={(value) => edit({ [`${f.key}Date`]: value })}
                    style={[arenaInputStyle, { flex: 3 }]}
                  />
                  <TextInput
                    accessibilityLabel={`${copyFor(f.label, ht)} — ${ht ? 'lè (èdtan:minit)' : 'heure (heures:minutes)'}`}
                    placeholder="HH:MM"
                    placeholderTextColor={C.muted}
                    keyboardType="numbers-and-punctuation"
                    maxLength={5}
                    value={
                      input[`${f.key}Time`] ??
                      (input[f.key]
                        ? new Date(input[f.key]).toTimeString().slice(0, 5)
                        : '')
                    }
                    onChangeText={(value) => edit({ [`${f.key}Time`]: value })}
                    style={[arenaInputStyle, { flex: 2 }]}
                  />
                </View>
              ) : f.type === 'select' ? (
                <View accessibilityRole="radiogroup" style={{ gap: 8 }}>
                  {f.options?.map((option) => (
                    <ArenaButton
                      key={option.value}
                      variant={
                        input[f.key] === option.value ? 'primary' : 'secondary'
                      }
                      selected={input[f.key] === option.value}
                      label={copyFor(option.label, ht)}
                      onPress={() => edit({ [f.key]: option.value })}
                    />
                  ))}
                </View>
              ) : (
                <TextInput
                  accessibilityLabel={copyFor(f.label, ht)}
                  value={input[f.key] || ''}
                  onChangeText={(value) => edit({ [f.key]: value })}
                  keyboardType={f.type === 'number' ? 'numeric' : 'default'}
                  autoCapitalize="none"
                  multiline={f.type === 'long'}
                  maxLength={2000}
                  style={[
                    arenaInputStyle,
                    f.type === 'long'
                      ? { minHeight: 100, textAlignVertical: 'top' }
                      : null,
                  ]}
                />
              )}
              {f.type === 'date' ? (
                <Text style={[arenaType.status, { color: C.muted }]}>
                  {ht
                    ? 'Dat ak lè lokal aparèy ou.'
                    : 'Date et heure locales de votre appareil.'}
                </Text>
              ) : null}
            </View>
          ))}
          {task.fields?.length || confirmed ? (
            <ArenaButton
              label={
                confirmed
                  ? ht
                    ? 'Konfime'
                    : 'Confirmer'
                  : copyFor(task.label, ht)
              }
              busy={busy}
              onPress={() => {
                void submit();
              }}
            />
          ) : null}
        </>
      ) : null}
      {confirmed && task.confirm ? (
        <View
          style={{
            backgroundColor: C.warnSoft,
            borderRadius: arenaRadius.tile,
            padding: 12,
          }}
        >
          <Text
            accessibilityLiveRegion="polite"
            style={[arenaType.status, { color: C.ink }]}
          >
            {copyFor(task.confirm, ht)}
          </Text>
        </View>
      ) : null}
      {error ? (
        <Text
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          style={[arenaType.status, { color: C.danger }]}
        >
          {error}
        </Text>
      ) : null}
    </View>
  );
}
