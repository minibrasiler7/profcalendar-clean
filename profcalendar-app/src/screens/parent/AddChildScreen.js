import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, TouchableWithoutFeedback,
  Keyboard, StyleSheet, Alert, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '../../api/client';
import colors from '../../theme/colors';

export default function AddChildScreen({ navigation }) {
  const [teacherName, setTeacherName] = useState('');
  const [classCode, setClassCode] = useState('');
  const [loading, setLoading] = useState(false);

  const handleAddChild = async () => {
    if (!teacherName.trim() || !classCode.trim()) {
      Alert.alert('Erreur', 'Les deux champs sont requis');
      return;
    }
    setLoading(true);
    try {
      const res = await api.post('/parent/add-child', {
        teacher_name: teacherName.trim(),
        class_code: classCode.trim().toUpperCase(),
      });
      Alert.alert('Succès', res.data.message, [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (err) {
      Alert.alert('Erreur', err.response?.data?.error || 'Liaison échouée');
    } finally {
      setLoading(false);
    }
  };

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
          <View style={styles.iconCircle}>
            <Ionicons name="person-add" size={40} color={colors.secondary} />
          </View>
          <Text style={styles.title}>Ajouter un enfant</Text>
          <Text style={styles.subtitle}>
            Entrez le nom de l'enseignant et le code de classe fourni par l'école pour lier un enfant supplémentaire
          </Text>

          <View style={styles.form}>
            <Text style={styles.label}>Nom de l'enseignant</Text>
            <TextInput
              style={styles.input}
              value={teacherName}
              onChangeText={setTeacherName}
              placeholder="Nom de l'enseignant"
              placeholderTextColor={colors.textLight}
            />

            <Text style={styles.label}>Code de classe</Text>
            <TextInput
              style={styles.input}
              value={classCode}
              onChangeText={setClassCode}
              placeholder="Ex: ABC123"
              placeholderTextColor={colors.textLight}
              autoCapitalize="characters"
              maxLength={20}
            />

            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleAddChild}
              disabled={loading}
            >
              <Text style={styles.buttonText}>
                {loading ? 'Liaison en cours...' : 'Ajouter l\'enfant'}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1, padding: 24, backgroundColor: colors.background, justifyContent: 'center',
  },
  iconCircle: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: colors.secondary + '20',
    justifyContent: 'center', alignItems: 'center',
    alignSelf: 'center', marginBottom: 16,
  },
  title: { fontSize: 22, fontWeight: '800', color: colors.text, textAlign: 'center' },
  subtitle: {
    fontSize: 14, color: colors.textSecondary, textAlign: 'center',
    marginTop: 8, marginBottom: 32, paddingHorizontal: 16,
  },
  form: {},
  label: { fontSize: 14, fontWeight: '600', color: colors.text, marginTop: 12, marginBottom: 4 },
  input: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: colors.text,
  },
  button: {
    backgroundColor: colors.secondary, borderRadius: 12,
    paddingVertical: 16, alignItems: 'center', marginTop: 24,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
});
