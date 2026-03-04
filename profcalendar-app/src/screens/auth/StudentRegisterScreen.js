import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, TouchableWithoutFeedback, Keyboard, StyleSheet, Alert, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import api from '../../api/client';
import colors from '../../theme/colors';

export default function StudentRegisterScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [accessCode, setAccessCode] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    if (!email || !password || !accessCode) {
      Alert.alert('Erreur', 'Tous les champs sont requis');
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert('Erreur', 'Les mots de passe ne correspondent pas');
      return;
    }
    if (password.length < 8) {
      Alert.alert('Erreur', 'Le mot de passe doit contenir au moins 8 caractères');
      return;
    }

    setLoading(true);
    try {
      const res = await api.post('/auth/student/register', {
        email: email.trim().toLowerCase(),
        password,
        access_code: accessCode.trim().toUpperCase(),
      });

      if (res.data.needs_verification) {
        navigation.navigate('VerifyEmail', {
          userType: 'student',
          userId: res.data.student_id,
        });
      }
    } catch (err) {
      Alert.alert('Erreur', err.response?.data?.error || 'Inscription échouée');
    } finally {
      setLoading(false);
    }
  };

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        <Text style={styles.title}>Inscription Élève</Text>
        <Text style={styles.subtitle}>Utilisez le code d'accès fourni par votre enseignant</Text>

        <View style={styles.form}>
          <Text style={styles.label}>Code d'accès (6 caractères)</Text>
          <TextInput
            style={styles.input}
            placeholder="ABC123"
            value={accessCode}
            onChangeText={setAccessCode}
            autoCapitalize="characters"
            maxLength={6}
          />

          <Text style={styles.label}>Email (celui donné à votre enseignant)</Text>
          <TextInput
            style={styles.input}
            placeholder="votre.email@exemple.ch"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />

          <Text style={styles.label}>Mot de passe (min. 8 caractères)</Text>
          <TextInput
            style={styles.input}
            placeholder="••••••••"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

          <Text style={styles.label}>Confirmer le mot de passe</Text>
          <TextInput
            style={styles.input}
            placeholder="••••••••"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
          />

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleRegister}
            disabled={loading}
          >
            <Text style={styles.buttonText}>{loading ? 'Création...' : 'Créer mon compte'}</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity onPress={() => navigation.navigate('StudentLogin')}>
          <Text style={styles.link}>Déjà un compte ? <Text style={styles.linkBold}>Se connecter</Text></Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 24, backgroundColor: colors.background },
  title: { fontSize: 24, fontWeight: '800', color: colors.text, textAlign: 'center', marginTop: 16 },
  subtitle: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', marginTop: 4, marginBottom: 24 },
  form: { gap: 4 },
  label: { fontSize: 14, fontWeight: '600', color: colors.text, marginTop: 12, marginBottom: 4 },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border, borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 14,
    fontSize: 16, color: colors.text,
  },
  button: {
    backgroundColor: colors.primary, borderRadius: 12,
    paddingVertical: 16, alignItems: 'center', marginTop: 20,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  link: { textAlign: 'center', marginTop: 24, fontSize: 14, color: colors.textSecondary },
  linkBold: { color: colors.primary, fontWeight: '700' },
});
