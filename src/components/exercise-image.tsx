import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { EXERCISE_IMAGES } from '@/data/exercise-images';
import { useTheme } from '@/hooks/use-theme';

/** The library picture of an exercise, or an empty tile when it has none. */
export function ExerciseImage({ libraryId, size }: { libraryId: string | null; size: number | 'wide' }) {
  const theme = useTheme();
  const source = libraryId ? EXERCISE_IMAGES[libraryId] : undefined;
  const style = size === 'wide' ? styles.wide : { width: size, height: size * 0.75, borderRadius: 8 };
  if (!source) return <View style={[style, { backgroundColor: theme.backgroundSelected }]} />;
  return <Image source={source} style={style} contentFit="cover" transition={100} recyclingKey={libraryId} />;
}

const styles = StyleSheet.create({
  wide: { width: '100%', aspectRatio: 4 / 3, borderRadius: 12 },
});
