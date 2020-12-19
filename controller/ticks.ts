import {
  just, fromAsyncIterator, fromTimer,
  map, merge, debounce,
} from '../deps.ts';

import { DnsSource, ControllerConfig } from "../common/mod.ts";

export function createTickStream(
  config: ControllerConfig,
  sources: DnsSource[],
) {
  const tickStreams = new Array<ReadableStream<DnsSource | null>>();

  // Always start with one tick as startup
  tickStreams.push(just(null));

  if (Deno.args.includes('--once')) {
    // Do nothing else after initial tick.

  } else if (config.enable_watching) {

    // Subscribe to every source's events
    for (const source of sources) {
      tickStreams.push(fromAsyncIterator(source
        .MakeEventSource())
        .pipeThrough(map(x => source)));
    }

    // Also regular infrequent ticks just in case
    const bgPollMillis = (config.interval_seconds ?? (60 * 60)) * 1000;
    tickStreams.push(fromTimer(bgPollMillis)
      .pipeThrough(map(() => null)));

  } else {

    // Just plain regular ticks at a fixed interval
    const bgPollMillis = (config.interval_seconds ?? 60) * 1000;
    tickStreams.push(fromTimer(bgPollMillis)
      .pipeThrough(map(() => null)));
  }

  // Merge every tick source and debounce
  return merge(...tickStreams)
    .pipeThrough(debounce((config.debounce_seconds ?? 2) * 1000));
};
