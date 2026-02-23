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
  { id: 'guerisseur', name: 'Guérisseur', image: `${BASE_URL}/static/img/chihuahua/guerisseur.png` },
];

export default function RPGDashboardScreen({ navigation }) {
  const [rpgData, setRpgData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [changingAvatar, setChangingAvatar] = useState(false);

  const fetchData = async () => {
    try {
      const res = await api.get('/student/rpg/profile');
      setRpgData(res.data.rpg_profile);
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
      await api.post('/student/rpg/avatar', { avatar_class: classId });
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

  const xpPercent = rpgData.xp_for_next_level > 0
    ? (rpgData.xp_progress || 0)
    : 0;
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
          {currentAvatarClass ? (
            <Image source={{ uri: currentAvatarClass.image }} style={styles.avatarImage} />
          ) : (
            <Ionicons name="help-circle-outline" size={40} color="rgba(255,255,255,0.5)" />
          )}
        </View>
        <View style={styles.heroInfo}>
          <Text style={styles.heroName}>{rpgData.student_name || 'Aventurier'}</Text>
          <Text style={styles.heroClass}>{currentAvatarClass?.name || 'Aucune classe'}</Text>
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
            {rpgData.xp_total} / {rpgData.xp_for_next_level} XP
          </Text>
        </View>
      </View>

      {/* Avatar Class Selection */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Classe</Text>
        {!rpgData.avatar_class && (
          <View style={styles.chooseAlert}>
            <Ionicons name="warning-outline" size={20} color="#f59e0b" />
            <Text style={styles.chooseAlertText}>Choisis un personnage pour lancer des missions !</Text>
          </View>
        )}
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
              <Image source={{ uri: classItem.image }} style={styles.classImage} />
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
            <Text style={styles.statValue}>{rpgData.xp_total}</Text>
          </View>
          <View style={styles.statItem}>
            <Ionicons name="cash-outline" size={24} color="#fbbf24" />
            <Text style={styles.statLabel}>Or</Text>
            <Text style={styles.statValue}>{rpgData.gold}</Text>
          </View>
          <View style={styles.statItem}>
            <Ionicons name="trophy" size={24} color={colors.primary} />
            <Text style={styles.statLabel}>Niveau</Text>
            <Text style={styles.statValue}>{rpgData.level}</Text>
          </View>
        </View>
      </View>

      {/* Inventaire */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          Inventaire ({rpgData.items?.length || 0} objets)
        </Text>
        {rpgData.items && rpgData.items.length > 0 ? (
          <View style={styles.inventoryGrid}>
            {rpgData.items.map((si) => (
              <View key={si.id} style={styles.inventoryItem}>
                {si.quantity > 1 && (
                  <View style={styles.itemQuantityBadge}>
                    <Text style={styles.itemQuantityText}>x{si.quantity}</Text>
                  </View>
                )}
                <View style={[styles.itemIcon, { backgroundColor: si.item?.color || '#6b7280' }]}>
                  <Ionicons
                    name={
                      si.item?.icon === 'flask' ? 'flask' :
                      si.item?.icon === 'gavel' ? 'hammer' :
                      si.item?.icon === 'shield-alt' ? 'shield' :
                      si.item?.icon === 'scroll' ? 'document-text' :
                      si.item?.icon === 'gem' ? 'diamond' :
                      si.item?.icon === 'coins' ? 'cash' :
                      si.item?.icon === 'crown' ? 'ribbon' :
                      si.item?.icon === 'hat-wizard' ? 'sparkles' :
                      si.item?.icon === 'user-secret' ? 'eye-off' :
                      si.item?.icon === 'ring' ? 'ellipse' :
                      'cube'
                    }
                    size={22}
                    color="white"
                  />
                </View>
                <Text style={styles.itemName} numberOfLines={1}>{si.item?.name}</Text>
                <Text style={[styles.itemRarity, { color: si.item?.rarity_color || '#9ca3af' }]}>
                  {si.item?.rarity_label || 'Commun'}
                </Text>
              </View>
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
                style={[
                  styles.badgeItem,
                  !badge.earned_at && styles.badgeItemLocked,
                ]}
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
    borderColor: '#f59e0b',
    overflow: 'hidden',
  },
  avatarImage: { width: 70, height: 70, resizeMode: 'contain', backgroundColor: 'white', borderRadius: 35 },
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
  chooseAlert: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fef3c7',
    borderWidth: 1,
    borderColor: '#f59e0b',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  chooseAlertText: { fontSize: 13, fontWeight: '600', color: '#92400e', flex: 1 },
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
  classCardSelected: { borderColor: colors.primary },
  classImage: { width: 56, height: 56, resizeMode: 'contain', marginBottom: 8, backgroundColor: 'white', borderRadius: 28 },
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
  badgeName: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
    marginTop: 6,
  },
  badgeNameLocked: { color: colors.textLight },
  inventoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  inventoryItem: {
    width: '31%',
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    position: 'relative',
  },
  itemQuantityBadge: {
    position: 'absolute',
    top: 4,
    right: 6,
    backgroundColor: '#1e1b4b',
    borderRadius: 8,
    paddingHorizontal: 5,
    paddingVertical: 1,
    zIndex: 1,
  },
  itemQuantityText: { color: 'white', fontSize: 10, fontWeight: '800' },
  itemIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  itemName: { fontSize: 11, fontWeight: '700', color: colors.text, textAlign: 'center' },
  itemRarity: { fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 },
  emptyInventory: { alignItems: 'center', padding: 24, gap: 8 },
  emptyInventoryText: { fontSize: 13, color: colors.textLight, textAlign: 'center', fontStyle: 'italic' },
});
