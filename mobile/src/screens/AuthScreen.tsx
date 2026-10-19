import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  KeyboardAvoidingView, Platform, Image, 
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { Mail, Lock, User, Eye, EyeOff, Check, AlertCircle, Gift, ChevronDown, ChevronUp, PartyPopper, ThumbsUp } from 'lucide-react-native';
import useStore from '../contexts/store';
import { useTheme, useColorScheme, touch } from '../theme/theme';
import Button from '../components/ui/Button';
import Segmented from '../components/ui/Segmented';
import {
  loginWithEmailPassword,
  registerWithEmailPassword,
  loginWithGoogleCredential,
  loginWithAppleCredential,
  sendPasswordReset,
} from '../services/authService';
import { redeemReferral, type RedeemResult } from '../services/referralService';
import Confetti from '../components/ui/Confetti';
import PopIn from '../components/ui/PopIn';
import { useContentContainerStyle } from '../components/ui/ContentContainer';
import * as haptics from '../utils/haptics';

WebBrowser.maybeCompleteAuthSession();

export default function AuthScreen() {
  const { setUser, setActiveTab, activeTab, language } = useStore();
  const { colors, fonts, radius, featureSurface, elevation } = useTheme();
  // Rendered only inside AuthModal (an RN Modal): pad by the root provider's
  // insets instead of a native SafeAreaView, which can measure 0 in a Modal.
  const insets = useSafeAreaInsets();
  const centerColumn = useContentContainerStyle('form');
  const isCreole = language === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);

  // Themed aliases so the card/text/fields adapt to light + dark.
  const AZURE = colors.azure;
  const INK = colors.ink;
  const MUTED = colors.muted;
  const FIELD = colors.surfaceAlt;

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState<'name' | 'email' | 'password' | 'referral' | null>(null);

  // Optional referral code entered at signup (collapsible / secondary).
  const [referralCode, setReferralCode] = useState('');
  const [showReferral, setShowReferral] = useState(false);
  // When a code was redeemed at signup we hold the result + the pending user and
  // show a brief overlay BEFORE flipping auth state (which unmounts this screen).
  const [celebration, setCelebration] = useState<{ result: RedeemResult; user: any } | null>(null);

  // Google OAuth client IDs from the edlight-academy Firebase project.
  // webClientId is the audience Firebase expects for the returned idToken.
  // androidClientId is the OAuth client registered against the Play App
  // Signing SHA-1 (Play-store installs are re-signed with that key). A second
  // Android client (...-8h16t4sk) exists for the upload-key cert if a
  // sideloaded/dev build ever needs it.
  const [, response, promptAsync] = Google.useAuthRequest({
    iosClientId: '618990331083-7snnbt287h2k9b82mkoufloj6um0epl4.apps.googleusercontent.com',
    androidClientId: '618990331083-mk0sbf8s32qtkm9bisvfht0pps351fh4.apps.googleusercontent.com',
    webClientId: '618990331083-lq461c7uqjr6sk389qi1tarcdrgfcobj.apps.googleusercontent.com',
  });

  React.useEffect(() => {
    if (response?.type === 'success') {
      const { authentication } = response;
      if (authentication?.idToken) {
        handleGoogleToken(authentication.idToken, authentication.accessToken ?? undefined);
      }
    }
  }, [response]);

  async function handleGoogleToken(idToken: string, accessToken?: string) {
    setError(null);
    setLoading(true);
    try {
      const user = await loginWithGoogleCredential(idToken, accessToken);
      setUser(user);
    } catch (e: any) {
      setError(e?.message || t('Connexion Google impossible.', 'Koneksyon Google echwe.'));
    } finally {
      setLoading(false);
    }
  }

  // Sign in with Apple — iOS only, and only when the device supports it.
  // The scheme comes from the store (the app theme is a manual setting that
  // deliberately doesn't follow the OS), so the button never ends up white on
  // a white card because the OS happens to be in dark mode.
  const colorScheme = useColorScheme();
  const [appleAvailable, setAppleAvailable] = useState(false);
  React.useEffect(() => {
    if (Platform.OS !== 'ios') return;
    AppleAuthentication.isAvailableAsync().then(setAppleAvailable).catch(() => setAppleAvailable(false));
  }, []);

  async function handleAppleSignIn() {
    setError(null);
    try {
      // Firebase verifies Apple's token against the SHA-256 of a nonce; we send
      // the hash to Apple and the raw value to Firebase.
      const rawNonce = Array.from(await Crypto.getRandomBytesAsync(16))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
      const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce: hashedNonce,
      });
      if (!credential.identityToken) {
        setError(t('Connexion Apple impossible.', 'Koneksyon Apple echwe.'));
        return;
      }
      const fullName = [credential.fullName?.givenName, credential.fullName?.familyName]
        .filter(Boolean)
        .join(' ');
      setLoading(true);
      const user = await loginWithAppleCredential(credential.identityToken, rawNonce, fullName || undefined);
      setUser(user);
    } catch (e: any) {
      // The user cancelling the native sheet is not an error.
      if (e?.code === 'ERR_REQUEST_CANCELED') return;
      setError(e?.message || t('Connexion Apple impossible.', 'Koneksyon Apple echwe.'));
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit() {
    if (!email.trim() || !password.trim() || (!isSignIn && !name.trim())) {
      setError(t('Remplis tous les champs.', 'Ranpli tout kaz yo.'));
      return;
    }
    setError(null);
    setLoading(true);
    try {
      if (activeTab === 'signin') {
        const user = await loginWithEmailPassword(email.trim(), password);
        setUser(user);
      } else {
        const user = await registerWithEmailPassword(email.trim(), password, name.trim());
        await finishSignup(user);
      }
    } catch (e: any) {
      setError(e?.message || t('Une erreur est survenue.', 'Yon erè rive.'));
    } finally {
      setLoading(false);
    }
  }

  /**
   * Complete a NEW-account signup. If the learner entered a friend's code, we
   * redeem it best-effort: on a real result (reward or a rejection reason) we
   * show a brief overlay, then flip auth state. A network/auth glitch never
   * blocks signup — we just proceed.
   */
  async function finishSignup(user: any) {
    const code = referralCode.trim();
    if (!code) {
      setUser(user);
      return;
    }
    const result = await redeemReferral(code);
    if (result.kind === 'ok') {
      haptics.success();
      setCelebration({ result, user });
    } else if (result.kind === 'rejected') {
      haptics.warn();
      setCelebration({ result, user });
    } else {
      // 'auth' | 'error' — best-effort, never block signup.
      setUser(user);
    }
  }

  // Auto-continue from the referral overlay into the app.
  React.useEffect(() => {
    if (!celebration) return;
    const ms = celebration.result.kind === 'ok' ? 2600 : 2200;
    const id = setTimeout(() => setUser(celebration.user), ms);
    return () => clearTimeout(id);
  }, [celebration, setUser]);

  /** Gentle localized note for a redeem rejection. */
  function reasonNote(reason: string): string {
    switch (reason) {
      case 'invalid_code':
        return t('Code invalide, mais ton compte est bien créé.', 'Kòd la pa bon, men kont ou kreye byen.');
      case 'already_referred':
        return t('Tu as déjà utilisé un code.', 'Ou deja sèvi ak yon kòd.');
      case 'self':
        return t('Tu ne peux pas utiliser ton propre code.', 'Ou pa ka sèvi ak pwòp kòd ou.');
      case 'too_old':
        return t('Ce code ne peut plus être utilisé sur ce compte.', 'Kòd sa a pa ka itilize sou kont sa a ankò.');
      default:
        return t('Code non appliqué, mais ton compte est prêt.', 'Kòd la pa aplike, men kont ou pare.');
    }
  }

  async function handleReset() {
    if (!email.trim()) {
      setError(t('Entre ton email pour réinitialiser ton mot de passe.', 'Antre imèl ou pou reyinisyalize modpas la.'));
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await sendPasswordReset(email.trim());
      setResetSent(true);
    } catch (e: any) {
      setError(e?.message || t('Une erreur est survenue.', 'Yon erè rive.'));
    } finally {
      setLoading(false);
    }
  }

  function switchTab(tab: 'signin' | 'signup') {
    setActiveTab(tab);
    setError(null);
    setResetSent(false);
  }

  const isSignIn = activeTab === 'signin';

  // Field: 56 tall, radius 12, opaque grey; while focused it lifts to the
  // surface with an azure focus ring (a control state, not a card outline).
  const fieldStyle = (key: 'name' | 'email' | 'password' | 'referral') => ({
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    minHeight: 56,
    borderRadius: radius.control,
    paddingHorizontal: 16,
    borderWidth: 1.5,
    backgroundColor: focused === key ? colors.surface : FIELD,
    borderColor: focused === key ? AZURE : 'transparent',
  });
  const inputStyle = { flex: 1, minHeight: 54, marginLeft: 12, color: INK, fontFamily: fonts.regular, fontSize: 17 } as const;
  const FieldLabel = ({ children }: { children: string }) => (
    <Text style={{ fontFamily: fonts.medium, fontSize: 15, lineHeight: 20, color: MUTED, marginBottom: 6 }}>{children}</Text>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top, paddingBottom: insets.bottom }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={{ flex: 1 }}
          // paddingTop clears AuthModal's floating close button.
          contentContainerStyle={[{ flexGrow: 1, justifyContent: 'center', paddingTop: 72, paddingBottom: 32 }, centerColumn]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Header — the brand mark on the page ground. No glow, no eyebrow. */}
          <View style={{ alignItems: 'center', paddingHorizontal: 24, marginBottom: 24 }}>
            <View
              style={{
                width: 72, height: 72, borderRadius: 22, backgroundColor: colors.surface,
                alignItems: 'center', justifyContent: 'center', marginBottom: 18, ...elevation.card,
              }}
            >
              <Image source={require('../../assets/logo.png')} style={{ width: 52, height: 52 }} resizeMode="contain" />
            </View>
            <Text accessibilityRole="header" style={{ fontFamily: fonts.heading, fontSize: 28, lineHeight: 33, letterSpacing: -1, color: INK, textAlign: 'center' }}>
              {isSignIn ? t('Bon retour', 'Byenveni tounen') : t('Crée ton compte', 'Kreye kont ou')}
            </Text>
            <Text style={{ fontFamily: fonts.regular, fontSize: 16, lineHeight: 23, color: MUTED, marginTop: 6, textAlign: 'center' }}>
              {isSignIn
                ? t('Continue là où tu t’es arrêté.', 'Kontinye kote ou te rive a.')
                : t('Gratuit, et ta progression reste sauvegardée.', 'Gratis, epi pwogrè ou ap konsève.')}
            </Text>
          </View>

          {/* Card */}
          <View style={[featureSurface, { marginHorizontal: 20, padding: 20, gap: 14 }]}>
            <Segmented
              options={[
                { key: 'signin', label: t('Connexion', 'Koneksyon') },
                { key: 'signup', label: t('Inscription', 'Enskripsyon') },
              ]}
              value={isSignIn ? 'signin' : 'signup'}
              onChange={(k) => switchTab(k as 'signin' | 'signup')}
            />

            {!isSignIn && (
              <View>
                <FieldLabel>{t('Nom complet', 'Non konplè')}</FieldLabel>
                <View style={fieldStyle('name')}>
                  <User color={focused === 'name' ? AZURE : colors.muted} size={20} />
                  <TextInput
                    style={inputStyle}
                    placeholder={t('Prénom et nom', 'Non ak siyati')}
                    accessibilityLabel={t('Nom complet', 'Non konplè')}
                    value={name}
                    onChangeText={(v) => { setName(v); setError(null); }}
                    onFocus={() => setFocused('name')}
                    onBlur={() => setFocused(null)}
                    autoCapitalize="words"
                    textContentType="name"
                    placeholderTextColor={colors.faint}
                  />
                </View>
              </View>
            )}

            <View>
              <FieldLabel>{t('Adresse email', 'Adrès imèl')}</FieldLabel>
              <View style={fieldStyle('email')}>
                <Mail color={focused === 'email' ? AZURE : colors.muted} size={20} />
                <TextInput
                  style={inputStyle}
                  placeholder="nom@exemple.com"
                  accessibilityLabel={t('Adresse email', 'Adrès imèl')}
                  value={email}
                  onChangeText={(v) => { setEmail(v); setError(null); }}
                  onFocus={() => setFocused('email')}
                  onBlur={() => setFocused(null)}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                  textContentType="emailAddress"
                  placeholderTextColor={colors.faint}
                />
              </View>
            </View>

            <View>
              <FieldLabel>{t('Mot de passe', 'Modpas')}</FieldLabel>
              <View style={fieldStyle('password')}>
                <Lock color={focused === 'password' ? AZURE : colors.muted} size={20} />
                <TextInput
                  style={inputStyle}
                  placeholder={isSignIn ? t('Ton mot de passe', 'Modpas ou') : t('6 caractères minimum', '6 karaktè minimòm')}
                  accessibilityLabel={t('Mot de passe', 'Modpas')}
                  value={password}
                  onChangeText={(v) => { setPassword(v); setError(null); }}
                  onFocus={() => setFocused('password')}
                  onBlur={() => setFocused(null)}
                  secureTextEntry={!showPw}
                  autoCapitalize="none"
                  textContentType={isSignIn ? 'password' : 'newPassword'}
                  returnKeyType="go"
                  onSubmitEditing={handleSubmit}
                  placeholderTextColor={colors.faint}
                />
                <TouchableOpacity
                  onPress={() => setShowPw((v) => !v)}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  accessibilityRole="button"
                  accessibilityLabel={showPw
                    ? t('Masquer le mot de passe', 'Kache modpas')
                    : t('Afficher le mot de passe', 'Montre modpas')}
                >
                  {showPw ? <EyeOff color={colors.muted} size={20} /> : <Eye color={colors.muted} size={20} />}
                </TouchableOpacity>
              </View>
            </View>

            {/* Optional referral code — secondary, collapsible, signup only. */}
            {!isSignIn && (
              <View>
                <TouchableOpacity
                  onPress={() => setShowReferral((v) => !v)}
                  activeOpacity={0.7}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: touch.min }}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: showReferral }}
                >
                  <Gift color={colors.azureInk} size={18} />
                  <Text style={{ flex: 1, color: MUTED, fontFamily: fonts.medium, fontSize: 15 }}>
                    {t('Un ami t’a invité ? Entre son code', 'Yon zanmi envite w ? Antre kòd li')}
                  </Text>
                  {showReferral ? <ChevronUp color={colors.faint} size={18} /> : <ChevronDown color={colors.faint} size={18} />}
                </TouchableOpacity>
                {showReferral && (
                  <View style={[fieldStyle('referral'), { marginTop: 6 }]}>
                    <Gift color={focused === 'referral' ? AZURE : colors.muted} size={20} />
                    <TextInput
                      style={[inputStyle, { letterSpacing: 2 }]}
                      placeholder={t('Code d’invitation', 'Kòd envitasyon')}
                      accessibilityLabel={t('Code d’invitation', 'Kòd envitasyon')}
                      value={referralCode}
                      onChangeText={(v) => setReferralCode(v.toUpperCase())}
                      onFocus={() => setFocused('referral')}
                      onBlur={() => setFocused(null)}
                      autoCapitalize="characters"
                      autoCorrect={false}
                      maxLength={12}
                      placeholderTextColor={colors.faint}
                    />
                  </View>
                )}
              </View>
            )}

            {isSignIn && (
              <TouchableOpacity
                onPress={handleReset}
                style={{ alignSelf: 'flex-end', minHeight: touch.min, justifyContent: 'center' }}
                hitSlop={{ top: 4, bottom: 4, left: 8, right: 8 }}
                accessibilityRole="button"
              >
                {resetSent ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Check color={colors.azureInk} size={16} />
                    <Text style={{ color: colors.azureInk, fontFamily: fonts.bold, fontSize: 15 }}>{t('Email envoyé', 'Imèl voye')}</Text>
                  </View>
                ) : (
                  <Text style={{ color: colors.azureInk, fontFamily: fonts.bold, fontSize: 15 }}>{t('Mot de passe oublié ?', 'Ou bliye modpas ou ?')}</Text>
                )}
              </TouchableOpacity>
            )}

            {/* Inline error — an opaque wash, tells you what to fix */}
            {error && (
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: colors.dangerSoft, borderRadius: radius.control, padding: 14 }}>
                <AlertCircle color={colors.danger} size={18} style={{ marginTop: 1 }} />
                <Text accessibilityRole="alert" style={{ flex: 1, color: INK, fontFamily: fonts.medium, fontSize: 15, lineHeight: 21 }}>{error}</Text>
              </View>
            )}

            {/* Primary CTA — the page's one solid azure. */}
            <Button
              size="lg"
              fullWidth
              loading={loading}
              onPress={handleSubmit}
              label={isSignIn ? t('Se connecter', 'Konekte') : t('Créer mon compte', 'Kreye kont mwen')}
            />

            <Text style={{ color: colors.muted, fontFamily: fonts.regular, fontSize: 15, textAlign: 'center' }}>{t('ou', 'oswa')}</Text>

            {/* Google */}
            <Button
              size="lg"
              fullWidth
              variant="outline"
              disabled={loading}
              onPress={() => promptAsync()}
              label={t('Continuer avec Google', 'Kontinye ak Google')}
              icon={<Text style={{ color: '#4285F4', fontFamily: fonts.heading, fontSize: 18 }}>G</Text>}
            />

            {/* Sign in with Apple — required by App Store guideline 4.8 alongside
                Google. iOS only, using Apple's own button per their HIG. */}
            {appleAvailable && (
              <AppleAuthentication.AppleAuthenticationButton
                buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
                buttonStyle={
                  colorScheme === 'dark'
                    ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                    : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
                }
                cornerRadius={radius.control}
                style={{ height: 52, width: '100%' }}
                onPress={handleAppleSignIn}
              />
            )}
          </View>

          {/* Reassurance footer */}
          <Text style={{ textAlign: 'center', color: colors.muted, fontFamily: fonts.regular, fontSize: 14, marginTop: 20, paddingHorizontal: 32, lineHeight: 20 }}>
            {isSignIn
              ? t('Ravi de te revoir sur EdLight.', 'Kontan wè ou ankò sou EdLight.')
              : t('En continuant, tu rejoins des milliers d’élèves qui révisent sur EdLight.', 'Lè ou kontinye, ou jwenn dè milye elèv k’ap revize sou EdLight.')}
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Referral result overlay — shown briefly before entering the app. */}
      {celebration && (
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => setUser(celebration.user)}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(6,12,24,0.78)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}
        >
          {celebration.result.kind === 'ok' && <Confetti fireKey={String(celebration.result.reward.xp)} />}
          <PopIn>
            <View style={{ alignItems: 'center', gap: 10 }}>
              {celebration.result.kind === 'ok'
                ? <PartyPopper color="#ffffff" size={44} strokeWidth={1.75} />
                : <ThumbsUp color="#ffffff" size={44} strokeWidth={1.75} />}
              {celebration.result.kind === 'ok' ? (
                <>
                  <Text style={{ color: '#fff', fontSize: 20, fontWeight: '800', textAlign: 'center' }}>
                    {t('Bonus débloqué !', 'Bonus debloke !')}
                  </Text>
                  <Text style={{ color: '#fff', fontSize: 15, fontWeight: '600', textAlign: 'center', opacity: 0.95 }}>
                    {t(
                      `+${celebration.result.reward.streakFreeze} gel de série, +${celebration.result.reward.xp} XP`,
                      `+${celebration.result.reward.streakFreeze} jèl seri, +${celebration.result.reward.xp} XP`,
                    )}
                  </Text>
                </>
              ) : celebration.result.kind === 'rejected' ? (
                <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600', textAlign: 'center', lineHeight: 22 }}>
                  {reasonNote(celebration.result.reason)}
                </Text>
              ) : null}
              <Text style={{ color: '#fff', fontSize: 14, opacity: 0.8, marginTop: 6 }}>
                {t('Touche pour continuer', 'Touche pou kontinye')}
              </Text>
            </View>
          </PopIn>
        </TouchableOpacity>
      )}
    </View>
  );
}
