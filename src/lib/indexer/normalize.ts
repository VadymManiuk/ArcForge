import type { IndexedEvent } from "./events";

export function normalizeEvent(event: IndexedEvent) {
  return { ...event, id: `${event.transactionHash}-${event.name}`, blockNumber: event.blockNumber.toString() };
}
