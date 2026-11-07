"use client";

import { type Avatar, AVATAR_TRAITS, type AvatarTrait, randomAvatar } from "@/lib/game/avatar";
import { AvatarView } from "./AvatarView";

type Props = {
  avatar: Avatar;
  onChange: (avatar: Avatar) => void;
};

export function AvatarEditor({ avatar, onChange }: Props) {
  function step(trait: AvatarTrait, total: number, direction: number) {
    onChange({ ...avatar, [trait]: (avatar[trait] + direction + total) % total });
  }

  return (
    <fieldset className="avatar-editor">
      <legend>Seu personagem</legend>
      <div className="avatar-preview">
        <AvatarView avatar={avatar} size={112} />
        <button
          type="button"
          className="button button-small block"
          onClick={() => onChange(randomAvatar())}
        >
          Sortear
        </button>
      </div>
      <div className="avatar-traits">
        {AVATAR_TRAITS.map((trait) => (
          <div className="avatar-trait" key={trait.key}>
            <button
              type="button"
              className="avatar-step"
              aria-label={`${trait.label}: opção anterior`}
              onClick={() => step(trait.key, trait.options.length, -1)}
            >
              &lt;
            </button>
            <span className="avatar-trait-name">
              <small>{trait.label}</small>
              {trait.options[avatar[trait.key]]}
            </span>
            <button
              type="button"
              className="avatar-step"
              aria-label={`${trait.label}: próxima opção`}
              onClick={() => step(trait.key, trait.options.length, 1)}
            >
              &gt;
            </button>
          </div>
        ))}
      </div>
    </fieldset>
  );
}
