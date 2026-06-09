import { sql } from "@/lib/db";
import { ENTITY_TYPES as SHARED_ENTITY_TYPES } from "@/lib/shared/constants";

// Re-export so server callers don't need to know constants live in /lib/shared.
export const ENTITY_TYPES = SHARED_ENTITY_TYPES;

/**
 * Single entry point for writing to the activity table. Every route
 * that needs an audit trail funnels through here so the structured
 * fields (`actor_id`, `action`, `entity_type`, `entity_id`) are *always*
 * set in a consistent way — the UI activity log filters depend on it.
 *
 * `actor_id` may be null for anonymous / system events (e.g. forgot-
 * password requests that mustn't leak whether the email exists, or the
 * scheduled deadline-reminder runner).
 */
export async function logActivity({
  icon = "activity",
  tone = "primary",
  message,
  actor_id = null,
  action = null,
  entity_type = null,
  entity_id = null,
}) {
  await sql`
    INSERT INTO activity
      (icon, tone, message, actor_id, action, entity_type, entity_id)
    VALUES
      (${icon}, ${tone}, ${message}, ${actor_id}, ${action},
       ${entity_type}, ${entity_id})
  `;
}
