import React from 'react';
import { Linking, ScrollView, Text, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import * as WebBrowser from 'expo-web-browser';
import { ChevronLeft, ExternalLink, MonitorPlay } from 'lucide-react-native';
import useStore from '../../contexts/store';
import PressableScale from '../../components/ui/PressableScale';
import { ArenaScreen, ArenaButton } from '../../components/arena/ArenaKit';
import ArenaHubPanel from '../../components/arena/ArenaHubPanel';
import { ARENA_DEMO_URL } from '../../navigation/arenaLinks';
import { arenaColors as C, arenaType } from '../../theme/arenaTheme';
import type { TriviaIntent } from '../../utils/triviaIntent';

/**
 * The Arena hub as a root route — where /arena deep links, "Retour à l'Arène"
 * actions and every unsupported Arena destination land (see
 * navigation/arenaLinks.ts). Same content as the Jeux tab's Arène segment:
 * one component, two hosts, so they can never disagree.
 *
 * No hero band: a back button and a title row, then the content.
 */
export default function ArenaHubScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const showDemo = route?.params?.section === 'demo';
  const isCreole = useStore((s) => s.language) === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);

  const toJeux = () => navigation.navigate('Main', { screen: 'Trivia' });
  // The intent rides along as a tab param: "Défier un ami" opens the duel
  // path directly, not the generic practice picker (M1).
  const toTrivia = (intent: TriviaIntent) =>
    navigation.navigate('Main', { screen: 'Trivia', params: { intent, nonce: Date.now() } });
  // The demo is a web simulation with fictional schools (M7). The app opens
  // it as itself — in an in-app browser — and never as a real event.
  const openDemo = () => {
    WebBrowser.openBrowserAsync(ARENA_DEMO_URL).catch(() => Linking.openURL(ARENA_DEMO_URL).catch(() => undefined));
  };
  const back = () => (navigation.canGoBack() ? navigation.goBack() : toJeux());

  return (
    <ArenaScreen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8 }}>
        <PressableScale
          onPress={back}
          accessibilityRole="button"
          accessibilityLabel={t('Retour', 'Retounen')}
          pressedScale={0.94}
          style={{
            width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
            backgroundColor: C.surfaceRaised,
          }}
        >
          <ChevronLeft color={C.inkSoft} size={22} />
        </PressableScale>
        <Text accessibilityRole="header" style={[arenaType.hero, { color: C.ink, flex: 1 }]}>
          {t('L’Arène', 'Arèn nan')}
        </Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }} showsVerticalScrollIndicator={false}>
        {showDemo ? (
          <View accessible={false} style={{ padding: 20, gap: 10, marginBottom: 14, borderRadius: 24, backgroundColor: C.surface }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <MonitorPlay color={C.signal} size={20} />
              <Text style={[arenaType.name, { color: C.ink, flex: 1 }]}>{t('La démo du championnat', 'Demo chanpyona a')}</Text>
            </View>
            <Text style={[arenaType.body, { color: C.muted }]}>
              {t(
                'C’est une simulation sur le web, avec des écoles fictives. Elle ne montre pas un vrai championnat.',
                'Se yon similasyon sou entènèt, ak lekòl ki pa egziste. Li pa montre yon vre chanpyona.',
              )}
            </Text>
            <ArenaButton
              variant="secondary"
              label={t('Ouvrir la démo sur le web', 'Louvri demo a sou entènèt')}
              accessibilityHint={t('S’ouvre dans un navigateur', 'L ap louvri nan yon navigatè')}
              onPress={openDemo}
              icon={<ExternalLink color={C.ink} size={16} />}
              style={{ backgroundColor: C.surfaceRaised }}
            />
          </View>
        ) : null}
        <ArenaHubPanel onPractice={() => toTrivia('practice')} onDuel={() => toTrivia('challenge')} />
      </ScrollView>
    </ArenaScreen>
  );
}
