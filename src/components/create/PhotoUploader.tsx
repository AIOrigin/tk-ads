'use client';

import { useEffect, useRef, useState } from 'react';
import { PHOTO_MAX_SIZE_BYTES, PHOTO_ACCEPTED_TYPES, PHOTO_MAX_SIZE_MB } from '@/lib/constants';
import { toast } from '@/components/ui/Toast';

interface PhotoUploaderProps {
  onFileSelected: (file: File) => void;
  selectedFile?: File | null;
  hasSavedPhoto?: boolean;
}

export function PhotoUploader({
  onFileSelected,
  selectedFile = null,
  hasSavedPhoto = false,
}: PhotoUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedFile) {
      setPreviewUrl(null);
      return;
    }

    const nextPreviewUrl = URL.createObjectURL(selectedFile);
    setPreviewUrl(nextPreviewUrl);

    return () => URL.revokeObjectURL(nextPreviewUrl);
  }, [selectedFile]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!PHOTO_ACCEPTED_TYPES.includes(file.type)) {
      toast.error('Please upload a JPG, PNG, or WebP image');
      return;
    }

    if (file.size > PHOTO_MAX_SIZE_BYTES) {
      toast.error(`Photo must be under ${PHOTO_MAX_SIZE_MB}MB`);
      return;
    }

    setPreviewUrl(URL.createObjectURL(file));
    onFileSelected(file);
  }

  function handleReupload() {
    setPreviewUrl(null);
    if (inputRef.current) inputRef.current.value = '';
    inputRef.current?.click();
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="user"
        onChange={handleChange}
        className="hidden"
      />

      {!previewUrl && !hasSavedPhoto ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="w-full aspect-[4/3] border border-dashed border-white/15 rounded-2xl flex flex-col items-center justify-center gap-2.5 text-white/30 hover:border-purple-500/40 hover:text-purple-400 transition-all duration-200"
        >
          <div className="w-12 h-12 rounded-full bg-white/[0.06] flex items-center justify-center">
            <svg aria-hidden="true" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
          </div>
          <span className="text-[13px] font-medium">Tap to upload photo</span>
          <span className="text-[11px] text-white/20">A clear selfie works best</span>
        </button>
      ) : previewUrl ? (
        <div className="relative aspect-[4/3] rounded-2xl overflow-hidden">
          {/* Bottom layer: blurred fill */}
          <img
            src={previewUrl}
            alt="Blurred preview background"
            className="absolute inset-0 w-full h-full object-cover blur-xl scale-110 brightness-75"
          />
          {/* Top layer: full photo fitted to height */}
          <img
            src={previewUrl}
            alt="Selected upload preview"
            className="absolute inset-0 w-full h-full object-contain"
          />
          <button
            type="button"
            onClick={handleReupload}
            className="absolute bottom-3 right-3 z-10 glass text-white text-[11px] font-medium px-3.5 py-1.5 rounded-full transition-transform active:scale-95"
          >
            Change Photo
          </button>
        </div>
      ) : (
        <div className="relative aspect-[4/3] rounded-2xl border border-white/15 bg-white/[0.04] flex flex-col items-center justify-center text-center px-6">
          <div className="w-12 h-12 rounded-full bg-emerald-500/15 flex items-center justify-center mb-3">
            <svg aria-hidden="true" className="w-6 h-6 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          </div>
          <p className="text-[13px] font-medium text-white">Saved photo ready</p>
          <p className="text-[11px] text-white/30 mt-1">You can continue with your saved upload or change it.</p>
          <button
            type="button"
            onClick={handleReupload}
            className="absolute bottom-3 right-3 z-10 glass text-white text-[11px] font-medium px-3.5 py-1.5 rounded-full transition-transform active:scale-95"
          >
            Change Photo
          </button>
        </div>
      )}
    </div>
  );
}
