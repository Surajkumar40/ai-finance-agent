import { useState, useEffect, useRef } from "react";
import Layout from "../components/Layout";
import api from "../api/axios";
import { useAuth } from "../context/AuthContext";

const SUGGESTIONS = [
  "Spent 450 on groceries yesterday",
  "How much did I spend this month?",
  "Where can I cut costs?",
  "Set a 5000 food budget",
];

const pad = n => String(n).padStart(2, "0");
// The user's own calendar date (so "yesterday" is right whatever the server's timezone)
const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// **bold** only; everything else stays plain text (React escapes it, so this is safe)
function RichText({ text }) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    /^\*\*[^*]+\*\*$/.test(part)
      ? <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>
      : <span key={i}>{part}</span>
  );
}

// New replies appear in about 0.7 seconds, like someone typing. Old messages show instantly.
function Typed({ text, animate, onGrow }) {
  const [n, setN] = useState(animate ? 0 : text.length);

  useEffect(() => {
    if (!animate) return;
    const total = text.length;
    const step = Math.max(1, Math.ceil(total / 40));
    const id = setInterval(() => {
      setN(v => {
        const next = Math.min(total, v + step);
        if (next >= total) clearInterval(id);
        return next;
      });
      onGrow?.();
    }, 18);
    return () => clearInterval(id);
  }, [text, animate]); // eslint-disable-line react-hooks/exhaustive-deps

  // when a message stops animating (for example you sent another one), show it in full
  const count = animate ? n : text.length;
  let shown = text.slice(0, count);
  if (count < text.length) {
    // never show half of a **bold** marker while typing
    if (shown.endsWith("*") && !shown.endsWith("**")) shown = shown.slice(0, -1);
    if ((shown.match(/\*\*/g) || []).length % 2) {
      shown = shown.endsWith("**") ? shown.slice(0, -2) : shown + "**";
    }
  }
  return <RichText text={shown} />;
}

