import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';

import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { ListRow } from '@/components/ui/list-row';
import { ThemedView } from '@/components/themed-view';
import { NameDialog } from '@/components/ui/name-dialog';
import { Spacing } from '@/constants/theme';
import { deloadStatus, endDeload, startDeloadWeek } from '@/db/repo/deload';
import { getActiveRoutine, programPlan } from '@/db/repo/program';
import { createRoutine, routinesQuery } from '@/db/repo/routines';
import { getActiveWorkout, startWorkout } from '@/db/repo/workouts';
import { useDb, write } from '@/db/use-db';
import { useTheme } from '@/hooks/use-theme';

export default function WorkoutScreen() {
  const theme = useTheme();
  const routines = useDb((db) => routinesQuery(db).all());
  const active = useDb(getActiveWorkout);
  const deload = useDb((db) => deloadStatus(db));
  const program = useDb(getActiveRoutine);
  const plan = useDb((db) => (program ? programPlan(db, program.id) : null));
  const [creating, setCreating] = useState(false);

  const startEmpty = () => {
    if (write((db) => startWorkout(db, null))) router.push('/workout');
  };

  const startDay = (dayId: number) => {
    if (write((db) => startWorkout(db, dayId))) router.push('/workout');
  };

  return (
    <Screen title="Workout">
      {deload.active || deload.reasons.length ? (
        <ThemedView type="backgroundElement" style={styles.banner}>
          <ThemedText type="smallBold">
            {deload.active
              ? `Deload week until ${deload.until!.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' })}`
              : 'Time for a deload?'}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {deload.active
              ? 'Workouts you start now use 90% of the planned weight and half the sets.'
              : `${deload.reasons.join(' ')} A lighter week lets you recover and come back stronger.`}
          </ThemedText>
          {deload.active ? (
            <Button title="End deload" variant="secondary" onPress={() => write(endDeload)} />
          ) : (
            <Button title="Start deload week" onPress={() => write((db) => startDeloadWeek(db))} />
          )}
        </ThemedView>
      ) : null}
      {active ? (
        <ListRow
          title="Workout in progress"
          subtitle={`Started at ${active.startedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
          onPress={() => router.push('/workout')}
          trailing={<Button title="Resume" onPress={() => router.push('/workout')} />}
        />
      ) : (
        <Button title="Start empty workout" variant="secondary" onPress={startEmpty} />
      )}
      <View style={styles.actions}>
        <Button title="New routine" onPress={() => setCreating(true)} style={styles.grow} />
        <Button title="Settings" variant="secondary" onPress={() => router.push('/settings')} />
      </View>
      {program && plan ? (
        <View style={[styles.banner, styles.program, { borderColor: theme.backgroundSelected }]}>
          <ThemedText type="small" themeColor="textSecondary">
            ACTIVE PROGRAM
          </ThemedText>
          <ThemedText
            type="smallBold"
            onPress={() => router.push({ pathname: '/routine/[id]', params: { id: program.id } })}>
            {program.name} ›
          </ThemedText>
          {plan.days.length === 0 ? (
            <ThemedText type="small" themeColor="textSecondary">
              This program has no days yet.
            </ThemedText>
          ) : null}
          {plan.days.map((day) => {
            const next = day.id === plan.nextDayId;
            return (
              <View key={day.id} style={styles.dayRow}>
                <View style={styles.grow}>
                  <ThemedText type={next ? 'smallBold' : 'small'}>
                    {day.name}
                    {next ? '  ·  Next' : ''}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {day.exerciseCount === 0
                      ? 'No exercises'
                      : day.lastDone
                        ? `Last done ${day.lastDone.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`
                        : 'Not done yet'}
                  </ThemedText>
                </View>
                {day.exerciseCount > 0 && !active ? (
                  <Button title="Start" variant={next ? 'primary' : 'secondary'} onPress={() => startDay(day.id)} />
                ) : null}
              </View>
            );
          })}
        </View>
      ) : routines.length ? (
        <ThemedText type="small" themeColor="textSecondary">
          Open a routine and set it as your active program to see which day is next here.
        </ThemedText>
      ) : null}
      <FlatList
        data={routines}
        keyExtractor={(r) => String(r.id)}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <ThemedText themeColor="textSecondary">
            No routines yet. Create one, then start a workout from one of its days.
          </ThemedText>
        }
        renderItem={({ item }) => (
          <ListRow
            title={item.name}
            subtitle={item.archived ? 'Archived' : item.id === program?.id ? 'Active program' : item.notes}
            dimmed={item.archived}
            onPress={() => router.push({ pathname: '/routine/[id]', params: { id: item.id } })}
          />
        )}
      />
      <NameDialog
        key={String(creating)}
        visible={creating}
        title="New routine"
        placeholder="e.g. Push / Pull / Legs"
        onCancel={() => setCreating(false)}
        onSubmit={(name) => {
          let id = 0;
          if (write((db) => (id = createRoutine(db, name)))) {
            setCreating(false);
            router.push({ pathname: '/routine/[id]', params: { id } });
          }
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  banner: { borderRadius: 12, padding: Spacing.three, gap: Spacing.two },
  actions: { flexDirection: 'row', gap: Spacing.two },
  grow: { flex: 1 },
  program: { borderWidth: 1 },
  dayRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  list: { gap: Spacing.two },
});
