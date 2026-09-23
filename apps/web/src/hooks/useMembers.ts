'use client';

import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import { apiClient } from '../lib/api';

export interface Member {
  userId: string;
  displayName: string;
}

export type MembersScope = 'active' | 'all';

export function createMemberNameLookup(members: readonly Member[]) {
  const names = new Map(members.map((member) => [member.userId, member.displayName]));
  return (userId: string | null | undefined): string | null =>
    userId ? (names.get(userId) ?? null) : null;
}

interface Snapshot {
  members: Member[];
  isLoading: boolean;
}

interface CacheEntry {
  snapshot: Snapshot;
  loaded: boolean;
  promise: Promise<void> | null;
  listeners: Set<() => void>;
}

const EMPTY: Snapshot = { members: [], isLoading: false };
const PENDING: Snapshot = { members: [], isLoading: true };
// Memory only; logout and 401 redirects reload the document (useAuth/apiClient).
// Both the resolved directory and its in-flight request are company + scope specific.
const cache = new Map<string, CacheEntry>();

function entryFor(key: string): CacheEntry {
  let entry = cache.get(key);
  if (!entry) {
    entry = { snapshot: PENDING, loaded: false, promise: null, listeners: new Set() };
    cache.set(key, entry);
  }
  return entry;
}

function publish(entry: CacheEntry, snapshot: Snapshot) {
  entry.snapshot = snapshot;
  entry.listeners.forEach((listener) => listener());
}

function loadMembers(companyId: string, scope: MembersScope, force = false): Promise<void> {
  // apiClient supplies the header synchronously: never cache another company's request.
  if (apiClient.getCompanyId() !== companyId) return Promise.resolve();
  const entry = entryFor(`${companyId}:${scope}`);
  if (entry.promise) return entry.promise;
  if (entry.loaded && !force) return Promise.resolve();

  entry.promise = apiClient
    .get<Member[]>(`/api/members?scope=${scope}`)
    .then((members) => {
      entry.loaded = true;
      publish(entry, { members, isLoading: false });
    })
    .catch(() => {
      // A failed request must not become a permanently cached empty directory.
      entry.loaded = false;
      publish(entry, EMPTY);
    })
    .finally(() => {
      entry.promise = null;
    });
  publish(entry, { members: entry.snapshot.members, isLoading: true });
  return entry.promise;
}

const serverSnapshot = () => EMPTY;

/** Current company's directory; all resolves history, active is for pickers. */
export function useMembers(scope: MembersScope = 'all') {
  const companyId = apiClient.getCompanyId();
  const key = companyId ? `${companyId}:${scope}` : null;
  const subscribe = useCallback(
    (listener: () => void) => {
      if (!key) return () => undefined;
      const entry = entryFor(key);
      entry.listeners.add(listener);
      return () => {
        entry.listeners.delete(listener);
      };
    },
    [key],
  );
  const getSnapshot = useCallback(() => (key ? entryFor(key).snapshot : EMPTY), [key]);
  // Switching company/scope reads a different snapshot immediately, without stale names.
  const { members, isLoading } = useSyncExternalStore(subscribe, getSnapshot, serverSnapshot);

  useEffect(() => {
    if (companyId) void loadMembers(companyId, scope);
  }, [companyId, scope]);

  const refresh = useCallback(
    () => (companyId ? loadMembers(companyId, scope, true) : Promise.resolve()),
    [companyId, scope],
  );
  const nameOf = useMemo(() => createMemberNameLookup(members), [members]);
  return { members, nameOf, isLoading, refresh };
}
