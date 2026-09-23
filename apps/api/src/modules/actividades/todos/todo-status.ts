import { TodoStatus } from '@prisma/client';

// GO-003 — every non-DONE state is open, including blocked work.
export const OPEN_TODO_STATUSES: TodoStatus[] = Object.values(TodoStatus).filter(
  (status) => status !== TodoStatus.DONE,
);
