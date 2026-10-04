import { ExtractedRequirements } from './types';

/**
 * Calculates a genuine qualification score (0-100) based on actual
 * requirement completeness, replacing the previous fake formula.
 */
export function calculateQualificationScore(req: Partial<ExtractedRequirements>): number {
  let score = 0;

  // 1. Project Type & Objective (up to 20 pts)
  if (req.projectType && req.projectType.trim().length > 0) {
    score += 10;
  }
  if (req.objective && req.objective.trim().length > 0) {
    score += 10;
  }

  // 2. Core Features (up to 20 pts)
  const featureCount = Array.isArray(req.features) ? req.features.length : 0;
  if (featureCount >= 4) {
    score += 20;
  } else if (featureCount >= 2) {
    score += 15;
  } else if (featureCount >= 1) {
    score += 10;
  }

  // 3. Target Audience (up to 10 pts)
  if (req.targetAudience && req.targetAudience.trim().length > 0) {
    score += 10;
  }

  // 4. Preferred Tech Stack (up to 10 pts)
  const techCount = Array.isArray(req.techStack) ? req.techStack.length : 0;
  if (techCount >= 1) {
    score += 10;
  }

  // 5. Budget Specifications (up to 15 pts)
  const isTentativeBudget = (val?: string) => {
    if (!val || val.trim().length === 0) return true;
    const lower = val.toLowerCase();
    return (
      lower.includes('unknown') ||
      lower.includes('gathering') ||
      lower.includes('unconfirmed') ||
      lower.includes('tentative') ||
      lower.includes('not sure') ||
      lower.includes('tbd') ||
      lower.includes('probably') ||
      lower.includes('maybe')
    );
  };

  if (req.budget && !isTentativeBudget(req.budget)) {
    score += 15;
  }

  // 6. Timeline Specifications (up to 15 pts)
  const isTentativeTimeline = (val?: string) => {
    if (!val || val.trim().length === 0) return true;
    const lower = val.toLowerCase();
    return (
      lower.includes('unknown') ||
      lower.includes('evaluating') ||
      lower.includes('unconfirmed') ||
      lower.includes('tentative') ||
      lower.includes('not sure') ||
      lower.includes('tbd') ||
      lower.includes('maybe')
    );
  };

  if (req.timeline && !isTentativeTimeline(req.timeline)) {
    score += 15;
  }

  // 7. Client & Contact Identification (up to 10 pts)
  let contactScore = 0;
  if (req.clientName && req.clientName.trim().length > 0) contactScore += 3;
  if (req.companyName && req.companyName.trim().length > 0) contactScore += 2;
  if (req.email && req.email.trim().length > 0) contactScore += 3;
  if (req.phone && req.phone.trim().length > 0) contactScore += 2;
  score += Math.min(contactScore, 10);

  return Math.min(Math.max(score, 0), 100);
}

/**
 * Derives missing critical fields from extracted requirements.
 */
export function computeMissingFields(req: Partial<ExtractedRequirements>): string[] {
  const missing: string[] = [];

  if (!req.projectType || req.projectType.trim().length === 0) missing.push('projectType');
  if (!req.objective || req.objective.trim().length === 0) missing.push('objective');
  if (!Array.isArray(req.features) || req.features.length === 0) missing.push('features');
  if (!req.targetAudience || req.targetAudience.trim().length === 0) missing.push('targetAudience');

  const lowerBudget = (req.budget || '').toLowerCase();
  if (
    !req.budget ||
    req.budget.trim().length === 0 ||
    lowerBudget.includes('unknown') ||
    lowerBudget.includes('gathering') ||
    lowerBudget.includes('unconfirmed') ||
    lowerBudget.includes('tentative') ||
    lowerBudget.includes('not sure') ||
    lowerBudget.includes('probably') ||
    lowerBudget.includes('maybe')
  ) {
    missing.push('budget');
  }

  const lowerTimeline = (req.timeline || '').toLowerCase();
  if (
    !req.timeline ||
    req.timeline.trim().length === 0 ||
    lowerTimeline.includes('unknown') ||
    lowerTimeline.includes('evaluating') ||
    lowerTimeline.includes('unconfirmed') ||
    lowerTimeline.includes('tentative') ||
    lowerTimeline.includes('not sure') ||
    lowerTimeline.includes('maybe')
  ) {
    missing.push('timeline');
  }

  if (!Array.isArray(req.techStack) || req.techStack.length === 0) missing.push('techStack');
  if (!req.clientName || req.clientName.trim().length === 0) missing.push('clientName');
  if (!req.email || req.email.trim().length === 0) missing.push('email');

  return missing;
}
