import { log } from "../deps.ts";

export function setupLogs(opts: {
  logLevel: log.LevelName,
  logFormat: 'json' | 'console',
}) {
  log.setup({
    handlers: {
      console: new log.ConsoleHandler(opts.logLevel),
      json: new JsonStdoutHandler(opts.logLevel),
    },
    loggers: {
      default: {
        level: opts.logLevel,
        handlers: [opts.logFormat],
      },
      http: {
        level: opts.logLevel == 'INFO' ? 'WARN' : opts.logLevel,
        handlers: [opts.logFormat],
      },
    },
  });
}

class JsonStdoutHandler extends log.ConsoleHandler {
  override format(logRecord: log.LogRecord): string {
    const {args} = logRecord;
    return JSON.stringify({ ...logRecord,
      data: args.length > 1 ? args : args[0],
    });
  }
}
