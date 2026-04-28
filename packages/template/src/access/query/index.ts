// Query layer — read-only access to this Sentinel's collected data.
//
// Query functions are pure: they read snapshot files, transform the data,
// and return a QueryResult<T>. No side effects. No transport knowledge.
// No calls to external systems.
//
// RULE: every query function must return QueryResult<T> — the standard
// freshness envelope exported from @appydave/appysentinel-core.
// The data_age_ms and stale fields are first-class: agents use them to
// decide whether to trigger a recollect before trusting the answer.
//
// Pattern:
//
//   import type { QueryResult } from '@appydave/appysentinel-core';
//
//   export async function getLatestSnapshot(
//     dataDir: string,
//     staleThresholdMs = 60 * 60 * 1000
//   ): Promise<QueryResult<MySnapshot>> {
//     const raw = await readSnapshotFile(dataDir);
//     const generatedAt = raw.generatedAt ?? new Date().toISOString();
//     const dataAgeMs = Date.now() - new Date(generatedAt).getTime();
//     return {
//       data: raw,
//       generated_at: generatedAt,
//       data_age_ms: dataAgeMs,
//       stale: dataAgeMs > staleThresholdMs,
//     };
//   }
//
// Wire query functions in src/access/bindings/ — bindings call them and
// translate the result to protocol format (MCP resource, HTTP response, etc.).
