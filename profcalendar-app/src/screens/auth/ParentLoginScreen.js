import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, TouchableWithoutFeedback, Keyboard, StyleSheet, Alert, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import colors from '../../theme/colors';

export default function ParentLoginScreen({ navigation }) {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Erreur', 'Email et mot de passe requis');
      return;
    }
    setLoading(true);
    try {
      const user = await login('parent', { email: email.trim().toLowerCase(), password });
      if (user.needs_link) {
        navigation.navigate('LinkChild');
      }
    } catch (err) {
      const data = err.response?.data;
      if (data?.needs_verification) {
        navigation.navigate('VerifyEmail', {
          userType: 'parent',
          userId: data.parent_id,
        });
      } else {
        Alert.alert('Erreur', data?.error || 'Connexion échouée');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        <Text style={styles.title}>Connexion Parent</Text>
        <Text style={styles.subtitle}>Accédez au suivi scolaire de vos enfants</Text>

        <View style={styles.form}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            placeholder="votre.email@exemple.ch"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Text style={styles.label}>Mot de passe</Text>
          <TextInput
            style={styles.input}
            placeholder="••••••••"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={loading}
          >
            <Text style={styles.buttonText}>{loading ? 'Connexion...' : 'Se connecter'}</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity onPress={() => navigation.navigate('ParentRegister')}>
          <Text style={styles.link}>Pas encore de compte ? <Text style={styles.linkBold}>S'inscrire</Text></Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 24, backgroundColor: colors.background, justifyContent: 'center' },
  title: { fontSize: 24, fontWeight: '800', color: colors.text, textAlign: 'center' },
  subtitle: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', marginTop: 4, marginBottom: 32 },
  form: { gap: 4 },
  label: { fontSize: 14, fontWeight: '600', color: colors.text, marginTop: 12, marginBottom: 4 },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border, borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 14,
    fontSize: 16, color: colors.text,
  },
  button: {
    backgroundColor: colors.secondary, borderRadius: 12,
    paddingVertical: 16, alignItems: 'center', marginTop: 20,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  link: { textAlign: 'center', marginTop: 24, fontSize: 14, color: colors.textSecondary },
  linkBold: { color: colors.secondary, fontWeight: '700' },
});
