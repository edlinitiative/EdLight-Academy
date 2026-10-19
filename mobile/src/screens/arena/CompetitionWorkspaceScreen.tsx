import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AppState,
  Linking,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation, useRoute } from '@react-navigation/native';
import useStore from '../../contexts/store';
import {
  ArenaScreen,
  ArenaPanel,
  ArenaButton,
} from '../../components/arena/ArenaKit';
import { arenaColors as C, arenaType } from '../../theme/arenaTheme';
import { competitionRequest } from '../../services/competitionService';
import {
  operationId,
  workspaceError,
  WorkspaceError,
} from '../../../../shared/competition/client';
import {
  copyFor,
  rowCopy,
  rowPerson,
  taskPayload,
  workspacePage,
  type Person,
  type Task,
  type WorkspaceTarget,
} from '../../../../shared/competition/workspace';
import { resolveAppPath } from '../../navigation/arenaLinks';
import Avatar from '../../components/arena/art/avatars/Avatar';

/** A person's face beside their public name; decorative for screen readers. */
function PersonFace({ person, size = 36 }: { person: Person; size?: number }) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Avatar seed={person.uid} config={person.avatar} size={size} still />
    </View>
  );
}

function TaskForm({
  task,
  ht,
  uid,
  execute,
}: {
  task: Task;
  ht: boolean;
  uid?: string;
  execute: (
    task: Task,
    input: Record<string, string>,
    op: string,
  ) => Promise<void>;
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
  return (
    <View style={{ gap: 12, paddingVertical: 8 }}>
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
              <Text style={{ color: C.ink }}>
                {copyFor(f.label, ht)}
                {f.required ? ' *' : ''}
              </Text>
              {f.type === 'date' ? (
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <TextInput
                    accessibilityLabel={`${copyFor(f.label, ht)} — ${ht ? 'dat (ane-mwa-jou)' : 'date (année-mois-jour)'}`}
                    placeholder="AAAA-MM-JJ"
                    placeholderTextColor={C.muted}
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
                    onChangeText={(value) => {
                      op.current = operationId();
                      pendingTask.current = null;
                      setConfirmed(false);
                      setInput({ ...input, [`${f.key}Date`]: value });
                    }}
                    style={{
                      color: C.ink,
                      backgroundColor: C.surfaceRaised,
                      minHeight: 48,
                      padding: 12,
                      flex: 2,
                    }}
                  />
                  <TextInput
                    accessibilityLabel={`${copyFor(f.label, ht)} — ${ht ? 'lè (èdtan:minit)' : 'heure (heures:minutes)'}`}
                    placeholder="HH:MM"
                    placeholderTextColor={C.muted}
                    value={
                      input[`${f.key}Time`] ??
                      (input[f.key]
                        ? new Date(input[f.key]).toTimeString().slice(0, 5)
                        : '')
                    }
                    onChangeText={(value) => {
                      op.current = operationId();
                      pendingTask.current = null;
                      setConfirmed(false);
                      setInput({ ...input, [`${f.key}Time`]: value });
                    }}
                    style={{
                      color: C.ink,
                      backgroundColor: C.surfaceRaised,
                      minHeight: 48,
                      padding: 12,
                      flex: 1,
                    }}
                  />
                </View>
              ) : f.type === 'select' ? (
                f.options?.map((option) => (
                  <ArenaButton
                    key={option.value}
                    variant={
                      input[f.key] === option.value ? 'primary' : 'secondary'
                    }
                    label={`${input[f.key] === option.value ? '✓ ' : ''}${copyFor(option.label, ht)}`}
                    onPress={() => {
                      op.current = operationId();
                      pendingTask.current = null;
                      setConfirmed(false);
                      setInput({ ...input, [f.key]: option.value });
                    }}
                  />
                ))
              ) : (
                <TextInput
                  accessibilityLabel={copyFor(f.label, ht)}
                  value={input[f.key] || ''}
                  onChangeText={(value) => {
                    op.current = operationId();
                    pendingTask.current = null;
                    setConfirmed(false);
                    setInput({ ...input, [f.key]: value });
                  }}
                  keyboardType={f.type === 'number' ? 'numeric' : 'default'}
                  autoCapitalize="none"
                  multiline={f.type === 'long'}
                  maxLength={2000}
                  style={{
                    minHeight: f.type === 'long' ? 100 : 48,
                    backgroundColor: C.surfaceRaised,
                    color: C.ink,
                    padding: 12,
                    borderRadius: 12,
                  }}
                />
              )}
              {f.type === 'date' ? (
                <Text style={{ color: C.muted }}>
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
        <Text accessibilityLiveRegion="polite" style={{ color: C.ink }}>
          {copyFor(task.confirm, ht)}
        </Text>
      ) : null}
      {error ? (
        <Text accessibilityRole="alert" style={{ color: C.ink }}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}
export default function CompetitionWorkspaceScreen() {
  const navigation = useNavigation<any>(),
    route = useRoute<any>();
  const kind = (route.params?.kind || 'home') as WorkspaceTarget['kind'],
    id = route.params?.id || '';
  const uid = useStore((s) => s.user?.uid),
    ht = useStore((s) => s.language) === 'ht';
  const [data, setData] = useState<any>(null),
    [mine, setMine] = useState<any>(null),
    [error, setError] = useState(''),
    [mineError, setMineError] = useState(''),
    [notice, setNotice] = useState('');
  const [school, setSchool] = useState(''),
    [department, setDepartment] = useState('');
  const [appliedSchool, setAppliedSchool] = useState(''),
    [appliedDepartment, setAppliedDepartment] = useState('');
  const serial = useRef(0);
  const [dataUid, setDataUid] = useState<string | undefined>(uid);
  const visibleData = dataUid === uid ? data : null;
  const visibleMine = mine?.uid === uid ? mine : null;
  const refresh = useCallback(async () => {
    const n = ++serial.current;
    const [main, personal] = await Promise.allSettled([
      competitionRequest(
        kind === 'home' ? 'directory' : kind,
        kind === 'home'
          ? {
              schoolKey: appliedSchool || undefined,
              department: appliedDepartment || undefined,
            }
          : { [`${kind}Id`]: id },
      ),
      uid ? competitionRequest('mine') : Promise.resolve(null),
    ]);
    if (n !== serial.current) return;
    if (main.status === 'fulfilled') {
      setDataUid(uid);
      setData(main.value);
      setError('');
    } else setError(workspaceError(main.reason?.code || 'network', ht));
    if (personal.status === 'fulfilled') {
      setMine(personal.value);
      setMineError('');
    } else setMineError(workspaceError(personal.reason?.code || 'network', ht));
  }, [kind, id, uid, ht, appliedSchool, appliedDepartment]);
  useEffect(() => {
    setData(null);
    setMine(null);
    setError('');
    setMineError('');
    setNotice('');
    void refresh();
    return () => {
      serial.current++;
    };
  }, [refresh]);
  useEffect(() => {
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') void refresh();
    }, 15000);
    return () => clearInterval(timer);
  }, [refresh]);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void refresh();
    });
    return () => sub.remove();
  }, [refresh]);
  const open = (path: string) => {
    if (/^https:\/\//.test(path)) {
      void Linking.openURL(path).catch(() =>
        setError(workspaceError('network', ht)),
      );
      return;
    }
    const target = resolveAppPath(path);
    if (target) navigation.push(target.screen, target.params);
  };
  const execute = async (
    task: Task,
    input: Record<string, string>,
    op: string,
  ) => {
    if (!uid || useStore.getState().user?.uid !== uid) {
      useStore.getState().toggleAuthModal();
      throw new WorkspaceError('unauthorized');
    }
    const out = await competitionRequest(task.action, {
      ...taskPayload(task, input, Date.now()),
      operationId: op,
    });
    if (useStore.getState().user?.uid !== uid)
      throw new WorkspaceError('unauthorized');
    setNotice(ht ? 'Aksyon an konfime.' : 'Action confirmée.');
    if (out.eventId && kind === 'home')
      open(`/arena/evenements/${out.eventId}`);
    else if (out.teamId && task.action === 'team-create')
      open(`/arena/equipes/${out.teamId}`);
    else if (out.leagueId && task.action === 'league-create')
      open(`/arena/ligues/${out.leagueId}`);
    else await refresh();
  };
  const target: WorkspaceTarget = kind === 'home' ? { kind } : { kind, id };
  const page = visibleData
    ? workspacePage(target, visibleData, visibleMine, Date.now())
    : null;
  return (
    <ArenaScreen world={false}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={{ padding: 18, gap: 18, paddingBottom: 64 }}
      >
        <ArenaButton
          variant="secondary"
          label={ht ? 'Retounen' : 'Retour'}
          onPress={() => navigation.goBack()}
        />
        <Text
          accessibilityRole="header"
          style={[arenaType.hero, { color: C.ink }]}
        >
          {page ? copyFor(page.title, ht) : ht ? 'Konpetisyon' : 'Compétitions'}
        </Text>
        <ArenaButton
          variant="secondary"
          label={ht ? 'Jwe yon pati' : 'Jouer une partie'}
          onPress={() => navigation.navigate('Main', { screen: 'Trivia' })}
        />
        <ArenaButton
          variant="secondary"
          label={ht ? 'Tounwa ant zanmi' : 'Tournois entre amis'}
          onPress={() => navigation.push('Tournois', {})}
        />
        {!uid ? (
          <ArenaButton
            label={ht ? 'Konekte pou patisipe' : 'Se connecter pour participer'}
            onPress={() => useStore.getState().toggleAuthModal()}
          />
        ) : null}
        {kind === 'home' ? (
          <ArenaPanel>
            <TextInput
              accessibilityLabel={
                ht ? 'Kòd lekòl pou dekouvri' : 'Code école à parcourir'
              }
              value={school}
              onChangeText={setSchool}
              placeholder={ht ? 'Kòd lekòl' : 'Code école'}
              placeholderTextColor={C.muted}
              style={{ color: C.ink, minHeight: 48 }}
            />
            <TextInput
              accessibilityLabel={
                ht ? 'Depatman pou dekouvri' : 'Département à parcourir'
              }
              value={department}
              onChangeText={setDepartment}
              placeholder={ht ? 'Depatman' : 'Département'}
              placeholderTextColor={C.muted}
              style={{ color: C.ink, minHeight: 48 }}
            />
            <ArenaButton
              variant="secondary"
              label={ht ? 'Aplike' : 'Parcourir'}
              onPress={() => {
                setAppliedSchool(school);
                setAppliedDepartment(department);
              }}
            />
          </ArenaPanel>
        ) : null}
        {error || mineError || data?.errors?.length ? (
          <ArenaPanel tone="warn">
            <Text accessibilityRole="alert" style={{ color: C.ink }}>
              {error ||
                mineError ||
                (ht
                  ? 'Gen yon seksyon ki pa disponib.'
                  : 'Une section est indisponible.')}
            </Text>
            <ArenaButton
              variant="secondary"
              label={ht ? 'Eseye ankò' : 'Réessayer'}
              onPress={() => {
                void refresh();
              }}
            />
          </ArenaPanel>
        ) : null}
        {!data && !error ? (
          <Text accessibilityLiveRegion="polite" style={{ color: C.ink }}>
            {ht ? 'Ap chaje…' : 'Chargement…'}
          </Text>
        ) : null}
        {notice ? (
          <Text accessibilityLiveRegion="polite" style={{ color: C.ink }}>
            {notice}
          </Text>
        ) : null}
        {page?.panels.map((panel, index) => (
          <ArenaPanel key={`${uid}:${kind}:${id}:${index}`}>
            <Text
              accessibilityRole="header"
              style={[arenaType.name, { color: C.ink }]}
            >
              {copyFor(panel.title, ht)}
            </Text>
            {panel.paragraphs?.map((p, i) => (
              <Text key={i} style={[arenaType.body, { color: C.inkSoft }]}>
                {copyFor(p, ht)}
              </Text>
            ))}
            {panel.rows?.map((r, i) => {
              const person = rowPerson(r);
              const text = (
                <Text
                  key={person ? undefined : i}
                  style={[arenaType.body, { color: C.ink, flexShrink: 1 }]}
                >
                  {copyFor(rowCopy(r), ht)}
                </Text>
              );
              return person ? (
                <View
                  key={i}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                  }}
                >
                  <PersonFace person={person} />
                  {text}
                </View>
              ) : (
                text
              );
            })}
            {panel.links?.map((link, i) => (
              <ArenaButton
                key={i}
                variant="secondary"
                label={copyFor(link.label, ht)}
                onPress={() => open(link.path)}
              />
            ))}
            {panel.tasks?.map((task) => (
              <TaskForm
                key={`${uid}:${task.id}`}
                task={task}
                ht={ht}
                uid={uid}
                execute={execute}
              />
            ))}
          </ArenaPanel>
        ))}
        {data?.cursor ? (
          <ArenaButton
            variant="secondary"
            label={ht ? 'Plis evènman' : 'Plus d’événements'}
            onPress={() => {
              void competitionRequest('directory', {
                cursor: data.cursor,
                schoolKey: school || undefined,
                department: department || undefined,
              })
                .then((next) =>
                  setData({
                    ...next,
                    events: [...data.events, ...next.events],
                  }),
                )
                .catch(() => setError(workspaceError('network', ht)));
            }}
          />
        ) : null}
      </ScrollView>
    </ArenaScreen>
  );
}