export default function AIChatPage() {
  const { user } = useAuth();
  const firstName = (user?.name || "").trim().split(/\s+/)[0];
  const GREETING = {
    role: "assistant",
    text: `Hey${firstName ? " " + firstName : ""}! 👋 Ask me anything about your money, or just tell me what you spent and I'll log it. Like "spent 450 on groceries yesterday".`,
  };
  const [messages, setMessages] = useState([GREETING]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  // Load saved conversation
  useEffect(() => {
    api.get("/agent/history")
      .then(({ data }) => {
        const list = Array.isArray(data) ? data : data.history ?? data.messages ?? [];
        if (list.length) {
          const old = list.map(m => ({ role: m.role, text: m.text ?? m.content }));
          // if you already started typing before history arrived, keep what is on screen
          setMessages(prev => (prev.length > 1 ? prev : [prev[0], ...old]));
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const keepAtBottom = () => bottomRef.current?.scrollIntoView({ behavior: "auto" });

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    setMessages(prev => [...prev, { role: "user", text }]);
    setLoading(true);
    try {
      const { data } = await api.post("/agent/chat", { message: text, today: localToday() });
      const reply = data.reply ?? data.response ?? data.message ?? data.text ?? "Hmm, I drew a blank there. Could you say that again?";
      setMessages(prev => [...prev, { role: "assistant", text: reply, fresh: true }]);
    } catch (err) {
      const detail = err.response?.data?.error || err.response?.data?.message
        || "I couldn't reach the server. Check your connection and try again.";
      setMessages(prev => [...prev, { role: "assistant", text: detail, fresh: true }]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  async function clearChat() {
    try { await api.delete("/agent/history"); } catch { /* ignore */ }
    setMessages([GREETING]);
  }

  const handleKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  return (
    <Layout>
      <div className="max-w-3xl mx-auto flex flex-col h-[calc(100vh-6rem)]">

        {/* Header */}
        <div className="mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center">
              <svg className="w-5 h-5 text-brand-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path d="M12 2a4 4 0 0 1 4 4v1h1a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-1v1a4 4 0 0 1-8 0v-1H7a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1V6a4 4 0 0 1 4-4z"/>
                <circle cx="9" cy="10" r="1" fill="currentColor" stroke="none"/>
                <circle cx="15" cy="10" r="1" fill="currentColor" stroke="none"/>
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">AI Finance Agent</h1>
              <div className="flex items-center gap-1.5 mt-0.5">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-xs text-slate-400 dark:text-slate-500">Online · works from your real transactions</span>
              </div>
            </div>
            <button onClick={clearChat}
              className="ml-auto text-xs px-3 py-1.5 rounded-xl border border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400 hover:border-brand-400 hover:text-brand-500 transition-all">
              Clear chat
            </button>
          </div>
        </div>

        {/* Chat window */}
        <div className="flex-1 overflow-y-auto bg-white dark:bg-[#16161f]
                        border border-slate-100 dark:border-white/5 rounded-2xl p-4 space-y-4 mb-4">
          {messages.map((m, i) => (
            <div key={i} className={`flex gap-3 ${m.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
              {/* Avatar */}
              <div className={`w-8 h-8 rounded-xl flex-shrink-0 flex items-center justify-center text-xs font-bold ${
                m.role === "assistant"
                  ? "bg-brand-500/10 border border-brand-500/20 text-brand-500"
                  : "bg-slate-100 dark:bg-white/10 text-slate-500 dark:text-slate-400"
              }`}>
                {m.role === "assistant" ? "AI" : "U"}
              </div>
              {/* Bubble */}
              <div className={`max-w-[80%] px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words ${
                m.role === "assistant"
                  ? "bg-slate-50 dark:bg-white/5 text-slate-700 dark:text-slate-200 rounded-tl-sm"
                  : "bg-brand-500 text-white rounded-tr-sm"
              }`}>
                {m.role === "assistant"
                  ? <Typed text={m.text} animate={!!m.fresh && i === messages.length - 1} onGrow={keepAtBottom} />
                  : m.text}
              </div>
            </div>
          ))}

          {/* Typing indicator */}
          {loading && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-xl flex-shrink-0 flex items-center justify-center text-xs font-bold bg-brand-500/10 border border-brand-500/20 text-brand-500">
                AI
              </div>
              <div className="bg-slate-50 dark:bg-white/5 px-4 py-3 rounded-2xl rounded-tl-sm flex items-center gap-1">
                {[0,1,2].map(i => (
                  <div key={i} className="w-1.5 h-1.5 rounded-full bg-slate-400 dark:bg-slate-500 animate-bounce"
                    style={{ animationDelay: `${i*0.15}s` }} />
                ))}
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Suggestions */}
        {messages.length <= 1 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {SUGGESTIONS.map(q => (
              <button key={q} onClick={() => { setInput(q); inputRef.current?.focus(); }}
                className="px-3 py-1.5 rounded-xl text-xs font-medium
                           bg-white dark:bg-[#16161f]
                           border border-slate-200 dark:border-white/10
                           text-slate-500 dark:text-slate-400
                           hover:border-brand-400 hover:text-brand-500
                           transition-all">
                {q}
              </button>
            ))}
          </div>
        )}

        {/* Input */}
        <div className="flex gap-3 bg-white dark:bg-[#16161f]
                        border border-slate-200 dark:border-white/10
                        rounded-2xl p-2 shadow-sm focus-within:border-brand-400 dark:focus-within:border-brand-500
                        focus-within:ring-2 focus-within:ring-brand-400/20 transition-all">
          <textarea
            ref={inputRef}
            rows={1}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Ask me anything, or tell me what you spent… (Enter to send)"
            className="flex-1 bg-transparent text-sm text-slate-900 dark:text-white
                       placeholder-slate-400 dark:placeholder-slate-600
                       resize-none focus:outline-none py-2 px-2 leading-relaxed"
          />
          <button onClick={send} disabled={loading || !input.trim()}
            className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0
                       bg-brand-500 hover:bg-brand-600 text-white
                       disabled:opacity-40 disabled:cursor-not-allowed
                       active:scale-95 transition-all self-end shadow-lg shadow-brand-500/25">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path d="M5 12h14M12 5l7 7-7 7"/>
            </svg>
          </button>
        </div>
        <p className="text-center text-xs text-slate-300 dark:text-slate-700 mt-2">
          AI can make mistakes. Verify important financial decisions.
        </p>
      </div>
    </Layout>
  );
}