/** Shared structural name projection; email is only a fallback, never returned whole. */
export function memberDisplayName(user: {
  firstName: string;
  lastName: string;
  email: string;
}): string {
  return `${user.firstName} ${user.lastName}`.trim() || user.email.split('@')[0];
}
