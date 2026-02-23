import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Image,
  Modal,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import api from '../../api/client';
import colors from '../../theme/colors';

const BASE_URL = 'https://profcalendar-clean.onrender.com';

const AVATAR_CLASSES = [
  { id: 'guerrier', name: 'Guerrier', image: `${BASE_URL}/static/img/chihuahua/guerrier.png` },
  { id: 'mage', name: 'Mage', image: `${BASE_URL}/static/img/chihuahua/mage.png` },
  { id: 'archer', name: 'Archer', image: `${BASE_URL}/static/img/chihuahua/archer.png` },
  { id: 'guerisseur', name: 'Moine', image: `${BASE_URL}/static/img/chihuahua/guerisseur.png` },
];

const STAT_ICONS = {
  force: { icon: 'fitness', color: '#ef4444', label: 'Force' },
  defense: { icon: 'shield', color: '#3b82f6', label: 'Défense' },
  defense_magique: { icon: 'sparkles', color: '#a855f7', label: 'Déf. Magique' },
  vie: { icon: 'heart', color: '#10b981', label: 'Vie' },
  intelligence: { icon: 'bulb', color: '#f59e0b', label: 'Intelligence' },
};

const SKILL_ICONS = {
  sword: 'fitness', flame: 'flame', flash: 'flash', shield: 'shield',
  sparkles: 'sparkles', locate: 'locate', rainy: 'rainy', body: 'body',
  heart: 'heart', fitness: 'fitness', sunny: 'sunny', sync: 'sync',
  megaphone: 'megaphone', nuclear: 'nuclear', snow: 'snow', planet: 'planet',
  flask: 'flask', warning: 'warning', rocket: 'rocket', people: 'people',
  water: 'water', star: 'star',
};

function mapItemIcon(icon) {
  return icon === 'flask' ? 'flask' :
    icon === 'gavel' ? 'hammer' :
    icon === 'shield-alt' ? 'shield' :
    icon === 'scroll' ? 'document-text' :
    icon === 'gem' ? 'diamond' :
    icon === 'coins' ? 'cash' :
    icon === 'crown' ? 'ribbon' :
    icon === 'hat-wizard' ? 'sparkles' :
    icon === 'user-secret' ? 'eye-off' :
    icon === 'ring' ? 'ellipse' :
    icon === 'diamond' ? 'diamond' :
    'cube';
}

