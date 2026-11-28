import React, { useEffect, useRef, useState } from 'react';
import { Bot, Loader2, Maximize2, Mic, MicOff, Minimize2, Send, Sparkles, Trash2, X } from 'lucide-react';
import type { UserProfile, VideoItem } from '../types';
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
  hideFab?: boolean;
  activeWatchVideo?: VideoItem | null;
}> = ({ user, hideOnMobile = false, hideFab = false, activeWatchVideo = null }) => {
  const [open, setOpen] = useState(false);
  const [fabCompact, setFabCompact] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [selectedRole, setSelectedRole] = useState<ChatRole>('general');
  const [messages, setMessages] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [listening, setListening] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<{ stop: () => void } | null>(null);

  useEffect(() => {
    if (open && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [open, messages.length, loading]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
    };
  }, []);

  const toggleVoiceInput = () => {
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }
    const win = window as unknown as {
      SpeechRecognition?: new () => {
        lang: string;
        interimResults: boolean;
        onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
        onerror: () => void;
        onend: () => void;
        start: () => void;
        stop: () => void;
      };
      webkitSpeechRecognition?: new () => {
        lang: string;
        interimResults: boolean;
        onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
        onerror: () => void;
        onend: () => void;
        start: () => void;
        stop: () => void;
      };
    };
    const Rec = win.SpeechRecognition || win.webkitSpeechRecognition;
    if (!Rec) {
      setError('Voice input is not supported in this browser. Type your question below.');
      return;
    }
    try {
      const rec = new Rec();
      rec.lang = 'en-IN';
      rec.interimResults = false;
      rec.onresult = (e) => {
        const transcript = e.results?.[0]?.[0]?.transcript?.trim();
        if (transcript) {
          setInput((prev) => (prev ? `${prev} ${transcript}` : transcript));
        }
      };
      rec.onerror = () => setListening(false);
      rec.onend = () => setListening(false);
      recognitionRef.current = rec;
      setListening(true);
      rec.start();
    } catch {
      setListening(false);
    }
  };

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
          videoContext: activeWatchVideo
            ? {
                id: activeWatchVideo.id,
                title: activeWatchVideo.title,
                channelName: activeWatchVideo.channelName,
                category: activeWatchVideo.category,
                language: activeWatchVideo.language,
                description: activeWatchVideo.description,
              }
            : null,
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
      {!open && !hideFab && (
        <div
          className={`fixed bottom-20 md:bottom-6 right-4 md:right-6 z-40 items-center gap-1.5 ${
            hideOnMobile ? 'hidden md:flex' : 'flex'
          }`}
        >
          {!fabCompact && (
            <button
              type="button"
              onClick={() => setFabCompact(true)}
              aria-label="Minimize Ask AI button"
              title="Minimize"
              className="w-6 h-6 rounded-full bg-black/50 text-white/80 hover:text-white flex items-center justify-center text-xs cursor-pointer backdrop-blur-xs"
            >
              <X className="w-3 h-3" />
            </button>
          )}
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Ask DopTube AI"
            className="p-[1.5px] rounded-full bg-gradient-to-r from-[#38bdf8] via-[#818cf8] to-[#ec4899] shadow-[0_8px_28px_rgba(56,189,248,0.28)] cursor-pointer hover:scale-[1.03] active:scale-[0.98] transition-all"
          >
            {fabCompact ? (
              <span className="w-11 h-11 rounded-full bg-[#090e24]/95 backdrop-blur-md text-white flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-[#38bdf8] fill-current" />
              </span>
            ) : (
              <span className="h-11 px-3 sm:px-4 rounded-full bg-[#090e24]/95 backdrop-blur-md text-white font-semibold text-[15px] flex items-center gap-2">
                <span className="relative inline-flex items-center justify-center">
                  <Mic className="w-[18px] h-[18px] text-[#e2e8f0]" />
                  <Sparkles className="w-2.5 h-2.5 text-[#38bdf8] absolute -top-1 -right-1 fill-current" />
                </span>
                <span className="hidden sm:inline">Ask</span>
              </span>
            )}
          </button>
        </div>
      )}

      {open && (
        <section
          role="dialog"
          aria-label="DopTube AI Assistant"
          className={`fixed bottom-4 md:bottom-6 right-4 md:right-6 z-50 h-[520px] max-h-[82dvh] rounded-2xl bg-[var(--dt-surface)] border border-[var(--dt-border)] shadow-2xl flex flex-col overflow-hidden transition-all ${
            expanded ? 'w-[calc(100vw-2rem)] sm:w-[540px] h-[620px]' : 'w-[calc(100vw-2rem)] sm:w-[400px]'
          }`}
        >
          {/* Header */}
          <div className="px-4 py-3 border-b border-[var(--dt-border)] flex items-center justify-between gap-2 bg-[var(--dt-bg)]/70">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="w-8 h-8 rounded-full jio-gradient text-white flex items-center justify-center shrink-0">
                <Bot className="w-4 h-4" />
              </span>
              <div className="min-w-0">
                <h2 className="text-sm font-bold truncate">DopTube AI</h2>
                <p className="text-[11px] text-[var(--dt-text-muted)] truncate">
                  {activeWatchVideo
                    ? `Context: ${activeWatchVideo.title}`
                    : user
                    ? `Tailored for ${user.name}`
                    : activeRoleMeta.hint}
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
                  className="p-1.5 rounded-full hover:bg-[var(--dt-surface-hover)] text-[var(--dt-text-muted)] cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                aria-label={expanded ? 'Collapse assistant width' : 'Expand assistant width'}
                title={expanded ? 'Compact size' : 'Expand'}
                className="hidden sm:flex p-1.5 rounded-full hover:bg-[var(--dt-surface-hover)] text-[var(--dt-text-muted)] cursor-pointer"
              >
                {expanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close DopTube AI Assistant"
                className="p-1.5 rounded-full hover:bg-[var(--dt-surface-hover)] cursor-pointer"
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
            <button
              type="button"
              onClick={toggleVoiceInput}
              aria-label={listening ? 'Stop voice input' : 'Start voice input'}
              title={listening ? 'Listening...' : 'Voice input'}
              className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 cursor-pointer transition-colors ${
                listening
                  ? 'bg-rose-500 text-white animate-pulse'
                  : 'bg-[#eff3f4] dark:bg-[#16181c] text-[#536471] dark:text-[#9ca3af] hover:text-[#0f1419] dark:hover:text-white'
              }`}
            >
              {listening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>
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
