import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { Page } from '@/components/page';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Chips } from '@/components/ui/chips';
import { NumberField, TextField } from '@/components/ui/text-field';
import { db } from '@/db/client';
import { createExercise, getExercise, MUSCLE_GROUPS, updateExercise } from '@/db/repo/exercises';
import { getSettings } from '@/db/repo/settings';
import { write } from '@/db/use-db';

const GROUP_OPTIONS = MUSCLE_GROUPS.map((g) => ({ value: g, label: g[0].toUpperCase() + g.slice(1) }));

export default function ExerciseScreen() {
  const param = useLocalSearchParams<{ id: string }>().id;
  const isNew = param === 'new';
  // Read once: this is a form, so it shouldn't reset while editing.
  const [initial] = useState(() => ({
    exercise: isNew ? undefined : getExercise(db, Number(param)),
    settings: getSettings(db),
  }));
  const { exercise, settings } = initial;

  const [name, setName] = useState(exercise?.name ?? '');
  const [group, setGroup] = useState<string | null>(exercise?.muscleGroup ?? null);
  const [equipment, setEquipment] = useState(exercise?.equipment ?? '');
  const [increment, setIncrement] = useState(String(exercise?.defaultIncrement ?? settings.defaultIncrement));

  const save = () => {
    const input = { name, muscleGroup: group ?? '', equipment, defaultIncrement: Number(increment) };
    const ok = write((db) => (isNew ? createExercise(db, input) : updateExercise(db, exercise!.id, input)));
    if (ok) router.back();
  };

  return (
    <Page>
      <Stack.Screen options={{ title: isNew ? 'New exercise' : 'Edit exercise' }} />
      <TextField label="Name" value={name} onChangeText={setName} placeholder="e.g. Pendlay Row" />
      <ThemedText type="small" themeColor="textSecondary">
        Muscle group
      </ThemedText>
      <Chips options={GROUP_OPTIONS} value={group} onChange={setGroup} />
      <TextField label="Equipment (optional)" value={equipment} onChangeText={setEquipment} placeholder="e.g. barbell" />
      <NumberField label={`Weight increment (${settings.unit})`} value={increment} onChangeValue={setIncrement} />
      <Button title="Save" onPress={save} />
    </Page>
  );
}
