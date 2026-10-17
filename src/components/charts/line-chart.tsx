import { useState } from 'react';
import { Pressable, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';

export interface ChartPoint {
  date: Date;
  value: number;
}

const PAD = { top: 12, right: 12, bottom: 22, left: 40 };

function niceTicks(min: number, max: number, count = 3): number[] {
  if (min === max) return [min];
  const step = (max - min) / (count - 1);
  return Array.from({ length: count }, (_, i) => min + i * step);
}

const shortDate = (d: Date) => d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

/**
 * Single-series line chart over time. Tap anywhere to read the nearest point;
 * the latest point is labelled by default.
 */
export function LineChart({
  points,
  height = 180,
  format = (v) => String(Math.round(v * 10) / 10),
}: {
  points: ChartPoint[];
  height?: number;
  format?: (value: number) => string;
}) {
  const theme = useTheme();
  const [width, setWidth] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);

  if (points.length === 0) {
    return <ThemedText themeColor="textSecondary">No data yet.</ThemedText>;
  }

  const values = points.map((p) => p.value);
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const pad = rawMax === rawMin ? Math.max(1, rawMax * 0.1) : (rawMax - rawMin) * 0.1;
  const min = Math.max(0, rawMin - pad);
  const max = rawMax + pad;
  const times = points.map((p) => p.date.getTime());
  const t0 = times[0];
  const t1 = times[times.length - 1];

  const plotW = Math.max(1, width - PAD.left - PAD.right);
  const plotH = height - PAD.top - PAD.bottom;
  const x = (t: number) => PAD.left + (t1 === t0 ? plotW / 2 : ((t - t0) / (t1 - t0)) * plotW);
  const y = (v: number) => PAD.top + plotH - ((v - min) / (max - min)) * plotH;

  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(times[i]).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const active = selected ?? points.length - 1;
  const activePoint = points[active];

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);
  const onPress = (locationX: number) => {
    let best = 0;
    for (let i = 1; i < points.length; i++) {
      if (Math.abs(x(times[i]) - locationX) < Math.abs(x(times[best]) - locationX)) best = i;
    }
    setSelected(best);
  };

  return (
    <View>
      <ThemedText type="small" themeColor="textSecondary">
        {shortDate(activePoint.date)}
        {activePoint.date.getFullYear() !== new Date().getFullYear() ? ` ${activePoint.date.getFullYear()}` : ''} ·{' '}
        <ThemedText type="smallBold">{format(activePoint.value)}</ThemedText>
      </ThemedText>
      <Pressable onLayout={onLayout} onPress={(e) => onPress(e.nativeEvent.locationX)} style={{ height }}>
        {width > 0 ? (
          <Svg width={width} height={height}>
            {niceTicks(min, max).map((tick) => (
              <Line
                key={tick}
                x1={PAD.left}
                x2={width - PAD.right}
                y1={y(tick)}
                y2={y(tick)}
                stroke={theme.border}
                strokeWidth={1}
              />
            ))}
            {niceTicks(min, max).map((tick) => (
              <SvgText key={`l${tick}`} x={PAD.left - 6} y={y(tick) + 4} fontSize={11} fill={theme.textSecondary} textAnchor="end">
                {format(tick)}
              </SvgText>
            ))}
            <SvgText x={PAD.left} y={height - 6} fontSize={11} fill={theme.textSecondary}>
              {shortDate(points[0].date)}
            </SvgText>
            {points.length > 1 ? (
              <SvgText x={width - PAD.right} y={height - 6} fontSize={11} fill={theme.textSecondary} textAnchor="end">
                {shortDate(points[points.length - 1].date)}
              </SvgText>
            ) : null}
            <Line
              x1={x(times[active])}
              x2={x(times[active])}
              y1={PAD.top}
              y2={PAD.top + plotH}
              stroke={theme.textSecondary}
              strokeWidth={1}
              strokeDasharray="3 3"
            />
            <Path d={path} stroke={theme.tint} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
            <Circle cx={x(times[active])} cy={y(activePoint.value)} r={5} fill={theme.tint} stroke={theme.background} strokeWidth={2} />
          </Svg>
        ) : null}
      </Pressable>
    </View>
  );
}

