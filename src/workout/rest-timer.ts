import {
  AndroidImportance,
  cancelScheduledNotificationAsync,
  requestPermissionsAsync,
  scheduleNotificationAsync,
  SchedulableTriggerInputTypes,
  setNotificationChannelAsync,
  setNotificationHandler,
} from 'expo-notifications';
import { useSyncExternalStore } from 'react';
import { Vibration } from 'react-native';

/**
 * One rest timer for the whole app. The end time lives in memory and a local notification is
 * scheduled for it, so the alert still arrives when the app is in the background.
 */

interface State {
  endsAt: number | null;
  total: number;
}

let state: State = { endsAt: null, total: 0 };
let notificationId: string | null = null;
let timeout: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

const CHANNEL = 'rest-timer';
let setupDone = false;

async function setup() {
  if (setupDone) return;
  setupDone = true;
  setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
  await setNotificationChannelAsync(CHANNEL, {
    name: 'Rest timer',
    importance: AndroidImportance.HIGH,
    vibrationPattern: [0, 400, 200, 400],
  });
  await requestPermissionsAsync();
}

function emit(next: State) {
  state = next;
  listeners.forEach((listener) => listener());
}

async function cancelScheduled() {
  if (timeout) clearTimeout(timeout);
  timeout = null;
  if (notificationId) {
    const id = notificationId;
    notificationId = null;
    await cancelScheduledNotificationAsync(id).catch(() => {});
  }
}

async function schedule(endsAt: number) {
  await cancelScheduled();
  const seconds = Math.max(1, Math.round((endsAt - Date.now()) / 1000));
  timeout = setTimeout(() => {
    Vibration.vibrate([0, 400, 200, 400]);
    emit({ endsAt: null, total: 0 });
  }, seconds * 1000);
  try {
    await setup();
    notificationId = await scheduleNotificationAsync({
      content: { title: 'Rest is over', body: 'Time for your next set.' },
      trigger: { type: SchedulableTriggerInputTypes.TIME_INTERVAL, seconds, channelId: CHANNEL },
    });
  } catch {
    // Notifications are a nice-to-have: the in-app timer and vibration still work without them.
  }
}

export function startRest(seconds: number) {
  if (seconds <= 0) return;
  const endsAt = Date.now() + seconds * 1000;
  emit({ endsAt, total: seconds });
  void schedule(endsAt);
}

export function extendRest(seconds: number) {
  if (!state.endsAt) return;
  const endsAt = state.endsAt + seconds * 1000;
  emit({ endsAt, total: state.total + seconds });
  void schedule(endsAt);
}

export function skipRest() {
  emit({ endsAt: null, total: 0 });
  void cancelScheduled();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useRestTimer(): State {
  return useSyncExternalStore(subscribe, () => state);
}
