import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Linking,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { ChevronLeft } from 'lucide-react-native';
import useStore from '../../contexts/store';
import {
  ArenaScreen,
  ArenaPanel,
  ArenaButton,
} from '../../components/arena/ArenaKit';
import {
  TaskForm,
  WorkspacePanel,
  arenaInputStyle,
} from '../../components/arena/WorkspaceKit';
import { arenaColors as C, arenaType } from '../../theme/arenaTheme';
import { competitionRequest } from '../../services/competitionService';
import {
  workspaceError,
  WorkspaceError,
} from '../../../../shared/competition/client';
import {
  copyFor,
  taskPayload,
  workspacePage,
  type Task,
  type WorkspaceTarget,
} from '../../../../shared/competition/workspace';
import { resolveAppPath } from '../../navigation/arenaLinks';

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
        contentContainerStyle={{ padding: 18, gap: 16, paddingBottom: 64 }}
      >
        <ArenaButton
          variant="secondary"
          label={ht ? 'Retounen' : 'Retour'}
          icon={<ChevronLeft color={C.ink} size={18} />}
          onPress={() => navigation.goBack()}
          style={{ alignSelf: 'flex-start' }}
        />
        <Text
          accessibilityRole="header"
          style={[arenaType.hero, { color: C.ink }]}
        >
          {page ? copyFor(page.title, ht) : ht ? 'Konpetisyon' : 'Compétitions'}
        </Text>
        {/* Two shortcuts side by side; they wrap onto two lines with large text. */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          <ArenaButton
            variant="secondary"
            label={ht ? 'Jwe yon pati' : 'Jouer une partie'}
            onPress={() => navigation.navigate('Main', { screen: 'Trivia' })}
            style={{ flexGrow: 1, flexBasis: 150 }}
          />
          <ArenaButton
            variant="secondary"
            label={ht ? 'Tounwa ant zanmi' : 'Tournois entre amis'}
            onPress={() => navigation.push('Tournois', {})}
            style={{ flexGrow: 1, flexBasis: 150 }}
          />
        </View>
        {!uid ? (
          <ArenaButton
            label={ht ? 'Konekte pou patisipe' : 'Se connecter pour participer'}
            onPress={() => useStore.getState().toggleAuthModal()}
          />
        ) : null}
        {kind === 'home' ? (
          <ArenaPanel style={{ gap: 12 }}>
            <Text
              accessibilityRole="header"
              style={[arenaType.name, { color: C.ink }]}
            >
              {ht ? 'Chèche evènman' : 'Parcourir les événements'}
            </Text>
            <TextInput
              accessibilityLabel={
                ht ? 'Kòd lekòl pou dekouvri' : 'Code école à parcourir'
              }
              value={school}
              onChangeText={setSchool}
              placeholder={ht ? 'Kòd lekòl' : 'Code école'}
              placeholderTextColor={C.muted}
              autoCapitalize="none"
              autoCorrect={false}
              style={arenaInputStyle}
            />
            <TextInput
              accessibilityLabel={
                ht ? 'Depatman pou dekouvri' : 'Département à parcourir'
              }
              value={department}
              onChangeText={setDepartment}
              placeholder={ht ? 'Depatman' : 'Département'}
              placeholderTextColor={C.muted}
              autoCorrect={false}
              style={arenaInputStyle}
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
            <Text
              accessibilityRole="alert"
              style={[arenaType.status, { color: C.ink }]}
            >
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
        {!visibleData && !error ? (
          <View
            accessibilityLiveRegion="polite"
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
          >
            <ActivityIndicator color={C.coral} />
            <Text style={[arenaType.status, { color: C.muted }]}>
              {ht ? 'Ap chaje…' : 'Chargement…'}
            </Text>
          </View>
        ) : null}
        {notice ? (
          <View
            style={{
              backgroundColor: C.successSoft,
              borderRadius: 14,
              padding: 12,
            }}
          >
            <Text
              accessibilityLiveRegion="polite"
              style={[arenaType.status, { color: C.ink }]}
            >
              {notice}
            </Text>
          </View>
        ) : null}
        {page?.panels.map((panel, index) => (
          <WorkspacePanel
            key={`${uid}:${kind}:${id}:${index}`}
            panel={panel}
            ht={ht}
            onOpen={open}
            renderTask={(task) => (
              <TaskForm
                key={`${uid}:${task.id}`}
                task={task}
                ht={ht}
                uid={uid}
                execute={execute}
              />
            )}
          />
        ))}
        {data?.cursor ? (
          <ArenaButton
            variant="secondary"
            label={ht ? 'Plis evènman' : 'Plus d’événements'}
            onPress={() => {
              // Same filters as the list on screen (the applied ones, not
              // whatever is half-typed in the browse fields).
              void competitionRequest('directory', {
                cursor: data.cursor,
                schoolKey: appliedSchool || undefined,
                department: appliedDepartment || undefined,
              })
                .then((next) =>
                  setData({
                    ...next,
                    events: [...(data.events || []), ...(next.events || [])],
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
