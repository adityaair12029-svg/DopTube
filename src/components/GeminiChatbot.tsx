import React, { useEffect, useRef, useState } from 'react';
import { Bot, Loader2, Send, Sparkles, Trash2, X } from 'lucide-react';
import type { UserProfile } from '../types';
import { apiFetch } from '../lib/api';

type ChatRole = 'general' | 'fast' | 'creator' | 'discovery';

interface ChatTurn {
  id: string;
  role: 'user' | 'model';
  text: string;
}

const ROLE_OPTIONS: Array<{ id: ChatRole; label: string; hint: string }> = [
  { id: 'general', label: 'Assistant', hint: 'Balanced answers for DopTube viewers & creators' },
  { id: 'fast', label: 'Quick Q&A', hint: 'Fast, crisp 1–3 sentence answers' },
  { id: 'creator', label: 'Creator Coach', hint: 'Hooks, titles, thumbnails & Shorts growth' },
  { id: 'discovery', label: 'Discovery', hint: 'Find Indian topics, search ideas & playlists' },
];

const STARTER_PROMPTS: Record<ChatRole, string[]> = {
  general: [
    'How does DopTube personalize my home feed?',
    'Suggest good Indian science & tech creators to search',
  ],
  fast: [
    'How do I upload a Short on DopTube?',
    'What languages can I filter videos by?',
  ],
  creator: [
    'Give me 3 strong Hindi/English hook ideas for a tech video',
    'How can I improve Shorts retention in the first 3 seconds?',
  ],
  discovery: [
    'Suggest search topics for cricket highlights and analysis',
    'Recommend calm study music & coding playlists',
  ],
};

