// Collect layer — data flows INTO this Sentinel from external sources.
//
// A collector is a recipe: a factory function that takes (sentinel, options),
// registers lifecycle hooks, and emits Signals. Collectors are observer-only —
// they read from external systems, never mutate them.
//
// RULE: all setup goes in onStart(), all teardown in onStop(). Never start
// timers, open connections, or allocate resources outside a lifecycle hook.
//
// Pattern:
//
//   import type { Sentinel } from '@appydave/appysentinel-core';
//
//   export function myCollector(
//     sentinel: Sentinel,
//     options: { intervalMs: number; dataDir: string }
//   ) {
//     let timer: Timer | undefined;
//
//     sentinel.lifecycle.onStart(async () => {
//       await collect();                               // first run immediately
//       timer = setInterval(collect, options.intervalMs);
//     });
//
//     sentinel.lifecycle.onStop(async () => {
//       clearInterval(timer);
//     });
//
//     async function collect() {
//       const data = await fetchFromExternalSystem();
//       await atomicWrite(join(options.dataDir, 'latest.json'), JSON.stringify(data));
//       sentinel.emit({
//         source: 'my-collector',
//         kind: 'state',
//         name: 'snapshot.updated',
//         payload: { recordCount: data.length },
//       });
//     }
//   }
//
// Wire collectors in src/main.ts before sentinel.start():
//   myCollector(sentinel, { intervalMs: 60_000, dataDir });
//   await sentinel.start();
