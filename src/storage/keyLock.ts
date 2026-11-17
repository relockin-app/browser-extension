/**
 * Runs a load → change → save of one storage key while no other context
 * (background, popup) writes that key; otherwise the later save would undo the
 * earlier one. These locks never nest, so they can't deadlock.
 */
export function withKeyLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  // The DOM typings wrap fn's promise in another one; at runtime it resolves to T.
  return navigator.locks.request(`relockr-storage:${key}`, fn) as Promise<T>;
}
