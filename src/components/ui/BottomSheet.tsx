'use client';

import { useEffect, useRef, useCallback } from 'react';

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

export function BottomSheet({ isOpen, onClose, children }: BottomSheetProps) {
  // Prevent pull-to-refresh when sheet is open
  useEffect(() => {
    if (isOpen) {
      document.body.classList.add('no-overscroll');
      document.documentElement.classList.add('no-overscroll');
    } else {
      document.body.classList.remove('no-overscroll');
      document.documentElement.classList.remove('no-overscroll');
    }
    return () => {
      document.body.classList.remove('no-overscroll');
      document.documentElement.classList.remove('no-overscroll');
    };
  }, [isOpen]);
  
  const sheetRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLButtonElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const startY = useRef(0);
  const currentY = useRef(0);
  const isDragging = useRef(false);
  const sheetHeight = useRef(0);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    // Only drag from handle area or when content is scrolled to top
    if (contentRef.current && contentRef.current.scrollTop > 0) return;
    startY.current = e.touches[0].clientY;
    currentY.current = 0;
    isDragging.current = true;
    sheetHeight.current = sheetRef.current?.offsetHeight || 400;
    if (sheetRef.current) {
      sheetRef.current.style.transition = 'none';
    }
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging.current) return;
    const delta = e.touches[0].clientY - startY.current;
    if (delta > 0) {
      e.preventDefault();
    }
    // Only allow dragging down, with slight rubber-band resistance for upward
    const clampedDelta = delta < 0 ? delta * 0.1 : delta;
    currentY.current = clampedDelta;

    if (sheetRef.current) {
      sheetRef.current.style.transform = `translateY(${Math.max(0, clampedDelta)}px)`;
    }
    // Fade backdrop proportionally
    if (backdropRef.current && sheetHeight.current > 0) {
      const progress = Math.min(Math.max(0, clampedDelta) / sheetHeight.current, 1);
      backdropRef.current.style.opacity = String(1 - progress);
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (!isDragging.current) return;
    isDragging.current = false;

    if (sheetRef.current) {
      sheetRef.current.style.transition = '';
    }
    if (backdropRef.current) {
      backdropRef.current.style.opacity = '';
    }

    // Close if dragged past 30% of sheet height or with fast velocity
    if (currentY.current > sheetHeight.current * 0.3) {
      if (sheetRef.current) {
        sheetRef.current.style.transform = '';
      }
      onClose();
    } else {
      // Snap back
      if (sheetRef.current) {
        sheetRef.current.style.transform = 'translateY(0)';
      }
    }
  }, [onClose]);

  return (
    <>
      {/* Backdrop */}
      <button
        ref={backdropRef}
        type="button"
        aria-label="Close sheet"
        className={`fixed inset-0 bg-black/60 z-40 transition-opacity duration-300 ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />
      {/* Sheet */}
      <div
        ref={sheetRef}
        className={`fixed inset-x-0 bottom-0 z-50 transition-transform duration-300 ease-out ${
          isOpen ? 'translate-y-0' : 'translate-y-full'
        }`}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div
          ref={contentRef}
          className="bg-[#1a1a1a] rounded-t-3xl max-h-[85vh] overflow-y-auto"
        >
          {/* Handle */}
          <div className="sticky top-0 z-10 flex justify-center pt-3 pb-2 bg-[#1a1a1a] rounded-t-3xl cursor-grab active:cursor-grabbing">
            <div className="w-9 h-[5px] rounded-full bg-white/30" />
          </div>
          <div className="px-5 pb-8 pt-1">{children}</div>
        </div>
      </div>
    </>
  );
}
