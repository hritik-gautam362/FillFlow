export interface ExtractedRequirements {
  clientName: string;
  companyName: string;
  email: string;
  phone: string;
  projectType: string;
  objective: string;
  targetAudience: string;
  features: string[];
  techStack: string[];
  budget: string;
  timeline: string;
  integrations: string[];
  securityRequirements: string[];
  constraints: string[];
  businessType?: string;
  productCount?: string;
  paymentGateway?: string;
  checkoutPreference?: string;
  missingFields: string[];
  qualificationScore: number;
  readyForBrief: boolean;
}

export interface CompanyContext {
  companyId?: string;
  name: string;
  industry?: string | null;
  teamSize?: string | null;
  website?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  timezone?: string | null;
  businessHours?: string | null;
  tone?: string | null;
  signature?: string | null;
  signatureEnabled?: boolean;
  services?: string[];
  description?: string;
  pricingPolicy?: string;
  pricingModel?: string;
  targetAudience?: string;
}


export type ConversationState =
  | 'ANSWER_ONLY'
  | 'ASK_ONE_QUESTION'
  | 'ANSWER_AND_ASK_ONE_QUESTION'
  | 'NO_RESPONSE_NEEDED'
  | 'READY_FOR_REVIEW';

export interface AiModelOutput {
  reply: string;
  options?: string[];
  conversationState?: ConversationState;
  requiresReply?: boolean;
  clientQuestionAnswered?: string | null;
  nextBestQuestion?: string | null;
  extractedRequirements: ExtractedRequirements;
  usedFallback?: boolean;
  fallbackReason?: string;
}

export interface ChatApiRequest {
  message: string;
  leadId?: string;
  channel?: 'web_chat' | 'whatsapp' | 'contact_form';
}

export interface ChatApiResponse {
  message: {
    id: string;
    sender: 'client' | 'agent' | 'system';
    text: string;
    options?: string[];
    timestamp: string;
  };
  extractedScope: {
    score: number;
    projectType: string;
    budget: string;
    timeline: string;
    techStack: string[];
    features: string[];
  };
  leadId: string;
  readyForBrief: boolean;
  briefCreated?: boolean;
  extractedRequirements?: ExtractedRequirements;
}
