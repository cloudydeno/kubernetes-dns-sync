import { log } from "../deps.ts";

export async function setupLogs(opts: {
  logLevel: log.LevelName,
  logFormat: 'json' | 'console',
}) {
  await log.setup({
    handlers: {
      console: new log.handlers.ConsoleHandler(opts.logLevel),
      json: new JsonStdoutHandler(opts.logLevel),
    },
    loggers: {
      default: {
        level: opts.logLevel,
        handlers: [opts.logFormat],
      },
      http: {
        level: opts.logLevel == 'INFO' ? 'WARNING' : opts.logLevel,
        handlers: [opts.logFormat],
      },
    },
  });
}

class JsonStdoutHandler extends log.handlers.ConsoleHandler {
  format(logRecord: log.LogRecord): string {
    const {args} = logRecord;
    return JSON.stringify({ ...logRecord,
      data: args.length > 1 ? args : args[0],
    });
  }
}
