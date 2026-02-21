import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  RefreshControl,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Image,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import api from '../../api/client';
import colors from '../../theme/colors';

const BASE_URL = 'https://profcalendar-clean.onrender.com';

export default function MissionsScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [missions, setMissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [rpgData, setRpgData] = useState(null);
  const timerRef = useRef(null);

  const fetchData = async () => {
    try {
      const [missionsRes, rpgRes] = await Promise.all([
        api.get('/student/missions'),
        api.get('/student/rpg/profile'),
      ]);
      setMissions(missionsRes.data.missions || []);
      setRpgData(rpgRes.data.rpg_profile);
    } catch (err) {
      console.log('Missions error:', err.response?.data);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchData();
      // Start countdown timer
      timerRef.current = setInterval(() => {
        setMissions(prev =>
          prev.map(m => {
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

  const goToRPGDashboard = () => {
    navigation.getParent().navigate('RPG');
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
          {!isCooldown && item.status !== 'completed' && (
            <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
          )}
        </View>
      </TouchableOpacity>
    );
  };

  if (loading && !rpgData) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* RPG Mini Bar */}
      {rpgData && (
        <View style={[styles.rpgBar, { paddingTop: Math.max(insets.top, 12) }]}>
          {rpgData.avatar_class ? (
            <Image
              source={{ uri: `${BASE_URL}/static/img/chihuahua/${rpgData.avatar_class}.png` }}
              style={styles.rpgAvatar}
            />
          ) : null}
          <View style={styles.rpgInfo}>
            <Text style={styles.rpgLevel}>Niveau {rpgData.level}</Text>
            <View style={styles.xpBarContainer}>
              <View
                style={[
                  styles.xpBarFill,
                  { width: `${rpgData.xp_progress || 0}%` },
                ]}
              />
            </View>
            <Text style={styles.xpBarLabel}>
              {rpgData.xp_total} / {rpgData.xp_for_next_level} XP
            </Text>
          </View>
          <TouchableOpacity style={styles.rpgButton} onPress={goToRPGDashboard}>
            <Ionicons name="trophy" size={20} color={colors.primary} />
          </TouchableOpacity>
        </View>
      )}

      <FlatList
        data={missions}
        keyExtractor={(item) => item.id.toString()}
        renderItem={renderMissionItem}
        ListEmptyComponent={
          <Text style={styles.empty}>Aucune mission pour le moment</Text>
        }
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
  rpgBar: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rpgAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'white', resizeMode: 'contain', borderWidth: 2, borderColor: '#f59e0b', marginRight: 10 },
  rpgInfo: { flex: 1 },
  rpgLevel: { fontSize: 14, fontWeight: '700', color: colors.text, marginBottom: 6 },
  xpBarContainer: {
    height: 8,
    backgroundColor: colors.border,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 4,
  },
  xpBarFill: { height: '100%', backgroundColor: colors.warning },
  xpBarLabel: { fontSize: 11, color: colors.textSecondary },
  rpgButton: { padding: 8, marginLeft: 12 },
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
});
