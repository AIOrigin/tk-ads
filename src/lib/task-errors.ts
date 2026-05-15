export const GENERIC_TASK_FAILURE_MESSAGE =
  'We could not finish this video. Your photo and dance are saved, so you can try again.';

export const TASK_CONCURRENCY_LIMIT_MESSAGE =
  'Your other video is still generating. Please wait for it to finish before starting another one.';

export type TaskFailureKind = 'concurrency' | 'invalid_input' | 'provider' | 'unknown';

interface TaskRecoveryContent {
  kind: TaskFailureKind;
  title: string;
  message: string;
  primaryAction: string;
}

function firstNonEmptyString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

export function classifyTaskFailure(
  errorMessage?: string | null,
  errorCode?: string | null
): TaskFailureKind {
  const normalizedCode = (errorCode || '').trim().toUpperCase();
  const message = `${normalizedCode} ${errorMessage || ''}`;

  if (normalizedCode === 'TASK_CONCURRENCY_LIMIT' || /concurrency limit/i.test(message)) {
    return 'concurrency';
  }

  if (
    normalizedCode === 'VALIDATION_INVALID_INPUT' ||
    /upper body|input was rejected|image recognition failed|reference image|first frame|invalid input/i.test(message)
  ) {
    return 'invalid_input';
  }

  if (
    normalizedCode === 'PROVIDER_API_ERROR' ||
    /provider request failed|provider api|try again later/i.test(message)
  ) {
    return 'provider';
  }

  return 'unknown';
}

export function getTaskRecoveryContent(
  errorMessage?: string | null,
  errorCode?: string | null
): TaskRecoveryContent {
  const kind = classifyTaskFailure(errorMessage, errorCode);

  if (kind === 'concurrency') {
    return {
      kind,
      title: 'Your video is already generating',
      message: TASK_CONCURRENCY_LIMIT_MESSAGE,
      primaryAction: 'View current video',
    };
  }

  if (kind === 'invalid_input') {
    return {
      kind,
      title: 'Try another photo',
      message: 'We could not use this image. Upload a clear photo with the head, shoulders, and upper body visible.',
      primaryAction: 'Upload another photo',
    };
  }

  if (kind === 'provider') {
    return {
      kind,
      title: 'We could not finish this video',
      message: 'The video engine had trouble finishing this one. Your photo and dance are saved.',
      primaryAction: 'Try again',
    };
  }

  return {
    kind,
    title: 'We could not finish this video',
    message: GENERIC_TASK_FAILURE_MESSAGE,
    primaryAction: 'Try again',
  };
}

export function resolveTaskErrorPayload(payload: unknown): {
  errorCode: string | null;
  errorMessage: string | null;
} {
  if (!payload || typeof payload !== 'object') {
    return {
      errorCode: null,
      errorMessage: typeof payload === 'string' ? payload : null,
    };
  }

  const body = payload as Record<string, unknown>;
  const detail = body.detail;
  const nested = detail && typeof detail === 'object' ? detail as Record<string, unknown> : null;

  return {
    errorCode: firstNonEmptyString(
      body.error_code,
      body.errorCode,
      body.code,
      nested?.error_code,
      nested?.errorCode,
      nested?.code
    ),
    errorMessage: firstNonEmptyString(
      body.error_message,
      body.errorMessage,
      body.message,
      body.error,
      typeof detail === 'string' ? detail : null,
      nested?.error_message,
      nested?.errorMessage,
      nested?.message,
      nested?.error
    ),
  };
}

export function resolveTaskErrorText(text: string): {
  errorCode: string | null;
  errorMessage: string;
} {
  let payload: unknown = text;

  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }

  const parsed = resolveTaskErrorPayload(payload);
  return {
    errorCode: parsed.errorCode,
    errorMessage: getUserFacingTaskErrorMessage(parsed.errorMessage || text, parsed.errorCode),
  };
}

export function getUserFacingTaskErrorMessage(
  errorMessage?: string | null,
  errorCode?: string | null
): string {
  return getTaskRecoveryContent(errorMessage, errorCode).message;
}
