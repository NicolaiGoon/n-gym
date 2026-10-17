import { useState } from 'react';
import { Pressable, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Line, Path, Text as SvgText } from 'react-native-svg';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';

export interface Bar {
  label: string;
  value: number;
  /** Longer description shown when the bar is selected. */
  detail: string;
}

const PAD = { top: 8, right: 4, bottom: 20, left: 4 };
const GAP = 2;
const RADIUS = 4;

/** A bar with a rounded top and a square base on the baseline. */
function barPath(x: number, y: number, w: number, h: number) {
  const r = Math.min(RADIUS, w / 2, h);
  return `M${x},${y + h} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + w - r},${y} Q${x + w},${y} ${x + w},${y + r} L${x + w},${y + h} Z`;
}

/** Single-series bar chart. Tap a bar to read it; the last bar is shown by default. */
export function BarChart({ bars, height = 140 }: { bars: Bar[]; height?: number }) {
  const theme = useTheme();
  const [width, setWidth] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  if (bars.length === 0) return null;

  const max = Math.max(1, ...bars.map((b) => b.value));
  const plotW = Math.max(1, width - PAD.left - PAD.right);
  const plotH = height - PAD.top - PAD.bottom;
  const slot = plotW / bars.length;
  const barW = Math.max(2, slot - GAP);
  const active = selected ?? bars.length - 1;

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);
  const onPress = (locationX: number) =>
    setSelected(Math.min(bars.length - 1, Math.max(0, Math.floor((locationX - PAD.left) / slot))));

  return (
    <View>
      <ThemedText type="small" themeColor="textSecondary">
        {bars[active].detail}
      </ThemedText>
      <Pressable onLayout={onLayout} onPress={(e) => onPress(e.nativeEvent.locationX)} style={{ height }}>
        {width > 0 ? (
          <Svg width={width} height={height}>
            <Line x1={PAD.left} x2={width - PAD.right} y1={PAD.top + plotH} y2={PAD.top + plotH} stroke={theme.border} strokeWidth={1} />
            {bars.map((bar, i) => {
              const h = (bar.value / max) * plotH;
              const x = PAD.left + i * slot + GAP / 2;
              return bar.value > 0 ? (
                <Path
                  key={i}
                  d={barPath(x, PAD.top + plotH - h, barW, h)}
                  fill={theme.tint}
                  opacity={i === active ? 1 : 0.55}
                />
              ) : null;
            })}
            {[0, bars.length - 1].map((i) => (
              <SvgText
                key={i}
                x={i === 0 ? PAD.left : width - PAD.right}
                y={height - 5}
                fontSize={11}
                fill={theme.textSecondary}
                textAnchor={i === 0 ? 'start' : 'end'}>
                {bars[i].label}
              </SvgText>
            ))}
          </Svg>
        ) : null}
      </Pressable>
    </View>
  );
}