export const GeminiChatbot: React.FC<{
  user: UserProfile | null;
  hideOnMobile?: boolean;
}> = ({ user, hideOnMobile = false }) => {
  const [open, setOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState<ChatRole>('general');
  const [messages, setMessages] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [open, messages.length, loading]);

  const sendMessage = async (textOverride?: string) => {
    const clean = (textOverride ?? input).trim();
    if (!clean || loading) return;

    setError('');
    if (!textOverride) setInput('');

    const userTurn: ChatTurn = {
      id: `u_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      role: 'user',
      text: clean,
    };
    const nextHistory = [...messages, userTurn];
    setMessages(nextHistory);
    setLoading(true);

    try {
      const res = await apiFetch<{ reply: string; role: ChatRole }>('/api/ai/chat', {
        method: 'POST',
        body: JSON.stringify({
          message: clean,
          role: selectedRole,
          history: messages.slice(-16).map((m) => ({ role: m.role, text: m.text })),
        }),
      });
      setMessages((prev) => [
        ...prev,
        {
          id: `m_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          role: 'model',
          text: res.reply,
        },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to reach DopTube AI right now.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void sendMessage();
  };

  const activeRoleMeta = ROLE_OPTIONS.find((r) => r.id === selectedRole) ?? ROLE_OPTIONS[0];

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open DopTube AI Assistant"
          className={`fixed bottom-20 md:bottom-6 right-4 md:right-6 z-40 h-12 px-4 rounded-full jio-gradient text-white font-bold text-sm shadow-xl shadow-blue-600/30 flex items-center gap-2 cursor-pointer hover:brightness-110 transition-all ${
            hideOnMobile ? 'hidden md:flex' : 'flex'
          }`}
        >
          <Sparkles className="w-4 h-4" />
          <span>DopTube AI</span>
        </button>
      )}

      {open && (
        <section
          role="dialog"
          aria-label="DopTube AI Assistant"
          className="fixed bottom-4 md:bottom-6 right-4 md:right-6 z-50 w-[calc(100vw-2rem)] sm:w-[400px] h-[520px] max-h-[82dvh] rounded-2xl bg-white dark:bg-[#0b0f19] border border-[#e5e7eb] dark:border-[#2f3336] shadow-2xl flex flex-col overflow-hidden"
        >
          {/* Header */}
          <div className="px-4 py-3 border-b border-[#e5e7eb] dark:border-[#1f2937] flex items-center justify-between gap-2 bg-[#eff3f4]/60 dark:bg-black/60">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="w-8 h-8 rounded-full jio-gradient text-white flex items-center justify-center shrink-0">
                <Bot className="w-4 h-4" />
              </span>
              <div className="min-w-0">
                <h2 className="text-sm font-bold truncate">DopTube AI</h2>
                <p className="text-[11px] text-[#536471] dark:text-[#71767b] truncate">
                  {user ? `Tailored for ${user.name}` : activeRoleMeta.hint}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {messages.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setMessages([]);
                    setError('');
                  }}
                  aria-label="Clear chat history"
                  title="Clear chat"
                  className="p-1.5 rounded-full hover:bg-[#e5e7eb] dark:hover:bg-[#1c2333] text-[#536471] dark:text-[#71767b] cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close DopTube AI Assistant"
                className="p-1.5 rounded-full hover:bg-[#e5e7eb] dark:hover:bg-[#1c2333] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Role Switcher */}
          <div className="px-3 py-2 border-b border-[#e5e7eb] dark:border-[#1f2937] flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            {ROLE_OPTIONS.map((roleOpt) => {
              const active = selectedRole === roleOpt.id;
              return (
                <button
                  key={roleOpt.id}
                  type="button"
                  onClick={() => setSelectedRole(roleOpt.id)}
                  className={`h-7 px-3 rounded-full text-xs font-semibold whitespace-nowrap cursor-pointer transition-colors ${
                    active
                      ? 'jio-gradient text-white'
                      : 'bg-[#eff3f4] dark:bg-[#16181c] text-[#536471] dark:text-[#9ca3af] hover:text-[#0f1419] dark:hover:text-white'
                  }`}
                >
                  {roleOpt.label}
                </button>
              );
            })}
          </div>

          {/* Scrollable Message Thread */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-3.5 space-y-3">
            {messages.length === 0 ? (
              <div className="space-y-3 pt-2">
                <div className="p-3.5 rounded-2xl bg-[#eff3f4] dark:bg-[#16181c] border border-[#e5e7eb] dark:border-[#1f2937] text-xs text-[#536471] dark:text-[#9ca3af]">
                  <p className="font-semibold text-[#0f1419] dark:text-[#e7e9ea] mb-1">
                    {activeRoleMeta.label} mode
                  </p>
                  <p>{activeRoleMeta.hint}</p>
                </div>
                <div className="space-y-1.5">
                  <p className="text-[11px] font-semibold text-[#536471] dark:text-[#71767b] px-1">
                    Try asking
                  </p>
                  {STARTER_PROMPTS[selectedRole].map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => void sendMessage(prompt)}
                      className="w-full text-left px-3 py-2 rounded-xl bg-white dark:bg-[#111827] border border-[#e5e7eb] dark:border-[#1f2937] hover:border-[#2563eb] text-xs font-medium cursor-pointer transition-colors"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed whitespace-pre-wrap ${
                      msg.role === 'user'
                        ? 'jio-gradient text-white rounded-br-sm'
                        : 'bg-[#eff3f4] dark:bg-[#16181c] border border-[#e5e7eb] dark:border-[#1f2937] text-[#0f1419] dark:text-[#e7e9ea] rounded-bl-sm'
                    }`}
                  >
                    {msg.text}
                  </div>
                </div>
              ))
            )}

            {loading && (
              <div className="flex justify-start">
                <div className="px-3.5 py-2.5 rounded-2xl bg-[#eff3f4] dark:bg-[#16181c] border border-[#e5e7eb] dark:border-[#1f2937] text-xs text-[#536471] dark:text-[#9ca3af] inline-flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-[#2563eb]" />
                  <span>Thinking...</span>
                </div>
              </div>
            )}

            {error && (
              <div className="px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/30 text-red-500 text-xs">
                {error}
              </div>
            )}
          </div>

          {/* Input Bar */}
          <form
            onSubmit={handleSubmit}
            className="p-3 border-t border-[#e5e7eb] dark:border-[#1f2937] flex items-center gap-2 bg-white dark:bg-[#0b0f19]"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={`Ask ${activeRoleMeta.label}...`}
              aria-label="Message DopTube AI"
              disabled={loading}
              className="flex-1 h-9 px-3.5 rounded-full bg-[#eff3f4] dark:bg-[#16181c] border border-[#e5e7eb] dark:border-[#2f3336] text-xs focus:outline-none focus:border-[#2563eb]"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              aria-label="Send message"
              className="w-9 h-9 rounded-full jio-gradient text-white flex items-center justify-center disabled:opacity-45 cursor-pointer shrink-0"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </section>
      )}
    </>
  );
};
