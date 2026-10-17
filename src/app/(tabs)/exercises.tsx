import { router } from 'expo-router';

import { ExerciseList } from '@/components/exercise-list';
import { Screen } from '@/components/screen';
import { Button } from '@/components/ui/button';

export default function ExercisesScreen() {
  return (
    <Screen title="Exercises">
      <ExerciseList
        header={<Button title="New exercise" onPress={() => router.push({ pathname: '/exercise/[id]', params: { id: 'new' } })} />}
        onSelect={(exercise) => router.push({ pathname: '/exercise/[id]', params: { id: exercise.id } })}
      />
    </Screen>
  );
}
