'use client';

import type { PresetCharacter } from '@/data/preset-characters';
import type { CreateInputMode } from '@/types/create';

interface PresetCharacterSelectorProps {
  characters: PresetCharacter[];
  selectedId: string;
  activeInputMode: CreateInputMode;
  onSelect: (character: PresetCharacter) => void;
}

export function PresetCharacterSelector({
  characters,
  selectedId,
  activeInputMode,
  onSelect,
}: PresetCharacterSelectorProps) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {characters.map((character) => {
        const isSelected = character.id === selectedId;
        const isActive = isSelected && activeInputMode === 'preset';

        return (
          <button
            type="button"
            key={character.id}
            onClick={() => onSelect(character)}
            className={`group relative overflow-hidden rounded-2xl border bg-white/[0.03] text-left transition-all duration-200 ${
              isActive
                ? 'border-purple-400/80 ring-2 ring-purple-500/40 shadow-[0_0_16px_rgba(168,85,247,0.22)]'
                : isSelected
                  ? 'border-white/20'
                  : 'border-white/10 hover:border-white/20'
            }`}
          >
            <div className="relative aspect-[4/5] overflow-hidden">
              <img
                src={character.imageUrl}
                alt={character.name}
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
              />
              <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/75 to-transparent" />
            </div>
            <div className="px-3 pb-3 pt-2.5">
              <p className="text-[12px] font-semibold text-white">{character.name}</p>
            </div>
          </button>
        );
      })}
    </div>
  );
}
