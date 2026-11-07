"use client";

import { useNow } from "@/lib/client/useRoom";
import { REACTIONS, type Action, type PublicState } from "@/lib/game/types";
import { AvatarView } from "./AvatarView";

const VISIBLE_MS = 4_000;

export function ReactionBar({ act }: { act: (action: Action) => Promise<boolean> }) {
  return (
    <section className="reaction-bar" aria-label="Reações rápidas">
      {REACTIONS.map((reaction) => (
        <button
          key={reaction.id}
          type="button"
          className="option reaction-button"
          onClick={() => void act({ type: "react", reaction: reaction.id })}
        >
          {reaction.label}
        </button>
      ))}
    </section>
  );
}

type BubblesProps = { state: PublicState; offsetMs: number };

export function ReactionBubbles({ state, offsetMs }: BubblesProps) {
  const now = useNow(state.reactions.length > 0, offsetMs, 500);
  const visible = state.reactions.filter((item) => !now || now - item.at < VISIBLE_MS);
  if (visible.length === 0) return null;
  return (
    <div className="reaction-bubbles" aria-live="polite">
      {visible.map((item) => {
        const player = state.players.find((candidate) => candidate.id === item.playerId);
        const label = REACTIONS.find((reaction) => reaction.id === item.reaction)?.label;
        return (
          <div className="reaction-bubble block block-yellow" key={item.id}>
            {player && <AvatarView avatar={player.avatar} size={32} />}
            <span>
              <small>{item.name}</small>
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
