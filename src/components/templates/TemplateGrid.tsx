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

function TemplateCard({ template, isActive, onTap, onSelect }: TemplateCardProps) {
  function handleClick() {
    if (!isActive) {
      onTap();
      return;
    }
    onSelect(template);
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
      <img
        src={template.thumbnailUrl}
        alt={template.name}
        loading="lazy"
        decoding="async"
        className="absolute inset-0 w-full h-full object-cover"
      />

      {isActive && (
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
