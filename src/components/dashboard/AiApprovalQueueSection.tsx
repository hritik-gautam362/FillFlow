'use client';

import * as React from 'react';
import { AiApprovalItem, ApprovalStatus, DraftVariationStyle } from '@/lib/ai/approvalTypes';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  ShieldAlert,
  Clock,
  CheckCircle2,
  XCircle,
  Send,
  Eye,
  RefreshCw,
  Sparkles,
  FileEdit,
  User,
  Check,
  AlertCircle,
  X,
  RotateCcw,
  Building2,
  ChevronDown,
  ChevronUp,
  History,
  Layers,
  ArrowRight,
  Mail,
  Hash,
} from 'lucide-react';

export type SendState = 'Draft' | 'Selected' | 'Edited' | 'Validated' | 'Sending' | 'Sent' | 'Failed';

interface AiApprovalQueueSectionProps {
  companyId: string;
}

export function AiApprovalQueueSection({ companyId }: AiApprovalQueueSectionProps) {
  const [items, setItems] = React.useState<AiApprovalItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [statusFilter, setStatusFilter] = React.useState<ApprovalStatus | 'ALL'>('PENDING');
  const [selectedItem, setSelectedItem] = React.useState<AiApprovalItem | null>(null);
  const [isReviewOpen, setIsReviewOpen] = React.useState(false);

  // Modal Editing & Sending State
  const [activeVariation, setActiveVariation] = React.useState<DraftVariationStyle>('professional');
  const [editedText, setEditedText] = React.useState('');
  const [sendState, setSendState] = React.useState<SendState>('Draft');
  const [isPreviewMode, setIsPreviewMode] = React.useState(false);
  const [showHistory, setShowHistory] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [isRegenerating, setIsRegenerating] = React.useState(false);
  const [isValidating, setIsValidating] = React.useState(false);
  const [showConfirmSendModal, setShowConfirmSendModal] = React.useState(false);
  const [showCompareModal, setShowCompareModal] = React.useState(false);

  const [actionError, setActionError] = React.useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = React.useState<string | null>(null);
  const [validationSuccess, setValidationSuccess] = React.useState<string | null>(null);
  const [serverValidationIssues, setServerValidationIssues] = React.useState<string[]>([]);
  const [showTeachPrompt, setShowTeachPrompt] = React.useState(false);
  const [isTeaching, setIsTeaching] = React.useState(false);
  const [teachSaved, setTeachSaved] = React.useState(false);

  // Company Instruction state
  const [companyInstruction, setCompanyInstruction] = React.useState('');
  const [isGeneratingReply, setIsGeneratingReply] = React.useState(false);

  // Reopen Confirmation state
  const [itemToReopen, setItemToReopen] = React.useState<AiApprovalItem | null>(null);
  const [isReopening, setIsReopening] = React.useState(false);
  const [reopenSuccess, setReopenSuccess] = React.useState<string | null>(null);

  const fetchItems = React.useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setActionError(null);

    try {
      const url = statusFilter === 'ALL'
        ? `/api/companies/${companyId}/approvals`
        : `/api/companies/${companyId}/approvals?status=${statusFilter}`;

      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`Failed to load approval queue (${res.status})`);
      }
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setItems(json.data);
      }
    } catch (err) {
      console.error('[AI Approvals] Error loading items:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [companyId, statusFilter]);

  React.useEffect(() => {
    if (companyId) {
      fetchItems();
    }
  }, [companyId, fetchItems]);

  const openReviewModal = (item: AiApprovalItem) => {
    setSelectedItem(item);
    const style = item.selectedVariation || 'professional';
    setActiveVariation(style);
    const initialText = item.currentDraft || item.variations?.[style] || item.variations?.professional || '';
    setEditedText(initialText);
    setCompanyInstruction(item.companyInstruction || '');

    if (item.status === 'APPROVED' || item.status === 'APPROVED_AND_SENT' || item.status === 'EDITED_AND_SENT') {
      setSendState('Sent');
    } else if (item.isEdited) {
      setSendState('Edited');
    } else {
      setSendState('Selected');
    }

    setIsPreviewMode(false);
    setShowHistory(false);
    setActionError(null);
    setActionSuccess(null);
    setValidationSuccess(null);
    setServerValidationIssues([]);
    setShowTeachPrompt(false);
    setTeachSaved(false);
    setShowConfirmSendModal(false);
    setShowCompareModal(false);
    setIsReviewOpen(true);
  };

  const closeReviewModal = () => {
    setIsReviewOpen(false);
    setSelectedItem(null);
    setCompanyInstruction('');
    setShowConfirmSendModal(false);
    setShowCompareModal(false);
    setShowTeachPrompt(false);
    setTeachSaved(false);
    setValidationSuccess(null);
    setServerValidationIssues([]);
  };

  const handleSelectVariation = async (style: DraftVariationStyle) => {
    if (!selectedItem) return;
    setActiveVariation(style);
    const normalizedStyle = style === 'warm' ? 'relationship' : style;
    const content = selectedItem.variations[normalizedStyle] || selectedItem.variations[style] || '';
    setEditedText(content);
    setSendState('Selected');
    setActionError(null);
    setValidationSuccess(null);
    setServerValidationIssues([]);

    try {
      await fetch(`/api/companies/${companyId}/approvals/${selectedItem.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'select_variation', variation: style }),
      });
      // update local reference
      setSelectedItem((prev) => prev ? {
        ...prev,
        selectedVariation: style,
        currentDraft: content,
        isEdited: false,
      } : null);
    } catch (err) {
      console.warn('[AI Approvals] Could not sync selected variation:', err);
    }
  };

  const handleRegenerate = async (style: DraftVariationStyle) => {
    if (!selectedItem || isRegenerating) return;
    setIsRegenerating(true);
    setActionError(null);
    setValidationSuccess(null);

    try {
      const res = await fetch(`/api/companies/${companyId}/approvals/${selectedItem.id}/regenerate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ variationStyle: style }),
      });
      const json = await res.json();
      if (!json.success) {
        throw new Error(json.error || 'Failed to regenerate draft');
      }

      const updatedItem: AiApprovalItem = json.data.item;
      setSelectedItem(updatedItem);
      const normalizedStyle = style === 'warm' ? 'relationship' : style;
      const newDraft = updatedItem.variations[normalizedStyle] || json.data.newVersion;
      if (activeVariation === style || activeVariation === normalizedStyle) {
        setEditedText(newDraft);
        setSendState('Selected');
      }
      setActionSuccess(`Regenerated ${style} variation with safe deterministic constraints.`);
      setTimeout(() => setActionSuccess(null), 3000);
    } catch (err: unknown) {
      setActionError((err as Error).message);
    } finally {
      setIsRegenerating(false);
    }
  };

  const handleReject = async () => {
    if (!selectedItem) return;
    const reason = prompt('Please enter the reason for rejecting this AI draft (optional):') || 'Rejected by reviewer';
    setIsSubmitting(true);
    setActionError(null);

    try {
      const res = await fetch(`/api/companies/${companyId}/approvals/${selectedItem.id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      const json = await res.json();
      if (!json.success) {
        throw new Error(json.error || 'Failed to reject draft');
      }

      setActionSuccess('Draft successfully rejected.');
      setTimeout(() => {
        closeReviewModal();
        fetchItems(true);
      }, 1000);
    } catch (err: unknown) {
      setActionError((err as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGenerateReply = async () => {
    if (!selectedItem || !companyInstruction.trim() || isGeneratingReply) return;
    setIsGeneratingReply(true);
    setActionError(null);
    setValidationSuccess(null);
    setServerValidationIssues([]);

    try {
      const res = await fetch(`/api/companies/${companyId}/approvals/${selectedItem.id}/generate-reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instruction: companyInstruction.trim() }),
      });
      const json = await res.json();
      if (!json.success) {
        throw new Error(json.error || 'Failed to generate drafts from company instruction');
      }

      const updatedItem: AiApprovalItem = json.data.item;
      setSelectedItem(updatedItem);
      const style = updatedItem.selectedVariation || activeVariation || 'professional';
      const normalizedStyle = style === 'warm' ? 'relationship' : style;
      const newDraft = updatedItem.variations[normalizedStyle] || updatedItem.variations.professional;
      setEditedText(newDraft);
      setSendState('Selected');
      setActionSuccess('FillFlow generated 3 drafts based on your instruction.');
      setTimeout(() => setActionSuccess(null), 4000);
      fetchItems(true);
    } catch (err: unknown) {
      setActionError((err as Error).message);
    } finally {
      setIsGeneratingReply(false);
    }
  };

  const handleReopenConfirm = async () => {
    if (!itemToReopen || isReopening) return;
    setIsReopening(true);
    setActionError(null);

    try {
      const res = await fetch(`/api/companies/${companyId}/approvals/${itemToReopen.id}/reopen`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const json = await res.json();
      if (!json.success) {
        throw new Error(json.error || 'Failed to reopen approval');
      }

      setReopenSuccess('Approval reopened and moved to Pending.');
      setTimeout(() => setReopenSuccess(null), 5000);
      setItemToReopen(null);
      if (selectedItem?.id === itemToReopen.id) {
        setSelectedItem(json.data);
      }
      await fetchItems(true);
    } catch (err: unknown) {
      setActionError((err as Error).message);
    } finally {
      setIsReopening(false);
    }
  };

  // Editor metrics and indicators
  const normalizedActiveVariation = activeVariation === 'warm' ? 'relationship' : activeVariation;
  const originalSelectedText = selectedItem?.variations[normalizedActiveVariation] || '';
  const isEditedByCompany = editedText.trim() !== originalSelectedText.trim();
  const charCount = editedText.length;
  const wordCount = editedText.trim().length > 0 ? editedText.trim().split(/\s+/).length : 0;

  // Real-time pre-send validation with comprehensive rules
  const computeClientValidationIssues = React.useCallback((text: string, item: AiApprovalItem | null): string[] => {
    const issues: string[] = [];
    if (!text || text.trim().length === 0) {
      issues.push('Send blocked: Response draft cannot be empty.');
      return issues;
    }
    if (text.trim().length < 20) {
      issues.push('Send blocked: Response is too short to be a consultative reply (minimum 20 characters).');
    }

    const lower = text.toLowerCase();

    // 1. Placeholder check
    const placeholderRegex = /\[(?:INSERT|TODO|PLACEHOLDER|FILL|NAME|DATE|PERCENTAGE|AMOUNT|DISCOUNT|PRICE)[^\]]*\]/i;
    if (placeholderRegex.test(text)) {
      issues.push('Send blocked: Unresolved placeholder detected: Response contains bracketed placeholder tokens.');
    }

    // 1B. Internal Meta-Instruction Language Check
    const metaRegex = /\b(?:generate\s+(?:a\s+)?(?:msg|message|email|reply)|write\s+(?:a\s+)?(?:msg|message|email|reply)|tell\s+(?:them|we)|ask\s+them\s+to|according\s+to\s+(?:the\s+|your\s+)?instruction|the\s+instruction\s+states|you\s+asked\s+us\s+to\s+say|the\s+company\s+wants\s+to\s+say)\b/i;
    if (metaRegex.test(text) && !metaRegex.test(item?.latestCustomerMessage || '')) {
      issues.push('Send blocked: This response contains internal meta-instruction language that should not appear in customer email.');
    }

    // 2. Unverified Commission Commitment
    const commissionCommitRegex = /\b(?:(?:we|i)\s+(?:confirm|agree\s+to|commit\s+to|accept|offer)\s+(?:the\s+|a\s+)?(\d{1,2}%)\s*commission|confirm(?:ing)?\s+(?:the\s+)?(\d{1,2}%)\s*commission|accept(?:ing)?\s+(?:the\s+)?(\d{1,2}%)\s*commission|agree(?:ing)?\s+to\s+(?:the\s+)?(\d{1,2}%)\s*commission|confirm\s+the\s+15%\s+commission)\b/i;
    const commMatch = text.match(commissionCommitRegex);
    if (commMatch) {
      const pct = commMatch[1] || commMatch[2] || '15%';
      issues.push(`Send blocked: This response appears to commit to a ${pct} commission that has not been approved.`);
    }

    // 2B. Unverified Equity Commitment
    const equityCommitRegex = /\b(?:(?:we|i)\s+(?:confirm|agree\s+to|commit\s+to|accept|grant|give|transfer)\s+(?:a\s+|the\s+)?(?:\d{1,2}%|\d{1,2}\s+percent)\s*equity|confirm(?:ing)?\s+(?:the\s+)?(?:\d{1,2}%|\d{1,2}\s+percent)\s*equity)\b/i;
    const eqMatch = text.match(equityCommitRegex);
    if (eqMatch) {
      const pct = eqMatch[1] || eqMatch[2] || '40%';
      issues.push(`Send blocked: This response appears to commit to an unapproved ${pct} equity transfer.`);
    }

    // 3. Unverified Pricing / Fixed Quote Commitment
    const pricingCommitRegex = /\b(?:(?:we|i)\s+(?:confirm|agree\s+to|commit\s+to|accept|guarantee)\s+(?:the\s+)?(?:fixed\s+)?(?:price|cost|quote|budget)\s+of\s+([₹$€£]?\s*[\d,]+(?:\s*(?:k|thousand|lakh|crore))?)|confirm(?:ing)?\s+(?:the\s+)?(?:fixed\s+)?(?:price|cost|quote)\s+of\s+([₹$€£]?\s*[\d,]+)|(?:we|i)\s+will\s+do\s+(?:it|this|the\s+project)\s+for\s+(?:exactly\s+)?([₹$€£]\s*[\d,]+|\b\d+\s*(?:dollars|usd|inr|rupees)\b)|fixed\s+price\s+guarantee|confirm(?:ing)?\s+(?:the\s+)?fixed\s+price)\b/i;
    if (pricingCommitRegex.test(text)) {
      issues.push('Send blocked: This response commits to unverified fixed pricing that has not been approved.');
    }

    // 4. Unverified Discount Commitment
    const discountCommitRegex = /\b(?:(?:we|i)\s+(?:confirm|agree\s+to|commit\s+to|accept|offer)\s+(?:a\s+|the\s+)?(\d{1,2}%)\s*discount|(?:giving|give)\s+you\s+(?:a\s+)?(\d{1,2}%)\s*discount|offer\s+(?:you\s+)?(?:a\s+)?(\d{1,2}%)\s*discount|confirm(?:ing)?\s+(?:the\s+)?(\d{1,2}%)\s*discount)\b/i;
    if (discountCommitRegex.test(text)) {
      issues.push('Send blocked: This response appears to offer an unverified discount that has not been approved.');
    }

    // 5. Outdated Budget & Superseded Requirement Detection
    if (item?.updatedOverrides && item.updatedOverrides.length > 0) {
      for (const override of item.updatedOverrides) {
        if (typeof override !== 'string' && override.previousValue) {
          const prev = override.previousValue.toLowerCase().trim();
          if (prev.length > 2 && lower.includes(prev)) {
            issues.push(`Send blocked: This response references an outdated budget ("${override.previousValue}"). The current budget is ${override.currentValue}.`);
          }
        }
      }
    }

    // 6. Stale Topics Detection
    if (item?.restrictedTopics && item.restrictedTopics.length > 0) {
      for (const topic of item.restrictedTopics) {
        if (topic.includes('stale_') && lower.includes(topic.replace('stale_', '').toLowerCase())) {
          issues.push(`Send blocked: Stale topic detected: Response mentions superseded or obsolete topic "${topic}".`);
        }
      }
    }

    // 7. Unverified Refund Commitment
    const refundCommitRegex = /\b(?:(?:we|i)\s+(?:will\s+)?(?:issue|give|grant|promise|guarantee)\s+(?:a\s+)?(?:full\s+|partial\s+)?refund|money[- ]back\s+guarantee|reimburse\s+(?:your|the)\s+(?:payment|funds|money)|(?:we|i)\s+will\s+refund\s+(?:your|the)\s+money)\b/i;
    if (refundCommitRegex.test(text)) {
      issues.push('Send blocked: This response commits to an unverified refund that has not been approved.');
    }

    // 8. Unverified Payment Terms
    const paymentTermsCommitRegex = /\b(?:(?:we|i)\s+(?:accept|agree\s+to)\s+(?:net\s*(?:30|45|60|90)|deferred\s+payment|zero\s+advance|paying\s+after\s+delivery)|net\s*(?:30|45|60|90)\s+(?:terms\s+are\s+accepted|is\s+accepted|agreed)|(?:we|i)\s+agree\s+to\s+pay\s+after\s+delivery)\b/i;
    if (paymentTermsCommitRegex.test(text)) {
      issues.push('Send blocked: This response commits to non-standard payment terms that have not been approved.');
    }

    // 9. Unauthorized SLA Commitment
    const slaCommitRegex = /\b(?:(?:we|i)\s+(?:guarantee|promise|commit\s+to)\s+(?:a\s+)?(?:99\.9+%?\s+uptime|\d+\s*minutes?\s+response(?:\s+time)?|sla\b)|guaranteed\s+(?:99\.9+%?\s+uptime|response\s+time\s+of\s+\d+)|(?:we|i)\s+commit\s+to\s+a\s+99\.9%\s+uptime\s+sla)\b/i;
    if (slaCommitRegex.test(text)) {
      issues.push('Send blocked: This response commits to an unauthorized SLA that has not been approved.');
    }

    // 10. Unauthorized Deadline Guarantee
    const deadlineCommitRegex = /\b(?:(?:we|i)\s+guarantee\s+(?:delivery|completion|launch)\s+by\b|guaranteed\s+(?:delivery|completion)\s+by\s+[a-z]+|will\s+be\s+completed\s+by\s+[a-z]+(?:\s+\d{1,2})?\s+guaranteed)\b/i;
    if (deadlineCommitRegex.test(text)) {
      issues.push('Send blocked: This response commits to an unauthorized delivery deadline guarantee.');
    }

    // 11. Contractual / Legal Commitment
    const contractCommitRegex = /\b(?:(?:we|i)\s+(?:sign|execute|accept|agree\s+to)\s+(?:the|this|your|a)?\s*(?:contract|agreement|terms|legally\s+binding)|sign\s+(?:the|this|your)\s+contract|power\s+of\s+attorney|official\s+legal\s+representative|legally\s+binding\s+commitment)\b/i;
    if (contractCommitRegex.test(text)) {
      issues.push('Send blocked: This response contains an unauthorized contractual or legal commitment.');
    }

    // 12. NDA Acceptance
    const ndaCommitRegex = /\b(?:(?:we|i)\s+(?:sign|execute|accept|agree\s+to)\s+(?:the|this|your|a)?\s*nda|nda\s+is\s+accepted|non-disclosure\s+agreement\s+is\s+accepted|(?:we|i)\s+accept\s+your\s+nda|(?:we|i)\s+have\s+signed\s+the\s+nda)\b/i;
    if (ndaCommitRegex.test(text)) {
      issues.push('Send blocked: This response contains an unauthorized NDA acceptance.');
    }

    // 13. Exclusivity
    const exclusivityCommitRegex = /\b(?:(?:we|i)\s+(?:agree\s+to|commit\s+to|offer)\s+(?:an?\s+)?exclusive\b|exclusivity\s+clause\s+(?:is\s+accepted|agreed)|sole\s+(?:vendor|provider|partner))\b/i;
    if (exclusivityCommitRegex.test(text)) {
      issues.push('Send blocked: This response contains an unauthorized exclusivity commitment.');
    }

    // 14. Guarantees
    const guaranteeCommitRegex = /\b(?:(?:we|i)\s+(?:can\s+)?guarantee\s+(?:100%|results|traffic|revenue|sales|leads|uptime|zero\s+bugs|bug-free)|100%\s+guarantee|unconditional\s+guarantee|bug-free\s+guarantee|(?:we|i)\s+guarantee\s+(?:that\s+)?you\s+will|(?:we|i)\s+guarantee\s+100%)\b/i;
    if (guaranteeCommitRegex.test(text)) {
      issues.push('Send blocked: This response contains an unauthorized guarantee.');
    }

    return issues;
  }, []);

  const liveValidationIssues = React.useMemo(() => {
    return computeClientValidationIssues(editedText, selectedItem);
  }, [editedText, selectedItem, computeClientValidationIssues]);

  const allValidationIssues = React.useMemo(() => {
    const combined = [...liveValidationIssues];
    for (const serverIssue of serverValidationIssues) {
      if (!combined.includes(serverIssue)) {
        combined.push(serverIssue);
      }
    }
    return combined;
  }, [liveValidationIssues, serverValidationIssues]);

  const handleValidate = async () => {
    if (!selectedItem) return;
    setIsValidating(true);
    setActionError(null);
    setValidationSuccess(null);

    try {
      const clientIssues = computeClientValidationIssues(editedText, selectedItem);
      if (clientIssues.length > 0) {
        setServerValidationIssues(clientIssues);
        setActionError(clientIssues[0]);
        setSendState('Edited');
        return;
      }

      const res = await fetch(`/api/companies/${companyId}/approvals/${selectedItem.id}/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draftText: editedText }),
      });
      const json = await res.json();
      if (!json.success || !json.data.isValid) {
        const issues = json.data?.issues || [json.error || 'Validation failed'];
        setServerValidationIssues(issues);
        setActionError(issues[0]);
        setSendState('Edited');
      } else {
        setServerValidationIssues([]);
        setSendState('Validated');
        setValidationSuccess('Validation passed: Response complies with company permission rules and is safe to dispatch.');
        setTimeout(() => setValidationSuccess(null), 4000);
      }
    } catch (err: unknown) {
      setActionError((err as Error).message);
    } finally {
      setIsValidating(false);
    }
  };

  const handleSend = async () => {
    if (!selectedItem) return;

    // Check live validation before actual dispatch
    const currentIssues = computeClientValidationIssues(editedText, selectedItem);
    if (currentIssues.length > 0) {
      setActionError(currentIssues[0]);
      setShowConfirmSendModal(false);
      return;
    }

    setIsSubmitting(true);
    setSendState('Sending');
    setActionError(null);
    setActionSuccess(null);

    try {
      const res = await fetch(`/api/companies/${companyId}/approvals/${selectedItem.id}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ finalDraft: editedText }),
      });
      const json = await res.json();
      if (!json.success) {
        setSendState('Failed');
        throw new Error(json.error || 'Failed to send approved email');
      }

      setSendState('Sent');
      setShowConfirmSendModal(false);
      setActionSuccess('Response sent successfully.');
      setShowTeachPrompt(true);

      const updatedStatus: ApprovalStatus = isEditedByCompany ? 'EDITED_AND_SENT' : 'APPROVED_AND_SENT';
      setSelectedItem((prev) => prev ? {
        ...prev,
        status: updatedStatus,
        currentDraft: editedText,
        isEdited: isEditedByCompany,
      } : null);

      fetchItems(true);
    } catch (err: unknown) {
      setSendState('Failed');
      setActionError((err as Error).message);
      setShowConfirmSendModal(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTeachFromDecision = async () => {
    if (!selectedItem) return;
    setIsTeaching(true);
    try {
      await fetch(`/api/companies/${companyId}/knowledge/teach`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          title: `Approved Decision: ${selectedItem.subject}`,
          content: editedText,
          category: 'commercial_policies',
        }),
      });
      setTeachSaved(true);
      setTimeout(() => {
        closeReviewModal();
      }, 1200);
    } catch {
      // Non-critical teach error
    } finally {
      setIsTeaching(false);
    }
  };

  const isSendDisabled =
    isSubmitting ||
    allValidationIssues.length > 0 ||
    selectedItem?.status === 'APPROVED' ||
    selectedItem?.status === 'APPROVED_AND_SENT' ||
    selectedItem?.status === 'EDITED_AND_SENT' ||
    selectedItem?.status === 'BLOCKED' ||
    sendState === 'Sent';

  const pendingCount = items.filter((i) => i.status === 'PENDING').length;

  return (
    <div className="space-y-4">
      {/* Header and Filter Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20">
            <ShieldAlert className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-slate-100">AI Approvals</h2>
              {pendingCount > 0 && (
                <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-red-500/20 text-red-300 border border-red-500/30">
                  {pendingCount} Pending
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400">
              Responses waiting for your review • Authorize, edit, or guide AI responses before customer dispatch
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Status Filters */}
          <div className="flex items-center rounded-lg bg-slate-950 p-1 border border-slate-800 text-xs">
            <button
              onClick={() => setStatusFilter('PENDING')}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                statusFilter === 'PENDING' ? 'bg-red-600 text-white font-medium' : 'text-slate-400 hover:text-white'
              }`}
            >
              Pending
            </button>
            <button
              onClick={() => setStatusFilter('APPROVED_AND_SENT')}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                statusFilter === 'APPROVED_AND_SENT' || statusFilter === 'APPROVED' ? 'bg-emerald-600 text-white font-medium' : 'text-slate-400 hover:text-white'
              }`}
            >
              Approved
            </button>
            <button
              onClick={() => setStatusFilter('EDITED_AND_SENT')}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                statusFilter === 'EDITED_AND_SENT' ? 'bg-blue-600 text-white font-medium' : 'text-slate-400 hover:text-white'
              }`}
            >
              Edited &amp; Sent
            </button>
            <button
              onClick={() => setStatusFilter('REJECTED')}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                statusFilter === 'REJECTED' ? 'bg-slate-700 text-white font-medium' : 'text-slate-400 hover:text-white'
              }`}
            >
              Rejected
            </button>
            <button
              onClick={() => setStatusFilter('BLOCKED')}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                statusFilter === 'BLOCKED' ? 'bg-purple-600 text-white font-medium' : 'text-slate-400 hover:text-white'
              }`}
            >
              Blocked
            </button>
            <button
              onClick={() => setStatusFilter('ALL')}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                statusFilter === 'ALL' ? 'bg-slate-800 text-white font-medium' : 'text-slate-400 hover:text-white'
              }`}
            >
              All
            </button>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchItems(true)}
            disabled={refreshing}
            className="h-8 border-slate-800 text-slate-300 hover:bg-slate-800"
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Reopen Action Success Banner */}
      {reopenSuccess && (
        <div className="p-3 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 flex items-center justify-between text-xs animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
            <span className="font-medium">{reopenSuccess}</span>
          </div>
          <button
            onClick={() => setReopenSuccess(null)}
            className="text-slate-400 hover:text-white"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Items List */}
      {loading ? (
        <Card className="p-8 border-slate-800 bg-slate-900/60 text-center text-slate-400 text-sm flex items-center justify-center gap-2">
          <RefreshCw className="h-4 w-4 animate-spin text-slate-500" />
          Loading approval queue...
        </Card>
      ) : items.length === 0 ? (
        statusFilter === 'PENDING' ? (
          <Card className="p-4 border-slate-800 bg-slate-900/40 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0">
                <CheckCircle2 className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-xs font-semibold text-slate-200">No responses waiting for review</h3>
                <p className="text-[11px] text-slate-400">
                  All incoming customer inquiries have been verified or safely handled.
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchItems(true)}
              disabled={refreshing}
              className="h-7 text-xs border-slate-800 text-slate-400 hover:text-white shrink-0"
            >
              Refresh
            </Button>
          </Card>
        ) : (
          <Card className="p-6 border-slate-800 bg-slate-900/40 text-center">
            <CheckCircle2 className="h-6 w-6 text-slate-500 mx-auto mb-1.5" />
            <h3 className="text-xs font-medium text-slate-300">No items found</h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              No approval items matching filter &quot;{statusFilter.replace(/_/g, ' ')}&quot;.
            </p>
          </Card>
        )
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {items.map((item) => {
            const isHigh = item.riskLevel === 'HIGH';
            const isCritical = item.riskLevel === 'CRITICAL';
            const isPending = item.status === 'PENDING';

            return (
              <Card
                key={item.id}
                className={`p-4 border transition-all ${
                  isCritical
                    ? 'border-purple-500/30 bg-purple-950/10 hover:border-purple-500/50'
                    : isHigh
                    ? 'border-red-500/30 bg-red-950/10 hover:border-red-500/50'
                    : 'border-slate-800 bg-slate-900/80 hover:border-slate-700'
                }`}
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {isCritical ? (
                        <Badge className="bg-purple-500/20 text-purple-300 border-purple-500/40 font-semibold text-[10px]">
                          🟣 CRITICAL RISK
                        </Badge>
                      ) : isHigh ? (
                        <Badge className="bg-red-500/20 text-red-300 border-red-500/40 font-semibold text-[10px]">
                          🔴 HIGH RISK
                        </Badge>
                      ) : (
                        <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/40 font-semibold text-[10px]">
                          🟡 MEDIUM RISK
                        </Badge>
                      )}

                      <Badge variant="outline" className="text-[10px] border-slate-700 text-slate-300 uppercase">
                        {item.intent || 'INQUIRY'}
                      </Badge>

                      <Badge
                        variant="outline"
                        className={`text-[10px] ${
                          item.status === 'PENDING'
                            ? 'border-amber-500/40 text-amber-300 bg-amber-500/10'
                            : item.status === 'APPROVED' || item.status === 'APPROVED_AND_SENT'
                            ? 'border-emerald-500/40 text-emerald-300 bg-emerald-500/10'
                            : item.status === 'EDITED_AND_SENT'
                            ? 'border-blue-500/40 text-blue-300 bg-blue-500/10'
                            : item.status === 'BLOCKED'
                            ? 'border-purple-500/40 text-purple-300 bg-purple-500/10'
                            : 'border-slate-600 text-slate-400'
                        }`}
                      >
                        {item.status.replace(/_/g, ' ')}
                      </Badge>

                      <span className="text-[11px] text-slate-300 font-medium">
                        {item.customerName}
                      </span>
                      {item.customerCompanyName && (
                        <span className="text-[11px] text-slate-400 flex items-center gap-1 font-mono">
                          <Building2 className="h-3 w-3 text-slate-500" />
                          {item.customerCompanyName}
                        </span>
                      )}
                      <span className="text-[11px] text-slate-500">
                        &lt;{item.customerEmail}&gt;
                      </span>
                    </div>

                    <div className="text-xs font-semibold text-slate-200 truncate">
                      {item.subject}
                    </div>

                    <div className="text-xs text-slate-300 italic bg-slate-950/60 p-2 rounded border border-slate-800/80 font-mono">
                      &quot;{item.latestCustomerMessage}&quot;
                    </div>

                    <div className="text-[11px] text-slate-400 flex flex-wrap items-center gap-1.5 pt-0.5">
                      <span className="text-slate-500 font-semibold">Reason:</span>
                      <span>{item.whyApprovalRequired?.join('; ') || 'Commercial commitment requires approval.'}</span>
                    </div>

                    {item.updatedOverrides && item.updatedOverrides.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1 pt-0.5">
                        <span className="text-[10px] text-amber-400 font-semibold">Updated Values:</span>
                        {item.updatedOverrides.map((override, i) => (
                          <span
                            key={i}
                            className="px-1.5 py-0.5 text-[9px] rounded bg-amber-950/40 text-amber-300 border border-amber-500/30 font-mono"
                          >
                            {typeof override === 'string' ? override : `${override.field}: ${override.currentValue}`}
                          </span>
                        ))}
                      </div>
                    )}

                    {item.restrictedTopics && item.restrictedTopics.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1 pt-0.5">
                        <span className="text-[10px] text-slate-500">Restricted Topics:</span>
                        {item.restrictedTopics.map((topic, i) => (
                          <span
                            key={i}
                            className="px-1.5 py-0.5 text-[9px] rounded bg-slate-800 text-slate-300 border border-slate-700 font-mono"
                          >
                            {topic}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex sm:flex-col items-center sm:items-end justify-between gap-2 shrink-0">
                    <span className="text-[10px] text-slate-500 flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {new Date(item.createdAt).toLocaleDateString()} {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>

                    <div className="flex items-center gap-1.5">
                      {item.status === 'REJECTED' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setItemToReopen(item)}
                          className="h-8 text-xs font-medium px-2.5 border-amber-500/40 bg-amber-950/20 text-amber-300 hover:bg-amber-900/40 hover:text-amber-200"
                        >
                          <RotateCcw className="h-3 w-3 mr-1 text-amber-400" />
                          Reopen
                        </Button>
                      )}

                      <Button
                        size="sm"
                        onClick={() => openReviewModal(item)}
                        className={`h-8 text-xs font-semibold px-3 ${
                          isPending
                            ? 'bg-red-600 hover:bg-red-500 text-white'
                            : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                        }`}
                      >
                        <Eye className="h-3.5 w-3.5 mr-1" />
                        {isPending ? 'Review & Respond' : 'View Details'}
                      </Button>
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Review & Edit Modal (Phase 3B Production Review Panel) */}
      {isReviewOpen && selectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-2xl max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden">
            
            {/* Modal Header */}
            <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/70">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20">
                  <ShieldAlert className="h-4 w-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                      Review AI Response &amp; Authorize Send
                    </h3>
                    <Badge variant="outline" className="text-[10px] border-slate-700 font-mono">
                      {selectedItem.id}
                    </Badge>
                    <Badge
                      className={`text-[10px] font-semibold ${
                        sendState === 'Sent'
                          ? 'bg-emerald-600 text-white'
                          : sendState === 'Validated'
                          ? 'bg-teal-600 text-white'
                          : sendState === 'Edited'
                          ? 'bg-amber-600 text-white'
                          : sendState === 'Sending'
                          ? 'bg-cyan-600 text-white animate-pulse'
                          : sendState === 'Failed'
                          ? 'bg-red-600 text-white'
                          : 'bg-indigo-600 text-white'
                      }`}
                    >
                      State: {sendState}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Thread ID: <span className="font-mono text-slate-300">{selectedItem.gmailThreadId || 'N/A'}</span> • Production Human-In-The-Loop Approval
                  </p>
                </div>
              </div>
              <button
                onClick={closeReviewModal}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal Scrollable Body */}
            <div className="p-5 overflow-y-auto space-y-4 flex-1 text-xs">
              
              {/* Alert Feedback */}
              {actionError && (
                <div className="p-3 rounded-lg bg-destructive/15 border border-destructive/30 text-destructive flex items-center gap-2 animate-in fade-in">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span className="font-medium">{actionError}</span>
                </div>
              )}
              {actionSuccess && (
                <div className="p-3 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center gap-2 animate-in fade-in">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <span className="font-medium">{actionSuccess}</span>
                </div>
              )}
              {validationSuccess && (
                <div className="p-3 rounded-lg bg-teal-500/15 border border-teal-500/30 text-teal-300 flex items-center gap-2 animate-in fade-in">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <span className="font-medium">{validationSuccess}</span>
                </div>
              )}

              {/* SECTION A: Customer Information */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5 text-slate-500" /> Customer Information
                </span>
                <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800 space-y-2.5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 text-[11px]">
                    <div>
                      <span className="text-slate-500 block text-[10px]">Customer Name</span>
                      <span className="font-semibold text-slate-200">{selectedItem.customerName}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">Customer Email</span>
                      <span className="font-mono text-slate-300">{selectedItem.customerEmail}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">Company</span>
                      <span className="text-slate-300 flex items-center gap-1">
                        <Building2 className="h-3 w-3 text-slate-500" />
                        {selectedItem.customerCompanyName || 'Not provided'}
                      </span>
                    </div>
                    <div className="sm:col-span-2">
                      <span className="text-slate-500 block text-[10px]">Subject</span>
                      <span className="font-medium text-slate-200 truncate block">{selectedItem.subject}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">Gmail Thread</span>
                      <span className="font-mono text-indigo-300 flex items-center gap-1">
                        <Hash className="h-3 w-3 text-indigo-400" />
                        {selectedItem.gmailThreadId || 'N/A'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* SECTION B: Latest Message */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5 text-amber-400" /> Latest Customer Message
                </span>
                <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800 space-y-2">
                  <div className="text-slate-200 font-mono text-xs whitespace-pre-wrap bg-slate-900/70 p-3 rounded border border-slate-800">
                    &quot;{selectedItem.latestCustomerMessage}&quot;
                  </div>
                </div>
              </div>

              {/* SECTION C: Relevant Previous Messages (Conversation) */}
              {selectedItem.conversationHistory && selectedItem.conversationHistory.length > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                      <History className="h-3.5 w-3.5 text-indigo-400" /> Conversation History
                    </span>
                    <button
                      onClick={() => setShowHistory((prev) => !prev)}
                      className="text-[11px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-medium"
                    >
                      {showHistory ? 'Hide Previous Messages' : `Show Previous Messages (${selectedItem.conversationHistory.length})`}
                      {showHistory ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    </button>
                  </div>

                  {showHistory && (
                    <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-2.5 max-h-56 overflow-y-auto">
                      {selectedItem.conversationHistory.map((h, idx) => {
                        const isCustomer = h.sender === 'client';
                        return (
                          <div
                            key={idx}
                            className={`p-2.5 rounded-lg border text-[11px] ${
                              isCustomer
                                ? 'bg-slate-900/90 border-slate-800 text-slate-200 ml-0 mr-8'
                                : 'bg-indigo-950/20 border-indigo-500/30 text-indigo-200 ml-8 mr-0'
                            }`}
                          >
                            <div className="flex items-center justify-between text-[10px] mb-1">
                              <Badge
                                variant="outline"
                                className={`text-[9px] px-1.5 py-0 ${
                                  isCustomer
                                    ? 'border-slate-700 text-slate-300'
                                    : 'border-indigo-500/40 text-indigo-300 bg-indigo-950/30'
                                }`}
                              >
                                {isCustomer ? `Customer (${selectedItem.customerName})` : 'FillFlow / Agent'}
                              </Badge>
                              {(h.timestamp || h.createdAt) && (
                                <span className="text-slate-500">
                                  {new Date((h.timestamp || h.createdAt) as string).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              )}
                            </div>
                            <p className="whitespace-pre-wrap leading-relaxed">{h.text}</p>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* SECTION D: AI Analysis */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-indigo-400" /> AI Risk &amp; Permission Analysis
                </span>
                <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800 space-y-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-slate-400 font-medium">Intent:</span>
                    <Badge variant="outline" className="text-[10px] border-slate-700 uppercase">
                      {selectedItem.intent || 'INQUIRY'}
                    </Badge>
                    <span className="text-slate-400 font-medium ml-2">Risk:</span>
                    <Badge
                      className={`text-[10px] ${
                        selectedItem.riskLevel === 'CRITICAL'
                          ? 'bg-purple-600'
                          : selectedItem.riskLevel === 'HIGH'
                          ? 'bg-red-600'
                          : 'bg-amber-600'
                      }`}
                    >
                      {selectedItem.riskLevel}
                    </Badge>
                    <span className="text-slate-400 font-medium ml-2">Permission Decision:</span>
                    <Badge variant="outline" className="border-red-500/40 text-red-300 bg-red-950/20 text-[10px]">
                      {selectedItem.permissionDecision}
                    </Badge>
                  </div>

                  {selectedItem.restrictedTopics && selectedItem.restrictedTopics.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                      <span className="text-slate-400 font-medium text-[11px]">Restricted Topics:</span>
                      {selectedItem.restrictedTopics.map((topic, i) => (
                        <span
                          key={i}
                          className="px-2 py-0.5 text-[10px] rounded bg-slate-800 text-slate-200 border border-slate-700 font-mono"
                        >
                          {topic}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="text-slate-300 text-[11px]">
                    <span className="font-semibold text-slate-400">Why approval is required: </span>
                    {selectedItem.whyApprovalRequired?.join('; ') || 'High-risk commercial commitment requires company verification.'}
                  </div>

                  {/* Overrides and Current-Turn Corrections */}
                  {selectedItem.updatedOverrides && selectedItem.updatedOverrides.length > 0 && (
                    <div className="p-2.5 rounded bg-amber-950/20 border border-amber-500/30 flex items-start gap-2">
                      <AlertCircle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                      <div className="text-[11px] text-amber-200 space-y-0.5">
                        <span className="font-semibold block">Current-Turn Corrections / Updated Overrides:</span>
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {selectedItem.updatedOverrides.map((o, idx) => (
                            <span
                              key={idx}
                              className="px-2 py-0.5 rounded bg-amber-900/40 border border-amber-500/40 font-mono text-[10px]"
                            >
                              {typeof o === 'string' ? o : `${o.field}: ${o.previousValue ? `${o.previousValue} → ` : ''}${o.currentValue}`}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {selectedItem.currentTurnRequirements && selectedItem.currentTurnRequirements.length > 0 && (
                    <div className="text-[11px] text-slate-400">
                      <span className="font-semibold text-slate-300">Important extracted information: </span>
                      {selectedItem.currentTurnRequirements.map((r) => typeof r === 'string' ? r : (r.description || r.type)).join(' • ')}
                    </div>
                  )}

                  {selectedItem.customerHoldingResponse && (
                    <div className="text-[11px] text-slate-400 pt-1.5 border-t border-slate-800">
                      <span className="font-semibold text-emerald-400">Holding response dispatched to customer: </span>
                      <span className="italic text-slate-300">&quot;{selectedItem.customerHoldingResponse}&quot;</span>
                    </div>
                  )}
                </div>
              </div>

              {/* SECTION E: Tell FillFlow what you want to say */}
              <div className="space-y-2.5 p-4 rounded-xl bg-slate-950 border border-slate-800">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h4 className="text-xs font-semibold text-slate-100 flex items-center gap-1.5">
                      <Sparkles className="h-3.5 w-3.5 text-indigo-400" />
                      Tell FillFlow what you want to say
                    </h4>
                    <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                      Describe what you want the customer-facing reply to communicate. FillFlow will turn your instruction into a polished response using the customer&apos;s message and conversation context.
                    </p>
                  </div>
                  <Badge variant="outline" className="text-[9px] border-indigo-500/30 text-indigo-300 shrink-0">
                    Company Instruction
                  </Badge>
                </div>

                <div className="space-y-2 pt-1">
                  <textarea
                    rows={3}
                    value={companyInstruction}
                    onChange={(e) => setCompanyInstruction(e.target.value)}
                    placeholder="Example: We're okay with a 30% revenue share. Tell them we're interested and ask how they normally handle referrals."
                    className="w-full rounded-lg bg-slate-900 border border-slate-800 p-2.5 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-y font-sans"
                  />

                  {/* Suggestion Chips */}
                  <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                    <span className="text-slate-500">Quick examples:</span>
                    <button
                      type="button"
                      onClick={() => setCompanyInstruction("We're okay with a 30% revenue share. Tell them we're interested and ask about their usual referral process.")}
                      className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400 hover:text-indigo-300 hover:border-indigo-500/40 transition-colors"
                    >
                      30% revenue share &amp; referrals
                    </button>
                    <button
                      type="button"
                      onClick={() => setCompanyInstruction("Don't accept commission yet. Tell them we're interested and want to discuss the structure.")}
                      className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400 hover:text-indigo-300 hover:border-indigo-500/40 transition-colors"
                    >
                      Don&apos;t accept commission yet
                    </button>
                    <button
                      type="button"
                      onClick={() => setCompanyInstruction("Tell them we'll review their requirements and discuss pricing.")}
                      className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400 hover:text-indigo-300 hover:border-indigo-500/40 transition-colors"
                    >
                      Review requirements &amp; discuss pricing
                    </button>
                    <button
                      type="button"
                      onClick={() => setCompanyInstruction("Ask them to schedule a call next week.")}
                      className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400 hover:text-indigo-300 hover:border-indigo-500/40 transition-colors"
                    >
                      Schedule a call next week
                    </button>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1 border-t border-slate-800/80">
                    <span className="text-[10px] text-slate-400">
                      FillFlow will use the customer&apos;s message and your instruction to create the response.
                    </span>
                    <Button
                      size="sm"
                      onClick={handleGenerateReply}
                      disabled={isGeneratingReply || !companyInstruction.trim()}
                      className="h-7 text-xs bg-indigo-600 hover:bg-indigo-500 text-white font-medium shrink-0 flex items-center gap-1.5"
                    >
                      <Sparkles className={`h-3 w-3 ${isGeneratingReply ? 'animate-spin' : ''}`} />
                      {isGeneratingReply ? 'Generating Reply...' : 'Generate Reply'}
                    </Button>
                  </div>
                </div>
              </div>

              {/* SECTION F: 3 Distinct AI Drafts */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Layers className="h-3.5 w-3.5 text-cyan-400" /> Three AI Drafts (Select One)
                  </span>
                  {selectedItem.regeneratedVersions && selectedItem.regeneratedVersions.length > 0 && (
                    <button
                      onClick={() => setShowCompareModal(true)}
                      className="text-[10px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-medium"
                    >
                      <RotateCcw className="h-3 w-3" />
                      Compare Versions ({selectedItem.regeneratedVersions.length})
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                  {/* [1] Professional */}
                  <div
                    onClick={() => handleSelectVariation('professional')}
                    className={`p-3 rounded-lg border cursor-pointer transition-all flex flex-col justify-between ${
                      activeVariation === 'professional'
                        ? 'border-indigo-500 bg-indigo-950/30 ring-2 ring-indigo-500 shadow-md shadow-indigo-500/10'
                        : 'border-slate-800 bg-slate-950 hover:border-slate-700'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="font-semibold text-slate-200 flex items-center gap-1 text-[11px]">
                          1. Professional
                          {activeVariation === 'professional' && <Check className="h-3.5 w-3.5 text-indigo-400" />}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={isRegenerating}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRegenerate('professional');
                          }}
                          className="h-5 px-1.5 text-[9px] text-slate-400 hover:text-white hover:bg-slate-800"
                        >
                          <RefreshCw className={`h-2.5 w-2.5 mr-1 ${isRegenerating ? 'animate-spin' : ''}`} />
                          Regenerate
                        </Button>
                      </div>
                      <p className="text-[11px] text-slate-400 line-clamp-4 font-mono">
                        {selectedItem.variations?.professional}
                      </p>
                    </div>
                    <div className="pt-2 flex items-center justify-between">
                      {activeVariation === 'professional' ? (
                        <span className="text-[10px] font-semibold text-indigo-400 flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3" /> Selected Draft
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-500 hover:text-indigo-400">
                          Click to select
                        </span>
                      )}
                    </div>
                  </div>

                  {/* [2] Warm / Relationship-focused */}
                  <div
                    onClick={() => handleSelectVariation('warm')}
                    className={`p-3 rounded-lg border cursor-pointer transition-all flex flex-col justify-between ${
                      activeVariation === 'warm' || activeVariation === 'relationship'
                        ? 'border-purple-500 bg-purple-950/30 ring-2 ring-purple-500 shadow-md shadow-purple-500/10'
                        : 'border-slate-800 bg-slate-950 hover:border-slate-700'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="font-semibold text-slate-200 flex items-center gap-1 text-[11px]">
                          2. Warm / Relationship-focused
                          {(activeVariation === 'warm' || activeVariation === 'relationship') && (
                            <Check className="h-3.5 w-3.5 text-purple-400" />
                          )}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={isRegenerating}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRegenerate('warm');
                          }}
                          className="h-5 px-1.5 text-[9px] text-slate-400 hover:text-white hover:bg-slate-800"
                        >
                          <RefreshCw className={`h-2.5 w-2.5 mr-1 ${isRegenerating ? 'animate-spin' : ''}`} />
                          Regenerate
                        </Button>
                      </div>
                      <p className="text-[11px] text-slate-400 line-clamp-4 font-mono">
                        {selectedItem.variations?.warm || selectedItem.variations?.relationship}
                      </p>
                    </div>
                    <div className="pt-2 flex items-center justify-between">
                      {activeVariation === 'warm' || activeVariation === 'relationship' ? (
                        <span className="text-[10px] font-semibold text-purple-400 flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3" /> Selected Draft
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-500 hover:text-purple-400">
                          Click to select
                        </span>
                      )}
                    </div>
                  </div>

                  {/* [3] Concise */}
                  <div
                    onClick={() => handleSelectVariation('concise')}
                    className={`p-3 rounded-lg border cursor-pointer transition-all flex flex-col justify-between ${
                      activeVariation === 'concise'
                        ? 'border-emerald-500 bg-emerald-950/30 ring-2 ring-emerald-500 shadow-md shadow-emerald-500/10'
                        : 'border-slate-800 bg-slate-950 hover:border-slate-700'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="font-semibold text-slate-200 flex items-center gap-1 text-[11px]">
                          3. Concise
                          {activeVariation === 'concise' && <Check className="h-3.5 w-3.5 text-emerald-400" />}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={isRegenerating}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRegenerate('concise');
                          }}
                          className="h-5 px-1.5 text-[9px] text-slate-400 hover:text-white hover:bg-slate-800"
                        >
                          <RefreshCw className={`h-2.5 w-2.5 mr-1 ${isRegenerating ? 'animate-spin' : ''}`} />
                          Regenerate
                        </Button>
                      </div>
                      <p className="text-[11px] text-slate-400 line-clamp-4 font-mono">
                        {selectedItem.variations?.concise}
                      </p>
                    </div>
                    <div className="pt-2 flex items-center justify-between">
                      {activeVariation === 'concise' ? (
                        <span className="text-[10px] font-semibold text-emerald-400 flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3" /> Selected Draft
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-500 hover:text-emerald-400">
                          Click to select
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* SECTION F: Response Editor & Live Email Preview */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                      <FileEdit className="h-3.5 w-3.5 text-amber-400" /> Response Editor
                    </span>
                    {/* Explicit indicator of AI Generated vs Edited by Company */}
                    {isEditedByCompany ? (
                      <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30 text-[10px] font-semibold">
                        Edited by Company
                      </Badge>
                    ) : (
                      <Badge className="bg-indigo-500/20 text-indigo-300 border-indigo-500/30 text-[10px] font-semibold">
                        AI Generated
                      </Badge>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Validate Button */}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleValidate}
                      disabled={isValidating || isSubmitting}
                      className="h-7 text-[11px] border-slate-700 bg-slate-800 text-slate-200 hover:text-white flex items-center gap-1"
                    >
                      <CheckCircle2 className={`h-3 w-3 text-teal-400 ${isValidating ? 'animate-spin' : ''}`} />
                      {isValidating ? 'Validating...' : 'Validate'}
                    </Button>

                    {/* Preview / Edit Toggle */}
                    <button
                      onClick={() => setIsPreviewMode((prev) => !prev)}
                      className="text-[11px] px-2.5 py-1 rounded border border-slate-700 bg-slate-800 text-slate-300 hover:text-white flex items-center gap-1 font-medium transition-colors"
                    >
                      <Eye className="h-3 w-3" />
                      {isPreviewMode ? 'Back to Editor' : 'Preview'}
                    </button>

                    {/* Reset Button */}
                    {isEditedByCompany && (
                      <button
                        onClick={() => handleSelectVariation(activeVariation)}
                        className="text-[11px] text-slate-400 hover:text-slate-200 underline flex items-center gap-1 ml-1"
                      >
                        <RotateCcw className="h-3 w-3" />
                        Reset to selected AI draft
                      </button>
                    )}
                  </div>
                </div>

                {isPreviewMode ? (
                  /* SECTION G: Email Preview */
                  <div className="p-4 rounded-lg bg-white text-slate-900 border border-slate-300 shadow-sm font-sans space-y-3">
                    <div className="p-2.5 rounded bg-emerald-50 text-emerald-900 border border-emerald-300 text-xs font-semibold flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                      <span>Customer will receive exactly this message.</span>
                    </div>
                    <div className="border-b border-slate-200 pb-2 text-[11px] text-slate-600 space-y-1">
                      <div><strong className="text-slate-800">From:</strong> FillFlow connected company mailbox</div>
                      <div><strong className="text-slate-800">To:</strong> {selectedItem.customerName} &lt;{selectedItem.customerEmail}&gt;</div>
                      <div><strong className="text-slate-800">Subject:</strong> {selectedItem.subject.startsWith('Re:') ? selectedItem.subject : `Re: ${selectedItem.subject}`}</div>
                    </div>
                    <div className="text-xs leading-relaxed text-slate-800 whitespace-pre-wrap font-sans p-1">
                      {editedText}
                    </div>
                  </div>
                ) : (
                  /* Editable Textarea View */
                  <div className="space-y-1">
                    <textarea
                      rows={6}
                      value={editedText}
                      onChange={(e) => {
                        setEditedText(e.target.value);
                        setSendState('Edited');
                        setValidationSuccess(null);
                        setServerValidationIssues([]);
                      }}
                      placeholder="Review or customize the response before dispatching..."
                      className="w-full rounded-lg bg-slate-950 border border-slate-800 p-3 text-xs text-slate-200 font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-y"
                    />
                    <div className="flex items-center justify-between text-[10px] text-slate-500 px-1 font-mono">
                      <span>{charCount} characters • {wordCount} words</span>
                      <span>Gmail thread ID &amp; RFC 2822 headers preserved</span>
                    </div>
                  </div>
                )}
              </div>

              {/* SECTION H: Live Pre-Send Safety Validation Status */}
              <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                    Live Safety Validation
                  </span>
                  {allValidationIssues.length === 0 ? (
                    (selectedItem.permissionDecision === 'NEEDS_APPROVAL' ||
                     (selectedItem.restrictedTopics && selectedItem.restrictedTopics.length > 0) ||
                     /\b(\d+%\s*(?:equity|commission|discount|revenue\s*share)|equity\s+stake|revenue-share|guarantee)\b/i.test(editedText)) ? (
                      <span className="text-[10px] text-amber-400 font-semibold flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" /> Approval Required
                      </span>
                    ) : (
                      <span className="text-[10px] text-emerald-400 font-semibold flex items-center gap-1">
                        <Check className="h-3 w-3" /> Safe to Send
                      </span>
                    )
                  ) : (
                    <span className="text-[10px] text-red-400 font-semibold flex items-center gap-1">
                      <X className="h-3 w-3" /> Send Blocked ({allValidationIssues.length} issue{allValidationIssues.length > 1 ? 's' : ''})
                    </span>
                  )}
                </div>

                {allValidationIssues.length > 0 && (
                  <div className="p-2.5 rounded bg-destructive/15 border border-destructive/30 text-destructive text-[11px] space-y-1">
                    <span className="font-semibold block">Safety Violations Preventing Dispatch:</span>
                    <ul className="list-disc list-inside space-y-0.5">
                      {allValidationIssues.map((issue, idx) => (
                        <li key={idx}>{issue}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* SECTION I: Teach FillFlow from this decision? */}
              {showTeachPrompt && (
                <div className="p-3.5 rounded-xl bg-indigo-950/40 border border-indigo-500/40 text-xs space-y-2 animate-in fade-in">
                  <div className="flex items-center gap-2 font-semibold text-indigo-300">
                    <Sparkles className="h-4 w-4 text-indigo-400" />
                    Teach FillFlow from this decision?
                  </div>
                  <p className="text-slate-300 text-[11px] leading-relaxed">
                    Save this approved response into your company&apos;s knowledge base as a <strong className="text-white">PENDING_REVIEW</strong> policy so future inquiries can safely follow this verified decision.
                  </p>
                  <div className="flex items-center gap-2 pt-1">
                    <Button
                      size="sm"
                      disabled={isTeaching || teachSaved}
                      onClick={handleTeachFromDecision}
                      className="text-xs bg-indigo-600 hover:bg-indigo-500 text-white flex items-center gap-1.5"
                    >
                      {teachSaved ? (
                        <>
                          <Check className="h-3.5 w-3.5" /> Saved as PENDING_REVIEW Knowledge
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-3.5 w-3.5" /> Save as PENDING_REVIEW Knowledge
                        </>
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        closeReviewModal();
                        fetchItems(true);
                      }}
                      className="text-xs text-slate-400 hover:text-white"
                    >
                      Skip / Close
                    </Button>
                  </div>
                </div>
              )}

            </div>

            {/* Modal Footer Actions */}
            <div className="p-4 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between gap-3">
              {selectedItem.status === 'REJECTED' ? (
                <Button
                  size="sm"
                  onClick={() => setItemToReopen(selectedItem)}
                  className="text-xs bg-amber-600 hover:bg-amber-500 text-white font-medium flex items-center gap-1"
                >
                  <RotateCcw className="h-3.5 w-3.5 mr-1" />
                  Reopen Approval
                </Button>
              ) : (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleReject}
                  disabled={isSubmitting || selectedItem.status === 'APPROVED' || selectedItem.status === 'APPROVED_AND_SENT' || selectedItem.status === 'EDITED_AND_SENT' || selectedItem.status === 'BLOCKED' || sendState === 'Sent'}
                  className="text-xs"
                >
                  <XCircle className="h-3.5 w-3.5 mr-1" />
                  Reject
                </Button>
              )}

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={closeReviewModal}
                  disabled={isSubmitting}
                  className="text-xs border-slate-800"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={() => setShowConfirmSendModal(true)}
                  disabled={isSendDisabled}
                  className={`text-xs text-white font-semibold ${
                    isSendDisabled ? 'bg-slate-700 cursor-not-allowed opacity-50' : 'bg-emerald-600 hover:bg-emerald-500'
                  }`}
                >
                  <Send className="h-3.5 w-3.5 mr-1" />
                  {selectedItem.status === 'APPROVED' || selectedItem.status === 'APPROVED_AND_SENT' || selectedItem.status === 'EDITED_AND_SENT' || sendState === 'Sent'
                    ? 'Already Dispatched'
                    : selectedItem.status === 'BLOCKED'
                    ? 'Send Blocked by Safety'
                    : 'Approve & Send directly via Gmail'}
                </Button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* Confirmation Dialog: "Send this response?" (Section 7) */}
      {showConfirmSendModal && selectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-2xl max-w-lg w-full p-5 space-y-4">
            <div className="flex items-center gap-2.5 border-b border-slate-800 pb-3">
              <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <Send className="h-5 w-5" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-slate-100">Send this response?</h4>
                <p className="text-xs text-slate-400">Direct send from FillFlow connected company mailbox</p>
              </div>
            </div>

            <div className="space-y-2.5 text-xs text-slate-300">
              <div className="p-2.5 rounded bg-slate-950 border border-slate-800 space-y-1 font-mono text-[11px]">
                <div><span className="text-slate-500">Recipient:</span> {selectedItem.customerName} &lt;{selectedItem.customerEmail}&gt;</div>
                <div><span className="text-slate-500">Subject:</span> {selectedItem.subject.startsWith('Re:') ? selectedItem.subject : `Re: ${selectedItem.subject}`}</div>
                <div><span className="text-slate-500">Thread:</span> {selectedItem.gmailThreadId || 'New Thread'}</div>
                <div><span className="text-slate-500">Mode:</span> {isEditedByCompany ? 'Edited by Company' : 'AI Generated'}</div>
              </div>

              <div className="p-3 rounded bg-slate-950 border border-slate-800 max-h-40 overflow-y-auto text-[11px] whitespace-pre-wrap font-sans text-slate-200">
                {editedText}
              </div>

              <p className="text-[11px] text-slate-400">
                This will send directly from your connected company Gmail mailbox, preserving RFC 2822 thread continuity. Email quota will be committed upon confirmed success.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-800 pt-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowConfirmSendModal(false)}
                disabled={isSubmitting}
                className="text-xs border-slate-800"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleSend}
                disabled={isSubmitting}
                className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-semibold"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="h-3 w-3 animate-spin mr-1.5" />
                    Sending to Customer...
                  </>
                ) : (
                  <>
                    <Send className="h-3.5 w-3.5 mr-1" />
                    Send to Customer
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Compare Modal */}
      {showCompareModal && selectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-2xl max-w-2xl w-full p-5 space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <RotateCcw className="h-4 w-4 text-cyan-400" />
                <h4 className="text-sm font-semibold text-slate-100">Regenerated Variations History</h4>
              </div>
              <button
                onClick={() => setShowCompareModal(false)}
                className="p-1 rounded text-slate-400 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="overflow-y-auto space-y-3 flex-1 text-xs">
              <div className="p-3 rounded bg-slate-950 border border-slate-800 space-y-1">
                <span className="text-[10px] font-semibold text-indigo-400 uppercase">Original AI Base Draft</span>
                <p className="text-slate-300 font-mono text-[11px] whitespace-pre-wrap">{selectedItem.originalAiDraft}</p>
              </div>

              {selectedItem.regeneratedVersions?.map((reg, idx) => (
                <div key={idx} className="p-3 rounded bg-slate-950 border border-slate-800 space-y-1">
                  <div className="flex items-center justify-between text-[10px] text-slate-500">
                    <span className="font-semibold text-cyan-400 uppercase">Version {idx + 1} ({reg.style})</span>
                    <span>{new Date(reg.timestamp).toLocaleTimeString()}</span>
                  </div>
                  <p className="text-slate-300 font-mono text-[11px] whitespace-pre-wrap">{reg.text || reg.content}</p>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setEditedText(reg.text || reg.content || '');
                      setSendState('Selected');
                      setShowCompareModal(false);
                    }}
                    className="text-[10px] text-cyan-400 hover:text-cyan-300 p-0 h-5"
                  >
                    Load this version into editor <ArrowRight className="h-3 w-3 ml-1" />
                  </Button>
                </div>
              ))}
            </div>

            <div className="flex justify-end border-t border-slate-800 pt-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowCompareModal(false)}
                className="text-xs border-slate-800"
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Reopen Confirmation Dialog */}
      {itemToReopen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-2xl max-w-md w-full p-5 space-y-4">
            <div className="flex items-center gap-2.5 border-b border-slate-800 pb-3">
              <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
                <RotateCcw className="h-5 w-5" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-slate-100">Reopen this approval?</h4>
                <p className="text-xs text-slate-400">Return item to Pending queue</p>
              </div>
            </div>

            <div className="space-y-2 text-xs text-slate-300">
              <p>
                This approval will return to the Pending queue. No message will be sent automatically.
              </p>
              <div className="p-2.5 rounded bg-slate-950 border border-slate-800 font-mono text-[11px] space-y-0.5">
                <div><span className="text-slate-500">Subject:</span> {itemToReopen.subject}</div>
                <div><span className="text-slate-500">Customer:</span> {itemToReopen.customerName} &lt;{itemToReopen.customerEmail}&gt;</div>
                <div><span className="text-slate-500">Thread:</span> {itemToReopen.gmailThreadId || 'N/A'}</div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-800 pt-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setItemToReopen(null)}
                disabled={isReopening}
                className="text-xs border-slate-800 text-slate-300 hover:text-white"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleReopenConfirm}
                disabled={isReopening}
                className="text-xs bg-amber-600 hover:bg-amber-500 text-white font-semibold flex items-center gap-1.5"
              >
                {isReopening ? (
                  <>
                    <RefreshCw className="h-3 w-3 animate-spin" />
                    Reopening...
                  </>
                ) : (
                  <>
                    <RotateCcw className="h-3.5 w-3.5" />
                    Reopen Approval
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
