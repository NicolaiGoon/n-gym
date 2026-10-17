import type { Database } from '@/db/types';

import { ACTIONS, type Action, type Change, type ToolDefinition } from './actions';
import { checkSchema } from './schema';

/** A write the user hasn't decided on yet. Nothing has been saved. */
export interface Proposal {
  action: string;
  input: unknown;
  summary: string;
  changes: Change[];
}

export type ActionOutcome =
  | { type: 'result'; data: unknown }
  | { type: 'proposal'; proposal: Proposal }
  /** The model gets the message back so it can correct itself. */
  | { type: 'error'; message: string };

/** Tool definitions to hand to the model or an MCP client. */
export function toolDefinitions(): ToolDefinition[] {
  return ACTIONS.map((a) => a.definition);
}

function findAction(name: string): Action {
  const action = ACTIONS.find((a) => a.definition.name === name);
  if (!action) throw new Error(`Unknown action "${name}". Available: ${ACTIONS.map((a) => a.definition.name).join(', ')}.`);
  return action;
}

function checkedInput(action: Action, input: unknown): unknown {
  const value = input ?? {};
  const errors = checkSchema(action.definition.inputSchema, value);
  if (errors.length) throw new Error(errors.join(' '));
  return value;
}

/** Runs a read action, or turns a write action into a proposal. Never writes. */
export function runAction(db: Database, name: string, input: unknown): ActionOutcome {
  try {
    const action = findAction(name);
    const value = checkedInput(action, input);
    if (action.kind === 'read') return { type: 'result', data: action.run(db, value) };
    return { type: 'proposal', proposal: { action: name, input: value, ...action.preview(db, value) } };
  } catch (error) {
    return { type: 'error', message: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Applies an approved proposal in one transaction. The input is checked again against the data as
 * it is now, so a proposal that went stale (say, the day was deleted) fails without a partial write.
 * Returns a short result for the model; throws with a readable message on failure.
 */
export function approveProposal(db: Database, proposal: Proposal): string {
  const action = findAction(proposal.action);
  if (action.kind !== 'write') throw new Error(`${proposal.action} doesn't change anything.`);
  const value = checkedInput(action, proposal.input);
  return db.transaction((tx) => {
    action.preview(tx, value);
    return action.apply(tx, value);
  });
}
