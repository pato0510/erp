export function memberInitials(displayName: string | null | undefined): string {
  const words = displayName?.trim().split(/\s+/).filter(Boolean) ?? [];
  if (!words.length) return '?';
  const first = Array.from(words[0])[0];
  const last = words.length > 1 ? Array.from(words[words.length - 1])[0] : '';
  return `${first}${last}`.toLocaleUpperCase('es-CL');
}

interface MemberAvatarProps {
  displayName?: string | null;
  size?: 'sm' | 'md';
}

export function MemberAvatar({ displayName, size = 'md' }: MemberAvatarProps) {
  const name = displayName?.trim() || 'Usuario desconocido';
  return (
    <span
      role="img"
      title={name}
      aria-label={name}
      className={`inline-flex shrink-0 items-center justify-center rounded-full border border-line bg-subtle font-medium text-fg-secondary ${
        size === 'sm' ? 'h-6 w-6 text-[10px]' : 'h-8 w-8 text-xs'
      }`}
    >
      <span aria-hidden="true">{memberInitials(displayName)}</span>
    </span>
  );
}
