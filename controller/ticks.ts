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

  if (Deno.args.includes('--once')) { // one run only

    // Add nothing else
    // Loop completes after initial tick.

  } else if (config.enable_watching) { // Watch + interval

    // Subscribe to every source's events
    for (const source of sources) {
      tickStreams.push(fromAsyncIterator(source
        .MakeEventSource())
        .pipeThrough(map(x => source)));
    }

    // Also regular infrequent ticks just in case
    tickStreams.push(makeTimer(config.interval_seconds ?? (60 * 60)));

  } else { // interval only

    // Just plain regular ticks at a fixed interval
    tickStreams.push(makeTimer(config.interval_seconds ?? (1 * 60)));

  }

  // Merge every tick source and debounce
  return merge(...tickStreams)
    .pipeThrough(debounce((config.debounce_seconds ?? 2) * 1000));
};


function makeTimer(intervalSeconds: number) {
  return fromTimer(intervalSeconds * 1000)
      // kludge to match the type signature
      .pipeThrough(map(() => null));
}
