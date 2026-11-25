export interface ValidatableCandidate {
  id: string;
  title: string;
  category: string;
  language: string;
  tags: string[];
  channelId: string;
  ownerUserId?: string;
  visibility: string;
  status: string;
  sourceType: 'native' | 'external';
  videoUrl: string;
  hlsUrl: string | null;
  externalEmbedUrl?: string;
  thumbnailUrl: string;
  isModerated?: boolean;
  regionCode?: string;
}

export interface ValidationContext {
  viewerUserId?: string;
  restrictedMode?: boolean;
  blockedCreators: Set<string>;
  blockedTopics: Set<string>;
  notInterestedVideoIds: Set<string>;
  moderatedVideoIds: Set<string>;
  region?: string;
}

export interface ValidationResult {
  valid: boolean;
  reason?: string;
}

export function validateContentCandidate(candidate: ValidatableCandidate | null | undefined, ctx: ValidationContext): ValidationResult {
  if (!candidate || !candidate.id || !candidate.title?.trim()) {
    return { valid: false, reason: 'missing_metadata' };
  }

  if (candidate.status !== 'published') {
    return { valid: false, reason: 'not_published' };
  }

  const isOwner = Boolean(ctx.viewerUserId && candidate.ownerUserId && ctx.viewerUserId === candidate.ownerUserId);
  if (candidate.visibility !== 'public' && !isOwner) {
    return { valid: false, reason: 'not_public' };
  }

  if (candidate.isModerated || ctx.moderatedVideoIds.has(candidate.id)) {
    return { valid: false, reason: 'moderated' };
  }

  if (!candidate.thumbnailUrl || candidate.thumbnailUrl.trim().length < 4) {
    return { valid: false, reason: 'missing_thumbnail' };
  }

  if (candidate.sourceType === 'native') {
    if (!candidate.videoUrl && !candidate.hlsUrl) {
      return { valid: false, reason: 'missing_native_stream' };
    }
  } else if (candidate.sourceType === 'external') {
    if (!candidate.externalEmbedUrl || !candidate.externalEmbedUrl.startsWith('https://')) {
      return { valid: false, reason: 'invalid_external_embed' };
    }
  }

  if (ctx.blockedCreators.has(candidate.channelId)) {
    return { valid: false, reason: 'blocked_creator' };
  }

  if (ctx.notInterestedVideoIds.has(candidate.id)) {
    return { valid: false, reason: 'not_interested' };
  }

  const lowerTopics = new Set([
    candidate.category.toLowerCase(),
    ...candidate.tags.map((t) => t.toLowerCase()),
  ]);
  for (const blocked of ctx.blockedTopics) {
    const b = blocked.toLowerCase();
    if (lowerTopics.has(b) || candidate.title.toLowerCase().includes(b)) {
      return { valid: false, reason: 'blocked_topic' };
    }
  }

  if (ctx.restrictedMode) {
    const titleLower = candidate.title.toLowerCase();
    const matureKeywords = ['18+', 'nsfw', 'explicit', 'gore'];
    if (matureKeywords.some((kw) => titleLower.includes(kw))) {
      return { valid: false, reason: 'restricted_mode' };
    }
  }

  if (ctx.region && candidate.regionCode && candidate.regionCode !== ctx.region) {
    return { valid: false, reason: 'region_unavailable' };
  }

  return { valid: true };
}

export function detectInteractionAnomaly(timestampsMs: number[], windowMs = 15_000, maxEvents = 12): boolean {
  if (timestampsMs.length < maxEvents) return false;
  const sorted = [...timestampsMs].sort((a, b) => a - b);
  for (let i = maxEvents - 1; i < sorted.length; i++) {
    if (sorted[i] - sorted[i - maxEvents + 1] <= windowMs) {
      return true;
    }
  }
  return false;
}
