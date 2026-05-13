'use client';

import { useEffect, useState, useCallback } from 'react';
import { getTaskStatus, type TaskStatus } from '@/lib/api/tool-api';
import { POLL_INTERVAL_MS, MAX_POLL_ATTEMPTS } from '@/lib/constants';
import { trackEvent } from '@/lib/analytics';
import { getUserFacingTaskErrorMessage } from '@/lib/task-errors';

function resolvePollingFailure(task: TaskStatus): {
  errorCode: string | null;
  errorMessage: string;
} {
  const failedVideo =
    task.videos?.find((video) => video.status === 'failed') ||
    task.videos?.find((video) => Boolean(video.error_message || video.error_code || video.code));
  const errorCode = task.error_code || task.code || failedVideo?.error_code || failedVideo?.code || null;
  const errorMessage = getUserFacingTaskErrorMessage(
    task.error_message || failedVideo?.error_message || null,
    errorCode
  );

  return { errorCode, errorMessage };
}

export function usePolling(taskId: string | null) {
  const [status, setStatus] = useState<TaskStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState(false);

  const startPolling = useCallback(() => {
    if (!taskId) return;
    setIsPolling(true);
    setError(null);
  }, [taskId]);

  useEffect(() => {
    if (!taskId || !isPolling) return;

    let timeoutId: NodeJS.Timeout;
    let attempts = 0;

    async function poll() {
      try {
        const res = await getTaskStatus([taskId!]);
        const task = res.results[0];

        if (!task) {
          setError('Task not found');
          setIsPolling(false);
          return;
        }

        setStatus(task);

        if (task.status === 'completed') {
          trackEvent('video_ready', {
            taskId: taskId!,
            templateId: task.template_id || '',
            durationSec: task.videos?.[0]?.duration_seconds || 0,
          });
          setIsPolling(false);
          return;
        }

        if (task.status === 'failed') {
          const failure = resolvePollingFailure(task);
          trackEvent('video_failed', {
            taskId: taskId!,
            templateId: task.template_id || '',
            errorCode: failure.errorCode || 'unknown',
            errorMessage: failure.errorMessage,
          });
          setError(failure.errorMessage);
          setIsPolling(false);
          return;
        }

        attempts++;
        if (attempts >= MAX_POLL_ATTEMPTS) {
          setError('timeout');
          setIsPolling(false);
          return;
        }

        timeoutId = setTimeout(poll, POLL_INTERVAL_MS);
      } catch {
        // Retry with longer interval on network error
        attempts++;
        if (attempts >= MAX_POLL_ATTEMPTS) {
          setError('timeout');
          setIsPolling(false);
          return;
        }
        timeoutId = setTimeout(poll, POLL_INTERVAL_MS * 2);
      }
    }

    poll();
    return () => clearTimeout(timeoutId);
  }, [taskId, isPolling]);

  return { status, error, isPolling, startPolling };
}
