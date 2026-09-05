import type { JsonValue } from "./json.ts";

/** Every messaging kind this spec understands. */
export type MessagingKind = "queue" | "pub-sub";

interface MessagingBase {
  class?: string;
  /** Raw, target-native config a kit may merge into its own translation of this one entry, keyed by target name. Opaque to the SDK — see storage.ts's StorageBase.overrides. */
  overrides?: Record<string, JsonValue>;
}

/** Send/receive/ack/visibility-timeout, single-consumer competing-consumers (SQS, Cloud Tasks, Azure Storage Queues/Service Bus queues). */
export interface Queue extends MessagingBase {
  type: "queue";
}

/**
 * Publish/subscribe by topic, fan-out (SNS, Pub/Sub, Azure Service Bus
 * topics). EventBridge/Eventarc/Event Grid are filed here for now —
 * pattern-matched routing rules are an explicitly deferred gap, not modeled
 * yet. See taxonomy doc.
 */
export interface PubSub extends MessagingBase {
  type: "pub-sub";
}

export type Messaging = Queue | PubSub;
