import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Alert, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '../../api/client';
import colors from '../../theme/colors';

const REASONS = [
  { key: 'maladie', label: 'Maladie / Accident' },
  { key: 'medecin', label: 'Rendez-vous médecin' },
  { key: 'transport', label: 'Problème de transport' },
  { key: 'conge_joker', label: 'Congé joker' },
  { key: 'dispense', label: 'Dispense' },
  { key: 'autre', label: 'Autre' },
];

export default function JustifyAbsenceScreen({ navigation }) {
  const [children, setChildren] = useState([]);
  const [selectedChildId, setSelectedChildId] = useState(null);
  const [absenceDate, setAbsenceDate] = useState('');
  const [reason, setReason] = useState('');
  const [otherReason, setOtherReason] = useState('');
  const [selectedPeriods, setSelectedPeriods] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get('/parent/dashboard');
        const kids = res.data.children || [];
        setChildren(kids);
        if (kids.length > 0) setSelectedChildId(kids[0].id);
      } catch (err) {}
    })();
  }, []);

  const togglePeriod = (p) => {
    setSelectedPeriods((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
    );
  };

  const handleSubmit = async () => {
    if (!selectedChildId || !absenceDate || !reason || selectedPeriods.length === 0) {
      Alert.alert('Erreur', 'Veuillez remplir tous les champs obligatoires');
      return;
    }

    // Validation du format de date
    if (!/^\d{4}-\d{2}-\d{2}$/.test(absenceDate)) {
      Alert.alert('Erreur', 'Format de date invalide (utilisez AAAA-MM-JJ)');
      return;
    }

    setLoading(true);
    try {
      const res = await api.post('/parent/justify-absence', {
        student_id: selectedChildId,
        absence_date: absenceDate,
        reason,
        other_reason_text: otherReason,
        periods: selectedPeriods,
      });

      Alert.alert('Succès', res.data.message, [
        { text: 'OK', onPress: () => navigation.goBack() }
      ]);
    } catch (err) {
      Alert.alert('Erreur', err.response?.data?.error || 'Échec de l\'envoi');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
      {/* Sélection enfant */}
      <Text style={styles.label}>Enfant</Text>
      <View style={styles.childrenRow}>
        {children.map((c) => (
          <TouchableOpacity
            key={c.id}
            style={[styles.childChip, selectedChildId === c.id && styles.childChipSelected]}
            onPress={() => setSelectedChildId(c.id)}
          >
            <Text style={[styles.childChipText, selectedChildId === c.id && styles.childChipTextSelected]}>
              {c.first_name}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Date */}
      <Text style={styles.label}>Date de l'absence</Text>
      <TextInput
        style={styles.input}
        value={absenceDate}
        onChangeText={setAbsenceDate}
        placeholder="AAAA-MM-JJ"
        keyboardType="numbers-and-punctuation"
      />

      {/* Périodes */}
      <Text style={styles.label}>Périodes concernées</Text>
      <View style={styles.periodsRow}>
        {[1, 2, 3, 4, 5, 6, 7, 8].map((p) => (
          <TouchableOpacity
            key={p}
            style={[styles.periodChip, selectedPeriods.includes(p) && styles.periodChipSelected]}
            onPress={() => togglePeriod(p)}
          >
            <Text style={[styles.periodChipText, selectedPeriods.includes(p) && styles.periodChipTextSelected]}>
              P{p}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Motif */}
      <Text style={styles.label}>Motif</Text>
      {REASONS.map((r) => (
        <TouchableOpacity
          key={r.key}
          style={[styles.reasonRow, reason === r.key && styles.reasonSelected]}
          onPress={() => setReason(r.key)}
        >
          <Ionicons
            name={reason === r.key ? 'radio-button-on' : 'radio-button-off'}
            size={20}
            color={reason === r.key ? colors.primary : colors.textLight}
          />
          <Text style={styles.reasonText}>{r.label}</Text>
        </TouchableOpacity>
      ))}

      {reason === 'autre' && (
        <>
          <Text style={styles.label}>Précisez</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={otherReason}
            onChangeText={setOtherReason}
            placeholder="Motif de l'absence..."
            multiline
            numberOfLines={3}
          />
        </>
      )}

      {/* Bouton */}
      <TouchableOpacity
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={handleSubmit}
        disabled={loading}
      >
        <Text style={styles.buttonText}>{loading ? 'Envoi...' : 'Envoyer la justification'}</Text>
      </TouchableOpacity>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 16 },
  label: { fontSize: 14, fontWeight: '700', color: colors.text, marginTop: 16, marginBottom: 8 },
  input: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: colors.text,
  },
  textArea: { minHeight: 80, textAlignVertical: 'top' },
  childrenRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  childChip: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
  },
  childChipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  childChipText: { fontSize: 14, fontWeight: '600', color: colors.text },
  childChipTextSelected: { color: '#FFF' },
  periodsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  periodChip: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    justifyContent: 'center', alignItems: 'center',
  },
  periodChipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  periodChipText: { fontSize: 14, fontWeight: '700', color: colors.text },
  periodChipTextSelected: { color: '#FFF' },
  reasonRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, paddingHorizontal: 12,
    backgroundColor: colors.surface, borderRadius: 10,
    marginBottom: 6, borderWidth: 1, borderColor: colors.border,
  },
  reasonSelected: { borderColor: colors.primary, backgroundColor: colors.primary + '08' },
  reasonText: { fontSize: 14, color: colors.text },
  button: {
    backgroundColor: colors.secondary, borderRadius: 12,
    paddingVertical: 16, alignItems: 'center', marginTop: 24,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
});
