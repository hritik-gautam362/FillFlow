export type ChannelSource = 'whatsapp' | 'web_chat' | 'contact_form' | 'email';

export type LeadStatus = 'new' | 'qualifying' | 'qualified' | 'disqualified' | 'brief_ready' | 'converted';

export type Priority = 'low' | 'medium' | 'high' | 'urgent';

export interface Lead {
  id: string;
  clientName: string;
  companyName: string;
  email: string;
  phone: string;
  channel: ChannelSource;
  status: LeadStatus;
  qualificationScore: number; // 0 to 100
  estimatedBudget: string;
  requestedTimeline: string;
  projectType: string;
  lastActive: string;
  assignedManager?: string;
  notes?: string;
  projectBrief?: { id: string; title: string } | null;
}

export interface ProjectFeature {
  name: string;
  description: string;
  complexity: 'Low' | 'Medium' | 'High';
}

export interface ProjectBrief {
  id: string;
  leadId: string;
  clientName: string;
  companyName: string;
  title: string;
  summary: string;
  projectType: string;
  targetAudience: string;
  requiredTechStack: string[];
  features: ProjectFeature[];
  budgetRange: string;
  estimatedDuration: string;
  keyRisks: string[];
  createdAt: string;
  rawConversationLength: number;
  structuredJson: Record<string, unknown>;
}

export interface ChatMessage {
  id: string;
  sender: 'client' | 'agent' | 'system';
  text: string;
  timestamp: string;
  options?: string[];
  extractedDataSnapshot?: Partial<{
    projectType: string;
    budget: string;
    timeline: string;
    techStack: string[];
    featuresCount: number;
  }>;
}

export interface CompanyProfile {
  name: string;
  logo: string;
  industry: string;
  teamSize: string;
  activeAgents: number;
  totalQualifiedLeads: number;
  briefsGeneratedCount: number;
}
