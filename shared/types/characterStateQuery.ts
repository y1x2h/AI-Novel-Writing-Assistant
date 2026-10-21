export interface CharacterCurrentStateArc {
  currentGoal: string | null;
  outerGoal: string | null;
  innerNeed: string | null;
  emotion: string | null;
  stressLevel: number | null;
  secretExposure: string | null;
}

export interface CharacterCurrentStateView {
  characterId: string;
  name: string;
  role: string;
  currentLocation: string | null;
  availability: string | null;
  injuries: string[];
  possessions: string[];
  knownFacts: string[];
  misbeliefs: string[];
  arc: CharacterCurrentStateArc;
  summary: string | null;
  snapshotId: string | null;
  sourceChapterId: string | null;
}

export interface NovelCharacterStatesResponse {
  novelId: string;
  snapshotId: string | null;
  sourceChapterId: string | null;
  snapshotSummary: string | null;
  characters: CharacterCurrentStateView[];
}
