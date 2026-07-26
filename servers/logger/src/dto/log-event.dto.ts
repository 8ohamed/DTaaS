import { z } from 'zod';

const MAX_CONTEXT_ENTRIES = 100;
const MAX_CONTEXT_DEPTH = 6;
const MAX_CONTEXT_VALUE_LENGTH = 1024;
const MAX_CONTEXT_KEY_LENGTH = 128;

export const logEventTypeSchema = z.enum([
  'click',
  'change',
  'navigation',
  'notification',
  'dismiss',
]);

type ContextValue =
  | string
  | number
  | boolean
  | null
  | ContextValue[]
  | { [key: string]: ContextValue };

type ContextObject = { [key: string]: ContextValue };

type ContextFrame = {
  value: unknown;
  depth: number;
  path: Array<string | number>;
};

type ContextWalkState = {
  stack: ContextFrame[];
  entriesSeen: number;
};

type ContextEntryCheck = {
  key: string | number;
  value: unknown;
  depth: number;
  entriesSeen: number;
  path: Array<string | number>;
};

type ContextChildCheck = {
  entry: [string | number, unknown];
  frame: ContextFrame;
  walk: ContextWalkState;
};

function isContextObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isPrimitiveContextValue(value: unknown): boolean {
  return (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    value === null
  );
}

function addContextIssue(
  ctx: z.RefinementCtx,
  message: string,
  path: Array<string | number>,
): void {
  ctx.addIssue({ code: 'custom', message, path });
}

function validatePrimitive(
  value: unknown,
  ctx: z.RefinementCtx,
  path: Array<string | number>,
): void {
  if (typeof value === 'string' && value.length > MAX_CONTEXT_VALUE_LENGTH) {
    addContextIssue(
      ctx,
      `context string may have at most ${MAX_CONTEXT_VALUE_LENGTH} characters`,
      path,
    );
  }
  if (!isPrimitiveContextValue(value)) {
    addContextIssue(
      ctx,
      'context values must be primitives, arrays, or objects',
      path,
    );
  }
}

function childEntries(frame: ContextFrame): Array<[string | number, unknown]> {
  if (Array.isArray(frame.value)) return [...frame.value.entries()];
  if (isContextObject(frame.value)) return Object.entries(frame.value);
  return [];
}

function validateContextStructure(
  context: ContextObject,
  ctx: z.RefinementCtx,
): void {
  const walk = createContextWalk(context);
  while (walk.stack.length > 0) {
    validateContextFrame(walk.stack.pop() as ContextFrame, walk, ctx);
  }
}

function createContextWalk(context: ContextObject): ContextWalkState {
  return {
    stack: [{ value: context, depth: MAX_CONTEXT_DEPTH, path: [] }],
    entriesSeen: 0,
  };
}

function validateContextFrame(
  frame: ContextFrame,
  walk: ContextWalkState,
  ctx: z.RefinementCtx,
): void {
  for (const entry of childEntries(frame)) {
    validateContextChildEntry({ entry, frame, walk }, ctx);
  }
}

function validateContextChildEntry(
  child: ContextChildCheck,
  ctx: z.RefinementCtx,
): void {
  const entry = createContextEntryCheck(child);
  validateContextEntry(entry, ctx);
  queueContextChild(entry, child.walk);
}

function createContextEntryCheck(child: ContextChildCheck): ContextEntryCheck {
  const [key, value] = child.entry;
  child.walk.entriesSeen += 1;
  return {
    key,
    value,
    depth: child.frame.depth - 1,
    entriesSeen: child.walk.entriesSeen,
    path: [...child.frame.path, key],
  };
}

function queueContextChild(
  entry: ContextEntryCheck,
  walk: ContextWalkState,
): void {
  if (!Array.isArray(entry.value) && !isContextObject(entry.value)) return;
  walk.stack.push({ value: entry.value, depth: entry.depth, path: entry.path });
}

function validateContextEntry(
  entry: ContextEntryCheck,
  ctx: z.RefinementCtx,
): void {
  validateContextKey(entry.key, ctx, entry.path);
  validateContextBudget(entry.entriesSeen, ctx, entry.path);
  if (rejectsContextDepth(entry, ctx)) return;
  if (!Array.isArray(entry.value) && !isContextObject(entry.value)) {
    validatePrimitive(entry.value, ctx, entry.path);
  }
}

function validateContextKey(
  key: string | number,
  ctx: z.RefinementCtx,
  path: Array<string | number>,
): void {
  if (typeof key !== 'string' || key.length <= MAX_CONTEXT_KEY_LENGTH) return;
  addContextIssue(
    ctx,
    `context keys may have at most ${MAX_CONTEXT_KEY_LENGTH} characters`,
    path,
  );
}

function validateContextBudget(
  entriesSeen: number,
  ctx: z.RefinementCtx,
  path: Array<string | number>,
): void {
  if (entriesSeen <= MAX_CONTEXT_ENTRIES) return;
  addContextIssue(
    ctx,
    `context may have at most ${MAX_CONTEXT_ENTRIES} entries`,
    path,
  );
}

function rejectsContextDepth(
  entry: ContextEntryCheck,
  ctx: z.RefinementCtx,
): boolean {
  if (!Array.isArray(entry.value) && !isContextObject(entry.value))
    return false;
  if (entry.depth > 0) return false;
  addContextIssue(
    ctx,
    `context may have at most ${MAX_CONTEXT_DEPTH} levels`,
    entry.path,
  );
  return true;
}

const contextSchema = z
  .custom<ContextObject>(isContextObject, 'context must be an object')
  .superRefine(validateContextStructure);

const pageTransitionSchema = z.object({
  src: z.string().min(1).max(1024),
  target: z.string().min(1).max(1024),
});

export const logEventSchema = z.object({
  sessionId: z.string().uuid(),
  userHash: z
    .string()
    .regex(/^[a-f0-9]{64}$/i, 'userHash must be a SHA-256 hex string'),
  timestamp: z.string().datetime({ offset: true }),
  event: logEventTypeSchema,
  page: z.string().min(1).max(1024),
  page_transition: pageTransitionSchema.optional(),
  element: z.string().min(1).max(128),
  label: z.string().min(1).max(512),
  context: contextSchema.default({}),
});

export type LogEventTypeDto = z.infer<typeof logEventTypeSchema>;
export type LogEventDto = z.infer<typeof logEventSchema>;
