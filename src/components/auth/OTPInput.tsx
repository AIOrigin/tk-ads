'use client';

import { useState, useRef, useCallback, useImperativeHandle, forwardRef, KeyboardEvent, ClipboardEvent } from 'react';

interface OTPInputProps {
  length?: number;
  onComplete: (code: string) => void;
  error?: boolean;
}

export interface OTPInputHandle {
  reset: () => void;
}

export const OTPInput = forwardRef<OTPInputHandle, OTPInputProps>(function OTPInput({ length = 6, onComplete, error }, ref) {
  const [values, setValues] = useState<string[]>(Array(length).fill(''));
  const valuesRef = useRef<string[]>(Array(length).fill(''));
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);
  const isProgrammaticFocus = useRef(false);

  const focusInput = useCallback(
    (index: number) => {
      if (index >= 0 && index < length) {
        isProgrammaticFocus.current = true;
        inputsRef.current[index]?.focus();
      }
    },
    [length]
  );

  function handleFocus(index: number) {
    // Skip redirect if focus was set programmatically (e.g. after typing a digit)
    if (isProgrammaticFocus.current) {
      isProgrammaticFocus.current = false;
      return;
    }
    // User tapped a box — redirect to first empty slot
    const firstEmpty = valuesRef.current.findIndex((v) => v === '');
    const target = firstEmpty === -1 ? length - 1 : firstEmpty;
    if (index !== target) {
      focusInput(target);
    }
  }

  function reset() {
    const empty = Array(length).fill('');
    setValues(empty);
    valuesRef.current = empty;
    setTimeout(() => focusInput(0), 0);
  }

  useImperativeHandle(ref, () => ({ reset }));

  function handleChange(index: number, value: string) {
    if (!/^\d*$/.test(value)) return;

    const digit = value.slice(-1);
    const next = [...valuesRef.current];
    next[index] = digit;
    setValues(next);
    valuesRef.current = next;

    if (digit && index < length - 1) {
      focusInput(index + 1);
    }

    if (next.every((v) => v !== '')) {
      onComplete(next.join(''));
    }
  }

  function handleKeyDown(index: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !valuesRef.current[index] && index > 0) {
      focusInput(index - 1);
    }
  }

  function handlePaste(e: ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
    if (!pasted) return;

    const next = [...valuesRef.current];
    for (let i = 0; i < pasted.length; i++) {
      next[i] = pasted[i];
    }
    setValues(next);
    valuesRef.current = next;

    if (pasted.length >= length) {
      onComplete(next.join(''));
    } else {
      focusInput(pasted.length);
    }
  }

  return (
    <div className="flex justify-center gap-2.5">
      {values.map((val, i) => (
        <input
          key={i}
          ref={(el) => { inputsRef.current[i] = el; }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={val}
          onChange={(e) => handleChange(i, e.target.value)}
          onFocus={() => handleFocus(i)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={handlePaste}
          autoFocus={i === 0}
          className={`w-12 h-14 text-2xl text-center text-white bg-white/[0.06] border rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 transition-colors ${
            error ? 'border-red-500 animate-shake' : 'border-white/15'
          }`}
        />
      ))}
    </div>
  );
});