export default function RPGDashboardScreen({ navigation }) {
  const [rpgData, setRpgData] = useState(null);
  const [classDescriptions, setClassDescriptions] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [changingAvatar, setChangingAvatar] = useState(false);
  const [expandedClass, setExpandedClass] = useState(null);
  const [showEvolutionModal, setShowEvolutionModal] = useState(false);
  const [selectedEvolution, setSelectedEvolution] = useState(null);

  const fetchData = async () => {
    try {
      const res = await api.get('/student/rpg/profile');
      setRpgData(res.data.rpg_profile);
      if (res.data.class_descriptions) {
        setClassDescriptions(res.data.class_descriptions);
      }
    } catch (err) {
      console.log('RPG error:', err.response?.data);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  const handleAvatarChange = async (classId) => {
    if (rpgData?.avatar_class === classId) return;

    // Si déjà une classe → demander confirmation de reset
    if (rpgData?.avatar_class) {
      Alert.alert(
        'Changer de classe ?',
        'Tu perdras tout ton niveau, équipement et or. Tu recommenceras au niveau 1. Confirmer ?',
        [
          { text: 'Annuler', style: 'cancel' },
          {
            text: 'Confirmer',
            style: 'destructive',
            onPress: async () => {
              setChangingAvatar(true);
              try {
                const res = await api.post('/student/rpg/avatar', { avatar_class: classId, confirm_reset: true });
                if (res.data.success) await fetchData();
              } catch (err) {
                Alert.alert('Erreur', 'Impossible de changer la classe');
              } finally {
                setChangingAvatar(false);
              }
            },
          },
        ]
      );
      return;
    }

    setChangingAvatar(true);
    try {
      await api.post('/student/rpg/avatar', { avatar_class: classId });
      await fetchData();
    } catch (err) {
      Alert.alert('Erreur', 'Impossible de changer l\'avatar');
    } finally {
      setChangingAvatar(false);
    }
  };

  const handleEquip = async (itemId) => {
    try {
      await api.post('/student/rpg/equip', { item_id: itemId });
      await fetchData();
    } catch (err) {
      Alert.alert('Erreur', err.response?.data?.error || 'Impossible d\'équiper');
    }
  };

  const handleUnequip = async (slot) => {
    try {
      await api.post('/student/rpg/equip', { unequip: true, slot });
      await fetchData();
    } catch (err) {
      Alert.alert('Erreur', 'Impossible de déséquiper');
    }
  };

  const handleEvolve = async (evolutionId, level) => {
    try {
      await api.post('/student/rpg/evolve', { evolution_id: evolutionId, level });
      await fetchData();
      setShowEvolutionModal(false);
      Alert.alert('Évolution !', 'Tu as évolué avec succès !');
    } catch (err) {
      Alert.alert('Erreur', err.response?.data?.error || 'Impossible d\'évoluer');
    }
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!rpgData) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>Profil RPG non trouvé</Text>
      </View>
    );
  }

  const xpPercent = rpgData.xp_for_next_level > 0 ? (rpgData.xp_progress || 0) : 0;
  const currentAvatarClass = AVATAR_CLASSES.find((c) => c.id === rpgData.avatar_class);
  const stats = rpgData.stats || {};
  const skills = rpgData.skills || [];
  const activeSkills = rpgData.active_skills || [];
  const availableEvolutions = rpgData.available_evolutions || [];
  const equipment = rpgData.equipment || {};

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
      }
    >
      {/* Hero Section */}
      <View style={styles.heroSection}>
        <View style={styles.avatarContainer}>
          {currentAvatarClass ? (
            <Image source={{ uri: currentAvatarClass.image }} style={styles.avatarImage} />
          ) : (
            <Ionicons name="help-circle-outline" size={40} color="rgba(255,255,255,0.5)" />
          )}
        </View>
        <View style={styles.heroInfo}>
          <Text style={styles.heroName}>{rpgData.student_name || 'Aventurier'}</Text>
          <Text style={styles.heroClass}>{currentAvatarClass?.name || 'Aucune classe'}</Text>
          {rpgData.evolutions && rpgData.evolutions.length > 0 && (
            <Text style={styles.heroEvolution}>
              {rpgData.evolutions.map(e => e.evolution_id).join(' → ')}
            </Text>
          )}
        </View>
        <View style={styles.heroLevelBadge}>
          <Text style={styles.heroLevelText}>Niv. {rpgData.level || 1}</Text>
        </View>
      </View>

      {/* Level and XP */}
      <View style={styles.levelSection}>
        <View style={styles.levelRow}>
          <Text style={styles.levelLabel}>Niveau {rpgData.level || 1}</Text>
          <Text style={styles.goldText}>{rpgData.gold || 0} or</Text>
        </View>
        <View style={styles.xpContainer}>
          <View style={styles.xpBarBackground}>
            <View style={[styles.xpBarFill, { width: `${xpPercent}%` }]} />
          </View>
          <Text style={styles.xpText}>
            {rpgData.xp_total || 0} / {rpgData.xp_for_next_level || 100} XP
          </Text>
        </View>
      </View>

      {/* Evolution Alert */}
      {availableEvolutions.length > 0 && (
        <TouchableOpacity
          style={styles.evolutionAlert}
          onPress={() => {
            setSelectedEvolution(availableEvolutions[0]);
            setShowEvolutionModal(true);
          }}
        >
          <Ionicons name="arrow-up-circle" size={24} color="#f59e0b" />
          <Text style={styles.evolutionAlertText}>
            Évolution disponible ! Choisis ta spécialisation.
          </Text>
          <Ionicons name="chevron-forward" size={20} color="#f59e0b" />
        </TouchableOpacity>
      )}

      {/* Class Selection with Descriptions */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Classe</Text>
        {!rpgData.avatar_class && (
          <View style={styles.chooseAlert}>
            <Ionicons name="warning-outline" size={20} color="#f59e0b" />
            <Text style={styles.chooseAlertText}>Choisis un personnage pour commencer !</Text>
          </View>
        )}
        {AVATAR_CLASSES.map((classItem) => {
          const desc = classDescriptions?.[classItem.id];
          const isExpanded = expandedClass === classItem.id;
          const isSelected = rpgData.avatar_class === classItem.id;
          return (
            <View key={classItem.id} style={{ marginBottom: 10 }}>
              <TouchableOpacity
                style={[styles.classCardHorizontal, isSelected && styles.classCardSelectedH]}
                onPress={() => setExpandedClass(isExpanded ? null : classItem.id)}
                disabled={changingAvatar}
              >
                <Image source={{ uri: classItem.image }} style={styles.classImageH} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.classNameH}>{desc?.name || classItem.name}</Text>
                  <Text style={styles.classSubtitle}>{desc?.subtitle || ''}</Text>
                </View>
                {isSelected && (
                  <View style={styles.selectedBadge}>
                    <Text style={styles.selectedBadgeText}>Actif</Text>
                  </View>
                )}
                <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={20} color={colors.textSecondary} />
              </TouchableOpacity>
              {isExpanded && desc && (
                <View style={styles.classDescription}>
                  <Text style={styles.classDescText}>{desc.description}</Text>
                  <View style={styles.classProsCons}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.prosTitle}>Forces</Text>
                      {desc.strengths?.map((s, i) => (
                        <Text key={i} style={styles.prosItem}>✓ {s}</Text>
                      ))}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.consTitle}>Faiblesses</Text>
                      {desc.weaknesses?.map((w, i) => (
                        <Text key={i} style={styles.consItem}>✗ {w}</Text>
                      ))}
                    </View>
                  </View>
                  <Text style={styles.playstyleText}>Style : {desc.playstyle}</Text>
                  {!isSelected && (
                    <TouchableOpacity
                      style={styles.chooseClassBtn}
                      onPress={() => handleAvatarChange(classItem.id)}
                    >
                      <Text style={styles.chooseClassBtnText}>Choisir cette classe</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </View>
          );
        })}
      </View>

      {/* Character Stats */}
      {rpgData.avatar_class && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Caractéristiques</Text>
          <View style={styles.charStatsContainer}>
            {Object.entries(STAT_ICONS).map(([key, info]) => {
              const val = stats[key] || 0;
              const maxStat = 50;
              const pct = Math.min(100, (val / maxStat) * 100);
              return (
                <View key={key} style={styles.charStatRow}>
                  <View style={styles.charStatIconWrap}>
                    <Ionicons name={info.icon} size={18} color={info.color} />
                  </View>
                  <Text style={styles.charStatLabel}>{info.label}</Text>
                  <View style={styles.charStatBarBg}>
                    <View style={[styles.charStatBarFill, { width: `${pct}%`, backgroundColor: info.color }]} />
                  </View>
                  <Text style={styles.charStatVal}>{val}</Text>
                </View>
              );
            })}
          </View>
        </View>
      )}

      {/* Skills */}
      {rpgData.avatar_class && skills.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Compétences ({activeSkills.length}/6 actives)</Text>
          <View style={styles.skillsGrid}>
            {skills.map((skill) => {
              const isActive = activeSkills.some(s => s.id === skill.id);
              return (
                <View key={skill.id} style={[styles.skillCard, isActive && styles.skillCardActive]}>
                  <View style={[styles.skillIconWrap, { backgroundColor: skill.type === 'attack' ? '#ef4444' : skill.type === 'heal' ? '#10b981' : skill.type === 'defense' ? '#3b82f6' : '#f59e0b' }]}>
                    <Ionicons name={SKILL_ICONS[skill.icon] || 'flash'} size={20} color="white" />
                  </View>
                  <Text style={styles.skillName} numberOfLines={1}>{skill.name}</Text>
                  <Text style={styles.skillType}>{skill.type === 'attack' ? 'Attaque' : skill.type === 'heal' ? 'Soin' : skill.type === 'defense' ? 'Défense' : 'Utilitaire'}</Text>
                  {skill.damage > 0 && <Text style={styles.skillDmg}>{skill.damage} dég.</Text>}
                  {skill.heal > 0 && <Text style={styles.skillHeal}>+{skill.heal} PV</Text>}
                </View>
              );
            })}
          </View>
        </View>
      )}

      {/* Equipment */}
      {rpgData.avatar_class && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Équipement</Text>
          <View style={styles.equipmentSlots}>
            {['arme', 'bouclier', 'accessoire'].map((slot) => {
              const equippedId = equipment[slot];
              const equippedItem = equippedId ? rpgData.items?.find(si => si.item?.id === equippedId) : null;
              return (
                <TouchableOpacity
                  key={slot}
                  style={styles.equipSlot}
                  onPress={() => {
                    if (equippedId) {
                      Alert.alert('Déséquiper ?', `Retirer ${equippedItem?.item?.name || 'cet objet'} ?`, [
                        { text: 'Annuler', style: 'cancel' },
                        { text: 'Retirer', onPress: () => handleUnequip(slot) },
                      ]);
                    }
                  }}
                >
                  <Text style={styles.equipSlotLabel}>{slot.charAt(0).toUpperCase() + slot.slice(1)}</Text>
                  {equippedItem ? (
                    <View style={styles.equipSlotFilled}>
                      <View style={[styles.equipSlotIcon, { backgroundColor: equippedItem.item?.color || '#6b7280' }]}>
                        <Ionicons name={mapItemIcon(equippedItem.item?.icon)} size={20} color="white" />
                      </View>
                      <Text style={styles.equipSlotName} numberOfLines={1}>{equippedItem.item?.name}</Text>
                      {equippedItem.item?.stat_bonus && Object.keys(equippedItem.item.stat_bonus).length > 0 && (
                        <Text style={styles.equipBonusText}>
                          {Object.entries(equippedItem.item.stat_bonus).map(([k, v]) => `+${v} ${STAT_ICONS[k]?.label || k}`).join(', ')}
                        </Text>
                      )}
                    </View>
                  ) : (
                    <View style={styles.equipSlotEmpty}>
                      <Ionicons name="add-circle-outline" size={28} color={colors.textLight} />
                      <Text style={styles.equipSlotEmptyText}>Vide</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}

      {/* Inventaire */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          Inventaire ({rpgData.items?.length || 0} objets)
        </Text>
        {rpgData.items && rpgData.items.length > 0 ? (
          <View style={styles.inventoryGrid}>
            {rpgData.items.map((si) => (
              <TouchableOpacity
                key={si.id}
                style={[styles.inventoryItem, si.item?.equip_slot && styles.inventoryItemEquipable]}
                onPress={() => {
                  if (si.item?.equip_slot) {
                    Alert.alert(
                      si.item.name,
                      `${si.item.description || ''}\n${si.item.special_ability ? `Spécial: ${si.item.special_ability}` : ''}`,
                      [
                        { text: 'Annuler', style: 'cancel' },
                        { text: 'Équiper', onPress: () => handleEquip(si.item.id) },
                      ]
                    );
                  } else {
                    Alert.alert(si.item?.name || 'Objet', si.item?.description || '');
                  }
                }}
              >
                {si.quantity > 1 && (
                  <View style={styles.itemQuantityBadge}>
                    <Text style={styles.itemQuantityText}>x{si.quantity}</Text>
                  </View>
                )}
                <View style={[styles.itemIcon, { backgroundColor: si.item?.color || '#6b7280' }]}>
                  <Ionicons name={mapItemIcon(si.item?.icon)} size={22} color="white" />
                </View>
                <Text style={styles.itemName} numberOfLines={1}>{si.item?.name}</Text>
                <Text style={[styles.itemRarity, { color: si.item?.rarity_color || '#9ca3af' }]}>
                  {si.item?.rarity_label || 'Commun'}
                </Text>
                {si.item?.equip_slot && (
                  <View style={styles.equipableTag}>
                    <Text style={styles.equipableTagText}>Équipable</Text>
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <View style={styles.emptyInventory}>
            <Ionicons name="cube-outline" size={36} color={colors.textLight} />
            <Text style={styles.emptyInventoryText}>
              Ton inventaire est vide ! Complète des missions pour gagner des objets.
            </Text>
          </View>
        )}
      </View>

      {/* Badges */}
      {rpgData.badges && rpgData.badges.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Badges</Text>
          <View style={styles.badgesGrid}>
            {rpgData.badges.map((badge) => (
              <View
                key={badge.badge?.id || badge.id}
                style={[styles.badgeItem, !badge.earned_at && styles.badgeItemLocked]}
              >
                <Ionicons
                  name={badge.earned_at ? 'medal' : 'lock-closed'}
                  size={28}
                  color={badge.earned_at ? '#fbbf24' : colors.textLight}
                />
                <Text style={[styles.badgeName, !badge.earned_at && styles.badgeNameLocked]}>
                  {badge.badge?.name || badge.name}
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}

      <View style={{ height: 32 }} />

      {/* Evolution Modal */}
      <Modal visible={showEvolutionModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Évolution disponible !</Text>
            <Text style={styles.modalSubtitle}>Choisis ta spécialisation :</Text>
            {selectedEvolution?.choices?.map((choice) => (
              <TouchableOpacity
                key={choice.id}
                style={styles.evoChoice}
                onPress={() => handleEvolve(choice.id, selectedEvolution.level)}
              >
                <Text style={styles.evoChoiceName}>{choice.name}</Text>
                <Text style={styles.evoChoiceDesc}>{choice.description}</Text>
                <Text style={styles.evoChoiceBonus}>
                  {Object.entries(choice.stat_bonus || {}).map(([k, v]) =>
                    `${v > 0 ? '+' : ''}${v} ${STAT_ICONS[k]?.label || k}`
                  ).join('  ')}
                </Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={styles.modalCloseBtn}
              onPress={() => setShowEvolutionModal(false)}
            >
              <Text style={styles.modalCloseBtnText}>Plus tard</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background },
  errorText: { fontSize: 16, color: colors.text },
  heroSection: {
    backgroundColor: colors.primary,
    paddingVertical: 20,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  avatarContainer: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: '#f59e0b', overflow: 'hidden',
  },
  avatarImage: { width: 70, height: 70, resizeMode: 'contain', backgroundColor: 'white', borderRadius: 35 },
  heroInfo: { flex: 1 },
  heroName: { fontSize: 20, fontWeight: '800', color: '#FFF' },
  heroClass: { fontSize: 14, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
  heroEvolution: { fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 2, fontStyle: 'italic' },
  heroLevelBadge: {
    backgroundColor: '#f59e0b', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4,
  },
  heroLevelText: { fontSize: 13, fontWeight: '800', color: '#1e1b4b' },
  levelSection: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1, borderBottomColor: colors.border,
    paddingHorizontal: 20, paddingVertical: 14,
  },
  levelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  levelLabel: { fontSize: 14, fontWeight: '600', color: colors.textSecondary },
  goldText: { fontSize: 14, fontWeight: '700', color: '#f59e0b' },
  xpContainer: { gap: 4 },
  xpBarBackground: { height: 10, backgroundColor: colors.border, borderRadius: 5, overflow: 'hidden' },
  xpBarFill: { height: '100%', backgroundColor: colors.warning },
  xpText: { fontSize: 12, color: colors.textSecondary, textAlign: 'center' },
  evolutionAlert: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#fef3c7', borderWidth: 1, borderColor: '#f59e0b',
    marginHorizontal: 16, marginTop: 12, borderRadius: 12, padding: 14,
  },
  evolutionAlertText: { flex: 1, fontSize: 13, fontWeight: '700', color: '#92400e' },
  section: { paddingHorizontal: 16, paddingVertical: 14 },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: colors.text, marginBottom: 12 },
  chooseAlert: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#fef3c7', borderWidth: 1, borderColor: '#f59e0b',
    borderRadius: 10, padding: 12, marginBottom: 12,
  },
  chooseAlertText: { fontSize: 13, fontWeight: '600', color: '#92400e', flex: 1 },
  // Horizontal class cards with expandable descriptions
  classCardHorizontal: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: colors.surface, borderRadius: 12, padding: 12,
    borderWidth: 2, borderColor: colors.border,
  },
  classCardSelectedH: { borderColor: colors.primary, backgroundColor: '#eef2ff' },
  classImageH: { width: 50, height: 50, resizeMode: 'contain', backgroundColor: 'white', borderRadius: 25 },
  classNameH: { fontSize: 15, fontWeight: '700', color: colors.text },
  classSubtitle: { fontSize: 12, color: colors.textSecondary, marginTop: 1 },
  selectedBadge: { backgroundColor: colors.primary, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  selectedBadgeText: { fontSize: 10, fontWeight: '700', color: 'white' },
  classDescription: {
    backgroundColor: colors.surface, borderRadius: 0, borderBottomLeftRadius: 12, borderBottomRightRadius: 12,
    padding: 14, borderWidth: 1, borderTopWidth: 0, borderColor: colors.border,
  },
  classDescText: { fontSize: 13, color: colors.text, lineHeight: 19, marginBottom: 10 },
  classProsCons: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  prosTitle: { fontSize: 12, fontWeight: '700', color: '#10b981', marginBottom: 4 },
  consTitle: { fontSize: 12, fontWeight: '700', color: '#ef4444', marginBottom: 4 },
  prosItem: { fontSize: 11, color: '#065f46', lineHeight: 16 },
  consItem: { fontSize: 11, color: '#991b1b', lineHeight: 16 },
  playstyleText: { fontSize: 12, fontWeight: '600', color: colors.primary, fontStyle: 'italic' },
  chooseClassBtn: {
    backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 10,
    alignItems: 'center', marginTop: 10,
  },
  chooseClassBtnText: { fontSize: 14, fontWeight: '700', color: 'white' },
  // Character stats
  charStatsContainer: { gap: 8 },
  charStatRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.surface, borderRadius: 10, padding: 10,
    borderWidth: 1, borderColor: colors.border,
  },
  charStatIconWrap: { width: 30, alignItems: 'center' },
  charStatLabel: { width: 90, fontSize: 12, fontWeight: '600', color: colors.text },
  charStatBarBg: { flex: 1, height: 8, backgroundColor: colors.border, borderRadius: 4, overflow: 'hidden' },
  charStatBarFill: { height: '100%', borderRadius: 4 },
  charStatVal: { width: 30, fontSize: 14, fontWeight: '800', color: colors.text, textAlign: 'right' },
  // Skills
  skillsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  skillCard: {
    width: '31%', backgroundColor: colors.surface, borderRadius: 12,
    padding: 10, alignItems: 'center', borderWidth: 1, borderColor: colors.border,
  },
  skillCardActive: { borderColor: colors.primary, borderWidth: 2 },
  skillIconWrap: { width: 38, height: 38, borderRadius: 19, justifyContent: 'center', alignItems: 'center', marginBottom: 6 },
  skillName: { fontSize: 11, fontWeight: '700', color: colors.text, textAlign: 'center' },
  skillType: { fontSize: 9, color: colors.textSecondary, marginTop: 2 },
  skillDmg: { fontSize: 10, fontWeight: '700', color: '#ef4444', marginTop: 2 },
  skillHeal: { fontSize: 10, fontWeight: '700', color: '#10b981', marginTop: 2 },
  // Equipment slots
  equipmentSlots: { gap: 10 },
  equipSlot: {
    backgroundColor: colors.surface, borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: colors.border,
  },
  equipSlotLabel: { fontSize: 12, fontWeight: '700', color: colors.textSecondary, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 },
  equipSlotFilled: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  equipSlotIcon: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  equipSlotName: { fontSize: 14, fontWeight: '700', color: colors.text, flex: 1 },
  equipBonusText: { fontSize: 10, color: '#10b981', fontWeight: '600' },
  equipSlotEmpty: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  equipSlotEmptyText: { fontSize: 13, color: colors.textLight, fontStyle: 'italic' },
  // Inventory
  inventoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  inventoryItem: {
    width: '31%', backgroundColor: colors.surface, borderRadius: 12,
    padding: 10, alignItems: 'center', borderWidth: 1, borderColor: colors.border, position: 'relative',
  },
  inventoryItemEquipable: { borderColor: '#3b82f6', borderStyle: 'dashed' },
  itemQuantityBadge: {
    position: 'absolute', top: 4, right: 6,
    backgroundColor: '#1e1b4b', borderRadius: 8, paddingHorizontal: 5, paddingVertical: 1, zIndex: 1,
  },
  itemQuantityText: { color: 'white', fontSize: 10, fontWeight: '800' },
  itemIcon: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', marginBottom: 6 },
  itemName: { fontSize: 11, fontWeight: '700', color: colors.text, textAlign: 'center' },
  itemRarity: { fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 },
  equipableTag: {
    backgroundColor: '#dbeafe', borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1, marginTop: 4,
  },
  equipableTagText: { fontSize: 8, fontWeight: '700', color: '#1d4ed8' },
  emptyInventory: { alignItems: 'center', padding: 24, gap: 8 },
  emptyInventoryText: { fontSize: 13, color: colors.textLight, textAlign: 'center', fontStyle: 'italic' },
  // Badges
  badgesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  badgeItem: {
    width: '31%', aspectRatio: 1, backgroundColor: colors.surface,
    borderRadius: 12, padding: 12, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: colors.success,
  },
  badgeItemLocked: { borderColor: colors.textLight, backgroundColor: colors.background },
  badgeName: { fontSize: 10, fontWeight: '600', color: colors.text, textAlign: 'center', marginTop: 6 },
  badgeNameLocked: { color: colors.textLight },
  // Modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center', alignItems: 'center', padding: 20,
  },
  modalContent: {
    backgroundColor: 'white', borderRadius: 16, padding: 24, width: '100%', maxWidth: 400,
  },
  modalTitle: { fontSize: 20, fontWeight: '800', color: colors.text, textAlign: 'center', marginBottom: 4 },
  modalSubtitle: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', marginBottom: 16 },
  evoChoice: {
    backgroundColor: '#f0f9ff', borderRadius: 12, padding: 16, marginBottom: 10,
    borderWidth: 2, borderColor: '#bae6fd',
  },
  evoChoiceName: { fontSize: 16, fontWeight: '800', color: colors.primary, marginBottom: 4 },
  evoChoiceDesc: { fontSize: 13, color: colors.text, marginBottom: 6 },
  evoChoiceBonus: { fontSize: 12, fontWeight: '700', color: '#10b981' },
  modalCloseBtn: { alignItems: 'center', paddingVertical: 12, marginTop: 4 },
  modalCloseBtnText: { fontSize: 14, color: colors.textSecondary, fontWeight: '600' },
});
