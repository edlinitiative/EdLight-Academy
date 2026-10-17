import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import useStore from '../contexts/store';
import { reportError, getBuildInfo } from '../services/telemetry';

/**
 * Top-level containment for render errors.
 *
 * A crash anywhere under the navigator used to leave a white screen (release)
 * or a red box (dev) with no way back. This shows a calm bilingual screen, and
 * "Réessayer" / "Eseye ankò" re-mounts the whole tree under a new key — the
 * auth listener re-subscribes and the cached data is still there, so the
 * student lands back where they were in most cases. No stack trace is ever
 * shown to a student; the details go to telemetry with the build that
 * produced them.
 *
 * The fallback deliberately depends on nothing that might itself be broken:
 * no theme hook, no custom fonts, no navigation, no icons — only the store's
 * language and theme values, read defensively.
 */

type Props = { children: React.ReactNode };
type State = { error: unknown | null; resetKey: number };

const COPY = {
  fr: {
    title: 'Un petit souci',
    body: "Quelque chose s'est mal passé sur cet écran. Tu peux réessayer.",
    retry: 'Réessayer',
  },
  ht: {
    title: 'Yon ti pwoblèm',
    body: 'Gen yon bagay ki pa mache sou ekran sa a. Ou ka eseye ankò.',
    retry: 'Eseye ankò',
  },
};

const PALETTE = {
  light: { bg: '#FFFFFF', text: '#1F2937', muted: '#4B5563', button: '#1B6FE0', buttonText: '#FFFFFF' },
  dark: { bg: '#0F172A', text: '#F1F5F9', muted: '#CBD5E1', button: '#1B6FE0', buttonText: '#FFFFFF' },
};

function readPrefs(): { lang: 'fr' | 'ht'; dark: boolean } {
  try {
    const s = useStore.getState();
    return { lang: s.language === 'fr' ? 'fr' : 'ht', dark: s.theme === 'dark' };
  } catch {
    return { lang: 'ht', dark: false };
  }
}

export default class AppErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null, resetKey: 0 };

  static getDerivedStateFromError(error: unknown): Partial<State> {
    return { error };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    reportError(error, {
      flow: 'error_boundary',
      componentStack: String(info?.componentStack ?? '').slice(0, 2000),
      ...getBuildInfo(),
    });
  }

  private retry = () => {
    this.setState((s) => ({ error: null, resetKey: s.resetKey + 1 }));
  };

  render() {
    if (this.state.error == null) {
      return <React.Fragment key={this.state.resetKey}>{this.props.children}</React.Fragment>;
    }
    const { lang, dark } = readPrefs();
    const c = dark ? PALETTE.dark : PALETTE.light;
    const t = COPY[lang];
    return (
      <View style={[styles.root, { backgroundColor: c.bg }]} accessibilityRole="alert">
        <Text style={[styles.title, { color: c.text }]} accessibilityRole="header">{t.title}</Text>
        <Text style={[styles.body, { color: c.muted }]}>{t.body}</Text>
        <Pressable
          onPress={this.retry}
          accessibilityRole="button"
          accessibilityLabel={t.retry}
          style={({ pressed }) => [styles.button, { backgroundColor: c.button, opacity: pressed ? 0.85 : 1 }]}
        >
          <Text style={[styles.buttonText, { color: c.buttonText }]}>{t.retry}</Text>
        </Pressable>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 10,
  },
  body: {
    fontSize: 16,
    lineHeight: 23,
    textAlign: 'center',
    marginBottom: 28,
    maxWidth: 360,
  },
  button: {
    minHeight: 48,
    minWidth: 180,
    paddingHorizontal: 28,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '700',
  },
});
