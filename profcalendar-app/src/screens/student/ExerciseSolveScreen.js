import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Modal,
  Image,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import api from '../../api/client';
import colors from '../../theme/colors';

export default function ExerciseSolveScreen({ route, navigation }) {
  const { missionId } = route.params;
  const [exercise, setExercise] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [answers, setAnswers] = useState({});
  const [resultModal, setResultModal] = useState(false);
  const [result, setResult] = useState(null);

  const fetchExercise = async () => {
    try {
      const res = await api.get(`/student/missions/${missionId}`);
      setExercise(res.data);
      initializeAnswers(res.data);
    } catch (err) {
      console.log('Exercise error:', err.response?.data);
      Alert.alert('Erreur', 'Impossible de charger l\'exercice');
    } finally {
      setLoading(false);
    }
  };

  const initializeAnswers = (exData) => {
    const initialAnswers = {};
    exData.blocks?.forEach((block, idx) => {
      if (block.type === 'qcm') {
        initialAnswers[idx] = null;
      } else if (block.type === 'short_answer') {
        initialAnswers[idx] = '';
      } else if (block.type === 'fill_blank') {
        initialAnswers[idx] = {};
        block.blanks?.forEach((blank, bidx) => {
          initialAnswers[idx][bidx] = '';
        });
      } else if (block.type === 'sorting') {
        initialAnswers[idx] = block.items ? [...block.items] : [];
      } else if (block.type === 'image') {
        initialAnswers[idx] = null;
      } else if (block.type === 'graph') {
        initialAnswers[idx] = {};
      }
    });
    setAnswers(initialAnswers);
  };

  useFocusEffect(
    useCallback(() => {
      fetchExercise();
    }, [missionId])
  );

  const handleQCMChange = (blockIdx, optionIdx) => {
    setAnswers({
      ...answers,
      [blockIdx]: optionIdx,
    });
  };

  const handleShortAnswerChange = (blockIdx, text) => {
    setAnswers({
      ...answers,
      [blockIdx]: text,
    });
  };

  const handleBlankChange = (blockIdx, blankIdx, text) => {
    setAnswers({
      ...answers,
      [blockIdx]: {
        ...answers[blockIdx],
        [blankIdx]: text,
      },
    });
  };

  const moveItem = (blockIdx, itemIdx, direction) => {
    const items = [...answers[blockIdx]];
    if (direction === 'up' && itemIdx > 0) {
      [items[itemIdx], items[itemIdx - 1]] = [items[itemIdx - 1], items[itemIdx]];
    } else if (direction === 'down' && itemIdx < items.length - 1) {
      [items[itemIdx], items[itemIdx + 1]] = [items[itemIdx + 1], items[itemIdx]];
    }
    setAnswers({
      ...answers,
      [blockIdx]: items,
    });
  };

  const handleImageSelect = (blockIdx) => {
    Alert.alert('Image', 'Sélection de position sur l\'image (non implémentée)');
  };

  const handleGraphChange = (blockIdx, field, value) => {
    setAnswers({
      ...answers,
      [blockIdx]: {
        ...answers[blockIdx],
        [field]: value,
      },
    });
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const res = await api.post(`/student/missions/${missionId}/submit`, { answers });
      setResult(res.data);
      setResultModal(true);
    } catch (err) {
      console.log('Submit error:', err.response?.data);
      Alert.alert('Erreur', 'Impossible de soumettre votre réponse');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResultClose = () => {
    setResultModal(false);
    navigation.goBack();
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!exercise) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>Exercice non trouvé</Text>
      </View>
    );
  }

  const renderBlock = (block, idx) => {
    switch (block.type) {
      case 'qcm':
        return (
          <View key={idx} style={styles.blockContainer}>
            <Text style={styles.blockTitle}>{block.question}</Text>
            <View style={styles.optionsContainer}>
              {block.options?.map((option, optIdx) => (
                <TouchableOpacity
                  key={optIdx}
                  style={[
                    styles.optionButton,
                    answers[idx] === optIdx && styles.optionButtonSelected,
                  ]}
                  onPress={() => handleQCMChange(idx, optIdx)}
                >
                  <View
                    style={[
                      styles.optionRadio,
                      answers[idx] === optIdx && styles.optionRadioSelected,
                    ]}
                  />
                  <Text style={styles.optionText}>{option}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        );

      case 'short_answer':
        return (
          <View key={idx} style={styles.blockContainer}>
            <Text style={styles.blockTitle}>{block.question}</Text>
            <TextInput
              style={styles.textInput}
              placeholder="Votre réponse"
              placeholderTextColor={colors.textLight}
              value={answers[idx] || ''}
              onChangeText={(text) => handleShortAnswerChange(idx, text)}
              multiline
            />
          </View>
        );

      case 'fill_blank':
        return (
          <View key={idx} style={styles.blockContainer}>
            <Text style={styles.blockTitle}>Complétez le texte</Text>
            <View style={styles.fillBlankContainer}>
              {block.text?.map((part, pidx) => (
                <View key={pidx} style={styles.fillBlankPart}>
                  <Text style={styles.fillBlankText}>{part.text}</Text>
                  {part.blank_idx != null && (
                    <TextInput
                      style={styles.fillBlankInput}
                      placeholder="..."
                      placeholderTextColor={colors.textLight}
                      value={answers[idx]?.[part.blank_idx] || ''}
                      onChangeText={(text) =>
                        handleBlankChange(idx, part.blank_idx, text)
                      }
                    />
                  )}
                </View>
              ))}
            </View>
          </View>
        );

      case 'sorting':
        return (
          <View key={idx} style={styles.blockContainer}>
            <Text style={styles.blockTitle}>Ordonnez les éléments</Text>
            <View style={styles.sortingContainer}>
              {answers[idx]?.map((item, itemIdx) => (
                <View key={itemIdx} style={styles.sortingItem}>
                  <Text style={styles.sortingText}>{item}</Text>
                  <View style={styles.sortingControls}>
                    <TouchableOpacity
                      onPress={() => moveItem(idx, itemIdx, 'up')}
                      disabled={itemIdx === 0}
                    >
                      <Ionicons
                        name="chevron-up"
                        size={18}
                        color={itemIdx === 0 ? colors.textLight : colors.primary}
                      />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => moveItem(idx, itemIdx, 'down')}
                      disabled={itemIdx === answers[idx].length - 1}
                    >
                      <Ionicons
                        name="chevron-down"
                        size={18}
                        color={
                          itemIdx === answers[idx].length - 1 ? colors.textLight : colors.primary
                        }
                      />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          </View>
        );

      case 'image':
        return (
          <View key={idx} style={styles.blockContainer}>
            <Text style={styles.blockTitle}>{block.question}</Text>
            {block.image_url && (
              <Image style={styles.blockImage} source={{ uri: block.image_url }} />
            )}
            <TouchableOpacity
              style={styles.imageSelectButton}
              onPress={() => handleImageSelect(idx)}
            >
              <Text style={styles.imageSelectText}>Sélectionner une position</Text>
            </TouchableOpacity>
          </View>
        );

      case 'graph':
        return (
          <View key={idx} style={styles.blockContainer}>
            <Text style={styles.blockTitle}>{block.question}</Text>
            {block.graph_type === 'linear' && (
              <View style={styles.graphInputs}>
                <View style={styles.graphInputGroup}>
                  <Text style={styles.graphLabel}>Pente</Text>
                  <TextInput
                    style={styles.graphInput}
                    placeholder="m"
                    placeholderTextColor={colors.textLight}
                    keyboardType="decimal-pad"
                    value={answers[idx]?.slope || ''}
                    onChangeText={(text) => handleGraphChange(idx, 'slope', text)}
                  />
                </View>
                <View style={styles.graphInputGroup}>
                  <Text style={styles.graphLabel}>Ordonnée à l'origine</Text>
                  <TextInput
                    style={styles.graphInput}
                    placeholder="b"
                    placeholderTextColor={colors.textLight}
                    keyboardType="decimal-pad"
                    value={answers[idx]?.intercept || ''}
                    onChangeText={(text) => handleGraphChange(idx, 'intercept', text)}
                  />
                </View>
              </View>
            )}
          </View>
        );

      default:
        return null;
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <Text style={styles.pageTitle}>{exercise.title}</Text>
        <Text style={styles.pageSubtitle}>{exercise.subject}</Text>

        {exercise.blocks?.map((block, idx) => renderBlock(block, idx))}

        <TouchableOpacity
          style={styles.submitButton}
          onPress={handleSubmit}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator size="small" color="#FFF" />
          ) : (
            <Text style={styles.submitButtonText}>Soumettre</Text>
          )}
        </TouchableOpacity>

        <View style={{ height: 20 }} />
      </ScrollView>

      {/* Results Modal */}
      <Modal visible={resultModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.resultTitle}>Résultat</Text>

            <View style={styles.resultSection}>
              <Text style={styles.resultLabel}>Score</Text>
              <Text style={styles.resultValue}>{result?.score}%</Text>
            </View>

            <View style={styles.resultSection}>
              <View style={styles.resultRow}>
                <Text style={styles.resultLabel}>XP gagnés</Text>
                <Text style={[styles.resultValue, { color: colors.warning }]}>
                  +{result?.xp_earned}
                </Text>
              </View>
              <View style={styles.resultRow}>
                <Text style={styles.resultLabel}>Or gagné</Text>
                <Text style={[styles.resultValue, { color: '#FFD700' }]}>
                  +{result?.gold_earned}
                </Text>
              </View>
            </View>

            {result?.message && (
              <View style={styles.resultMessage}>
                <Text style={styles.resultMessageText}>{result.message}</Text>
              </View>
            )}

            <TouchableOpacity
              style={styles.closeModalButton}
              onPress={handleResultClose}
            >
              <Text style={styles.closeModalButtonText}>Retour</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  scrollView: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingVertical: 12, paddingBottom: 20 },
  pageTitle: { fontSize: 22, fontWeight: '800', color: colors.text, marginBottom: 4 },
  pageSubtitle: { fontSize: 14, color: colors.textSecondary, marginBottom: 20 },
  blockContainer: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  blockTitle: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: 12 },
  optionsContainer: { gap: 10 },
  optionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.border,
  },
  optionButtonSelected: { borderColor: colors.primary, backgroundColor: colors.primary + '10' },
  optionRadio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: colors.border,
    marginRight: 10,
  },
  optionRadioSelected: { borderColor: colors.primary, backgroundColor: colors.primary },
  optionText: { fontSize: 14, color: colors.text, flex: 1 },
  textInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    color: colors.text,
    backgroundColor: colors.background,
    minHeight: 100,
    textAlignVertical: 'top',
  },
  fillBlankContainer: { flexDirection: 'row', flexWrap: 'wrap' },
  fillBlankPart: { flexDirection: 'row', alignItems: 'center', marginRight: 4, marginBottom: 8 },
  fillBlankText: { fontSize: 14, color: colors.text },
  fillBlankInput: {
    borderBottomWidth: 2,
    borderBottomColor: colors.primary,
    paddingHorizontal: 8,
    paddingVertical: 4,
    minWidth: 60,
    fontSize: 14,
    color: colors.text,
  },
  sortingContainer: { gap: 10 },
  sortingItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    backgroundColor: colors.background,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sortingText: { fontSize: 14, color: colors.text, flex: 1 },
  sortingControls: { flexDirection: 'row', gap: 8 },
  blockImage: { width: '100%', height: 200, borderRadius: 10, marginBottom: 12 },
  imageSelectButton: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  imageSelectText: { fontSize: 14, fontWeight: '600', color: '#FFF' },
  graphInputs: { gap: 12 },
  graphInputGroup: { marginBottom: 8 },
  graphLabel: { fontSize: 13, fontWeight: '600', color: colors.text, marginBottom: 6 },
  graphInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    color: colors.text,
    backgroundColor: colors.background,
  },
  submitButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 16,
  },
  submitButtonText: { fontSize: 16, fontWeight: '700', color: '#FFF' },
  errorText: { fontSize: 16, color: colors.text },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 24,
    width: '85%',
  },
  resultTitle: { fontSize: 20, fontWeight: '800', color: colors.text, marginBottom: 20, textAlign: 'center' },
  resultSection: { marginBottom: 16 },
  resultRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  resultLabel: { fontSize: 14, color: colors.textSecondary },
  resultValue: { fontSize: 24, fontWeight: '800', color: colors.success },
  resultMessage: {
    backgroundColor: colors.background,
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  resultMessageText: { fontSize: 13, color: colors.text, textAlign: 'center' },
  closeModalButton: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  closeModalButtonText: { fontSize: 16, fontWeight: '700', color: '#FFF' },
});
