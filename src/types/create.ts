export type CreateInputMode = 'preset' | 'upload';

export type CharacterSelectionSource = 'default' | 'url' | 'restore' | 'manual';

export function isCreateInputMode(value: string | null | undefined): value is CreateInputMode {
  return value === 'preset' || value === 'upload';
}
