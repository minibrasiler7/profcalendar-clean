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
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import api from '../../api/client';
import colors from '../../theme/colors';

const AVATAR_CLASSES = [
  { id: 'guerrier', name: 'Guerrier', emoji: '⚔️' },
  { id: 'mage', name: 'Mage', emoji: '🧙' },
  { id: 'archer', name: 'Archer', emoji: '🏹' },
  { id: 'guerisseur', name: 'Guérisseur', emoji: '💚' },
];

export default function RPGDashboardScreen({ navigation }) {
  const [rpgData, setRpgData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [changingAvatar, setChangingAvatar] = useState(false);

  const fetchData = async () => {
    try {
      const res = await api.get('/student/rpg/profile');
      setRpgData(res.data);
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

    setChangingAvatar(true);
    try {
      await api.post('/student/rpg/avatar', { class: classId });
      await fetchData();
    } catch (err) {
      console.log('Avatar change error:', err.response?.data);
      Alert.alert('Erreur', 'Impossible de changer l\'avatar');
    } finally {
      setChangingAvatar(false);
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

  const xpPercent = (rpgData.current_xp / rpgData.next_level_xp) * 100;
  const currentAvatarClass = AVATAR_CLASSES.find((c) => c.id === rpgData.avatar_class);

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
          <Text style={styles.avatarEmoji}>{currentAvatarClass?.emoji}</Text>
        </View>
        <View style={styles.heroInfo}>
          <Text style={styles.heroName}>{rpgData.student_name}</Text>
          <Text style={styles.heroClass}>{currentAvatarClass?.name}</Text>
        </View>
      </View>

      {/* Level and XP */}
      <View style={styles.levelSection}>
        <View style={styles.levelRow}>
          <Text style={styles.levelLabel}>Niveau</Text>
          <Text style={styles.levelValue}>{rpgData.level}</Text>
        </View>
        <View style={styles.xpContainer}>
          <View style={styles.xpBarBackground}>
            <View style={[styles.xpBarFill, { width: `${xpPercent}%` }]} />
          </View>
          <Text style={styles.xpText}>
            {rpgData.current_xp} / {rpgData.next_level_xp} XP
          </Text>
        </View>
      </View>

      {/* Avatar Class Selection */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Classe</Text>
        <View style={styles.classGrid}>
          {AVATAR_CLASSES.map((classItem) => (
            <TouchableOpacity
              key={classItem.id}
              style={[
                styles.classCard,
                rpgData.avatar_class === classItem.id && styles.classCardSelected,
              ]}
              onPress={() => handleAvatarChange(classItem.id)}
              disabled={changingAvatar}
            >
              <Text style={styles.classEmoji}>{classItem.emoji}</Text>
              <Text style={styles.className}>{classItem.name}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Stats */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Statistiques</Text>
        <View style={styles.statsGrid}>
          <View style={styles.statItem}>
            <Ionicons name="star" size={24} color={colors.warning} />
            <Text style={styles.statLabel}>XP Total</Text>
            <Text style={styles.statValue}>{rpgData.total_xp}</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.goldIcon}>💰</Text>
            <Text style={styles.statLabel}>Or</Text>
            <Text style={styles.statValue}>{rpgData.gold}</Text>
          </View>
          <View style={styles.statItem}>
            <Ionicons name="checkmark-circle" size={24} color={colors.success} />
            <Text style={styles.statLabel}>Missions</Text>
            <Text style={styles.statValue}>{rpgData.missions_completed}</Text>
          </View>
        </View>
      </View>

      {/* Badges */}
      {rpgData.badges && rpgData.badges.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Badges</Text>
          <View style={styles.badgesGrid}>
            {rpgData.badges.map((badge) => (
              <View
                key={badge.id}
                style={[
                  styles.badgeItem,
                  !badge.earned && styles.badgeItemLocked,
                ]}
              >
                <Text style={styles.badgeEmoji}>{badge.earned ? badge.emoji : '🔒'}</Text>
                <Text style={[styles.badgeName, !badge.earned && styles.badgeNameLocked]}>
                  {badge.name}
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}

      <View style={{ height: 32 }} />
    </ScrollView>
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
  errorText: { fontSize: 16, color: colors.text },
  heroSection: {
    backgroundColor: colors.primary,
    paddingVertical: 24,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
  },
  avatarContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.4)',
  },
  avatarEmoji: { fontSize: 40 },
  heroInfo: { flex: 1 },
  heroName: { fontSize: 22, fontWeight: '800', color: '#FFF' },
  heroClass: { fontSize: 14, color: 'rgba(255, 255, 255, 0.8)', marginTop: 2 },
  levelSection: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  levelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  levelLabel: { fontSize: 14, fontWeight: '600', color: colors.textSecondary },
  levelValue: { fontSize: 28, fontWeight: '800', color: colors.primary },
  xpContainer: { gap: 6 },
  xpBarBackground: {
    height: 10,
    backgroundColor: colors.border,
    borderRadius: 5,
    overflow: 'hidden',
  },
  xpBarFill: { height: '100%', backgroundColor: colors.warning },
  xpText: { fontSize: 12, color: colors.textSecondary, textAlign: 'center' },
  section: { paddingHorizontal: 16, paddingVertical: 16 },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: colors.text, marginBottom: 12 },
  classGrid: { flexDirection: 'row', gap: 12, justifyContent: 'space-between' },
  classCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.border,
  },
  classCardSelected: { borderColor: colors.primary, backgroundColor: colors.primary + '10' },
  classEmoji: { fontSize: 32, marginBottom: 8 },
  className: { fontSize: 12, fontWeight: '600', color: colors.text, textAlign: 'center' },
  statsGrid: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  statItem: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  statLabel: { fontSize: 11, color: colors.textSecondary, marginTop: 8 },
  statValue: { fontSize: 18, fontWeight: '800', color: colors.text, marginTop: 4 },
  goldIcon: { fontSize: 24, marginBottom: 4 },
  badgesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  badgeItem: {
    width: '31%',
    aspectRatio: 1,
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.success,
  },
  badgeItemLocked: { borderColor: colors.textLight, backgroundColor: colors.background },
  badgeEmoji: { fontSize: 32, marginBottom: 8 },
  badgeName: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
  },
  badgeNameLocked: { color: colors.textLight },
});
