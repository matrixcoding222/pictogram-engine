type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const LOG_COLORS: Record<LogLevel, string> = {
  debug: "\x1b[36m",  // cyan
  info: "\x1b[32m",   // green
  warn: "\x1b[33m",   // yellow
  error: "\x1b[31m",  // red
};

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";

function formatTimestamp(): string {
  const now = new Date();
  const pad = (n: number, width = 2) => String(n).padStart(width, "0");
  return (
    `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}.${pad(now.getMilliseconds(), 3)}`
  );
}

function formatLevel(level: LogLevel): string {
  const color = LOG_COLORS[level];
  const label = level.toUpperCase().padEnd(5);
  return `${color}${BOLD}${label}${RESET}`;
}

class Logger {
  private minLevel: LogLevel;

  constructor(minLevel: LogLevel = "debug") {
    this.minLevel = minLevel;
  }

  setLevel(level: LogLevel): void {
    this.minLevel = level;
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[this.minLevel];
  }

  private log(level: LogLevel, message: string, ...args: unknown[]): void {
    if (!this.shouldLog(level)) return;

    const timestamp = `${DIM}${formatTimestamp()}${RESET}`;
    const formattedLevel = formatLevel(level);
    const line = `${timestamp} ${formattedLevel} ${message}`;

    if (level === "error") {
      console.error(line, ...args);
    } else if (level === "warn") {
      console.warn(line, ...args);
    } else {
      console.log(line, ...args);
    }
  }

  debug(message: string, ...args: unknown[]): void {
    this.log("debug", message, ...args);
  }

  info(message: string, ...args: unknown[]): void {
    this.log("info", message, ...args);
  }

  warn(message: string, ...args: unknown[]): void {
    this.log("warn", message, ...args);
  }

  error(message: string, ...args: unknown[]): void {
    this.log("error", message, ...args);
  }

  /**
   * Log a pipeline step with progress indicator.
   * Example output: "12:05:32.041 INFO  [Step 3/9] Generating voice..."
   */
  step(current: number, total: number, message: string): void {
    const stepPrefix = `${BOLD}[Step ${current}/${total}]${RESET}`;
    this.log("info", `${stepPrefix} ${message}`);
  }
}

export const logger = new Logger();
export { Logger, LogLevel };
