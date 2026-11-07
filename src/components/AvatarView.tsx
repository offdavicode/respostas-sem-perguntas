import { type Avatar, avatarDataUrl } from "@/lib/game/avatar";

export function AvatarView({ avatar, size = 40 }: { avatar: Avatar; size?: number }) {
  return (
    <span
      className="avatar"
      aria-hidden="true"
      style={{ width: size, height: size, backgroundImage: `url("${avatarDataUrl(avatar)}")` }}
    />
  );
}
