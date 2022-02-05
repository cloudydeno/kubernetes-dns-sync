import { ows } from '../deps.ts';

import type { ControllerConfig } from "../defs/config.ts";
import type { DnsSource } from "../defs/types.ts";

/**
 * Builds a stream of one or more 'ticks', which are events that
 * result in the controller performing a fresh reconsile loop.
 * If "--once" was passed in, this stream closes after a single tick.
 * Otherwise it's an infinite stream either from a fast timer interval
 * or, if enabled, from watch events plus a slow timer.
 * Tick values are either null, or the source that caused them via event.
 * @todo consider if watching should be the default behavior.
 * @param config Controller configuration, drives timing + watching
 * @param sources List of record sources to watch if enabled
 */

export function createTickStream(
  config: ControllerConfig,
  sources: DnsSource[],
) {
  const tickStreams = new Array<ReadableStream<DnsSource | null>>();

  // Always start with one tick as startup
  tickStreams.push(ows.just(null));

  if (Deno.args.includes('--once')) { // one run only

    // Add nothing else
    // Loop completes after initial tick.

  } else if (config.enable_watching) { // Watch + interval

    // Subscribe to every source's events
    for (const source of sources) {
      tickStreams.push(ows.fromIterable(source
        .MakeEventSource())
        .pipeThrough(ows.map(() => source)));
    }

    // Also regular infrequent ticks just in case
    tickStreams.push(makeTimer(config.interval_seconds ?? (60 * 60)));

  } else { // interval only

    // Just plain regular ticks at a fixed interval
    tickStreams.push(makeTimer(config.interval_seconds ?? (1 * 60)));

  }

  // Merge every tick source and debounce
  return ows.merge(...tickStreams)
    .pipeThrough(ows.debounce((config.debounce_seconds ?? 2) * 1000));
};


function makeTimer(intervalSeconds: number) {
  return ows.fromTimer(intervalSeconds * 1000)
      // kludge to match the type signature
      .pipeThrough(ows.map(() => null));
}
