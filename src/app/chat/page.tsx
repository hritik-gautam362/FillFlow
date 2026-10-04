'use client';

import * as React from 'react';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { ChatMessage } from '@/types';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Bot,
  Send,
  Sparkles,
  MessageSquare,
  Globe,
  FileSpreadsheet,
  CheckCircle2,
  Cpu,
  Layers,
  DollarSign,
  Calendar,
  ArrowRight,
  RefreshCw,
} from 'lucide-react';
import Link from 'next/link';

interface ExtractedScopeState {
  score: number;
  projectType: string;
  budget: string;
  timeline: string;
  techStack: string[];
  features: string[];
}

const DEFAULT_EXTRACTED_SCOPE: ExtractedScopeState = {
  score: 0,
  projectType: 'Awaiting project details...',
  budget: 'Gathering budget...',
  timeline: 'Evaluating duration...',
  techStack: [],
  features: [],
};

export default function ChatPage() {
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = React.useState('');
  const [isTyping, setIsTyping] = React.useState(false);
  const [activeChannel, setActiveChannel] = React.useState<'web' | 'whatsapp'>('web');
  const [leadId, setLeadId] = React.useState<string | null>(null);
  const [extractedScope, setExtractedScope] = React.useState<ExtractedScopeState>(DEFAULT_EXTRACTED_SCOPE);

  const messagesEndRef = React.useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  React.useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  const handleSendMessage = async (textToSend?: string) => {
    const text = textToSend || inputValue.trim();
    if (!text || isTyping) return;

    const newClientMsg: ChatMessage = {
      id: `client-${Date.now()}`,
      sender: 'client',
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, newClientMsg]);
    if (!textToSend) setInputValue('');
    setIsTyping(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: text,
          leadId: leadId || undefined,
          channel: activeChannel === 'whatsapp' ? 'whatsapp' : 'web_chat',
        }),
      });

      const result = await response.json();

      if (response.ok && result.success && result.data) {
        const { message: agentMsg, extractedScope: newScope, leadId: returnedLeadId } = result.data;
        if (returnedLeadId) setLeadId(returnedLeadId);
        if (newScope) setExtractedScope(newScope);

        const newAgentMsg: ChatMessage = {
          id: agentMsg.id || `agent-${Date.now()}`,
          sender: 'agent',
          text: agentMsg.text,
          options: agentMsg.options,
          timestamp: agentMsg.timestamp || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };

        setMessages((prev) => [...prev, newAgentMsg]);
      } else {
        const errorMsg = result.error || 'Unable to connect to AI discovery agent.';
        setMessages((prev) => [
          ...prev,
          {
            id: `system-error-${Date.now()}`,
            sender: 'agent',
            text: `⚠️ Discovery Notice: ${errorMsg}. Please try sending your message again.`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          },
        ]);
      }
    } catch (err) {
      console.error('[ChatPage] Error sending message:', err);
      setMessages((prev) => [
        ...prev,
        {
          id: `system-error-${Date.now()}`,
          sender: 'agent',
          text: '⚠️ Network connection issue. Please check your connection and try again.',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleResetChat = () => {
    setMessages([]);
    setLeadId(null);
    setExtractedScope(DEFAULT_EXTRACTED_SCOPE);
  };

  const quickPrompts = [
    'I want to build a food delivery mobile app',
    'Target budget is $30,000 with launch needed in 8 weeks',
    'We also need a HIPAA compliant patient portal for healthcare',
  ];

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100 selection:bg-indigo-500 selection:text-white">
      <Navbar />

      <main className="flex-1 py-8 px-4 sm:px-6 lg:px-8 mx-auto max-w-7xl w-full space-y-6">
        
        {/* Page Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
              <MessageSquare className="h-6 w-6 text-emerald-400" />
              Client Requirement Onboarding Demo
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              Simulate a prospect explaining their project. The AI Agent extracts scope, budget, and generates a structured brief in real time.
            </p>
          </div>

          {/* Channel Selector */}
          <div className="flex items-center gap-3">
            <div className="flex items-center rounded-xl bg-slate-900 p-1 border border-slate-800 text-xs">
              <button
                onClick={() => setActiveChannel('web')}
                className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${
                  activeChannel === 'web'
                    ? 'bg-indigo-600 text-white font-medium shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Globe className="h-3.5 w-3.5" /> Web Chat Widget
              </button>
              <button
                onClick={() => setActiveChannel('whatsapp')}
                className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${
                  activeChannel === 'whatsapp'
                    ? 'bg-emerald-600 text-white font-medium shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <MessageSquare className="h-3.5 w-3.5" /> WhatsApp Business API
              </button>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={handleResetChat}
              className="text-xs flex items-center gap-1 border-slate-800 text-slate-400 hover:text-white"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Reset Chat
            </Button>
          </div>
        </div>

        {/* Grid Layout: Left Chat Interface | Right Live Requirement Sidebar */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* Left: Chat Canvas */}
          <div className="lg:col-span-7">
            <Card className="border-slate-800 bg-slate-900/90 shadow-2xl flex flex-col h-[650px] overflow-hidden">
              
              {/* Chat Window Top Bar */}
              <div className="p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 text-white">
                    <Bot className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-white text-sm">ApexByte AI Assistant</h3>
                    <p className="text-[10px] text-emerald-400 flex items-center gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      Active — 24/7 Automated Onboarding
                    </p>
                  </div>
                </div>

                <Badge variant={activeChannel === 'whatsapp' ? 'success' : 'default'} className="text-[10px]">
                  {activeChannel === 'whatsapp' ? 'WhatsApp Mode' : 'Web Chat Widget'}
                </Badge>
              </div>

              {/* Message Log */}
              <div className="flex-1 p-4 overflow-y-auto space-y-4 bg-slate-950/40">
                {messages.length === 0 && !isTyping && (
                  <div className="h-full flex flex-col items-center justify-center text-center p-8">
                    <div className="h-12 w-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mb-3">
                      <Bot className="h-6 w-6" />
                    </div>
                    <h4 className="text-sm font-semibold text-white mb-1">Start Requirement Discovery</h4>
                    <p className="text-xs text-slate-400 max-w-sm">
                      Describe your project vision, features, target audience, budget, or timeline below to begin automated onboarding.
                    </p>
                  </div>
                )}
                {messages.map((msg) => {
                  const isAgent = msg.sender === 'agent';
                  return (
                    <div
                      key={msg.id}
                      className={`flex flex-col ${isAgent ? 'items-start' : 'items-end'}`}
                    >
                      <div className="flex items-center gap-2 mb-1 px-1">
                        <span className="text-[10px] text-slate-500">{msg.sender === 'agent' ? 'AI Assistant' : 'Client (You)'}</span>
                        <span className="text-[10px] text-slate-600">{msg.timestamp}</span>
                      </div>

                      <div
                        className={`max-w-[85%] p-3.5 rounded-2xl text-xs leading-relaxed ${
                          isAgent
                            ? 'bg-slate-900 border border-slate-800 text-slate-200 rounded-tl-sm'
                            : 'bg-indigo-600 text-white rounded-tr-sm shadow-md shadow-indigo-600/20'
                        }`}
                      >
                        {msg.text}

                        {/* Quick Interactive Options if provided */}
                        {msg.options && (
                          <div className="mt-3 flex flex-wrap gap-2 pt-2 border-t border-slate-800">
                            {msg.options.map((opt, i) => (
                              <button
                                key={i}
                                onClick={() => handleSendMessage(opt)}
                                className="text-[11px] px-2.5 py-1 rounded-lg bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/20 transition-colors"
                              >
                                {opt}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* Typing Indicator */}
                {isTyping && (
                  <div className="flex items-center gap-2 p-3 rounded-xl bg-slate-900/60 border border-slate-800 w-fit text-xs text-slate-400">
                    <Bot className="h-4 w-4 text-indigo-400 animate-spin" />
                    <span>AI Assistant is analyzing requirements...</span>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Quick Prompts bar */}
              <div className="px-4 py-2 bg-slate-950 border-t border-slate-800/80 overflow-x-auto flex items-center gap-2">
                <span className="text-[10px] font-semibold text-slate-400 shrink-0">Quick Prompts:</span>
                {quickPrompts.map((prompt, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSendMessage(prompt)}
                    className="text-[10px] whitespace-nowrap px-2.5 py-1 rounded-md bg-slate-900 border border-slate-800 text-slate-300 hover:border-indigo-500/50 hover:text-white transition-colors"
                  >
                    + {prompt}
                  </button>
                ))}
              </div>

              {/* Chat Input Field */}
              <div className="p-3 bg-slate-950 border-t border-slate-800 flex items-center gap-2">
                <Input
                  type="text"
                  placeholder="Type your project requirement details..."
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                  className="bg-slate-900 border-slate-800 text-xs"
                />
                <Button
                  variant="glow"
                  size="sm"
                  onClick={() => handleSendMessage()}
                  className="shrink-0 flex items-center gap-1.5"
                >
                  <Send className="h-3.5 w-3.5" /> Send
                </Button>
              </div>

            </Card>
          </div>

          {/* Right: Live AI Extracted Requirement Sidebar */}
          <div className="lg:col-span-5 space-y-4">
            <Card className="border-indigo-500/30 bg-slate-900/90 p-5 space-y-6 shadow-xl">
              
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-purple-400" />
                  <h3 className="font-semibold text-white text-sm">Live AI Requirement Extractor</h3>
                </div>
                <Badge variant="success" className="text-[10px]">
                  Real-time Sync
                </Badge>
              </div>

              {/* Qualification Score Gauge */}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">Lead Qualification Score</span>
                  <span className="font-bold text-emerald-400 font-mono text-sm">
                    {extractedScope.score} / 100
                  </span>
                </div>
                <div className="w-full h-2.5 rounded-full bg-slate-900 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-emerald-400 transition-all duration-500"
                    style={{ width: `${extractedScope.score}%` }}
                  />
                </div>
                <span className="text-[10px] text-slate-500 block">
                  Score updates automatically as client provides budget & technical scope.
                </span>
              </div>

              {/* Extracted Fields */}
              <div className="space-y-4 text-xs">
                
                {/* Project Category */}
                <div className="space-y-1">
                  <span className="text-slate-400 flex items-center gap-1 text-[11px]">
                    <Layers className="h-3.5 w-3.5 text-indigo-400" /> Project Scope
                  </span>
                  <p className="font-semibold text-white p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                    {extractedScope.projectType}
                  </p>
                </div>

                {/* Commercial Specs */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-1">
                    <span className="text-[10px] text-slate-400 flex items-center gap-1">
                      <DollarSign className="h-3 w-3 text-emerald-400" /> Target Budget
                    </span>
                    <span className="font-bold text-white text-xs block">{extractedScope.budget}</span>
                  </div>

                  <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-1">
                    <span className="text-[10px] text-slate-400 flex items-center gap-1">
                      <Calendar className="h-3 w-3 text-indigo-400" /> Timeline
                    </span>
                    <span className="font-bold text-white text-xs block">{extractedScope.timeline}</span>
                  </div>
                </div>

                {/* Tech Stack Chips */}
                <div className="space-y-1.5">
                  <span className="text-slate-400 flex items-center gap-1 text-[11px]">
                    <Cpu className="h-3.5 w-3.5 text-purple-400" /> Extracted Tech Stack
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {extractedScope.techStack.map((tech, idx) => (
                      <Badge key={idx} variant="secondary" className="text-[10px] bg-slate-950 border-slate-800">
                        {tech}
                      </Badge>
                    ))}
                  </div>
                </div>

                {/* Features List */}
                <div className="space-y-1.5">
                  <span className="text-slate-400 flex items-center gap-1 text-[11px]">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> Captured Core Features
                  </span>
                  <div className="space-y-1 p-3 rounded-lg bg-slate-950 border border-slate-800 text-[11px] text-slate-300">
                    {extractedScope.features.map((feat, idx) => (
                      <div key={idx} className="flex items-center gap-1.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-indigo-400" />
                        <span>{feat}</span>
                      </div>
                    ))}
                  </div>
                </div>

              </div>

              {/* Action Button to Dashboard */}
              <div className="pt-2">
                <Link href="/dashboard">
                  <Button variant="glow" size="sm" className="w-full flex items-center justify-center gap-2">
                    <FileSpreadsheet className="h-4 w-4" />
                    View Generated Brief in Dashboard
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              </div>

            </Card>
          </div>

        </div>

      </main>

      <Footer />
    </div>
  );
}
