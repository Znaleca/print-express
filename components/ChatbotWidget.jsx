"use client";

import { useState } from "react";
import { MessageSquare, X, Send, Bot } from "lucide-react";

const QUICK_ANSWERS = {
  pricing: "Pricing depends on the business and service. Browse shops on the map to compare rates.",
  upload: "You can upload PDF, PNG, JPG or AI files during checkout — each upload creates a versioned proof.",
  track: "Log in and visit the Track Order page with your Order ID to see real-time status.",
  default: "I'm your Print Assistant! Ask me about pricing, file uploads, or order tracking.",
};

export default function ChatbotWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    { id: 1, sender: "bot", text: QUICK_ANSWERS.default },
  ]);
  const [input, setInput] = useState("");

  const handleSend = (e) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMsg = { id: Date.now(), sender: "user", text: input };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");

    const lower = input.toLowerCase();
    const reply =
      lower.includes("pric") || lower.includes("cost")  ? QUICK_ANSWERS.pricing  :
      lower.includes("upload") || lower.includes("file") ? QUICK_ANSWERS.upload   :
      lower.includes("track") || lower.includes("order") ? QUICK_ANSWERS.track    :
      QUICK_ANSWERS.default;

    setTimeout(() => {
      setMessages((prev) => [...prev, { id: Date.now(), sender: "bot", text: reply }]);
    }, 800);
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
      {/* Chat window */}
      {isOpen && (
        <div className="animate-scale-in w-80 sm:w-96 bg-white border border-gray-200 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-violet-600 text-white">
            <div className="flex items-center gap-2 font-semibold">
              <Bot size={20} /> Print Assistant
            </div>
            <button onClick={() => setIsOpen(false)} className="hover:text-violet-200 transition-colors">
              <X size={20} />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50 min-h-[280px] max-h-72">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                  m.sender === "bot"
                    ? "bg-white border border-gray-200 text-gray-700 self-start rounded-bl-none"
                    : "bg-violet-600 text-white self-end ml-auto rounded-br-none"
                }`}
              >
                {m.text}
              </div>
            ))}
          </div>

          {/* Input */}
          <form onSubmit={handleSend} className="flex gap-2 p-3 border-t border-gray-100 bg-white">
            <input
              type="text"
              className="flex-1 text-sm px-4 py-2 border border-gray-200 rounded-full outline-none focus:border-violet-500 transition-colors"
              placeholder="Ask me anything…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
            <button
              type="submit"
              disabled={!input.trim()}
              className="w-9 h-9 flex items-center justify-center rounded-full bg-violet-600 hover:bg-violet-700 text-white disabled:opacity-40 transition-all"
            >
              <Send size={15} />
            </button>
          </form>
        </div>
      )}

      {/* Toggle button */}
      <button
        onClick={() => setIsOpen((o) => !o)}
        className="w-14 h-14 rounded-full bg-violet-600 hover:bg-violet-700 text-white flex items-center justify-center shadow-xl hover:scale-105 transition-all"
      >
        {isOpen ? <X size={24} /> : <MessageSquare size={24} />}
      </button>
    </div>
  );
}
