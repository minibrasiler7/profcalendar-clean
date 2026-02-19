import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, RefreshControl, StyleSheet, Alert, Platform } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import api from '../../api/client';
import FileCard from '../../components/FileCard';
import colors from '../../theme/colors';
import * as SecureStore from 'expo-secure-store';

export default function FilesScreen() {
  const [files, setFiles] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [downloading, setDownloading] = useState(null);

  const fetchFiles = async () => {
    try {
      const res = await api.get('/student/files');
      setFiles(res.data.files || []);
    } catch (err) {
      console.log('Files error:', err.response?.data);
    }
  };

  useFocusEffect(useCallback(() => { fetchFiles(); }, []));

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchFiles();
    setRefreshing(false);
  };

  const handleDownload = async (file) => {
    try {
      const token = await SecureStore.getItemAsync('token');
      const url = `${api.defaults.baseURL}/student/files/${file.id}/download`;
      const filename = file.filename || `fichier_${file.id}`;

      Alert.alert(
        'Téléchargement',
        `Voulez-vous télécharger "${filename}" ?`,
        [
          { text: 'Annuler', style: 'cancel' },
          { text: 'Télécharger', onPress: async () => {
            try {
              setDownloading(file.id);
              const fileUri = FileSystem.documentDirectory + filename;
              const downloadResult = await FileSystem.downloadAsync(url, fileUri, {
                headers: { Authorization: `Bearer ${token}` },
              });

              if (downloadResult.status === 200) {
                // Proposer de partager/ouvrir le fichier
                const canShare = await Sharing.isAvailableAsync();
                if (canShare) {
                  await Sharing.shareAsync(downloadResult.uri, {
                    mimeType: downloadResult.headers['content-type'] || 'application/octet-stream',
                    dialogTitle: `Ouvrir ${filename}`,
                  });
                } else {
                  Alert.alert('Succès', `"${filename}" téléchargé avec succès.`);
                }
              } else {
                Alert.alert('Erreur', 'Impossible de télécharger le fichier. Veuillez réessayer.');
              }
            } catch (dlErr) {
              console.log('Download error:', dlErr);
              Alert.alert('Erreur', 'Erreur lors du téléchargement du fichier.');
            } finally {
              setDownloading(null);
            }
          }},
        ]
      );
    } catch (err) {
      Alert.alert('Erreur', 'Impossible de télécharger le fichier');
    }
  };

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
    >
      <Text style={styles.pageTitle}>Mes Fichiers</Text>
      <Text style={styles.count}>{files.length} fichier{files.length > 1 ? 's' : ''} partagé{files.length > 1 ? 's' : ''}</Text>

      <View style={styles.list}>
        {files.length === 0 ? (
          <Text style={styles.empty}>Aucun fichier partagé</Text>
        ) : (
          files.map((f) => <FileCard key={f.id} file={f} onDownload={handleDownload} />)
        )}
      </View>

      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  pageTitle: { fontSize: 22, fontWeight: '800', color: colors.text, paddingHorizontal: 20, paddingTop: 20 },
  count: { fontSize: 13, color: colors.textSecondary, paddingHorizontal: 20, marginTop: 4, marginBottom: 16 },
  list: { paddingHorizontal: 16 },
  empty: { fontSize: 14, color: colors.textLight, textAlign: 'center', padding: 40 },
});
