import { router } from 'expo-router';
import { useState } from 'react';

import { Page } from '@/components/page';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Chips } from '@/components/ui/chips';
import { NumberField } from '@/components/ui/text-field';
import { db } from '@/db/client';
import { getSettings, updateSettings, type WeightUnit } from '@/db/repo/settings';
import { write } from '@/db/use-db';

const UNIT_OPTIONS: { value: WeightUnit; label: string }[] = [
  { value: 'kg', label: 'Kilograms (kg)' },
  { value: 'lb', label: 'Pounds (lb)' },
];

export default function SettingsScreen() {
  const [initial] = useState(() => getSettings(db));
  const [unit, setUnit] = useState<WeightUnit>(initial.unit);
  const [increment, setIncrement] = useState(String(initial.defaultIncrement));

  const save = () => {
    if (write((db) => updateSettings(db, { unit, defaultIncrement: Number(increment) }))) router.back();
  };

  return (
    <Page>
      <ThemedText type="small" themeColor="textSecondary">
        Weight unit
      </ThemedText>
      <Chips options={UNIT_OPTIONS} value={unit} onChange={(value) => value && setUnit(value)} />
      <ThemedText type="small" themeColor="textSecondary">
        Changing the unit relabels weights; it doesn’t convert numbers you’ve already entered.
      </ThemedText>
      <NumberField label={`Default increment for new exercises (${unit})`} value={increment} onChangeValue={setIncrement} />
      <Button title="Save" onPress={save} />
    </Page>
  );
}
