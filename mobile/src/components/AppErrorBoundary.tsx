import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import useStore from '../contexts/store';
import { reportRenderError } from '../services/telemetry';

/**
 * Containment for render errors — at the root (around the whole navigator)
 * and around each tab, so one broken screen never takes the app down to a
 * white screen.
 *
 * Shows a calm bilingual screen with "Réessayer" / "Eseye ankò" (re-mounts
 * the subtree under a new key; cached data is still there, so the student
 * usually lands back where they were) and, when `onGoHome` is given,
 * "Retour à l'accueil" / "Retounen nan Akèy". No stack trace is ever shown to
 * a student; telemetry gets a sanitized signature with the build that
 * produced it (services/telemetry `reportRenderError`).
 *
 * The fallback deliberately depends on nothing that might itself be broken:
 * no theme hook, no custom fonts, no navigation, no icons — only the store's
 * language and theme values, read defensively.
 */

type Props = {
  children: React.ReactNode;
  /** Which boundary caught it ('root', 'Dashboard', 'Courses', …): a static name for diagnostics. */
  boundary?: string;
  /** Leave the broken screen for home. The boundary also resets itself. */
  onGoHome?: () => void;
};
type State = { error: unknown | null; resetKey: number };

export const BOUNDARY_COPY = {
  fr: {
    title: 'Un petit souci',
    body: "Quelque chose s'est mal passé sur cet écran. Tu peux réessayer.",
    retry: 'Réessayer',
    home: "Retour à l'accueil",
  },
  ht: {
    title: 'Yon ti pwoblèm',
    body: 'Gen yon bagay ki pa mache sou ekran sa a. Ou ka eseye ankò.',
    retry: 'Eseye ankò',
    home: 'Retounen nan Akèy',
  },
};

const PALETTE = {
  light: { bg: '#FFFFFF', text: '#1F2937', muted: '#4B5563', button: '#1B6FE0', buttonText: '#FFFFFF', ghost: '#1558B8' },
  dark: { bg: '#0F172A', text: '#F1F5F9', muted: '#CBD5E1', button: '#1B6FE0', buttonText: '#FFFFFF', ghost: '#7DB4F8' },
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

  componentDidCatch(error: unknown) {
    reportRenderError(error, this.props.boundary ?? 'root');
  }

  private retry = () => {
    this.setState((s) => ({ error: null, resetKey: s.resetKey + 1 }));
  };

  private goHome = () => {
    try { this.props.onGoHome?.(); } catch { /* still reset below */ }
    this.retry();
  };

  render() {
    if (this.state.error == null) {
      return <React.Fragment key={this.state.resetKey}>{this.props.children}</React.Fragment>;
    }
    const { lang, dark } = readPrefs();
    const c = dark ? PALETTE.dark : PALETTE.light;
    const t = BOUNDARY_COPY[lang];
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
        {this.props.onGoHome ? (
          <Pressable
            onPress={this.goHome}
            accessibilityRole="button"
            accessibilityLabel={t.home}
            style={({ pressed }) => [styles.ghost, { opacity: pressed ? 0.7 : 1 }]}
          >
            <Text style={[styles.buttonText, { color: c.ghost }]}>{t.home}</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }
}

/**
 * Wraps a tab's root component in its own boundary. Created once per tab at
 * module level so the component identity is stable across renders.
 */
export function withTabBoundary<P extends { navigation?: any }>(
  Component: React.ComponentType<P>,
  boundary: string,
): React.ComponentType<P> {
  function TabBoundary(props: P) {
    return (
      <AppErrorBoundary
        boundary={boundary}
        onGoHome={boundary === 'Dashboard' ? undefined : () => props.navigation?.navigate?.('Dashboard')}
      >
        <Component {...props} />
      </AppErrorBoundary>
    );
  }
  TabBoundary.displayName = `TabBoundary(${boundary})`;
  return TabBoundary;
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
  ghost: {
    minHeight: 48,
    minWidth: 180,
    paddingHorizontal: 28,
    marginTop: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '700',
  },
});
