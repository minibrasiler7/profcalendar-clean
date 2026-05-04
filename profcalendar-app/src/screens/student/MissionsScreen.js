import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  RefreshControl,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import api from '../../api/client';
import colors from '../../theme/colors';
import BadgeImage from '../../components/BadgeImage';

export default function MissionsScreen({ navigation }) {
  const [missions, setMissions] = useState([]);
  const [badges, setBadges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const timerRef = useRef(null);

  const fetchData = async () => {
    try {
      const res = await api.get('/student/missions');
      const all = res.data.missions || [];
      setMissions(all.filter((m) => m.mode !== 'combat'));
    } catch (err) {
      console.log('Missions error:', err.response?.data);
    }
    try {
      const badgeRes = await api.get('/student/exercise-badges');
      setBadges(badgeRes.data.badges || []);
    } catch (err) {
      // Endpoint optionnel : si l'API ne le supporte pas (ancienne version),
      // on n'affiche simplement pas la galerie.
      console.log('Badges error:', err.response?.data);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchData();
      timerRef.current = setInterval(() => {
        setMissions((prev) =>
          prev.map((m) => {
            if (m.on_cooldown && m.cooldown_remaining > 0) {
              const newRemaining = m.cooldown_remaining - 1;
              if (newRemaining <= 0) {
                return { ...m, on_cooldown: false, cooldown_remaining: 0 };
              }
              return { ...m, cooldown_remaining: newRemaining };
            }
            return m;
          })
        );
      }, 1000);
      return () => {
        if (timerRef.current) clearInterval(timerRef.current);
      };
    }, [])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  const handleMissionPress = (mission) => {
    if (mission.on_cooldown && mission.cooldown_remaining > 0) return;
    navigation.navigate('ExerciseSolve', { missionId: mission.id });
  };

  const formatCooldown = (seconds) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h}h${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const renderMissionItem = ({ item }) => {
    const isCooldown = item.on_cooldown && item.cooldown_remaining > 0;
    const statusColor = isCooldown
      ? '#f59e0b'
      : item.status === 'completed'
      ? colors.success
      : colors.warning;
    const statusLabel = isCooldown
      ? 'Cooldown'
      : item.status === 'completed'
      ? 'Complété'
      : 'À faire';

    return (
      <TouchableOpacity
        style={[styles.missionCard, isCooldown && styles.missionCardCooldown]}
        onPress={() => handleMissionPress(item)}
        disabled={isCooldown}
        activeOpacity={isCooldown ? 1 : 0.7}
      >
        <View style={styles.missionHeader}>
          <View style={styles.missionInfo}>
            <Text style={[styles.missionTitle, isCooldown && { opacity: 0.5 }]}>
              {item.title}
            </Text>
            <Text style={styles.missionSubject}>{item.subject}</Text>
          </View>
          <View style={styles.missionRight}>
            <View style={[styles.statusBadge, { backgroundColor: statusColor + '20' }]}>
              {isCooldown && (
                <Ionicons name="hourglass" size={12} color={statusColor} style={{ marginRight: 4 }} />
              )}
              <Text style={[styles.statusLabel, { color: statusColor }]}>{statusLabel}</Text>
            </View>
          </View>
        </View>

        {isCooldown && (
          <View style={styles.cooldownRow}>
            <Ionicons name="time-outline" size={16} color="#f59e0b" />
            <Text style={styles.cooldownText}>
              Disponible dans {formatCooldown(item.cooldown_remaining)}
            </Text>
          </View>
        )}

        <View style={styles.missionFooter}>
          <View style={styles.xpBadge}>
            <Ionicons name="star" size={14} color={colors.warning} />
            <Text style={styles.xpText}>+{item.xp_reward} XP</Text>
          </View>
          {!isCooldown && (
            <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
          )}
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  // Galerie de badges affichée en en-tête de la liste des missions.
  // Chaque badge est en couleur si l'élève a atteint le seuil de l'exercice,
  // grisé sinon. Tap sur un badge → ouvre l'exercice correspondant.
  const renderBadgeGallery = () => {
    if (!badges || badges.length === 0) return null;
    return (
      <View style={styles.badgeGalleryContainer}>
        <Text style={styles.badgeGalleryTitle}>🏅 Mes badges</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.badgeGalleryScroll}
        >
          {badges.map((b) => (
            <View
              key={b.exercise_id}
              style={[
                styles.badgeItem,
                b.earned ? styles.badgeItemEarned : styles.badgeItemLocked,
              ]}
            >
              <BadgeImage
                pattern={b.badge_pattern}
                color={b.badge_color}
                size={64}
                greyed={!b.earned}
              />
              <Text
                style={[
                  styles.badgeItemTitle,
                  b.earned ? styles.badgeItemTitleEarned : styles.badgeItemTitleLocked,
                ]}
                numberOfLines={2}
              >
                {b.exercise_title}
              </Text>
            </View>
          ))}
        </ScrollView>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={missions}
        keyExtractor={(item) => item.id.toString()}
        renderItem={renderMissionItem}
        ListHeaderComponent={renderBadgeGallery}
        ListEmptyComponent={<Text style={styles.empty}>Aucune mission pour le moment</Text>}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background },
  listContent: { paddingHorizontal: 16, paddingVertical: 12, paddingBottom: 20 },
  missionCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  missionCardCooldown: {
    borderColor: '#f59e0b50',
    backgroundColor: colors.surface,
    opacity: 0.75,
  },
  missionHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  missionInfo: { flex: 1 },
  missionTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  missionSubject: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  missionRight: { marginLeft: 12 },
  statusBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, flexDirection: 'row', alignItems: 'center' },
  statusLabel: { fontSize: 12, fontWeight: '600' },
  cooldownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f59e0b10',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 10,
    gap: 6,
  },
  cooldownText: { fontSize: 13, fontWeight: '600', color: '#f59e0b' },
  missionFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  xpBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  xpText: { fontSize: 13, fontWeight: '600', color: colors.warning },
  empty: {
    fontSize: 14,
    color: colors.textLight,
    textAlign: 'center',
    paddingVertical: 40,
    fontStyle: 'italic',
  },
  // Galerie de badges
  badgeGalleryContainer: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  badgeGalleryTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 8,
  },
  badgeGalleryScroll: {
    gap: 10,
    paddingRight: 8,
  },
  badgeItem: {
    width: 90,
    alignItems: 'center',
    padding: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  badgeItemEarned: {
    backgroundColor: '#fefce8',
    borderColor: '#fde047',
  },
  badgeItemLocked: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
  },
  badgeItemTitle: {
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 14,
  },
  badgeItemTitleEarned: {
    color: '#92400e',
  },
  badgeItemTitleLocked: {
    color: colors.textLight,
  },
});
