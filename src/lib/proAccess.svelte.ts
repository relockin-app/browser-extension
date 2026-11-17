import { onDestroy } from "svelte";
import {
  FULL_ACCESS,
  getProAccess,
  isLimited,
  watchProAccess,
  type ProAccess,
} from "~/shared/pro/proAccess";

/** The free tier's limits on a phone without Pro. Matches the mobile app's. */
export const FREE_RULE_LIMIT = 1;
export const FREE_SCHEDULE_LIMIT = 1;

/**
 * Pro access for a component, kept current. Call during component init.
 * `ready` is false until the first read, so a limited UI doesn't flash the
 * full one first.
 */
export function useProAccess(): { readonly access: ProAccess; readonly limited: boolean; readonly ready: boolean } {
  let access = $state<ProAccess>(FULL_ACCESS);
  let ready = $state(false);
  void getProAccess().then((a) => {
    access = a;
    ready = true;
  });
  onDestroy(watchProAccess((a) => (access = a)));
  return {
    get access() {
      return access;
    },
    get limited() {
      return isLimited(access);
    },
    get ready() {
      return ready;
    },
  };
}
