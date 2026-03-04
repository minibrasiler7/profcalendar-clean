import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import colors from '../theme/colors';

const FILE_ICONS = {
  pdf: 'document-text',
  doc: 'document',
  docx: 'document',
  xls: 'grid',
  xlsx: 'grid',
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
};

export default function FileCard({ file, onDownload }) {
  const icon = FILE_ICONS[file.file_type] || 'attach';

  return (
    <TouchableOpacity style={styles.card} onPress={() => onDownload?.(file)}>
      <View style={styles.iconBox}>
        <Ionicons name={icon} size={24} color={colors.primary} />
      </View>
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>{file.filename}</Text>
        <Text style={styles.meta}>{file.shared_at?.split('T')[0]}</Text>
        {file.message ? <Text style={styles.message} numberOfLines={2}>{file.message}</Text> : null}
      </View>
      <Ionicons name="download-outline" size={20} color={colors.textLight} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  iconBox: {
    width: 44, height: 44, borderRadius: 10,
    backgroundColor: colors.primary + '15',
    justifyContent: 'center', alignItems: 'center',
    marginRight: 12,
  },
  info: { flex: 1, marginRight: 8 },
  name: { fontSize: 14, fontWeight: '600', color: colors.text },
  meta: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
  message: { fontSize: 12, color: colors.textSecondary, marginTop: 4, fontStyle: 'italic' },
});
