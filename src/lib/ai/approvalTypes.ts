import { PermissionDecision, RiskLevel, AIActivityLogEntry } from './permissionTypes';
import { ResponseValidationResult } from './responseValidator';

export type ApprovalStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'APPROVED_AND_SENT'
  | 'REJECTED'
  | 'EDITED_AND_SENT'
  | 'BLOCKED';

export type DraftVariationStyle = 'professional' | 'relationship' | 'warm' | 'concise';

export interface DraftVariation {
  id: DraftVariationStyle;
  label: string;
  content: string;
  styleDescription: string;
  validationResult?: ResponseValidationResult;
}

export interface AiApprovalItem {
  id: string;
  companyId: string;
  leadId: string;
  gmailThreadId?: string;
  inboundMessageId: string;
  customerName: string;
  customerEmail: string;
  customerCompanyName?: string;
  subject: string;
  latestCustomerMessage: string;
  conversationHistory?: Array<{ sender: 'client' | 'agent' | 'system'; text: string; createdAt?: string | Date; timestamp?: string | Date }>;
  intent: string;
  riskLevel: RiskLevel;
  permissionDecision: PermissionDecision;
  restrictedTopics: string[];
  whyApprovalRequired: string[];

  // Current-turn requirements and updated overrides
  currentTurnRequirements?: Array<
    | string
    | {
        type: string;
        topic?: string;
        description?: string;
        currentValue?: string;
        previousValue?: string;
        isOverride?: boolean;
      }
  >;
  commercialTermsDetected?: string[];
  updatedOverrides?: Array<
    | string
    | {
        field: string;
        currentValue: string;
        previousValue?: string;
      }
  >;

  // Safe holding response sent to the customer
  customerHoldingResponse?: string;
  holdingResponseSent: boolean;
  holdingResponseSentAt?: string;
  holdingOutboundMessageId?: string;

  // The 3 AI-generated draft variations (warm is aliased to relationship)
  variations: {
    professional: string;
    relationship: string;
    warm?: string;
    concise: string;
  };
  selectedVariation: DraftVariationStyle;

  // Regenerated draft history for version comparison
  regeneratedVersions?: Array<{
    id?: string;
    timestamp: string;
    style: DraftVariationStyle;
    content?: string;
    text?: string;
  }>;

  // Current active text for sending
  currentDraft: string;
  originalAiDraft: string;
  editedDraft?: string;
  isEdited: boolean;

  // Company instruction for AI reply generation
  companyInstruction?: string;

  // Status and audit trail
  status: ApprovalStatus;
  rejectionReason?: string;
  approvedBy?: string;
  approvedAt?: string;
  sentAt?: string;
  outboundMessageId?: string;
  policySnapshot?: Record<string, unknown> | string[];
  finalSentMessage?: string;
  validationResult?: ResponseValidationResult;
  knowledgeSaved?: boolean;

  // Activity timeline
  activityTimeline?: AIActivityLogEntry[];

  // Metadata
  inReplyTo?: string;
  references?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateApprovalItemInput {
  companyId: string;
  leadId: string;
  gmailThreadId?: string;
  inboundMessageId: string;
  customerName: string;
  customerEmail: string;
  customerCompanyName?: string;
  subject: string;
  latestCustomerMessage: string;
  conversationHistory?: Array<{ sender: 'client' | 'agent' | 'system'; text: string; createdAt?: string | Date; timestamp?: string | Date }>;
  intent: string;
  riskLevel: RiskLevel;
  permissionDecision: PermissionDecision;
  restrictedTopics: string[];
  whyApprovalRequired: string[];
  currentTurnRequirements?: Array<
    | string
    | {
        type: string;
        topic?: string;
        description?: string;
        currentValue?: string;
        previousValue?: string;
        isOverride?: boolean;
      }
  >;
  commercialTermsDetected?: string[];
  updatedOverrides?: Array<
    | string
    | {
        field: string;
        currentValue: string;
        previousValue?: string;
      }
  >;
  customerHoldingResponse?: string;
  holdingResponseSent?: boolean;
  holdingOutboundMessageId?: string;
  baseDraft: string;
  companyInstruction?: string;
  variations?: {
    professional: string;
    relationship: string;
    warm?: string;
    concise: string;
  };
  inReplyTo?: string;
  references?: string;
  activityTimeline?: AIActivityLogEntry[];
}

export interface SendApprovalItemResult {
  success: boolean;
  item?: AiApprovalItem;
  outboundMessageId?: string;
  error?: string;
  auditRecord?: Record<string, unknown>;
}
