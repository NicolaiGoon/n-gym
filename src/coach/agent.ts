import type { Database } from '@/db/types';

import { runAction, toolDefinitions, type Proposal } from './run';

/**
 * The coach's chat loop, independent of the model runtime so it can be driven by a scripted
 * model in tests. The model calls the Phase 7 actions as tools; reads are answered from the
 * database, and writes become proposals the user approves or rejects in the chat.
 */

export interface ToolCall {
  id: string;
  name: string;
  /** JSON text, as the model wrote it. */
  arguments: string;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
  /** Sent to the model but not shown as a bubble (e.g. "the user approved"). */
  hidden?: boolean;
}

export interface ModelReply {
  content: string;
  toolCalls: ToolCall[];
}

/** OpenAI-style tool, the format llama.cpp's chat templates take. */
export interface ModelTool {
  type: 'function';
  function: { name: string; description: string; parameters: object };
}

export interface ChatModel {
  /** `onText` receives the reply text so far (not including tool calls) while it is generated. */
  complete(messages: ChatMessage[], tools: ModelTool[], onText?: (text: string) => void): Promise<ModelReply>;
}

export type CoachEvent =
  | { type: 'message'; message: ChatMessage }
  | { type: 'tool'; name: string; ok: boolean; message: ChatMessage }
  | { type: 'proposal'; proposal: Proposal; message: ChatMessage };

export const MAX_STEPS = 6;
const MAX_TOOL_RESULT_CHARS = 4000;

export function modelTools(): ModelTool[] {
  return toolDefinitions().map((t) => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.inputSchema },
  }));
}

function truncate(text: string, max = MAX_TOOL_RESULT_CHARS): string {
  return text.length <= max ? text : `${text.slice(0, max)}… (cut; ask for less, e.g. with a filter)`;
}

/** Runs one tool call and returns the message that goes back to the model, plus the event for the UI. */
function callTool(db: Database, call: ToolCall): CoachEvent {
  const reply = (content: string): ChatMessage => ({ role: 'tool', content, toolCallId: call.id });
  let input: unknown;
  try {
    input = call.arguments.trim() ? JSON.parse(call.arguments) : {};
  } catch {
    return { type: 'tool', name: call.name, ok: false, message: reply('Error: the arguments were not valid JSON.') };
  }
  const outcome = runAction(db, call.name, input);
  switch (outcome.type) {
    case 'result':
      return { type: 'tool', name: call.name, ok: true, message: reply(truncate(JSON.stringify(outcome.data))) };
    case 'error':
      return { type: 'tool', name: call.name, ok: false, message: reply(`Error: ${outcome.message}`) };
    case 'proposal':
      return {
        type: 'proposal',
        proposal: outcome.proposal,
        message: reply(
          `Shown to the user as a proposal: ${outcome.proposal.summary}. Nothing is saved until they approve it, ` +
            'and you will be told their decision. Do not call this again for the same change.',
        ),
      };
  }
}

/**
 * Runs the model until it answers without calling a tool, or MAX_STEPS model calls have been made.
 * `messages` is the whole conversation so far, system prompt and the new user message included.
 * Every new message is reported through `onEvent` as soon as it exists.
 */
export async function runCoachTurn({
  db,
  model,
  messages,
  onEvent,
  onText,
  shouldStop = () => false,
}: {
  db: Database;
  model: ChatModel;
  messages: ChatMessage[];
  onEvent: (event: CoachEvent) => void;
  onText?: (text: string) => void;
  shouldStop?: () => boolean;
}): Promise<void> {
  const conversation = [...messages];
  const tools = modelTools();
  for (let step = 0; step < MAX_STEPS; step++) {
    const reply = await model.complete(conversation, tools, onText);
    const assistant: ChatMessage = { role: 'assistant', content: reply.content.trim() };
    if (reply.toolCalls.length) assistant.toolCalls = reply.toolCalls;
    conversation.push(assistant);
    onEvent({ type: 'message', message: assistant });
    if (!reply.toolCalls.length || shouldStop()) return;

    for (const call of reply.toolCalls) {
      const event = callTool(db, call);
      conversation.push(event.message);
      onEvent(event);
    }
    if (shouldStop()) return;
  }
  onEvent({
    type: 'message',
    message: { role: 'assistant', content: 'I stopped after too many steps. Could you narrow the request down?' },
  });
}

/** The note the model gets after the user decides on a proposal. */
export function decisionMessage(proposal: Proposal, decision: { status: 'approved' | 'rejected' | 'failed'; message?: string }): ChatMessage {
  const text =
    decision.status === 'approved'
      ? `The user approved "${proposal.summary}". ${decision.message ?? ''}`
      : decision.status === 'rejected'
        ? `The user rejected "${proposal.summary}". Nothing was changed.`
        : `Approving "${proposal.summary}" failed: ${decision.message}. Nothing was changed.`;
  return { role: 'user', content: `[${text.trim()}]`, hidden: true };
}

/**
 * Keeps the system prompt and as many of the latest messages as fit in `maxChars`, starting at a
 * user message so a tool result is never separated from the call that asked for it.
 */
export function trimHistory(messages: ChatMessage[], maxChars: number): ChatMessage[] {
  const system = messages[0]?.role === 'system' ? messages[0] : undefined;
  const rest = system ? messages.slice(1) : messages;
  let budget = maxChars - (system?.content.length ?? 0);
  let start = rest.length;
  for (let i = rest.length - 1; i >= 0; i--) {
    budget -= rest[i].content.length + (rest[i].toolCalls ? JSON.stringify(rest[i].toolCalls).length : 0);
    if (budget < 0) break;
    if (rest[i].role === 'user') start = i;
  }
  // Always keep the latest user message, even when it alone is over budget.
  if (start === rest.length) {
    const lastUser = rest.findLastIndex((m) => m.role === 'user');
    start = lastUser === -1 ? rest.length : lastUser;
  }
  return [...(system ? [system] : []), ...rest.slice(start)];
}
