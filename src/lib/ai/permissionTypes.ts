export type PermissionDecision =
  | 'SAFE_AUTO_REPLY'
  | 'NEEDS_APPROVAL'
  | 'BLOCKED'
  | 'INFORMATION_ONLY';

export type RiskLevel =
  | 'LOW'
  | 'MEDIUM'
  | 'HIGH'
  | 'CRITICAL';

export type AIPermissionLevel =
  | 'AUTO'
  | 'APPROVAL'
  | 'BLOCKED';

export type AIAutonomyMode =
  | 'LIMITED_ACCESS'
  | 'NO_AUTONOMOUS_ACCESS';

export interface CompanyTopicPolicies {
  // General (Default: AUTO)
  generalInfo: AIPermissionLevel;
  services: AIPermissionLevel;
  technologies: AIPermissionLevel;
  businessHours: AIPermissionLevel;
  qualificationQuestions: AIPermissionLevel;

  // Business / Partnership (Default: APPROVAL)
  partnerships: AIPermissionLevel;
  clientCommunication: AIPermissionLevel;
  referralArrangements: AIPermissionLevel;

  // Commercial (Default: APPROVAL)
  pricing: AIPermissionLevel;
  discounts: AIPermissionLevel;
  commission: AIPermissionLevel;
  revenueShare: AIPermissionLevel;
  refunds: AIPermissionLevel;
  paymentTerms: AIPermissionLevel;
  customCommercialTerms: AIPermissionLevel;

  // Delivery (Default: APPROVAL)
  deliveryTimelines: AIPermissionLevel;
  deadlines: AIPermissionLevel;
  slas: AIPermissionLevel;
  guarantees: AIPermissionLevel;

  // Legal / Sensitive (Default: BLOCKED)
  contracts: AIPermissionLevel;
  ndaAcceptance: AIPermissionLevel;
  legalCommitments: AIPermissionLevel;
  exclusivity: AIPermissionLevel;
}

export type CompanyKnowledgeCategory =
  | 'company'
  | 'services'
  | 'technologies'
  | 'pricing_rules'
  | 'commercial_policies'
  | 'commercial'
  | 'partnerships'
  | 'communication_preferences'
  | 'communication'
  | 'delivery_policies'
  | 'custom_instructions';

export interface CompanyKnowledgeItem {
  id: string;
  companyId: string;
  category: CompanyKnowledgeCategory;
  title: string;
  content: string;
  verified: boolean;
  status?: 'VERIFIED' | 'PENDING_REVIEW' | 'UNVERIFIED';
  source: 'COMPANY' | 'AI_SUGGESTION';
  createdAt: string;
  updatedAt: string;
  verifiedAt?: string;
  verifiedBy?: string;
  enabled?: boolean;
}

export interface TeachAiSuggestion {
  id: string;
  companyId: string;
  suggestionText: string;
  suggestedCategory: CompanyKnowledgeCategory;
  sourceSnippet: string;
  detectedAt: string;
  status: 'PENDING' | 'ACCEPTED' | 'DISMISSED';
}

export interface AIActivityLogEntry {
  id: string;
  timestamp: string;
  step: string;
  details: string;
  status?: 'success' | 'warning' | 'error' | 'pending';
}

export interface CompanyPermissionConfig {
  // Legacy boolean flags preserved for 100% backward compatibility
  autoReplyGeneralInfo: boolean;
  autoReplyServices: boolean;
  autoReplyPartnerships: boolean;
  autoReplyPricing: boolean;
  autoReplyDiscounts: boolean;
  autoReplyCommission: boolean;
  autoReplyContracts: boolean;
  autoReplyRefunds: boolean;
  autoReplyDeadlines: boolean;
  autoReplySLAs: boolean;
  customRestrictedKeywords?: string[];
  customHoldingResponseTemplate?: string;

  // Upgraded Rich Policy Model
  autonomyMode?: AIAutonomyMode;
  outboundPaused?: boolean;
  topicPolicies?: Partial<CompanyTopicPolicies>;
  knowledge?: CompanyKnowledgeItem[];
  suggestions?: TeachAiSuggestion[];
}

export interface PermissionEvaluationResult {
  decision: PermissionDecision;
  riskLevel: RiskLevel;
  reasons: string[];
  restrictedTopics: string[];
  requiresCompanyApproval: boolean;
  customerHoldingResponse?: string;
  suggestedAction: string;
  holdingResponseDraft?: string;
  proposedWordingDraft?: string;
  metadata?: {
    intent?: string;
    companyId?: string;
    leadId?: string;
    gmailThreadId?: string;
    timestamp?: string;
    detectedEntities?: Record<string, unknown>;
    autonomyMode?: AIAutonomyMode;
    outboundPaused?: boolean;
    policyUsed?: Partial<CompanyTopicPolicies>;
    immutableRuleTriggered?: string;
  };
}

export interface ApprovalQueueMetadata {
  customerMessage: string;
  detectedIntent: string;
  riskLevel: RiskLevel;
  restrictedTopics: string[];
  whyApprovalRequired: string[];
  aiDraft?: string;
  customerHoldingResponse?: string;
  companyId?: string;
  leadId?: string;
  gmailThreadId?: string;
  timestamp: string;
  decision: PermissionDecision;
  activityTimeline?: AIActivityLogEntry[];
}
