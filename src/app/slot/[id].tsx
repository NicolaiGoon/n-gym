import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Page } from '@/components/page';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Chips } from '@/components/ui/chips';
import { NumberField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import { getExercise } from '@/db/repo/exercises';
import { getSlot, updateSlot } from '@/db/repo/routines';
import { getSettings } from '@/db/repo/settings';
import { db } from '@/db/client';
import { write } from '@/db/use-db';
import { defaultRule, type ProgressionRule } from '@/progression';

type RuleType = ProgressionRule['type'];

const TYPE_OPTIONS: { value: RuleType; label: string }[] = [
  { value: 'double', label: 'Double' },
  { value: 'linear', label: 'Linear' },
  { value: 'rpe', label: 'RPE' },
  { value: 'topBackoff', label: 'Top + back-off' },
  { value: 'wave', label: '5/3/1 waves' },
];

const TYPE_HELP: Record<RuleType, string> = {
  double: 'Work up the rep range at the same weight. When every set hits the top, add weight and start again at the bottom.',
  linear: 'Same sets and reps every time. Add weight after each successful session, and deload after repeated misses.',
  rpe: 'Fixed sets and reps. Weight goes up or down so the top set lands on the target RPE.',
  topBackoff:
    'One heavy top set worked up the rep range like double progression, then lighter back-off sets at a percentage of it.',
  wave: 'Four-week cycles from a training max: 5s, 3s, 5/3/1 (last set as many reps as possible), then a deload week. The training max goes up by the increment after each cycle.',
};

/** Fields shown as percentages in the editor but stored as fractions. */
const PERCENT_FIELDS = new Set(['deloadPercent', 'backoffPercent']);

/** Rule fields as editable text, so partial input like "2." is allowed while typing. */
type Draft = Record<string, string>;

function toDraft(rule: ProgressionRule): Draft {
  const draft: Draft = {};
  for (const [key, value] of Object.entries(rule)) {
    if (key === 'type') continue;
    draft[key] = PERCENT_FIELDS.has(key) ? String(Math.round((value as number) * 100)) : String(value);
  }
  return draft;
}

function fromDraft(type: RuleType, draft: Draft): ProgressionRule {
  const n = (key: string) => Number(draft[key]);
  switch (type) {
    case 'double':
      return { type, sets: n('sets'), repMin: n('repMin'), repMax: n('repMax'), increment: n('increment') };
    case 'linear':
      return {
        type,
        sets: n('sets'),
        reps: n('reps'),
        increment: n('increment'),
        failuresBeforeDeload: n('failuresBeforeDeload'),
        deloadPercent: n('deloadPercent') / 100,
      };
    case 'rpe':
      return { type, sets: n('sets'), reps: n('reps'), targetRpe: n('targetRpe'), increment: n('increment') };
    case 'wave':
      return { type, trainingMax: n('trainingMax'), increment: n('increment'), roundTo: n('roundTo') };
    case 'topBackoff':
      return {
        type,
        repMin: n('repMin'),
        repMax: n('repMax'),
        increment: n('increment'),
        backoffSets: n('backoffSets'),
        backoffPercent: n('backoffPercent') / 100,
        backoffReps: n('backoffReps'),
        roundTo: n('roundTo'),
      };
  }
}

const FIELDS: Record<RuleType, [string, string][]> = {
  double: [
    ['sets', 'Sets'],
    ['repMin', 'Min reps'],
    ['repMax', 'Max reps'],
    ['increment', 'Increment'],
  ],
  linear: [
    ['sets', 'Sets'],
    ['reps', 'Reps'],
    ['increment', 'Increment'],
    ['failuresBeforeDeload', 'Misses before deload'],
    ['deloadPercent', 'Deload %'],
  ],
  rpe: [
    ['sets', 'Sets'],
    ['reps', 'Reps'],
    ['targetRpe', 'Target RPE'],
    ['increment', 'Increment'],
  ],
  topBackoff: [
    ['repMin', 'Top set min reps'],
    ['repMax', 'Top set max reps'],
    ['increment', 'Increment'],
    ['backoffSets', 'Back-off sets'],
    ['backoffPercent', 'Back-off %'],
    ['backoffReps', 'Back-off reps'],
    ['roundTo', 'Round to'],
  ],
  wave: [
    ['trainingMax', 'Training max'],
    ['increment', 'Increment per cycle'],
    ['roundTo', 'Round to'],
  ],
};

export default function SlotScreen() {
  const id = Number(useLocalSearchParams<{ id: string }>().id);
  // Read once: this is a form, so it shouldn't reset while editing.
  const [initial] = useState(() => {
    const slot = getSlot(db, id);
    return slot ? { slot, exercise: getExercise(db, slot.exerciseId), unit: getSettings(db).unit } : null;
  });
  const [type, setType] = useState<RuleType>(initial?.slot.rule.type ?? 'double');
  const [draft, setDraft] = useState<Draft>(() => (initial ? toDraft(initial.slot.rule) : {}));
  const [startWeight, setStartWeight] = useState(String(initial?.slot.startWeight ?? 0));
  const [rest, setRest] = useState(String(initial?.slot.restSeconds ?? 120));

  if (!initial) return <Page>{null}</Page>;
  const increment = initial.exercise?.defaultIncrement ?? 2.5;

  const changeType = (next: RuleType | null) => {
    if (!next || next === type) return;
    // Keep sets and increment, fill the rest from the new type's defaults.
    const base = toDraft(defaultRule(next, Number(draft.increment) || increment));
    const keep = (key: string) => (key in base && draft[key] !== undefined ? { [key]: draft[key] } : {});
    setDraft({ ...base, ...keep('sets'), ...(next === 'wave' ? {} : keep('increment')) });
    setType(next);
  };

  const save = () => {
    const ok = write((db) =>
      updateSlot(db, id, {
        rule: fromDraft(type, draft),
        startWeight: Number(startWeight),
        restSeconds: Number(rest),
      }),
    );
    if (ok) router.back();
  };

  return (
    <Page>
      <Stack.Screen options={{ title: initial.exercise?.name ?? 'Exercise' }} />

      <ThemedText type="smallBold" themeColor="textSecondary">
        PROGRESSION
      </ThemedText>
      <Chips options={TYPE_OPTIONS} value={type} onChange={changeType} />
      <ThemedText type="small" themeColor="textSecondary">
        {TYPE_HELP[type]}
      </ThemedText>

      <View style={styles.grid}>
        {FIELDS[type].map(([key, label]) => (
          <View key={key} style={styles.cell}>
            <NumberField
              label={['increment', 'trainingMax', 'roundTo'].includes(key) ? `${label} (${initial.unit})` : label}
              value={draft[key] ?? ''}
              onChangeValue={(text) => setDraft({ ...draft, [key]: text })}
            />
          </View>
        ))}
      </View>

      <View style={styles.grid}>
        <View style={styles.cell}>
          <NumberField label={`Starting weight (${initial.unit})`} value={startWeight} onChangeValue={setStartWeight} />
        </View>
        <View style={styles.cell}>
          <NumberField label="Rest (seconds)" value={rest} onChangeValue={setRest} keyboardType="number-pad" />
        </View>
      </View>
      <ThemedText type="small" themeColor="textSecondary">
        The starting weight is used until you have logged this exercise; after that the suggestions come from your
        history.
      </ThemedText>

      <Button title="Save" onPress={save} />
    </Page>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  cell: { flexBasis: '45%', flexGrow: 1, flexDirection: 'row' },
});
