import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, TouchableWithoutFeedback,
  Keyboard, StyleSheet, Alert, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import api from '../../api/client';
import colors from '../../theme/colors';

export default function VerifyEmailScreen({ route, navigation }) {
  const { userType, userId } = route.params;
  const { verifyEmail } = useAuth();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);

  const handleVerify = async () => {
    if (code.length < 4) {
      Alert.alert('Erreur', 'Veuillez entrer le code complet');
      return;
    }
    setLoading(true);
    try {
      const idKey = userType === 'student' ? 'student_id' : 'parent_id';
      const user = await verifyEmail(userType, { [idKey]: userId, code: code.trim() });
      if (userType === 'parent' && user.needs_link) {
        navigation.replace('LinkChild');
      }
      // Sinon le AuthContext redirigera automatiquement
    } catch (err) {
      Alert.alert('Erreur', err.response?.data?.error || 'Code invalide');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResending(true);
    try {
      const endpoint = userType === 'student'
        ? '/auth/student/resend-code'
        : '/auth/parent/resend-code';
      const idKey = userType === 'student' ? 'student_id' : 'parent_id';
      await api.post(endpoint, { [idKey]: userId });
      Alert.alert('Succès', 'Un nouveau code a été envoyé');
    } catch (err) {
      Alert.alert('Erreur', err.response?.data?.error || 'Impossible de renvoyer le code');
    } finally {
      setResending(false);
    }
  };

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <View style={styles.iconCircle}>
            <Ionicons name="mail-open" size={48} color={colors.primary} />
          </View>
          <Text style={styles.title}>Vérifiez votre email</Text>
          <Text style={styles.subtitle}>
            Un code de vérification a été envoyé à votre adresse email
          </Text>

          <TextInput
            style={styles.codeInput}
            placeholder="Code de vérification"
            value={code}
            onChangeText={setCode}
            keyboardType="number-pad"
            textAlign="center"
            maxLength={6}
            autoFocus
          />

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleVerify}
            disabled={loading}
          >
            <Text style={styles.buttonText}>{loading ? 'Vérification...' : 'Vérifier'}</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={handleResend} disabled={resending} style={{ marginTop: 20 }}>
            <Text style={styles.link}>
              {resending ? 'Envoi en cours...' : 'Renvoyer le code'}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1, padding: 24, backgroundColor: colors.background,
    justifyContent: 'center', alignItems: 'center',
  },
  iconCircle: {
    width: 90, height: 90, borderRadius: 45,
    backgroundColor: colors.primary + '20',
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 20,
  },
  title: { fontSize: 22, fontWeight: '800', color: colors.text },
  subtitle: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', marginTop: 8, marginBottom: 32, paddingHorizontal: 20 },
  codeInput: {
    backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.primary, borderRadius: 16,
    paddingHorizontal: 24, paddingVertical: 18,
    fontSize: 28, fontWeight: '700', color: colors.text,
    width: '80%', letterSpacing: 8,
  },
  button: {
    backgroundColor: colors.primary, borderRadius: 12,
    paddingVertical: 16, paddingHorizontal: 48,
    marginTop: 24,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  link: { color: colors.primary, fontSize: 14, fontWeight: '600' },
});
