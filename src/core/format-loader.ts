import fs from "fs";
import path from "path";
import type { FormatTemplate } from "./types-v2";

/**
 * Load a format template from config/formats/{formatId}.json
 */
export function loadFormatTemplate(formatId: string, projectRoot?: string): FormatTemplate {
  const root = projectRoot ?? path.resolve(__dirname, "..", "..");
  const formatPath = path.join(root, "config", "formats", `${formatId}.json`);

  if (!fs.existsSync(formatPath)) {
    throw new Error(`Format template not found: ${formatPath}`);
  }

  const raw = JSON.parse(fs.readFileSync(formatPath, "utf-8"));

  // Basic validation
  if (!raw.format_id || !raw.grid || !raw.timing) {
    throw new Error(`Invalid format template: missing required fields in ${formatPath}`);
  }

  return raw as FormatTemplate;
}
