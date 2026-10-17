import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Spacing } from '@/constants/theme';
import { approveProposal, type Change, type Proposal } from '@/coach';
import { db } from '@/db/client';
import { useTheme } from '@/hooks/use-theme';

export type Decision = { status: 'approved'; message: string } | { status: 'rejected' } | { status: 'failed'; message: string };

const MARKS: Record<Change['kind'], string> = { add: '+', update: '~', remove: '−' };

function ChangeRow({ change }: { change: Change }) {
  const theme = useTheme();
  const color = change.kind === 'remove' ? theme.danger : theme.tint;
  return (
    <View style={styles.change}>
      <ThemedText type="smallBold" style={[styles.mark, { color }]} accessibilityLabel={change.kind}>
        {MARKS[change.kind]}
      </ThemedText>
      <View style={styles.grow}>
        <ThemedText type="smallBold">{change.label}</ThemedText>
        {change.before ? (
          <ThemedText
            type="small"
            themeColor="textSecondary"
            style={change.after ? styles.struck : undefined}
            accessibilityLabel={`Before: ${change.before}`}>
            {change.before}
          </ThemedText>
        ) : null}
        {change.after ? (
          <ThemedText type="small" accessibilityLabel={change.before ? `After: ${change.after}` : undefined}>
            {change.before ? `→ ${change.after}` : change.after}
          </ThemedText>
        ) : null}
      </View>
    </View>
  );
}

/**
 * Shows exactly what a proposal would change. Nothing is written until Approve; the result
 * (or the reason it failed) is passed to `onDecide` so the coach can be told.
 */
export function ProposalCard({ proposal, onDecide }: { proposal: Proposal; onDecide?: (decision: Decision) => void }) {
  const [decision, setDecision] = useState<Decision | null>(null);

  const decide = (next: Decision) => {
    setDecision(next);
    onDecide?.(next);
  };

  const approve = () => {
    try {
      decide({ status: 'approved', message: approveProposal(db, proposal) });
    } catch (error) {
      decide({ status: 'failed', message: error instanceof Error ? error.message : String(error) });
    }
  };

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="smallBold">{proposal.summary}</ThemedText>
      {proposal.changes.map((change, i) => (
        <ChangeRow key={i} change={change} />
      ))}
      {decision ? (
        <ThemedText type="small" themeColor="textSecondary">
          {decision.status === 'approved'
            ? `Approved. ${decision.message}`
            : decision.status === 'rejected'
              ? 'Rejected. Nothing was changed.'
              : `Couldn’t apply: ${decision.message}`}
        </ThemedText>
      ) : (
        <View style={styles.actions}>
          <Button title="Reject" variant="secondary" onPress={() => decide({ status: 'rejected' })} style={styles.grow} />
          <Button title="Approve" onPress={approve} style={styles.grow} />
        </View>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 12, padding: Spacing.three, gap: Spacing.two },
  change: { flexDirection: 'row', gap: Spacing.two },
  mark: { width: 14, textAlign: 'center' },
  struck: { textDecorationLine: 'line-through' },
  actions: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.one },
  grow: { flex: 1 },
});
