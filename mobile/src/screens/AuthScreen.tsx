import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  KeyboardAvoidingView, Platform, Image, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import { Mail, Lock, User, Eye, EyeOff, Check, AlertCircle } from 'lucide-react-native';
import useStore from '../contexts/store';
import {
  loginWithEmailPassword,
  registerWithEmailPassword,
  loginWithGoogleCredential,
  sendPasswordReset,
} from '../services/authService';

WebBrowser.maybeCompleteAuthSession();

const AZURE = '#0857A6';
const INK = '#0f172a';
const MUTED = '#64748b';
const BORDER = '#e8edf5';
const FIELD = '#f8fafc';

export default function AuthScreen() {
  const { setUser, setActiveTab, activeTab, language } = useStore();
  const isCreole = language === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState<'name' | 'email' | 'password' | null>(null);

  const [, response, promptAsync] = Google.useAuthRequest({
    // Fill these from app.json / EAS environment
    clientId: '',
    iosClientId: '',
    androidClientId: '',
    webClientId: '',
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

  async function handleSubmit() {
    if (!email.trim() || !password.trim() || (!isSignIn && !name.trim())) {
      setError(t('Remplis tous les champs.', 'Ranpli tout kaz yo.'));
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const user =
        activeTab === 'signin'
          ? await loginWithEmailPassword(email.trim(), password)
          : await registerWithEmailPassword(email.trim(), password, name.trim());
      setUser(user);
    } catch (e: any) {
      setError(e?.message || t('Une erreur est survenue.', 'Yon erè rive.'));
    } finally {
      setLoading(false);
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

  // Reusable field wrapper: lifts to white + azure ring while focused.
  const fieldStyle = (key: 'name' | 'email' | 'password') => ({
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    borderRadius: 14,
    paddingHorizontal: 14,
    borderWidth: 1.5,
    backgroundColor: focused === key ? '#ffffff' : FIELD,
    borderColor: focused === key ? AZURE : BORDER,
  });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f4f6fb' }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingVertical: 32 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Header — the brand mark, lit. Two soft glows behind the logo make
              the "EdLight" bulb read as genuinely illuminated (the signature). */}
          <View style={{ alignItems: 'center', paddingHorizontal: 24, marginBottom: 22 }}>
            <View style={{ width: 132, height: 132, alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
              {/* warm outer glow */}
              <View style={{ position: 'absolute', width: 132, height: 132, borderRadius: 66, backgroundColor: '#FDB022', opacity: 0.14 }} />
              {/* azure inner glow */}
              <View style={{ position: 'absolute', width: 96, height: 96, borderRadius: 48, backgroundColor: AZURE, opacity: 0.10 }} />
              {/* logo tile */}
              <View
                style={{
                  width: 84,
                  height: 84,
                  borderRadius: 22,
                  backgroundColor: '#ffffff',
                  alignItems: 'center',
                  justifyContent: 'center',
                  shadowColor: AZURE,
                  shadowOffset: { width: 0, height: 6 },
                  shadowOpacity: 0.16,
                  shadowRadius: 16,
                  elevation: 6,
                }}
              >
                <Image
                  source={require('../../assets/logo.png')}
                  style={{ width: 60, height: 60 }}
                  resizeMode="contain"
                />
              </View>
            </View>

            <Text style={{ fontSize: 12, fontWeight: '700', color: AZURE, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 6 }}>
              EdLight Academy
            </Text>
            <Text style={{ fontSize: 25, fontWeight: '800', color: INK, letterSpacing: -0.4, textAlign: 'center' }}>
              {isSignIn ? t('Bon retour \u{1F44B}', 'Byenveni tounen \u{1F44B}') : t('Crée ton compte', 'Kreye kont ou')}
            </Text>
            <Text style={{ fontSize: 14.5, color: MUTED, marginTop: 5, textAlign: 'center', lineHeight: 20 }}>
              {isSignIn
                ? t('Continue ta préparation au Bac.', 'Kontinye preparasyon Bak ou.')
                : t('Gratuit — et ta progression reste sauvegardée.', 'Gratis — epi pwogrè ou ap konsève.')}
            </Text>
          </View>

          {/* Card */}
          <View
            style={{
              marginHorizontal: 20,
              backgroundColor: '#ffffff',
              borderRadius: 24,
              borderWidth: 1,
              borderColor: BORDER,
              padding: 18,
              gap: 12,
              shadowColor: AZURE,
              shadowOffset: { width: 0, height: 8 },
              shadowOpacity: 0.06,
              shadowRadius: 20,
              elevation: 3,
            }}
          >
            {/* Segmented tabs */}
            <View style={{ flexDirection: 'row', backgroundColor: '#f1f5f9', borderRadius: 14, padding: 4, marginBottom: 2 }}>
              {(['signin', 'signup'] as const).map((tab) => {
                const active = activeTab === tab;
                return (
                  <TouchableOpacity
                    key={tab}
                    onPress={() => switchTab(tab)}
                    activeOpacity={0.9}
                    style={{
                      flex: 1,
                      paddingVertical: 10,
                      borderRadius: 10,
                      alignItems: 'center',
                      backgroundColor: active ? '#ffffff' : 'transparent',
                      shadowColor: active ? AZURE : 'transparent',
                      shadowOffset: { width: 0, height: 1 },
                      shadowOpacity: active ? 0.1 : 0,
                      shadowRadius: 3,
                      elevation: active ? 2 : 0,
                    }}
                  >
                    <Text style={{ fontWeight: '700', fontSize: 14, color: active ? AZURE : MUTED }}>
                      {tab === 'signin' ? t('Connexion', 'Koneksyon') : t('Inscription', 'Enskripsyon')}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {!isSignIn && (
              <View style={fieldStyle('name')}>
                <User color={focused === 'name' ? AZURE : '#9ca3af'} size={18} />
                <TextInput
                  style={{ flex: 1, paddingVertical: 14, marginLeft: 10, color: INK, fontSize: 16 }}
                  placeholder={t('Nom complet', 'Non konplè')}
                  value={name}
                  onChangeText={(v) => { setName(v); setError(null); }}
                  onFocus={() => setFocused('name')}
                  onBlur={() => setFocused(null)}
                  autoCapitalize="words"
                  textContentType="name"
                  placeholderTextColor="#9ca3af"
                />
              </View>
            )}

            <View style={fieldStyle('email')}>
              <Mail color={focused === 'email' ? AZURE : '#9ca3af'} size={18} />
              <TextInput
                style={{ flex: 1, paddingVertical: 14, marginLeft: 10, color: INK, fontSize: 16 }}
                placeholder={t('Adresse email', 'Adrès imèl')}
                value={email}
                onChangeText={(v) => { setEmail(v); setError(null); }}
                onFocus={() => setFocused('email')}
                onBlur={() => setFocused(null)}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                textContentType="emailAddress"
                placeholderTextColor="#9ca3af"
              />
            </View>

            <View style={fieldStyle('password')}>
              <Lock color={focused === 'password' ? AZURE : '#9ca3af'} size={18} />
              <TextInput
                style={{ flex: 1, paddingVertical: 14, marginLeft: 10, color: INK, fontSize: 16 }}
                placeholder={t('Mot de passe', 'Modpas')}
                value={password}
                onChangeText={(v) => { setPassword(v); setError(null); }}
                onFocus={() => setFocused('password')}
                onBlur={() => setFocused(null)}
                secureTextEntry={!showPw}
                autoCapitalize="none"
                textContentType={isSignIn ? 'password' : 'newPassword'}
                returnKeyType="go"
                onSubmitEditing={handleSubmit}
                placeholderTextColor="#9ca3af"
              />
              <TouchableOpacity onPress={() => setShowPw((v) => !v)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                {showPw ? <EyeOff color="#9ca3af" size={18} /> : <Eye color="#9ca3af" size={18} />}
              </TouchableOpacity>
            </View>

            {isSignIn && (
              <TouchableOpacity onPress={handleReset} style={{ alignSelf: 'flex-end' }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                {resetSent ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Check color={AZURE} size={14} />
                    <Text style={{ color: AZURE, fontSize: 13, fontWeight: '600' }}>{t('Email envoyé', 'Imèl voye')}</Text>
                  </View>
                ) : (
                  <Text style={{ color: AZURE, fontSize: 13, fontWeight: '600' }}>{t('Mot de passe oublié ?', 'Ou bliye modpas ou ?')}</Text>
                )}
              </TouchableOpacity>
            )}

            {/* Inline error — non-blocking, tells you what to fix */}
            {error && (
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca', borderRadius: 12, padding: 11 }}>
                <AlertCircle color="#dc2626" size={16} style={{ marginTop: 1 }} />
                <Text style={{ flex: 1, color: '#b91c1c', fontSize: 13, lineHeight: 18 }}>{error}</Text>
              </View>
            )}

            {/* Primary CTA */}
            <TouchableOpacity
              onPress={handleSubmit}
              disabled={loading}
              activeOpacity={0.9}
              style={{
                backgroundColor: AZURE,
                borderRadius: 16,
                paddingVertical: 16,
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'row',
                gap: 8,
                marginTop: 2,
                opacity: loading ? 0.7 : 1,
                shadowColor: AZURE,
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.28,
                shadowRadius: 10,
                elevation: 4,
              }}
            >
              {loading && <ActivityIndicator color="#ffffff" size="small" />}
              <Text style={{ color: '#ffffff', fontWeight: '700', fontSize: 16 }}>
                {loading
                  ? t('Un instant…', 'Yon ti moman…')
                  : isSignIn
                  ? t('Se connecter', 'Konekte')
                  : t('Créer mon compte', 'Kreye kont mwen')}
              </Text>
            </TouchableOpacity>

            {/* Divider */}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginVertical: 2 }}>
              <View style={{ flex: 1, height: 1, backgroundColor: '#eef2f7' }} />
              <Text style={{ color: '#94a3b8', fontSize: 12, marginHorizontal: 12 }}>{t('ou', 'oswa')}</Text>
              <View style={{ flex: 1, height: 1, backgroundColor: '#eef2f7' }} />
            </View>

            {/* Google */}
            <TouchableOpacity
              onPress={() => promptAsync()}
              disabled={loading}
              activeOpacity={0.85}
              style={{
                borderRadius: 16,
                paddingVertical: 14,
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'row',
                gap: 10,
                borderWidth: 1.5,
                borderColor: BORDER,
                backgroundColor: '#ffffff',
              }}
            >
              <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: '#ffffff', borderWidth: 1, borderColor: BORDER, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: '#4285F4', fontWeight: '800', fontSize: 14 }}>G</Text>
              </View>
              <Text style={{ color: '#374151', fontWeight: '600', fontSize: 15 }}>
                {t('Continuer avec Google', 'Kontinye ak Google')}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Reassurance footer */}
          <Text style={{ textAlign: 'center', color: '#94a3b8', fontSize: 12, marginTop: 18, paddingHorizontal: 32, lineHeight: 17 }}>
            {isSignIn
              ? t('Ravi de te revoir sur EdLight.', 'Kontan wè ou ankò sou EdLight.')
              : t('En continuant, tu rejoins des milliers d’élèves qui révisent sur EdLight.', 'Lè ou kontinye, ou jwenn dè milye elèv k’ap revize sou EdLight.')}
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
