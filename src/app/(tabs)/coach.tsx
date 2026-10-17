import { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import { runAction, toolDefinitions, type ActionOutcome } from '@/coach';
import { EXAMPLE_INPUTS } from '@/coach/examples';
import { ProposalCard } from '@/components/coach/proposal-card';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Chips } from '@/components/ui/chips';
import { TextField } from '@/components/ui/text-field';
import { Fonts, Spacing } from '@/constants/theme';
import { db } from '@/db/client';

const TOOLS = toolDefinitions();
const example = (name: string) => JSON.stringify(EXAMPLE_INPUTS[name] ?? {}, null, 2);

/**
 * Until the on-device model arrives, the Coach tab is a console for the actions it will use:
 * pick one, edit its JSON input and run it. Reads show their result; changes show a proposal
 * that writes nothing until approved.
 */
export default function CoachScreen() {
  const [name, setName] = useState(TOOLS[0].name);
  const [input, setInput] = useState(() => example(TOOLS[0].name));
  const [outcome, setOutcome] = useState<ActionOutcome | null>(null);
  const [runs, setRuns] = useState(0);
  const tool = TOOLS.find((t) => t.name === name)!;

  const choose = (next: string | null) => {
    if (!next) return;
    setName(next);
    setInput(example(next));
    setOutcome(null);
  };

  const run = () => {
    let parsed: unknown;
    try {
      parsed = input.trim() ? JSON.parse(input) : {};
    } catch {
      setOutcome({ type: 'error', message: 'The input isn’t valid JSON.' });
      return;
    }
    setOutcome(runAction(db, name, parsed));
    setRuns(runs + 1);
  };

  return (
    <Screen title="Coach">
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ThemedText type="small" themeColor="textSecondary">
          The on-device coach is coming. These are the actions it will use. Anything that changes your data is
          shown as a proposal first, and nothing is saved until you approve it.
        </ThemedText>
        <Chips options={TOOLS.map((t) => ({ value: t.name, label: t.name }))} value={name} onChange={choose} />
        <ThemedText type="small" themeColor="textSecondary">
          {tool.description}
        </ThemedText>
        <TextField
          label="Input (JSON)"
          value={input}
          onChangeText={setInput}
          multiline
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.code}
        />
        <Button title="Run" onPress={run} />

        {outcome?.type === 'proposal' ? <ProposalCard key={runs} proposal={outcome.proposal} /> : null}
        {outcome?.type === 'result' ? (
          <ThemedView type="backgroundElement" style={styles.output}>
            <ThemedText type="small" style={styles.code} selectable>
              {JSON.stringify(outcome.data, null, 2)}
            </ThemedText>
          </ThemedView>
        ) : null}
        {outcome?.type === 'error' ? (
          <ThemedText type="small" themeColor="danger">
            {outcome.message}
          </ThemedText>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: Spacing.three, paddingBottom: Spacing.four },
  code: { fontFamily: Fonts?.mono, fontSize: 12 },
  output: { borderRadius: 12, padding: Spacing.three },
});
