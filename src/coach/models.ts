/** Models the coach can download. All are GGUF files that llama.cpp runs on the phone's CPU or GPU. */
export interface CoachModel {
  id: string;
  name: string;
  file: string;
  url: string;
  /** Download size in bytes (approximate). */
  bytes: number;
  /** Phone RAM this model needs to run comfortably. */
  minRamBytes: number;
  description: string;
}

const GB = 1024 ** 3;

export const COACH_MODELS: CoachModel[] = [
  {
    id: 'qwen3-4b-instruct-2507-q4',
    name: 'Qwen 3 4B Instruct',
    file: 'Qwen3-4B-Instruct-2507-Q4_K_M.gguf',
    url: 'https://huggingface.co/unsloth/Qwen3-4B-Instruct-2507-GGUF/resolve/main/Qwen3-4B-Instruct-2507-Q4_K_M.gguf',
    bytes: 2.5 * GB,
    minRamBytes: 6 * GB,
    description: 'Best quality. Reliable at building routines. Needs a phone with 8 GB of RAM or more.',
  },
  {
    id: 'qwen3-1.7b-q4',
    name: 'Qwen 3 1.7B',
    file: 'Qwen3-1.7B-Q4_K_M.gguf',
    url: 'https://huggingface.co/unsloth/Qwen3-1.7B-GGUF/resolve/main/Qwen3-1.7B-Q4_K_M.gguf',
    bytes: 1.1 * GB,
    minRamBytes: 3 * GB,
    description: 'Smaller and faster. Fine for questions about your stats, less reliable for big routines.',
  },
];

/** The best model that fits the phone's RAM, or the smallest when RAM is unknown or low. */
export function recommendedModel(totalMemoryBytes: number | null): CoachModel {
  const fits = COACH_MODELS.filter((m) => totalMemoryBytes !== null && m.minRamBytes <= totalMemoryBytes);
  return fits[0] ?? COACH_MODELS[COACH_MODELS.length - 1];
}

export function formatBytes(bytes: number): string {
  return bytes >= GB ? `${(bytes / GB).toFixed(1)} GB` : `${Math.round(bytes / 1024 ** 2)} MB`;
}
