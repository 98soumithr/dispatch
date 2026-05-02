// Shared option lists used across onboarding + load forms.

export const EQUIPMENT_TYPES = [
  "Dry Van",
  "Reefer",
  "Flatbed",
  "Step Deck",
  "RGN",
  "Tanker",
] as const;
export type EquipmentType = (typeof EQUIPMENT_TYPES)[number];

export const REGIONS = [
  "Northeast",
  "Southeast",
  "Midwest",
  "Southwest",
  "West",
  "Mountain",
] as const;
export type Region = (typeof REGIONS)[number];
