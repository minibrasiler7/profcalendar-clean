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

    // Mode combat RPG → ouvrir CombatScreen
    if (mission.mode === 'combat' && mission.combat_session_id) {
      navigation.getParent().navigate('RPG', {
        screen: 'Combat',
        params: {
          sessionId: mission.combat_session_id,
          studentId: rpgData?.student_id,
          classroomId: rpgData?.classroom_id,
        },
      });
      return;
    }

    // Mode classique → exercice normal
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
    const isCombat = item.mode === 'combat' && item.combat_session_id;
    const combatNotReady = item.mode === 'combat' && !item.combat_session_id;

    const statusColor = isCooldown
      ? '#f59e0b'
      : isCombat
      ? '#ef4444'
      : item.status === 'completed'
      ? colors.success
      : colors.warning;
    const statusLabel = isCooldown
      ? 'Cooldown'
      : isCombat
      ? '⚔️ Combat'
      : combatNotReady
      ? 'En attente'
      : item.status === 'completed'
      ? 'Complété'
      : 'À faire';

    const isDisabled = isCooldown || combatNotReady;

    return (
      <TouchableOpacity
        style={[
          styles.missionCard,
          isCooldown && styles.missionCardCooldown,
          isCombat && styles.missionCardCombat,
        ]}
        onPress={() => handleMissionPress(item)}
        disabled={isDisabled}
        activeOpacity={isDisabled ? 1 : 0.7}
      >
        <View style={styles.missionHeader}>
          <View style={styles.missionInfo}>
            <Text style={[styles.missionTitle, isDisabled && { opacity: 0.5 }]}>
              {isCombat ? '⚔️ ' : ''}{item.title}
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

        {isCombat && (
          <View style={styles.combatRow}>
            <Ionicons name="flash" size={16} color="#ef4444" />
            <Text style={styles.combatText}>
              Combat en cours — Rejoindre !
            </Text>
          </View>
        )}

        {combatNotReady && (
          <View style={styles.combatRow}>
            <Ionicons name="time-outline" size={16} color="#9ca3af" />
            <Text style={[styles.combatText, { color: '#9ca3af' }]}>
              En attente du prof pour lancer le combat
            </Text>
          </View>
        )}

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
          {!isDisabled && (
            <Ionicons name="chevron-forward" size={18} color={isCombat ? '#ef4444' : colors.textSecondary} />
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
              source={{ uri: `${BASE_URL}/static/${rpgData.sprite_path || ('img/chihuahua/' + rpgData.avatar_class + '.png')}` }}
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
  missionCardCombat: {
    borderColor: '#ef4444',
    borderWidth: 2,
    backgroundColor: '#1a1a2e10',
  },
  combatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ef444415',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 10,
    gap: 6,
  },
  combatText: { fontSize: 13, fontWeight: '600', color: '#ef4444' },
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
