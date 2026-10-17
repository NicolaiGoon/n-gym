import { useRef, useState, type ComponentRef } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';

import { decisionMessage, runCoachTurn, trimHistory, type ChatMessage } from '@/coach/agent';
import { loadModel } from '@/coach/llama';
import type { CoachModel } from '@/coach/models';
import { buildSystemPrompt } from '@/coach/prompt';
import type { Proposal } from '@/coach/run';
import { ProposalCard } from '@/components/coach/proposal-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import { db } from '@/db/client';
import { useTheme } from '@/hooks/use-theme';

/** Roughly 3 characters per token leaves room in the 8k context for tools and the reply. */
const HISTORY_CHARS = 12000;

const TOOL_LABELS: Record<string, string> = {
  list_exercises: 'Looked through exercises',
  list_routines: 'Looked at your routines',
  get_routine: 'Read a routine',
  get_exercise_stats: 'Checked exercise stats',
  list_recent_workouts: 'Looked at recent workouts',
  get_training_summary: 'Checked your training summary',
};

const SUGGESTIONS = ['Build me a 4-day upper/lower routine', 'How is my bench press going?', 'Do I need a deload?'];

function Bubble({ message }: { message: ChatMessage }) {
  const theme = useTheme();
  const mine = message.role === 'user';
  return (
    <View
      style={[
        styles.bubble,
        mine ? [styles.mine, { backgroundColor: theme.tint }] : { backgroundColor: theme.backgroundElement },
      ]}>
      <ThemedText type="small" style={mine ? { color: theme.onTint } : undefined} selectable>
        {message.content}
      </ThemedText>
    </View>
  );
}

/** The coach conversation. Messages stay in memory for as long as the app is open. */
export function CoachChat({ model }: { model: CoachModel }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [proposals, setProposals] = useState<Record<string, Proposal>>({});
  const [draft, setDraft] = useState('');
  const [text, setText] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const stopRequested = useRef(false);
  const runtime = useRef<Awaited<ReturnType<typeof loadModel>> | null>(null);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  // The conversation as of now, for the async turn; `messages` is its rendered copy.
  const latest = useRef<ChatMessage[]>([]);

  const append = (message: ChatMessage) => {
    latest.current = [...latest.current, message];
    setMessages(latest.current);
  };

  const send = async (content: string) => {
    if (!content.trim() || status) return;
    setText('');
    append({ role: 'user', content: content.trim() });
    stopRequested.current = false;
    try {
      setStatus('Loading the model…');
      runtime.current = await loadModel(model, (f) => setStatus(`Loading the model… ${Math.round(f * 100)}%`));
      setStatus('Thinking…');
      await runCoachTurn({
        db,
        model: runtime.current,
        messages: trimHistory([{ role: 'system', content: buildSystemPrompt(db) }, ...latest.current], HISTORY_CHARS),
        onText: (partial) => setDraft(partial),
        shouldStop: () => stopRequested.current,
        onEvent: (event) => {
          setDraft('');
          if (event.type === 'proposal') {
            setProposals((all) => ({ ...all, [event.message.toolCallId!]: event.proposal }));
          }
          append(event.message);
        },
      });
    } catch (error) {
      append({ role: 'assistant', content: `Something went wrong: ${error instanceof Error ? error.message : String(error)}` });
    } finally {
      setDraft('');
      setStatus(null);
    }
  };

  const stop = () => {
    stopRequested.current = true;
    runtime.current?.stop();
  };

  const visible = messages.filter((m) => !m.hidden && (m.role !== 'assistant' || m.content));

  return (
    <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        ref={scroll}
        style={styles.fill}
        contentContainerStyle={styles.messages}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}>
        {visible.length === 0 ? (
          <View style={styles.suggestions}>
            <ThemedText type="small" themeColor="textSecondary">
              Ask about your training, or have the coach build or change a routine. You approve every change.
            </ThemedText>
            {SUGGESTIONS.map((s) => (
              <Button key={s} title={s} variant="secondary" onPress={() => send(s)} />
            ))}
          </View>
        ) : null}
        {visible.map((message, i) => {
          if (message.role !== 'tool') return <Bubble key={i} message={message} />;
          const proposal = message.toolCallId ? proposals[message.toolCallId] : undefined;
          if (proposal) {
            return (
              <ProposalCard key={message.toolCallId} proposal={proposal} onDecide={(d) => append(decisionMessage(proposal, d))} />
            );
          }
          const call = messages.flatMap((m) => m.toolCalls ?? []).find((c) => c.id === message.toolCallId);
          const failed = message.content.startsWith('Error:');
          return (
            <ThemedText key={i} type="small" themeColor="textSecondary">
              {failed ? '✕ ' : '✓ '}
              {(call && TOOL_LABELS[call.name]) ?? call?.name ?? 'Used a tool'}
              {failed ? ' (retrying)' : ''}
            </ThemedText>
          );
        })}
        {draft ? <Bubble message={{ role: 'assistant', content: draft }} /> : null}
        {status ? (
          <View style={styles.status}>
            <ActivityIndicator size="small" />
            <ThemedText type="small" themeColor="textSecondary">
              {status}
            </ThemedText>
          </View>
        ) : null}
      </ScrollView>
      <ThemedView style={styles.inputRow}>
        <View style={styles.fill}>
          <TextField placeholder="Message the coach" value={text} onChangeText={setText} multiline />
        </View>
        {status ? <Button title="Stop" variant="secondary" onPress={stop} /> : <Button title="Send" onPress={() => send(text)} />}
      </ThemedView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  messages: { gap: Spacing.two, paddingBottom: Spacing.three },
  suggestions: { gap: Spacing.two },
  bubble: { borderRadius: 12, padding: Spacing.two + Spacing.one, maxWidth: '88%', alignSelf: 'flex-start' },
  mine: { alignSelf: 'flex-end' },
  status: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.two, paddingVertical: Spacing.two },
});
