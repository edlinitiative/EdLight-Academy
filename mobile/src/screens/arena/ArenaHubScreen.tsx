import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ChevronLeft } from 'lucide-react-native';
import useStore from '../../contexts/store';
import PressableScale from '../../components/ui/PressableScale';
import { ArenaScreen } from '../../components/arena/ArenaKit';
import ArenaHubPanel from '../../components/arena/ArenaHubPanel';
import { arenaColors as C, arenaType } from '../../theme/arenaTheme';

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
  const isCreole = useStore((s) => s.language) === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);

  const toJeux = () => navigation.navigate('Main', { screen: 'Trivia' });
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
        <ArenaHubPanel onPractice={toJeux} onDuel={toJeux} />
      </ScrollView>
    </ArenaScreen>
  );
}
