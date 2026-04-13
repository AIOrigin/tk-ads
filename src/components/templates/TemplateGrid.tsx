'use client';

import { useState } from 'react';
import type { Template } from '@/types/template';
import templates from '@/data/templates.json';

interface TemplateCardProps {
  template: Template;
  isActive: boolean;
  onTap: () => void;
  onSelect: (template: Template) => void;
}

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function TemplateCard({ template, isActive, onTap, onSelect }: TemplateCardProps) {
  const [isPlaying, setIsPlaying] = useState(false);

  function handleClick() {
    if (!isActive) {
      onTap();
      return;
    }
    if (isPlaying) {
      onSelect(template);
    } else {
      setIsPlaying(true);
    }
  }

  return (
    <div
      className={`relative aspect-[9/16] rounded-2xl overflow-hidden bg-gray-900 cursor-pointer transition-all duration-300 ${
        isActive
          ? 'scale-[1.03] z-10 ring-2 ring-purple-500/70 shadow-[0_0_20px_rgba(168,85,247,0.3)]'
          : 'scale-100 opacity-80'
      }`}
      onClick={handleClick}
    >
      {/* Video content */}
      {isActive && isPlaying ? (
        <video
          autoPlay
          muted
          loop
          playsInline
          className="absolute inset-0 w-full h-full object-cover"
        >
          <source src={template.motionVideoUrl} type="video/mp4" />
        </video>
      ) : (
        <video
          src={template.motionVideoUrl}
          muted
          playsInline
          preload="metadata"
          className="absolute inset-0 w-full h-full object-cover"
        />
      )}

      {/* Play button — show when not playing */}
      {!(isActive && isPlaying) && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className={`rounded-full flex items-center justify-center transition-all ${
            isActive
              ? 'w-12 h-12 glass'
              : 'w-10 h-10 bg-black/30 backdrop-blur-sm border border-white/10'
          }`}>
            <svg className={`text-white ml-0.5 ${isActive ? 'w-4.5 h-4.5' : 'w-3.5 h-3.5'}`} fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </div>
      )}

      {/* "Use This" button — active + playing */}
      {isActive && isPlaying && (
        <div className="absolute inset-0 flex items-end justify-center pb-5 z-10">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onSelect(template);
            }}
            className="glass text-white text-xs font-semibold px-5 py-2.5 rounded-full transition-transform active:scale-95"
          >
            Use This Dance
          </button>
        </div>
      )}

      {/* Duration badge — top right */}
      <div className="absolute top-2.5 right-2.5 bg-black/50 backdrop-blur-sm text-white text-[10px] font-medium px-2 py-0.5 rounded-md">
        {formatDuration(template.durationSeconds)}
      </div>

      {/* Bottom gradient + info */}
      <div className="absolute bottom-0 left-0 right-0 card-gradient-overlay px-3 pb-3 pt-10 pointer-events-none">
        <p className="text-white font-semibold text-[13px] leading-tight">{template.name}</p>
        <p className="text-white/50 text-[11px] mt-0.5">{template.description}</p>
      </div>
    </div>
  );
}

interface TemplateGridProps {
  onSelect: (template: Template) => void;
}

export function TemplateGrid({ onSelect }: TemplateGridProps) {
  const [activeId, setActiveId] = useState<string>(
    (templates as Template[])[0]?.id || ''
  );

  return (
    <div className="grid grid-cols-2 gap-3">
      {(templates as Template[]).map((template) => (
        <TemplateCard
          key={template.id}
          template={template as Template}
          isActive={template.id === activeId}
          onTap={() => setActiveId(template.id)}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}
