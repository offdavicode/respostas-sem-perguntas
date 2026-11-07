"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import { CHAT_MAX_LENGTH } from "@/lib/game/engine";
import type { Action, PublicState } from "@/lib/game/types";

type Props = {
  state: PublicState;
  act: (action: Action) => Promise<boolean>;
};

export function Chat({ state, act }: Props) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [open, setOpen] = useState(false);
  const [seenId, setSeenId] = useState<string | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const { chat, you } = state;
  const lastId = chat[chat.length - 1]?.id ?? null;

  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [lastId, open]);

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => setSeenId(lastId), 0);
    return () => clearTimeout(timer);
  }, [lastId, open]);

  const seenIndex = chat.findIndex((message) => message.id === seenId);
  const unread = chat.slice(seenIndex + 1).filter((message) => message.playerId !== you).length;

  async function send(event: FormEvent) {
    event.preventDefault();
    if (!text.trim() || sending) return;
    setSending(true);
    if (await act({ type: "chat", text })) setText("");
    setSending(false);
  }

  return (
    <>
      <button
        type="button"
        className="button button-small block block-yellow chat-toggle"
        onClick={() => setOpen(true)}
      >
        Chat
        {unread > 0 && <span className="chat-unread">{unread}</span>}
      </button>

      <section className={`chat block${open ? " open" : ""}`} aria-label="Chat da sala">
        <div className="chat-header">
          <h2 className="section-title">Chat</h2>
          <button
            type="button"
            className="button button-small block chat-close"
            onClick={() => setOpen(false)}
          >
            Fechar
          </button>
        </div>

        <ul className="chat-list" ref={listRef} aria-live="polite">
          {chat.length === 0 && <li className="chat-empty">Nenhuma mensagem ainda.</li>}
          {chat.map((message) => (
            <li
              key={message.id}
              className={`chat-message${message.playerId === you ? " mine" : ""}`}
            >
              <b>{message.name}</b>
              {message.text ?? <span className="chat-hidden">Mensagem escondida: entregava a resposta.</span>}
            </li>
          ))}
        </ul>

        <form className="chat-form" onSubmit={send}>
          <input
            className="input"
            value={text}
            onChange={(event) => setText(event.target.value)}
            maxLength={CHAT_MAX_LENGTH}
            autoComplete="off"
            aria-label="Mensagem"
            placeholder="Escreva aqui"
          />
          <button className="button button-small block block-mint" disabled={sending || !text.trim()}>
            Enviar
          </button>
        </form>
      </section>
    </>
  );
}
