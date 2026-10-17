import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';

/**
 * A small dialog asking for a name (Android has no built-in text prompt).
 * Render it with a `key` that changes when it opens so the field starts from `initialValue`.
 */
export function NameDialog({
  visible,
  title,
  initialValue = '',
  placeholder,
  onCancel,
  onSubmit,
}: {
  visible: boolean;
  title: string;
  initialValue?: string;
  placeholder?: string;
  onCancel: () => void;
  onSubmit: (name: string) => void;
}) {
  const [value, setValue] = useState(initialValue);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel}>
        <Pressable>
          <ThemedView style={styles.dialog}>
            <ThemedText type="smallBold">{title}</ThemedText>
            <View style={styles.field}>
              <TextField
                autoFocus
                value={value}
                placeholder={placeholder}
                onChangeText={setValue}
                onSubmitEditing={() => onSubmit(value)}
                returnKeyType="done"
              />
            </View>
            <View style={styles.actions}>
              <Button title="Cancel" variant="secondary" onPress={onCancel} />
              <Button title="Save" onPress={() => onSubmit(value)} disabled={!value.trim()} />
            </View>
          </ThemedView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: Spacing.four },
  dialog: { borderRadius: 16, padding: Spacing.four, gap: Spacing.three },
  field: { flexDirection: 'row' },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: Spacing.two },
});
