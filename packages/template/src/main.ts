/**
 * {{PROJECT_NAME}} — AppySentinel entry point.
 *
 * This is the minimal walking-skeleton scaffold. It boots a Sentinel,
 * subscribes a console logger, emits a single startup Signal, and then
 * sits waiting for SIGINT/SIGTERM.
 *
 * After install, the `configure-sentinel` Claude skill will replace this
 * file with a fully wired Sentinel — input collectors, storage, interface,
 * transport, runtime supervisor — based on your answers in the interview.
 */

import { createSentinel } from '@appydave/appysentinel-core';

const sentinel = createSentinel({
  name: '{{PROJECT_NAME}}',
  machine: process.env['MACHINE_NAME'] ?? '{{MACHINE_NAME}}',
});

// Default subscriber: log every Signal to the Pino logger.
sentinel.on((signal) => {
  sentinel.logger.info(
    {
      kind: signal.kind,
      name: signal.name,
      source: signal.source,
      payload: signal.payload,
    },
    'signal'
  );
});

await sentinel.start();

sentinel.emit({
  source: 'lifecycle',
  kind: 'event',
  name: 'sentinel.started',
  payload: { sentinelId: sentinel.sentinelId, machine: sentinel.machine },
});

sentinel.logger.info('{{PROJECT_NAME}} is running. Press Ctrl-C to stop.');
