export const GENERIC_TASK_FAILURE_MESSAGE =
  'We could not finish this video. Please try again or contact support.';

export const TASK_CONCURRENCY_LIMIT_MESSAGE =
  'You already have a video generating. Please wait for it to finish before starting another one.';

function firstNonEmptyString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function stripInternalDetails(message: string): string {
  return message
    .replace(/^\[[A-Z0-9_]+\]\s*/, '')
    .replace(/User\[[^\]]+\]\s*/g, '')
    .trim();
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
  if (errorCode === 'TASK_CONCURRENCY_LIMIT') {
    return TASK_CONCURRENCY_LIMIT_MESSAGE;
  }

  const cleanedMessage = errorMessage ? stripInternalDetails(errorMessage) : '';
  if (/TASK_CONCURRENCY_LIMIT|concurrency limit/i.test(cleanedMessage)) {
    return TASK_CONCURRENCY_LIMIT_MESSAGE;
  }

  return cleanedMessage || GENERIC_TASK_FAILURE_MESSAGE;
}
