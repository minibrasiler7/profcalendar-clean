import React, { useState, useCallback, useRef } from 'react';
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
  Dimensions,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import api from '../../api/client';
import colors from '../../theme/colors';

const BASE_URL = 'https://profcalendar-clean.onrender.com';
const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function ExerciseSolveScreen({ route, navigation }) {
  const { missionId } = route.params;
  const [mission, setMission] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [answers, setAnswers] = useState({});
  const [currentIdx, setCurrentIdx] = useState(0);
  const [resultModal, setResultModal] = useState(false);
  const [result, setResult] = useState(null);

  const fetchExercise = async () => {
    try {
      const res = await api.get(`/student/missions/${missionId}`);
      setMission(res.data.mission);
      initializeAnswers(res.data.mission);
    } catch (err) {
      console.log('Exercise error:', err.response?.data);
      Alert.alert('Erreur', 'Impossible de charger l\'exercice');
    } finally {
      setLoading(false);
    }
  };

  const initializeAnswers = (missionData) => {
    const initial = {};
    (missionData.blocks || []).forEach((block) => {
      const c = block.config_json || {};
      if (block.block_type === 'qcm') {
        initial[block.id] = { selected: [] };
      } else if (block.block_type === 'short_answer') {
        initial[block.id] = { value: '' };
      } else if (block.block_type === 'fill_blank') {
        const blanks = [];
        const template = c.text_template || '';
        const matches = template.match(/\{[^}]+\}/g) || [];
        matches.forEach(() => blanks.push(''));
        initial[block.id] = { blanks };
      } else if (block.block_type === 'sorting') {
        if (c.mode === 'order') {
          initial[block.id] = { order: (c.items || []).map((_, i) => i) };
        } else {
          initial[block.id] = { categories: {} };
        }
      } else if (block.block_type === 'image_position') {
        initial[block.id] = { clicks: [] };
      } else if (block.block_type === 'graph') {
        initial[block.id] = { points: [] };
      }
    });
    setAnswers(initial);
  };

  useFocusEffect(
    useCallback(() => {
      fetchExercise();
    }, [missionId])
  );

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      // Transform answers to match the API format
      const formattedAnswers = [];
      Object.entries(answers).forEach(([blockId, answer]) => {
        formattedAnswers.push({
          block_id: parseInt(blockId),
          answer: answer,
        });
      });

      const res = await api.post(`/student/missions/${missionId}/submit`, { answers: formattedAnswers });
      setResult(res.data);
      setResultModal(true);
    } catch (err) {
      console.log('Submit error:', err.response?.data);
      Alert.alert('Erreur', 'Impossible de soumettre');
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

  if (!mission) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>Mission non trouvée</Text>
      </View>
    );
  }

  const blocks = mission.blocks || [];
  const totalBlocks = blocks.length;
  const currentBlock = blocks[currentIdx];

  const updateAnswer = (blockId, data) => {
    setAnswers(prev => ({ ...prev, [blockId]: data }));
  };

  const renderBlock = (block) => {
    if (!block) return null;
    const c = block.config_json || {};
    const blockId = block.id;
    const answer = answers[blockId] || {};

    switch (block.block_type) {
      case 'qcm': {
        const isMultiple = c.multiple_answers;
        const selected = answer.selected || [];
        return (
          <View>
            {c.question ? <Text style={styles.questionText}>{c.question}</Text> : null}
            <View style={styles.optionsContainer}>
              {(c.options || []).map((opt, i) => {
                const isSelected = selected.includes(i);
                return (
                  <TouchableOpacity
                    key={i}
                    style={[styles.optionButton, isSelected && styles.optionButtonSelected]}
                    onPress={() => {
                      let newSelected;
                      if (isMultiple) {
                        newSelected = isSelected ? selected.filter(x => x !== i) : [...selected, i];
                      } else {
                        newSelected = [i];
                      }
                      updateAnswer(blockId, { selected: newSelected });
                    }}
                  >
                    <View style={[styles.optionRadio, isSelected && styles.optionRadioSelected]} />
                    <Text style={styles.optionText}>{opt.text}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        );
      }

      case 'short_answer':
        return (
          <View>
            {c.question ? <Text style={styles.questionText}>{c.question}</Text> : null}
            <TextInput
              style={styles.textInput}
              placeholder="Ta réponse..."
              placeholderTextColor={colors.textLight}
              value={answer.value || ''}
              onChangeText={(text) => updateAnswer(blockId, { value: text })}
              keyboardType={c.answer_type === 'number' ? 'decimal-pad' : 'default'}
            />
          </View>
        );

      case 'fill_blank': {
        const template = c.text_template || '';
        const parts = template.split(/(\{[^}]+\})/);
        let blankIdx = 0;
        const blanks = answer.blanks || [];
        return (
          <View>
            <View style={styles.fillBlankWrap}>
              {parts.map((part, i) => {
                if (part.match(/^\{[^}]+\}$/)) {
                  const bi = blankIdx++;
                  return (
                    <TextInput
                      key={i}
                      style={styles.fillBlankInput}
                      placeholder="..."
                      placeholderTextColor={colors.textLight}
                      value={blanks[bi] || ''}
                      onChangeText={(text) => {
                        const newBlanks = [...blanks];
                        newBlanks[bi] = text;
                        updateAnswer(blockId, { blanks: newBlanks });
                      }}
                    />
                  );
                } else {
                  return <Text key={i} style={styles.fillBlankText}>{part}</Text>;
                }
              })}
            </View>
          </View>
        );
      }

      case 'sorting': {
        if (c.mode === 'order') {
          const order = answer.order || [];
          const items = c.items || [];
          return (
            <View>
              <Text style={styles.questionText}>Remets dans le bon ordre :</Text>
              <View style={styles.sortingContainer}>
                {order.map((origIdx, pos) => (
                  <View key={pos} style={styles.sortingItem}>
                    <Text style={styles.sortingText}>{items[origIdx]}</Text>
                    <View style={styles.sortingControls}>
                      <TouchableOpacity
                        onPress={() => {
                          if (pos > 0) {
                            const newOrder = [...order];
                            [newOrder[pos], newOrder[pos - 1]] = [newOrder[pos - 1], newOrder[pos]];
                            updateAnswer(blockId, { order: newOrder });
                          }
                        }}
                        disabled={pos === 0}
                      >
                        <Ionicons name="chevron-up" size={22} color={pos === 0 ? colors.textLight : colors.primary} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => {
                          if (pos < order.length - 1) {
                            const newOrder = [...order];
                            [newOrder[pos], newOrder[pos + 1]] = [newOrder[pos + 1], newOrder[pos]];
                            updateAnswer(blockId, { order: newOrder });
                          }
                        }}
                        disabled={pos === order.length - 1}
                      >
                        <Ionicons name="chevron-down" size={22} color={pos === order.length - 1 ? colors.textLight : colors.primary} />
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          );
        } else {
          // Categories mode — simplified for mobile
          const items = c.items || [];
          const categories = c.categories || [];
          const catAssignments = answer.categories || {};
          const assignedItems = new Set(Object.values(catAssignments).flat());

          return (
            <View>
              <Text style={styles.questionText}>Classe les éléments :</Text>
              {categories.map((cat, catIdx) => {
                const catItems = catAssignments[catIdx] || [];
                return (
                  <View key={catIdx} style={styles.categoryZone}>
                    <Text style={styles.categoryName}>{cat.name}</Text>
                    <View style={styles.categoryItems}>
                      {catItems.map((itemIdx) => (
                        <TouchableOpacity
                          key={itemIdx}
                          style={styles.categoryItem}
                          onPress={() => {
                            // Remove from category
                            const newCats = { ...catAssignments };
                            newCats[catIdx] = catItems.filter(x => x !== itemIdx);
                            updateAnswer(blockId, { categories: newCats });
                          }}
                        >
                          <Text style={styles.categoryItemText}>{items[itemIdx]}</Text>
                          <Ionicons name="close-circle" size={16} color={colors.error || '#ef4444'} />
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                );
              })}
              <Text style={styles.poolLabel}>Éléments à classer :</Text>
              <View style={styles.poolItems}>
                {items.map((item, itemIdx) => {
                  if (!item || assignedItems.has(itemIdx)) return null;
                  return (
                    <View key={itemIdx} style={styles.poolItem}>
                      <Text style={styles.poolItemText}>{item}</Text>
                      <View style={styles.poolItemButtons}>
                        {categories.map((cat, catIdx) => (
                          <TouchableOpacity
                            key={catIdx}
                            style={styles.assignButton}
                            onPress={() => {
                              const newCats = { ...catAssignments };
                              newCats[catIdx] = [...(newCats[catIdx] || []), itemIdx];
                              updateAnswer(blockId, { categories: newCats });
                            }}
                          >
                            <Text style={styles.assignButtonText}>{cat.name}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
          );
        }
      }

      case 'image_position': {
        const imageUrl = c.image_file_id
          ? `${BASE_URL}/file_manager/preview/${c.image_file_id}`
          : c.image_url
            ? (c.image_url.startsWith('http') ? c.image_url : `${BASE_URL}${c.image_url}`)
            : null;
        const zones = c.zones || [];
        return (
          <View>
            <Text style={styles.questionText}>
              Touche l'image pour marquer les zones :
              {zones.map(z => z.label).join(', ')}
            </Text>
            {imageUrl ? (
              <Image source={{ uri: imageUrl }} style={styles.blockImage} resizeMode="contain" />
            ) : (
              <Text style={{ color: '#ef4444' }}>Image non disponible</Text>
            )}
            <Text style={styles.hintText}>
              (La sélection de position sur l'image est limitée sur mobile. Utilisez le navigateur web pour une meilleure expérience.)
            </Text>
          </View>
        );
      }

      case 'graph':
        return (
          <View>
            <Text style={styles.questionText}>
              {c.question_type === 'draw_quadratic'
                ? 'Tracez la courbe quadratique demandée.'
                : 'Tracez la droite demandée.'}
            </Text>
            <Text style={styles.hintText}>
              (Le graphique interactif n'est pas disponible sur mobile. Utilisez le navigateur web pour cette question.)
            </Text>
          </View>
        );

      default:
        return <Text style={styles.questionText}>Type de question non supporté</Text>;
    }
  };

  return (
    <View style={styles.container}>
      {/* Progress */}
      <View style={styles.progressSection}>
        <Text style={styles.progressText}>Question {currentIdx + 1} / {totalBlocks}</Text>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${((currentIdx + 1) / totalBlocks) * 100}%` }]} />
        </View>
        <Text style={styles.totalXP}>{mission.total_points} XP</Text>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {currentBlock && (
          <View style={styles.blockContainer}>
            <View style={styles.blockHeader}>
              <Text style={styles.blockTypeBadge}>
                {currentBlock.block_type === 'qcm' ? 'QCM' :
                 currentBlock.block_type === 'short_answer' ? 'Réponse' :
                 currentBlock.block_type === 'fill_blank' ? 'Trou' :
                 currentBlock.block_type === 'sorting' ? 'Tri' :
                 currentBlock.block_type === 'image_position' ? 'Image' :
                 currentBlock.block_type === 'graph' ? 'Graphique' : ''}
              </Text>
              <Text style={styles.blockPoints}>
                <Ionicons name="star" size={14} color="#f59e0b" /> {currentBlock.points} XP
              </Text>
            </View>
            <Text style={styles.blockTitle}>{currentBlock.title || `Question ${currentIdx + 1}`}</Text>
            {renderBlock(currentBlock)}
          </View>
        )}
      </ScrollView>

      {/* Navigation */}
      <View style={styles.navButtons}>
        <TouchableOpacity
          style={[styles.navButton, styles.navPrev]}
          onPress={() => setCurrentIdx(Math.max(0, currentIdx - 1))}
          disabled={currentIdx === 0}
        >
          <Ionicons name="chevron-back" size={20} color={currentIdx === 0 ? colors.textLight : '#FFF'} />
          <Text style={[styles.navButtonText, currentIdx === 0 && { color: colors.textLight }]}>Précédent</Text>
        </TouchableOpacity>

        {currentIdx < totalBlocks - 1 ? (
          <TouchableOpacity
            style={[styles.navButton, styles.navNext]}
            onPress={() => setCurrentIdx(currentIdx + 1)}
          >
            <Text style={styles.navButtonText}>Suivant</Text>
            <Ionicons name="chevron-forward" size={20} color="#FFF" />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.navButton, styles.navSubmit]}
            onPress={handleSubmit}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <>
                <Ionicons name="send" size={18} color="#FFF" />
                <Text style={styles.navButtonText}>Soumettre</Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </View>

      {/* Results Modal */}
      <Modal visible={resultModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Ionicons name="trophy" size={48} color="#f59e0b" style={{ alignSelf: 'center', marginBottom: 12 }} />
            <Text style={styles.resultTitle}>Mission terminée !</Text>

            <Text style={[styles.resultScore, {
              color: (result?.score_percentage || 0) >= 80 ? '#10b981' :
                     (result?.score_percentage || 0) >= 50 ? '#f59e0b' : '#ef4444'
            }]}>
              {result?.score_percentage || 0}%
            </Text>

            <View style={styles.resultRewards}>
              <View style={styles.rewardItem}>
                <Ionicons name="star" size={24} color="#f59e0b" />
                <Text style={styles.rewardValue}>+{result?.xp_earned || 0}</Text>
                <Text style={styles.rewardLabel}>XP</Text>
              </View>
              <View style={styles.rewardItem}>
                <Ionicons name="cash-outline" size={24} color="#fbbf24" />
                <Text style={styles.rewardValue}>+{result?.gold_earned || 0}</Text>
                <Text style={styles.rewardLabel}>Or</Text>
              </View>
            </View>

            <TouchableOpacity style={styles.closeModalButton} onPress={handleResultClose}>
              <Text style={styles.closeModalButtonText}>Retour aux missions</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1a4e' },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background },
  errorText: { fontSize: 16, color: colors.text },
  progressSection: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  progressText: { color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: '600' },
  progressBar: { flex: 1, height: 8, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#667eea', borderRadius: 4 },
  totalXP: { color: '#f59e0b', fontSize: 13, fontWeight: '700' },
  scrollView: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 24 },
  blockContainer: {
    backgroundColor: '#FFF', borderRadius: 16,
    padding: 20, shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15, shadowRadius: 12, elevation: 4,
  },
  blockHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  blockTypeBadge: {
    backgroundColor: '#eef2ff', color: '#667eea',
    paddingHorizontal: 10, paddingVertical: 3,
    borderRadius: 6, fontSize: 11, fontWeight: '700', textTransform: 'uppercase',
  },
  blockPoints: { fontSize: 13, fontWeight: '700', color: '#f59e0b' },
  blockTitle: { fontSize: 17, fontWeight: '700', color: colors.text, marginBottom: 16 },
  questionText: { fontSize: 14, color: '#374151', marginBottom: 12, lineHeight: 22 },
  hintText: { fontSize: 12, color: colors.textSecondary, fontStyle: 'italic', marginTop: 8 },
  optionsContainer: { gap: 10 },
  optionButton: {
    flexDirection: 'row', alignItems: 'center',
    padding: 14, borderRadius: 10,
    borderWidth: 2, borderColor: '#e5e7eb',
  },
  optionButtonSelected: { borderColor: '#667eea', backgroundColor: '#eef2ff' },
  optionRadio: {
    width: 20, height: 20, borderRadius: 10,
    borderWidth: 2, borderColor: '#d1d5db', marginRight: 12,
  },
  optionRadioSelected: { borderColor: '#667eea', backgroundColor: '#667eea' },
  optionText: { fontSize: 14, color: colors.text, flex: 1 },
  textInput: {
    borderWidth: 2, borderColor: '#e5e7eb', borderRadius: 10,
    padding: 14, fontSize: 15, color: colors.text, backgroundColor: '#fafafa',
  },
  fillBlankWrap: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
  fillBlankText: { fontSize: 15, color: colors.text, lineHeight: 36 },
  fillBlankInput: {
    borderBottomWidth: 2, borderBottomColor: '#667eea',
    paddingHorizontal: 8, paddingVertical: 4,
    minWidth: 70, fontSize: 15, color: colors.text, textAlign: 'center',
  },
  sortingContainer: { gap: 8 },
  sortingItem: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 14, backgroundColor: '#f9fafb', borderRadius: 10,
    borderWidth: 1, borderColor: '#e5e7eb',
  },
  sortingText: { fontSize: 14, color: colors.text, flex: 1 },
  sortingControls: { flexDirection: 'row', gap: 4 },
  categoryZone: {
    borderWidth: 2, borderColor: '#d1d5db', borderStyle: 'dashed',
    borderRadius: 12, padding: 12, marginBottom: 10, minHeight: 60,
  },
  categoryName: { fontSize: 14, fontWeight: '700', color: '#4b5563', marginBottom: 8 },
  categoryItems: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  categoryItem: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#eef2ff', paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 8, borderWidth: 1, borderColor: '#667eea',
  },
  categoryItemText: { fontSize: 13, color: '#667eea', fontWeight: '600' },
  poolLabel: { fontSize: 13, fontWeight: '600', color: '#6b7280', marginTop: 12, marginBottom: 8 },
  poolItems: { gap: 8 },
  poolItem: {
    backgroundColor: '#f9fafb', padding: 12, borderRadius: 10,
    borderWidth: 1, borderColor: '#e5e7eb',
  },
  poolItemText: { fontSize: 14, color: colors.text, marginBottom: 8 },
  poolItemButtons: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  assignButton: {
    backgroundColor: '#667eea', paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 6,
  },
  assignButtonText: { fontSize: 11, color: '#FFF', fontWeight: '600' },
  blockImage: { width: '100%', height: 220, borderRadius: 10, marginBottom: 12, backgroundColor: '#f1f5f9' },
  navButtons: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  navButton: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 18, paddingVertical: 12, borderRadius: 10,
  },
  navPrev: { backgroundColor: 'rgba(255,255,255,0.12)' },
  navNext: { backgroundColor: '#667eea' },
  navSubmit: { backgroundColor: '#10b981' },
  navButtonText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15,12,41,0.9)', justifyContent: 'center', alignItems: 'center' },
  modalContent: {
    backgroundColor: '#1e1b4b', borderRadius: 24, padding: 28, width: '85%',
  },
  resultTitle: { fontSize: 20, fontWeight: '800', color: '#fbbf24', textAlign: 'center', marginBottom: 8 },
  resultScore: { fontSize: 48, fontWeight: '900', textAlign: 'center', marginVertical: 8 },
  resultRewards: { flexDirection: 'row', justifyContent: 'center', gap: 40, marginVertical: 20 },
  rewardItem: { alignItems: 'center' },
  rewardValue: { fontSize: 20, fontWeight: '800', color: '#FFF', marginTop: 4 },
  rewardLabel: { fontSize: 12, color: 'rgba(255,255,255,0.6)' },
  closeModalButton: {
    backgroundColor: '#667eea', borderRadius: 12, paddingVertical: 14, alignItems: 'center',
  },
  closeModalButtonText: { fontSize: 16, fontWeight: '700', color: '#FFF' },
});
