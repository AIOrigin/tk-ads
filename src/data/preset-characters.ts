const CHARACTER_ASSET_BASE_URL = 'https://assets.tool.elser.ai/community/ai-pet-dance/motions/character';

export interface PresetCharacter {
  id: string;
  legacyIds: string[];
  name: string;
  imageUrl: string;
  fileName: string;
  mimeType: string;
}

function createPresetCharacter(
  id: string,
  legacyIds: string[],
  name: string,
  fileName: string,
): PresetCharacter {
  return {
    id,
    legacyIds,
    name,
    imageUrl: `${CHARACTER_ASSET_BASE_URL}/${fileName}`,
    fileName,
    mimeType: 'image/webp',
  };
}

export const presetCharacters: PresetCharacter[] = [
  createPresetCharacter('green-eyed-penguin', ['char-1'], 'Green-Eyed Penguin', 'green-eyed-penguin.webp'),
  createPresetCharacter('winter-outfit-penguin', ['char-2'], 'Winter Outfit Penguin', 'winter-outfit-penguin.webp'),
  createPresetCharacter('hoodie-chipmunk', ['char-3'], 'Hoodie Chipmunk', 'hoodie-chipmunk.webp'),
  createPresetCharacter('beach-otter', ['char-4'], 'Beach Otter', 'beach-otter.webp'),
  createPresetCharacter('hoodie-penguin', ['char-5'], 'Hoodie Penguin', 'hoodie-penguin.webp'),
  createPresetCharacter('overalls-penguin', ['char-6'], 'Overalls Penguin', 'overalls-penguin.webp'),
  createPresetCharacter('sweater-penguin', ['char-7'], 'Sweater Penguin', 'sweater-penguin.webp'),
  createPresetCharacter('otter', ['char-8'], 'Otter', 'otter.webp'),
];

export const DEFAULT_PRESET_CHARACTER_ID = presetCharacters[0]?.id ?? 'green-eyed-penguin';

export function getPresetCharacterById(id: string | null | undefined): PresetCharacter | null {
  if (!id) return null;
  return presetCharacters.find((character) => character.id === id || character.legacyIds.includes(id)) ?? null;
}

export async function createPresetCharacterFile(character: PresetCharacter): Promise<File> {
  const response = await fetch(character.imageUrl);
  if (!response.ok) {
    throw new Error('Failed to load preset character');
  }

  const blob = await response.blob();

  return new File([blob], character.fileName, {
    type: blob.type || character.mimeType,
  });
}
