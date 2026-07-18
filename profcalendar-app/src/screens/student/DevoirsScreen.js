import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  RefreshControl,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Image,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as ImagePicker from 'expo-image-picker';
import api from '../../api/client';
import colors from '../../theme/colors';

export default function DevoirsScreen({ navigation }) {
  const [devoirs, setDevoirs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [photos, setPhotos] = useState({}); // { [devoirId]: [assets] }
  const [sending, setSending] = useState(null);
  const [downloading, setDownloading] = useState(null);

  const fetchDevoirs = async () => {
    try {
      const res = await api.get('/student/devoirs');
      setDevoirs(res.data.devoirs || []);
    } catch (err) {
      console.log('Devoirs error:', err.response?.data);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(useCallback(() => { fetchDevoirs(); }, []));

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchDevoirs();
    setRefreshing(false);
  };

  // ─── Photos : appareil ou galerie, accumulées avant l'envoi ───
  const addPhotos = (devoirId) => {
    Alert.alert('Ajouter une photo', 'Comment veux-tu ajouter ta photo ?', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Appareil photo', onPress: () => pickFromCamera(devoirId) },
      { text: 'Galerie', onPress: () => pickFromLibrary(devoirId) },
    ]);
  };

  const pushPhotos = (devoirId, assets) => {
    if (!assets || !assets.length) return;
    setPhotos((prev) => ({
      ...prev,
      [devoirId]: [...(prev[devoirId] || []), ...assets],
    }));
  };

  const pickFromCamera = async (devoirId) => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission refusée', "Autorise l'accès à l'appareil photo dans les Réglages.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (!result.canceled) pushPhotos(devoirId, result.assets);
  };

  const pickFromLibrary = async (devoirId) => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission refusée', "Autorise l'accès aux photos dans les Réglages.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      quality: 0.7,
    });
    if (!result.canceled) pushPhotos(devoirId, result.assets);
  };

  const removePhoto = (devoirId, index) => {
    setPhotos((prev) => ({
      ...prev,
      [devoirId]: (prev[devoirId] || []).filter((_, i) => i !== index),
    }));
  };

  const submitPhotos = async (devoir) => {
    const list = photos[devoir.id] || [];
    if (!list.length) return;
    setSending(devoir.id);
    try {
      const fd = new FormData();
      list.forEach((a, i) => {
        fd.append('photos', {
          uri: a.uri,
          name: a.fileName || `photo_${i + 1}.jpg`,
          type: a.mimeType || 'image/jpeg',
        });
      });
      const res = await api.post(`/student/devoirs/${devoir.id}/submit`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 60000,
      });
      if (res.data.success) {
        Alert.alert('Envoyé !', 'Ton devoir a bien été envoyé à ton enseignant.');
        setPhotos((prev) => ({ ...prev, [devoir.id]: [] }));
        await fetchDevoirs();
      } else {
        Alert.alert('Erreur', res.data.error || "Échec de l'envoi");
      }
    } catch (err) {
      Alert.alert('Erreur', err.response?.data?.error || 'Erreur réseau');
    } finally {
      setSending(null);
    }
  };

  // ─── Correction : téléchargement authentifié puis partage/aperçu ───
  const viewCorrection = async (devoir) => {
    if (!devoir.submission_id) return;
    setDownloading(devoir.id);
    try {
      const token = await SecureStore.getItemAsync('token');
      const url = `${api.defaults.baseURL}/student/devoirs/submission/${devoir.submission_id}/corrected`;
      const fileUri = FileSystem.documentDirectory + `correction_devoir_${devoir.id}.pdf`;
      const dl = await FileSystem.downloadAsync(url, fileUri, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (dl.status === 200) {
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(dl.uri, { mimeType: 'application/pdf' });
        } else {
          Alert.alert('Téléchargé', 'Correction enregistrée dans les fichiers de l’app.');
        }
      } else {
        Alert.alert('Erreur', 'Impossible de télécharger la correction.');
      }
    } catch (err) {
      Alert.alert('Erreur', 'Impossible de télécharger la correction.');
    } finally {
      setDownloading(null);
    }
  };

  // ─── Document joint par l'enseignant : téléchargement authentifié + aperçu ───
  const viewDocument = async (devoir) => {
    setDownloading('doc' + devoir.id);
    try {
      const token = await SecureStore.getItemAsync('token');
      const url = `${api.defaults.baseURL}/student/devoirs/${devoir.id}/document`;
      const safeName = (devoir.document_name || `document_${devoir.id}.pdf`).replace(/[^\w.\-]/g, '_');
      const fileUri = FileSystem.documentDirectory + safeName;
      const dl = await FileSystem.downloadAsync(url, fileUri, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (dl.status === 200) {
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(dl.uri);
        } else {
          Alert.alert('Téléchargé', 'Document enregistré dans les fichiers de l’app.');
        }
      } else {
        Alert.alert('Erreur', 'Impossible de télécharger le document.');
      }
    } catch (err) {
      Alert.alert('Erreur', 'Impossible de télécharger le document.');
    } finally {
      setDownloading(null);
    }
  };

  const openExercise = (devoir) => {
    if (!devoir.mission_id) {
      Alert.alert('Indisponible', "Cet exercice n'est pas encore accessible.");
      return;
    }
    navigation.navigate('Missions', {
      screen: 'ExerciseSolve',
      params: { missionId: devoir.mission_id },
    });
  };

  // ─── Rendu ───
  const formatDate = (iso) => {
    if (!iso) return '';
    const [y, m, d] = iso.split('-');
    return `${d}.${m}.${y}`;
  };

  const isOverdue = (devoir) => {
    if (devoir.submitted || devoir.type !== 'submission' || !devoir.due_date) return false;
    const today = new Date().toISOString().slice(0, 10);
    return devoir.due_date < today;
  };

  const renderDevoir = ({ item }) => {
    const pending = photos[item.id] || [];
    const overdue = isOverdue(item);
    const borderColor = item.submitted ? colors.success : (overdue ? colors.error : colors.primary);
    return (
      <View style={[styles.card, { borderLeftColor: borderColor }]}>
        <View style={styles.cardHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.meta}>
              {item.subject ? `${item.subject} · ` : ''}à rendre le {formatDate(item.due_date)}
            </Text>
          </View>
          <View style={[styles.typeChip, item.type === 'exercise' ? styles.chipExercise : styles.chipSubmission]}>
            <Text style={item.type === 'exercise' ? styles.chipExerciseText : styles.chipSubmissionText}>
              {item.type === 'exercise' ? 'Exercice' : 'À rendre'}
            </Text>
          </View>
        </View>

        {item.instructions ? <Text style={styles.instructions}>{item.instructions}</Text> : null}

        {item.has_document ? (
          <TouchableOpacity
            style={[styles.outlineBtn, { alignSelf: 'flex-start' }]}
            onPress={() => viewDocument(item)}
            disabled={downloading === 'doc' + item.id}
          >
            {downloading === 'doc' + item.id
              ? <ActivityIndicator size="small" color={colors.primary} />
              : <Ionicons name="attach" size={16} color={colors.primary} />}
            <Text style={styles.outlineBtnText}>Voir le document</Text>
          </TouchableOpacity>
        ) : null}

        {item.type === 'exercise' ? (
          <TouchableOpacity style={styles.primaryBtn} onPress={() => openExercise(item)}>
            <Ionicons name="play" size={16} color="#FFF" />
            <Text style={styles.primaryBtnText}>Faire l'exercice</Text>
          </TouchableOpacity>
        ) : (
          <View>
            {item.submitted ? (
              <View style={styles.statusRow}>
                <Ionicons name="checkmark-circle" size={16} color={colors.success} />
                <Text style={styles.statusText}>
                  Rendu ({item.page_count} page{item.page_count > 1 ? 's' : ''})
                </Text>
              </View>
            ) : null}
            {item.corrected ? (
              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: colors.success }]}
                onPress={() => viewCorrection(item)}
                disabled={downloading === item.id}
              >
                {downloading === item.id
                  ? <ActivityIndicator size="small" color="#FFF" />
                  : <Ionicons name="document-text" size={16} color="#FFF" />}
                <Text style={styles.primaryBtnText}>Voir la correction</Text>
              </TouchableOpacity>
            ) : null}

            {pending.length > 0 ? (
              <View style={styles.thumbRow}>
                {pending.map((a, i) => (
                  <View key={`${a.uri}_${i}`} style={styles.thumbWrap}>
                    <Image source={{ uri: a.uri }} style={styles.thumb} />
                    <TouchableOpacity style={styles.thumbRemove} onPress={() => removePhoto(item.id, i)}>
                      <Ionicons name="close" size={12} color="#FFF" />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            ) : null}

            <View style={styles.actionsRow}>
              <TouchableOpacity style={styles.outlineBtn} onPress={() => addPhotos(item.id)}>
                <Ionicons name="camera" size={16} color={colors.primary} />
                <Text style={styles.outlineBtnText}>
                  {item.submitted ? 'Remplacer — ajouter des photos' : 'Ajouter une photo'}
                </Text>
              </TouchableOpacity>
              {pending.length > 0 ? (
                <TouchableOpacity
                  style={styles.primaryBtn}
                  onPress={() => submitPhotos(item)}
                  disabled={sending === item.id}
                >
                  {sending === item.id
                    ? <ActivityIndicator size="small" color="#FFF" />
                    : <Ionicons name="send" size={16} color="#FFF" />}
                  <Text style={styles.primaryBtnText}>Envoyer ({pending.length})</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Mes devoirs</Text>
      </View>
      <FlatList
        data={devoirs}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderDevoir}
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <View style={styles.center}>
            <Ionicons name="book-outline" size={48} color={colors.textLight} />
            <Text style={styles.emptyText}>Aucun devoir pour le moment 🎉</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 48 },
  header: { backgroundColor: colors.primary, paddingTop: 60, paddingBottom: 16, paddingHorizontal: 20 },
  headerTitle: { color: '#FFF', fontSize: 22, fontWeight: '700' },
  emptyText: { color: colors.textSecondary, marginTop: 12, fontSize: 15 },
  card: {
    backgroundColor: colors.surface, borderRadius: 12, borderLeftWidth: 5,
    padding: 14, marginBottom: 12, shadowColor: '#000', shadowOpacity: 0.05,
    shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  title: { fontSize: 16, fontWeight: '700', color: colors.text },
  meta: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  typeChip: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  chipSubmission: { backgroundColor: '#EEF2FF' },
  chipSubmissionText: { color: colors.primary, fontSize: 11, fontWeight: '700' },
  chipExercise: { backgroundColor: '#FEF3C7' },
  chipExerciseText: { color: '#B45309', fontSize: 11, fontWeight: '700' },
  instructions: { fontSize: 13, color: colors.text, marginTop: 8 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 10 },
  statusText: { fontSize: 13, color: colors.secondaryDark, fontWeight: '600' },
  actionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: colors.primary, borderRadius: 8, paddingVertical: 9,
    paddingHorizontal: 12, marginTop: 10, alignSelf: 'flex-start',
  },
  primaryBtnText: { color: '#FFF', fontSize: 13, fontWeight: '700' },
  outlineBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1,
    borderColor: '#C7D2FE', borderRadius: 8, paddingVertical: 9,
    paddingHorizontal: 12, marginTop: 10, backgroundColor: '#FFF',
  },
  outlineBtnText: { color: colors.primary, fontSize: 13, fontWeight: '600' },
  thumbRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  thumbWrap: { position: 'relative' },
  thumb: { width: 62, height: 62, borderRadius: 8, borderWidth: 1, borderColor: colors.border },
  thumbRemove: {
    position: 'absolute', top: -6, right: -6, backgroundColor: colors.error,
    borderRadius: 10, width: 20, height: 20, alignItems: 'center',
    justifyContent: 'center', borderWidth: 2, borderColor: '#FFF',
  },
});
