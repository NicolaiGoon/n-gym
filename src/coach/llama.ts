import { Directory, File, Paths } from 'expo-file-system';
import { initLlama, type LlamaContext } from 'llama.rn';

import type { ChatMessage, ChatModel, ModelTool } from './agent';
import type { CoachModel } from './models';

/** Downloaded models live in the app's documents folder, so they survive updates and work offline. */
const MODEL_DIR = new Directory(Paths.document, 'models');

function modelFile(model: CoachModel): File {
  return new File(MODEL_DIR, model.file);
}

export function isDownloaded(model: CoachModel): boolean {
  return modelFile(model).exists;
}

/**
 * Downloads to a temporary name and renames when complete, so an interrupted download never looks
 * like a usable model. Rejects with an AbortError when `signal` is aborted.
 */
export async function downloadModel(
  model: CoachModel,
  onProgress: (fraction: number) => void,
  signal: AbortSignal,
): Promise<void> {
  if (!MODEL_DIR.exists) MODEL_DIR.create({ intermediates: true });
  const partial = new File(MODEL_DIR, `${model.file}.part`);
  if (partial.exists) partial.delete();
  try {
    await File.downloadFileAsync(model.url, partial, {
      idempotent: true,
      signal,
      onProgress: ({ bytesWritten, totalBytes }) => onProgress(bytesWritten / (totalBytes > 0 ? totalBytes : model.bytes)),
    });
    partial.rename(model.file);
  } catch (error) {
    if (partial.exists) partial.delete();
    throw error;
  }
}

export async function deleteModel(model: CoachModel): Promise<void> {
  if (loaded?.id === model.id) await unloadModel();
  const file = modelFile(model);
  if (file.exists) file.delete();
}

let loaded: { id: string; context: LlamaContext } | null = null;
/** For tool calls the template doesn't give an id. */
let callCount = 0;

export async function unloadModel(): Promise<void> {
  const current = loaded;
  loaded = null;
  await current?.context.release();
}

/** Converts the chat to the OpenAI-style messages llama.cpp's chat templates expect. */
function toLlamaMessages(messages: ChatMessage[]) {
  return messages.map((m) => ({
    role: m.role,
    content: m.content,
    ...(m.toolCalls
      ? { tool_calls: m.toolCalls.map((c) => ({ type: 'function', id: c.id, function: { name: c.name, arguments: c.arguments } })) }
      : {}),
    ...(m.toolCallId ? { tool_call_id: m.toolCallId } : {}),
  }));
}

/** Loads a downloaded model (once) and wraps it as a ChatModel. */
export async function loadModel(model: CoachModel, onProgress?: (fraction: number) => void): Promise<ChatModel & { stop: () => Promise<void> }> {
  if (loaded?.id !== model.id) {
    await unloadModel();
    const context = await initLlama(
      { model: modelFile(model).uri, n_ctx: 8192, n_gpu_layers: 99, use_mlock: false },
      (progress) => onProgress?.(progress / 100),
    );
    loaded = { id: model.id, context };
  }
  const { context } = loaded!;

  return {
    stop: () => context.stopCompletion(),
    async complete(messages: ChatMessage[], tools: ModelTool[], onText?: (text: string) => void) {
      const result = await context.completion(
        {
          // The typings only list role and content; the template also reads tool_calls and tool_call_id.
          messages: toLlamaMessages(messages) as { role: string; content: string }[],
          tools,
          tool_choice: 'auto',
          jinja: true,
          enable_thinking: false,
          reasoning_format: 'auto',
          n_predict: 1536,
          temperature: 0.3,
        },
        (data) => {
          if (data.content !== undefined) onText?.(data.content);
        },
      );
      return {
        content: result.content ?? result.text,
        toolCalls: (result.tool_calls ?? []).map((c) => ({
          id: c.id ?? `call_${++callCount}`,
          name: c.function.name,
          arguments: c.function.arguments,
        })),
      };
    },
  };
}
