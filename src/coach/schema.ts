/**
 * The small subset of JSON Schema the coach's actions use. Definitions are handed to the model
 * as-is (MCP tool format), and the same definitions check the model's input before anything runs.
 */
export type JsonSchema =
  | { type: 'object'; description?: string; properties: Record<string, JsonSchema>; required?: string[] }
  | { type: 'array'; description?: string; items: JsonSchema; minItems?: number; maxItems?: number }
  | { type: 'string'; description?: string; enum?: readonly string[]; minLength?: number }
  | { type: 'number' | 'integer'; description?: string; minimum?: number; maximum?: number }
  | { type: 'boolean'; description?: string };

/** Returns readable problems with `value`, empty when it matches. Unknown object keys are errors. */
export function checkSchema(schema: JsonSchema, value: unknown, path = 'input'): string[] {
  switch (schema.type) {
    case 'object': {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) return [`${path} must be an object.`];
      const record = value as Record<string, unknown>;
      const errors: string[] = [];
      for (const key of schema.required ?? []) {
        if (record[key] === undefined) errors.push(`${path}.${key} is required.`);
      }
      for (const [key, item] of Object.entries(record)) {
        const property = schema.properties[key];
        if (!property) errors.push(`${path}.${key} is not a known field.`);
        else if (item !== undefined) errors.push(...checkSchema(property, item, `${path}.${key}`));
      }
      return errors;
    }
    case 'array': {
      if (!Array.isArray(value)) return [`${path} must be a list.`];
      const errors: string[] = [];
      if (schema.minItems !== undefined && value.length < schema.minItems) {
        errors.push(`${path} needs at least ${schema.minItems} item${schema.minItems === 1 ? '' : 's'}.`);
      }
      if (schema.maxItems !== undefined && value.length > schema.maxItems) {
        errors.push(`${path} can have at most ${schema.maxItems} items.`);
      }
      value.forEach((item, i) => errors.push(...checkSchema(schema.items, item, `${path}[${i}]`)));
      return errors;
    }
    case 'string':
      if (typeof value !== 'string') return [`${path} must be text.`];
      if (schema.enum && !schema.enum.includes(value)) return [`${path} must be one of: ${schema.enum.join(', ')}.`];
      if (schema.minLength !== undefined && value.trim().length < schema.minLength) return [`${path} can't be empty.`];
      return [];
    case 'number':
    case 'integer':
      if (typeof value !== 'number' || !Number.isFinite(value)) return [`${path} must be a number.`];
      if (schema.type === 'integer' && !Number.isInteger(value)) return [`${path} must be a whole number.`];
      if (schema.minimum !== undefined && value < schema.minimum) return [`${path} must be at least ${schema.minimum}.`];
      if (schema.maximum !== undefined && value > schema.maximum) return [`${path} must be at most ${schema.maximum}.`];
      return [];
    case 'boolean':
      return typeof value === 'boolean' ? [] : [`${path} must be true or false.`];
  }
}
