import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  KeyboardAvoidingView, Platform, Alert, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import { Mail, Lock, User, Eye, EyeOff, Check } from 'lucide-react-native';
import useStore from '../contexts/store';
import {
  loginWithEmailPassword,
  registerWithEmailPassword,
  loginWithGoogleCredential,
  sendPasswordReset,
} from '../services/authService';

WebBrowser.maybeCompleteAuthSession();

export default function AuthScreen() {
  const { setUser, setActiveTab, activeTab } = useStore();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);

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
    setLoading(true);
    try {
      const user = await loginWithGoogleCredential(idToken, accessToken);
      setUser(user);
    } catch (e: any) {
      Alert.alert('Erreur Google', e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit() {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Champs requis', 'Veuillez remplir tous les champs.');
      return;
    }
    setLoading(true);
    try {
      const user =
        activeTab === 'signin'
          ? await loginWithEmailPassword(email.trim(), password)
          : await registerWithEmailPassword(email.trim(), password, name.trim());
      setUser(user);
    } catch (e: any) {
      Alert.alert('Erreur', e.message || 'Une erreur est survenue.');
    } finally {
      setLoading(false);
    }
  }

  async function handleReset() {
    if (!email.trim()) {
      Alert.alert('Email requis', 'Entrez votre adresse email pour réinitialiser.');
      return;
    }
    setLoading(true);
    try {
      await sendPasswordReset(email.trim());
      setResetSent(true);
    } catch (e: any) {
      Alert.alert('Erreur', e.message);
    } finally {
      setLoading(false);
    }
  }

  const isSignIn = activeTab === 'signin';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#ffffff' }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
          {/* Header */}
          <View style={{ alignItems: 'center', paddingTop: 48, paddingBottom: 32, paddingHorizontal: 24 }}>
            <Image
              source={require('../../assets/logo.png')}
              style={{ width: 80, height: 80, marginBottom: 16 }}
              resizeMode="contain"
            />
            <Text style={{ fontSize: 26, fontWeight: '800', color: '#0f172a' }}>EdLight Academy</Text>
            <Text style={{ color: '#64748b', marginTop: 4, textAlign: 'center' }}>
              Préparez votre Bac avec confiance
            </Text>
          </View>

          {/* Tabs */}
          <View className="flex-row mx-6 bg-gray-100 rounded-xl p-1 mb-6">
            {(['signin', 'signup'] as const).map((tab) => (
              <TouchableOpacity
                key={tab}
                onPress={() => setActiveTab(tab)}
                className={`flex-1 py-2.5 rounded-lg items-center`}
                style={activeTab === tab ? { backgroundColor: '#ffffff', shadowColor: '#0857A6', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 2, elevation: 2 } : {}}
              >
                <Text className={`font-semibold text-sm ${activeTab === tab ? 'text-primary-600' : 'text-gray-500'}`}>
                  {tab === 'signin' ? 'Connexion' : 'Inscription'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Form */}
          <View className="px-6 gap-3">
            {!isSignIn && (
              <View className="flex-row items-center bg-gray-50 rounded-xl px-4" style={{ borderWidth: 1, borderColor: '#e8edf5' }}>
                <User color="#9ca3af" size={18} />
                <TextInput
                  className="flex-1 py-3.5 ml-3 text-gray-900 text-base"
                  placeholder="Nom complet"
                  value={name}
                  onChangeText={setName}
                  autoCapitalize="words"
                  placeholderTextColor="#9ca3af"
                />
              </View>
            )}

            <View className="flex-row items-center bg-gray-50 rounded-xl px-4" style={{ borderWidth: 1, borderColor: '#e8edf5' }}>
              <Mail color="#9ca3af" size={18} />
              <TextInput
                className="flex-1 py-3.5 ml-3 text-gray-900 text-base"
                placeholder="Adresse email"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                placeholderTextColor="#9ca3af"
              />
            </View>

            <View className="flex-row items-center bg-gray-50 rounded-xl px-4" style={{ borderWidth: 1, borderColor: '#e8edf5' }}>
              <Lock color="#9ca3af" size={18} />
              <TextInput
                className="flex-1 py-3.5 ml-3 text-gray-900 text-base"
                placeholder="Mot de passe"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPw}
                autoCapitalize="none"
                placeholderTextColor="#9ca3af"
              />
              <TouchableOpacity onPress={() => setShowPw((v) => !v)}>
                {showPw ? <EyeOff color="#9ca3af" size={18} /> : <Eye color="#9ca3af" size={18} />}
              </TouchableOpacity>
            </View>

            {isSignIn && (
              <TouchableOpacity onPress={handleReset} className="items-end">
                {resetSent ? (
                  <View className="flex-row items-center gap-1">
                    <Check color="#0857A6" size={14} />
                    <Text className="text-primary-600 text-sm">Email envoyé</Text>
                  </View>
                ) : (
                  <Text className="text-primary-600 text-sm">Mot de passe oublié ?</Text>
                )}
              </TouchableOpacity>
            )}

            <TouchableOpacity
              onPress={handleSubmit}
              disabled={loading}
              className={`bg-primary-600 rounded-2xl py-4 items-center mt-2 ${loading ? 'opacity-60' : ''}`}
            >
              <Text className="text-white font-bold text-base">
                {loading ? 'Chargement…' : isSignIn ? 'Se connecter' : 'Créer un compte'}
              </Text>
            </TouchableOpacity>

            <View className="flex-row items-center my-2">
              <View className="flex-1 h-px bg-gray-200" />
              <Text className="text-gray-400 text-sm mx-3">ou</Text>
              <View className="flex-1 h-px bg-gray-200" />
            </View>

            <TouchableOpacity
              onPress={() => promptAsync()}
              disabled={loading}
              className="rounded-2xl py-3.5 items-center flex-row justify-center gap-3"
              style={{ borderWidth: 1, borderColor: '#e8edf5' }}
            >
              <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e8edf5', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: '#0857A6', fontWeight: '800', fontSize: 13 }}>G</Text>
              </View>
              <Text className="text-gray-700 font-semibold">Continuer avec Google</Text>
            </TouchableOpacity>
          </View>

          <View className="h-12" />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
