'use client';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import {
  MessageSquare,
  X,
  Send,
  Loader2,
  AlertCircle,
  Sparkles,
  Bot,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';

interface ChatMessageItem {
  id: string;
  sender: 'client' | 'agent' | 'system';
  text: string;
  options?: string[];
  timestamp?: string;
}

interface WidgetConfig {
  company: {
    id: string;
    name: string;
    logo?: string | null;
  };
  settings: {
    assistantName: string;
    welcomeMessage: string;
    primaryColor: string;
  };
  leadId?: string | null;
  messages?: ChatMessageItem[];
}

function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'v-' + Math.random().toString(36).substring(2, 15) + '-' + Date.now().toString(36);
}

function WidgetChat() {
  const searchParams = useSearchParams();
  const companyId = searchParams.get('companyId');

  const [isOpen, setIsOpen] = React.useState(false);
  const [visitorId, setVisitorId] = React.useState<string>('');
  const [leadId, setLeadId] = React.useState<string | null>(null);
  const [config, setConfig] = React.useState<WidgetConfig | null>(null);
  const [loadingConfig, setLoadingConfig] = React.useState(true);
  const [configError, setConfigError] = React.useState<string | null>(null);

  const [messages, setMessages] = React.useState<ChatMessageItem[]>([]);
  const [inputText, setInputText] = React.useState('');
  const [isSending, setIsSending] = React.useState(false);
  const [chatError, setChatError] = React.useState<string | null>(null);

  const messagesEndRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Set transparent background for parent iframe embedding
  React.useEffect(() => {
    document.documentElement.style.backgroundColor = 'transparent';
    document.body.style.backgroundColor = 'transparent';
    return () => {
      document.documentElement.style.backgroundColor = '';
      document.body.style.backgroundColor = '';
    };
  }, []);

  // 1. Initialize visitor session
  React.useEffect(() => {
    if (!companyId) return;

    const storageKey = `client_ai_widget_${companyId}`;
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.visitorId) {
          setVisitorId(parsed.visitorId);
          if (parsed.leadId) setLeadId(parsed.leadId);
          return;
        }
      }
    } catch {
      // ignore storage parsing error
    }

    const newId = generateUUID();
    setVisitorId(newId);
    try {
      localStorage.setItem(storageKey, JSON.stringify({ visitorId: newId }));
    } catch {
      // ignore storage error
    }
  }, [companyId]);

  // 2. Fetch Widget Configuration & Past History
  const fetchConfig = React.useCallback(async () => {
    if (!companyId || !visitorId) return;

    try {
      setLoadingConfig(true);
      setConfigError(null);

      const res = await fetch(
        `/api/widget/config?companyId=${encodeURIComponent(companyId)}&visitorId=${encodeURIComponent(visitorId)}`
      );
      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.message || json.error || 'Failed to initialize widget.');
      }

      const data: WidgetConfig = json.data;
      setConfig(data);
      if (data.leadId) setLeadId(data.leadId);

      if (data.messages && data.messages.length > 0) {
        setMessages(
          data.messages.map((m) => ({
            ...m,
            sender: m.sender as 'client' | 'agent' | 'system',
          }))
        );
      } else {
        // Show initial greeting
        setMessages([
          {
            id: 'init-greeting',
            sender: 'agent',
            text: data.settings.welcomeMessage,
            options: ['Web Application', 'Mobile App', 'AI / Automation', 'Other Project'],
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          },
        ]);
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        setConfigError(err.message);
      } else {
        setConfigError('Could not load chat settings.');
      }
    } finally {
      setLoadingConfig(false);
    }
  }, [companyId, visitorId]);

  React.useEffect(() => {
    if (companyId && visitorId) {
      fetchConfig();
    }
  }, [companyId, visitorId, fetchConfig]);

  // Auto-scroll message list
  React.useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isSending, isOpen]);

  // Notify parent container to resize iframe when toggling
  const toggleWidget = () => {
    const nextState = !isOpen;
    setIsOpen(nextState);

    if (typeof window !== 'undefined' && window.parent) {
      window.parent.postMessage({ type: 'WIDGET_RESIZE', isOpen: nextState }, '*');
    }

    if (nextState) {
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  };

  // Close widget
  const handleClose = () => {
    setIsOpen(false);
    if (typeof window !== 'undefined' && window.parent) {
      window.parent.postMessage({ type: 'WIDGET_RESIZE', isOpen: false }, '*');
    }
  };

  // Send message
  const handleSendMessage = async (textToSend?: string) => {
    const msg = (textToSend !== undefined ? textToSend : inputText).trim();
    if (!msg || isSending || !companyId || !visitorId) return;

    setChatError(null);
    setInputText('');

    const userMessage: ChatMessageItem = {
      id: `temp-${Date.now()}`,
      sender: 'client',
      text: msg,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsSending(true);

    try {
      const res = await fetch('/api/widget/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId,
          visitorId,
          leadId: leadId || undefined,
          message: msg,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || json.error || 'Failed to send message.');
      }

      const responseData = json.data;
      if (responseData.leadId) {
        setLeadId(responseData.leadId);
        try {
          const storageKey = `client_ai_widget_${companyId}`;
          localStorage.setItem(
            storageKey,
            JSON.stringify({ visitorId, leadId: responseData.leadId })
          );
        } catch {
          // ignore
        }
      }

      const agentMessage: ChatMessageItem = {
        id: responseData.message.id,
        sender: 'agent',
        text: responseData.message.text,
        options: responseData.message.options,
        timestamp: responseData.message.timestamp,
      };

      setMessages((prev) => [...prev, agentMessage]);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setChatError(err.message);
      } else {
        setChatError('Failed to receive response. Please try again.');
      }
    } finally {
      setIsSending(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  if (!companyId) {
    return (
      <div className="flex items-center justify-center p-4 text-xs text-rose-400 bg-slate-900 rounded-lg border border-rose-800">
        Missing companyId parameter.
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col justify-end items-end p-2 sm:p-3 pointer-events-none">
      {/* Floating Chat Window (Visible when open) */}
      {isOpen && (
        <div className="pointer-events-auto flex flex-col w-full h-full sm:w-[390px] sm:h-[590px] bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
          {/* Header */}
          <div className="px-4 py-3.5 bg-gradient-to-r from-slate-950 via-slate-900 to-indigo-950/40 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="relative">
                <div className="w-9 h-9 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                  <Bot className="w-5 h-5" />
                </div>
                <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-500 border-2 border-slate-900 rounded-full" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-white tracking-tight leading-tight">
                  {config?.settings.assistantName || 'AI Discovery Assistant'}
                </h2>
                <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                  <span>{config?.company.name || 'Project Discovery'}</span>
                  <span>•</span>
                  <span className="text-emerald-400 font-medium">Online</span>
                </div>
              </div>
            </div>

            <button
              onClick={handleClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/80 transition-colors"
              aria-label="Close chat"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body / Messages Stream */}
          <div className="flex-1 p-3.5 overflow-y-auto space-y-3.5 bg-slate-950/60">
            {loadingConfig ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-2">
                <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
                <span className="text-xs">Initializing assistant...</span>
              </div>
            ) : configError ? (
              <div className="p-3 rounded-xl bg-rose-950/30 border border-rose-800 text-rose-300 text-xs space-y-2">
                <div className="flex items-center gap-2 font-medium">
                  <AlertCircle className="w-4 h-4 text-rose-400" />
                  <span>Connection Notice</span>
                </div>
                <p>{configError}</p>
                <button
                  onClick={fetchConfig}
                  className="flex items-center gap-1 text-[11px] text-indigo-400 hover:underline pt-1"
                >
                  <RefreshCw className="w-3 h-3" /> Retry connection
                </button>
              </div>
            ) : (
              <>
                {messages.map((m) => {
                  const isAgent = m.sender === 'agent';
                  return (
                    <div
                      key={m.id}
                      className={`flex flex-col ${isAgent ? 'items-start' : 'items-end'} space-y-1.5`}
                    >
                      <div className="flex items-end gap-2 max-w-[88%]">
                        {isAgent && (
                          <div className="w-6 h-6 rounded-lg bg-indigo-950 border border-indigo-500/30 flex items-center justify-center text-indigo-400 text-xs shrink-0 mb-1">
                            <Sparkles className="w-3.5 h-3.5" />
                          </div>
                        )}
                        <div
                          className={`rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed ${
                            isAgent
                              ? 'bg-slate-800/90 text-slate-200 border border-slate-700/60 rounded-bl-sm'
                              : 'bg-gradient-to-r from-indigo-600 to-indigo-700 text-white rounded-br-sm shadow-md'
                          }`}
                        >
                          <p className="whitespace-pre-wrap">{m.text}</p>
                        </div>
                      </div>

                      {/* Quick Reply Options */}
                      {isAgent && m.options && m.options.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 pl-8 pt-0.5">
                          {m.options.map((opt, idx) => (
                            <button
                              key={idx}
                              onClick={() => handleSendMessage(opt)}
                              disabled={isSending}
                              className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-slate-800/70 border border-indigo-500/30 text-indigo-300 hover:bg-indigo-600 hover:text-white transition-all duration-150 disabled:opacity-50"
                            >
                              {opt}
                            </button>
                          ))}
                        </div>
                      )}

                      {m.timestamp && (
                        <span className="text-[10px] text-slate-500 px-1">
                          {m.timestamp}
                        </span>
                      )}
                    </div>
                  );
                })}

                {/* Typing Indicator */}
                {isSending && (
                  <div className="flex items-center gap-2 pl-2 text-slate-400">
                    <div className="w-6 h-6 rounded-lg bg-indigo-950 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    </div>
                    <div className="bg-slate-800/80 border border-slate-700/60 rounded-2xl rounded-bl-sm px-3.5 py-2 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" />
                      <span
                        className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce"
                        style={{ animationDelay: '0.15s' }}
                      />
                      <span
                        className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce"
                        style={{ animationDelay: '0.3s' }}
                      />
                    </div>
                  </div>
                )}

                {/* In-Chat Error Message */}
                {chatError && (
                  <div className="p-2.5 rounded-lg bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0 text-rose-400" />
                      {chatError}
                    </span>
                    <button
                      onClick={() => handleSendMessage()}
                      className="text-[11px] text-rose-400 hover:underline font-medium"
                    >
                      Retry
                    </button>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </>
            )}
          </div>

          {/* Footer Input Bar */}
          <div className="p-3 bg-slate-900 border-t border-slate-800/80">
            <div className="relative flex items-center">
              <input
                ref={inputRef}
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type your reply or question..."
                disabled={isSending || Boolean(configError)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-3.5 pr-11 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 disabled:opacity-50 transition-colors"
              />
              <button
                onClick={() => handleSendMessage()}
                disabled={!inputText.trim() || isSending || Boolean(configError)}
                className="absolute right-1.5 p-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-40 disabled:hover:bg-indigo-600 transition-colors"
                aria-label="Send message"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="mt-1.5 flex items-center justify-between text-[10px] text-slate-500 px-1">
              <span className="flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3 text-indigo-400" /> End-to-end requirement scoping
              </span>
              <span>Powered by FillFlow</span>
            </div>
          </div>
        </div>
      )}

      {/* Floating Toggle Button (Always present at bottom right) */}
      <button
        onClick={toggleWidget}
        className="pointer-events-auto mt-2 w-14 h-14 rounded-full bg-gradient-to-tr from-indigo-700 via-indigo-600 to-indigo-500 text-white shadow-lg hover:shadow-indigo-500/25 hover:scale-105 active:scale-95 transition-all duration-200 flex items-center justify-center relative border border-indigo-400/30"
        aria-label={isOpen ? 'Close chat' : 'Open project discovery chat'}
      >
        {isOpen ? (
          <X className="w-6 h-6 animate-in spin-in-180 duration-150" />
        ) : (
          <>
            <MessageSquare className="w-6 h-6" />
            <span className="absolute top-0 right-0 w-3.5 h-3.5 bg-emerald-500 border-2 border-slate-900 rounded-full animate-pulse" />
          </>
        )}
      </button>
    </div>
  );
}

export default function WidgetPage() {
  return (
    <React.Suspense
      fallback={
        <div className="w-full h-full flex items-center justify-center bg-transparent">
          <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
        </div>
      }
    >
      <WidgetChat />
    </React.Suspense>
  );
}
