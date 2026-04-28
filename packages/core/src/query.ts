/**
 * Standard envelope for all query function return values.
 * Bindings wrap this in their protocol format (MCP tool response, HTTP JSON, CLI text).
 * The data_age_ms and stale fields are first-class — agents need freshness metadata.
 */
export interface QueryResult<T> {
  data: T;
  generated_at: string; // ISO — when the snapshot was written to disk
  data_age_ms: number;  // ms between generated_at and now()
  stale: boolean;       // caller sets threshold; core provides the shape
}
