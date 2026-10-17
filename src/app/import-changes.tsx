import { useState } from 'react';

import { runAction } from '@/coach';
import { getPendingChanges, markHandled, wasHandled } from '@/coach/change-files';
import { ProposalCard } from '@/components/coach/proposal-card';
import { Page } from '@/components/page';
import { ThemedText } from '@/components/themed-text';
import { db } from '@/db/client';

/** Changes queued by a desktop MCP client, each previewed against this phone's data and approved one by one. */
export default function ImportChangesScreen() {
  const [file] = useState(getPendingChanges);
  // Decide once which changes are new, so cards don't vanish as they are handled.
  const [fresh] = useState(() => file?.changes.filter((c) => !wasHandled(c)) ?? []);
  const [previews] = useState(() => fresh.map((c) => ({ change: c, outcome: runAction(db, c.action, c.input) })));

  if (!file) {
    return (
      <Page>
        <ThemedText themeColor="textSecondary">No change file selected.</ThemedText>
      </Page>
    );
  }
  const skipped = file.changes.length - fresh.length;

  return (
    <Page>
      <ThemedText type="small" themeColor="textSecondary">
        {fresh.length
          ? `${fresh.length} change${fresh.length === 1 ? '' : 's'} from your desktop coach. Nothing is saved until you approve it.`
          : 'Nothing new in this file.'}
        {skipped ? ` ${skipped} already handled.` : ''}
      </ThemedText>
      {previews.map(({ change, outcome }, i) =>
        outcome.type === 'proposal' ? (
          <ProposalCard key={i} proposal={outcome.proposal} onDecide={(d) => d.status !== 'failed' && markHandled(change)} />
        ) : (
          <ThemedText key={i} type="small" themeColor="danger">
            “{change.summary}” can’t be applied here: {outcome.type === 'error' ? outcome.message : 'not a change.'}
          </ThemedText>
        ),
      )}
    </Page>
  );
}
