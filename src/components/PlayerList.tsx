import type { PublicPlayer } from "@/lib/game/types";
import { AvatarView } from "./AvatarView";

export function playerName(players: PublicPlayer[], id: string | null): string {
  return players.find((player) => player.id === id)?.name ?? "Alguém";
}

type Props = {
  players: PublicPlayer[];
  you: string;
  hostId: string;
  currentId?: string | null;
  answeredIds?: Set<string>;
  showScore?: boolean;
  onKick?: (playerId: string) => void;
};

export function PlayerList({ players, you, hostId, currentId, answeredIds, showScore, onKick }: Props) {
  const ordered = showScore ? [...players].sort((a, b) => b.score - a.score) : players;
  const canKick = !!onKick && hostId === you;

  function confirmKick(player: PublicPlayer) {
    if (window.confirm(`Remover ${player.name} da sala?`)) onKick?.(player.id);
  }

  return (
    <ul className="players">
      {ordered.map((player) => {
        const notes = [
          player.id === you ? "você" : null,
          player.id === hostId ? "anfitrião" : null,
          !player.online ? "desconectado" : null,
          player.online && !player.playing ? "entra na próxima" : null,
          answeredIds?.has(player.id) ? "já respondeu" : null,
        ].filter(Boolean);
        return (
          <li
            key={player.id}
            className={`player${player.id === currentId ? " current" : ""}${
              player.online ? "" : " offline"
            }`}
          >
            <AvatarView avatar={player.avatar} />
            <span className="player-info">
              <span className="player-name">{player.name}</span>
              {notes.length > 0 && <span className="player-note">{notes.join(" · ")}</span>}
            </span>
            {showScore && <span className="player-score">{player.score}</span>}
            {canKick && player.id !== you && (
              <button
                type="button"
                className="player-kick"
                aria-label={`Remover ${player.name} da sala`}
                onClick={() => confirmKick(player)}
              >
                X
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
