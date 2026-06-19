import React, { useEffect, useRef, useState } from 'react';
import { Bot, Loader2, Send, Sparkles, X } from 'lucide-react';
import { AiMessage, sendAiMessage } from '../api/ai';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

// Safe, read-only example prompts — no hardcoded fake people that would create
// real records if clicked.
const SUGGESTIONS = [
  'Show today\'s schedule',
  'List pending appointments',
  'How many appointments are booked this week?',
  'Show all doctors and their specialities',
];

export default function AiAssistant() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', content: trimmed };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setError(null);
    setLoading(true);

    try {
      const res = await sendAiMessage({ message: trimmed, conversationId });
      setConversationId(res.conversationId);
      setMessages(prev => [
        ...prev,
        { id: res.conversationId + Date.now(), role: 'assistant', content: res.message }
      ]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send(input);
    }
  };

  const formatMessage = (content: string) => {
    return content.split('\n').map((line, i) => (
      <span key={i}>
        {line}
        {i < content.split('\n').length - 1 && <br />}
      </span>
    ));
  };

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(o => !o)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg flex items-center justify-center transition-all duration-200 hover:scale-105 active:scale-95"
        title="AI Admin Assistant"
      >
        {open ? <X size={22} /> : <Sparkles size={22} />}
      </button>

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-24 right-6 z-50 w-[380px] max-h-[600px] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden">

          {/* Header */}
          <div className="bg-indigo-600 px-4 py-3 flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
              <Bot size={18} className="text-white" />
            </div>
            <div>
              <p className="text-white font-semibold text-sm">AI Admin Assistant</p>
              <p className="text-indigo-200 text-xs">Powered by GPT-4.1-mini</p>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 min-h-0 max-h-[420px]">
            {messages.length === 0 && (
              <div className="space-y-4">
                <div className="flex gap-2">
                  <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center shrink-0 mt-0.5">
                    <Bot size={14} className="text-indigo-600" />
                  </div>
                  <div className="bg-slate-50 rounded-2xl rounded-tl-sm px-3 py-2 text-sm text-slate-700 max-w-[280px]">
                    Hi! I can help you manage doctors, patients, appointments, and the waitlist. What would you like to do?
                  </div>
                </div>
                <div className="pl-9 flex flex-wrap gap-2">
                  {SUGGESTIONS.map(s => (
                    <button
                      key={s}
                      onClick={() => void send(s)}
                      className="text-xs bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-full px-3 py-1.5 transition-colors"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map(msg => (
              <div
                key={msg.id}
                className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.role === 'assistant' && (
                  <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center shrink-0 mt-0.5">
                    <Bot size={14} className="text-indigo-600" />
                  </div>
                )}
                <div
                  className={`rounded-2xl px-3 py-2 text-sm max-w-[280px] ${
                    msg.role === 'user'
                      ? 'bg-indigo-600 text-white rounded-tr-sm'
                      : 'bg-slate-50 text-slate-700 rounded-tl-sm'
                  }`}
                >
                  {formatMessage(msg.content)}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex gap-2 items-start">
                <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
                  <Bot size={14} className="text-indigo-600" />
                </div>
                <div className="bg-slate-50 rounded-2xl rounded-tl-sm px-3 py-2">
                  <Loader2 size={16} className="text-indigo-500 animate-spin" />
                </div>
              </div>
            )}

            {error && (
              <div className="mx-2 px-3 py-2 bg-red-50 border border-red-100 rounded-xl text-xs text-red-600">
                {error}
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="px-3 py-3 border-t border-slate-100 flex gap-2 items-center">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Ask me anything..."
              disabled={loading}
              className="flex-1 text-sm bg-slate-50 rounded-xl px-3 py-2 outline-none border border-slate-200 focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200 disabled:opacity-50 transition"
            />
            <button
              onClick={() => void send(input)}
              disabled={loading || !input.trim()}
              className="w-9 h-9 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white flex items-center justify-center transition-colors"
            >
              <Send size={15} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
