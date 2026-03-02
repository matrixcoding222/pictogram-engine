import sharp from "sharp";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ASSETS_DIR = path.resolve(__dirname, "..", "assets", "pictograms");

// ---------------------------------------------------------------------------
// SVG source strings keyed by category/filename (without extension)
// ---------------------------------------------------------------------------

const pictograms: Record<string, string> = {
  // ── FIGURES ──────────────────────────────────────────────────────────────
  "figures/stick_standing": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 150" width="300" height="300" fill="none" stroke="black" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
  <circle cx="50" cy="20" r="12" />
  <line x1="50" y1="32" x2="50" y2="85" />
  <line x1="50" y1="50" x2="25" y2="70" />
  <line x1="50" y1="50" x2="75" y2="70" />
  <line x1="50" y1="85" x2="28" y2="140" />
  <line x1="50" y1="85" x2="72" y2="140" />
</svg>`,

  "figures/stick_pointing": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 150" width="300" height="300" fill="none" stroke="black" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
  <circle cx="45" cy="20" r="12" />
  <line x1="45" y1="32" x2="45" y2="85" />
  <line x1="45" y1="50" x2="22" y2="70" />
  <line x1="45" y1="50" x2="100" y2="45" />
  <line x1="100" y1="45" x2="90" y2="38" />
  <line x1="100" y1="45" x2="90" y2="52" />
  <line x1="45" y1="85" x2="25" y2="140" />
  <line x1="45" y1="85" x2="65" y2="140" />
</svg>`,

  "figures/stick_thinking": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 150" width="300" height="300" fill="none" stroke="black" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
  <circle cx="53" cy="20" r="12" />
  <line x1="50" y1="32" x2="50" y2="85" />
  <line x1="50" y1="50" x2="25" y2="70" />
  <line x1="50" y1="50" x2="60" y2="55" />
  <line x1="60" y1="55" x2="55" y2="35" />
  <line x1="50" y1="85" x2="28" y2="140" />
  <line x1="50" y1="85" x2="72" y2="140" />
</svg>`,

  "figures/stick_shrugging": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 150" width="300" height="300" fill="none" stroke="black" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
  <circle cx="50" cy="20" r="12" />
  <line x1="50" y1="32" x2="50" y2="85" />
  <line x1="50" y1="48" x2="20" y2="40" />
  <line x1="20" y1="40" x2="15" y2="28" />
  <line x1="50" y1="48" x2="80" y2="40" />
  <line x1="80" y1="40" x2="85" y2="28" />
  <line x1="50" y1="85" x2="28" y2="140" />
  <line x1="50" y1="85" x2="72" y2="140" />
</svg>`,

  "figures/stick_scared": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 150" width="300" height="300" fill="none" stroke="black" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
  <circle cx="50" cy="20" r="12" />
  <line x1="50" y1="32" x2="50" y2="85" />
  <line x1="50" y1="48" x2="18" y2="30" />
  <line x1="50" y1="48" x2="82" y2="30" />
  <line x1="50" y1="85" x2="18" y2="140" />
  <line x1="50" y1="85" x2="82" y2="140" />
</svg>`,

  "figures/stick_celebrating": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 150" width="300" height="300" fill="none" stroke="black" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
  <circle cx="50" cy="20" r="12" />
  <line x1="50" y1="32" x2="50" y2="85" />
  <line x1="50" y1="48" x2="22" y2="15" />
  <line x1="50" y1="48" x2="78" y2="15" />
  <line x1="50" y1="85" x2="28" y2="140" />
  <line x1="50" y1="85" x2="72" y2="140" />
</svg>`,

  "figures/stick_running": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 110 150" width="300" height="300" fill="none" stroke="black" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
  <circle cx="60" cy="20" r="12" />
  <line x1="58" y1="32" x2="50" y2="82" />
  <line x1="55" y1="48" x2="25" y2="55" />
  <line x1="55" y1="48" x2="85" y2="42" />
  <line x1="50" y1="82" x2="20" y2="120" />
  <line x1="20" y1="120" x2="10" y2="140" />
  <line x1="50" y1="82" x2="75" y2="115" />
  <line x1="75" y1="115" x2="95" y2="140" />
</svg>`,

  "figures/stick_sitting": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 130" width="300" height="300" fill="none" stroke="black" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
  <circle cx="50" cy="15" r="12" />
  <line x1="50" y1="27" x2="50" y2="70" />
  <line x1="50" y1="45" x2="28" y2="62" />
  <line x1="50" y1="45" x2="72" y2="62" />
  <line x1="50" y1="70" x2="80" y2="72" />
  <line x1="80" y1="72" x2="82" y2="120" />
  <line x1="30" y1="72" x2="85" y2="72" />
</svg>`,

  "figures/stick_falling": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 150" width="300" height="300" fill="none" stroke="black" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
  <circle cx="75" cy="25" r="12" />
  <line x1="70" y1="36" x2="45" y2="85" />
  <line x1="58" y1="58" x2="20" y2="45" />
  <line x1="58" y1="58" x2="95" y2="50" />
  <line x1="45" y1="85" x2="25" y2="135" />
  <line x1="45" y1="85" x2="70" y2="130" />
</svg>`,

  "figures/stick_looking_up": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 150" width="300" height="300" fill="none" stroke="black" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
  <circle cx="50" cy="18" r="12" />
  <line x1="50" y1="30" x2="50" y2="85" />
  <line x1="50" y1="50" x2="25" y2="68" />
  <line x1="50" y1="50" x2="75" y2="68" />
  <line x1="50" y1="85" x2="28" y2="140" />
  <line x1="50" y1="85" x2="72" y2="140" />
  <line x1="52" y1="10" x2="55" y2="3" />
</svg>`,

  "figures/two_figures_talking": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 150" width="300" height="300" fill="none" stroke="black" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
  <circle cx="45" cy="20" r="12" />
  <line x1="45" y1="32" x2="45" y2="85" />
  <line x1="45" y1="50" x2="22" y2="68" />
  <line x1="45" y1="50" x2="65" y2="60" />
  <line x1="45" y1="85" x2="28" y2="140" />
  <line x1="45" y1="85" x2="62" y2="140" />
  <circle cx="135" cy="20" r="12" />
  <line x1="135" y1="32" x2="135" y2="85" />
  <line x1="135" y1="50" x2="158" y2="68" />
  <line x1="135" y1="50" x2="115" y2="60" />
  <line x1="135" y1="85" x2="118" y2="140" />
  <line x1="135" y1="85" x2="152" y2="140" />
  <line x1="78" y1="28" x2="85" y2="28" />
  <line x1="78" y1="35" x2="88" y2="35" />
  <line x1="78" y1="42" x2="83" y2="42" />
  <line x1="95" y1="28" x2="102" y2="28" />
  <line x1="92" y1="35" x2="102" y2="35" />
  <line x1="97" y1="42" x2="102" y2="42" />
</svg>`,

  "figures/figure_pushing": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 150" width="300" height="300" fill="none" stroke="black" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
  <circle cx="55" cy="25" r="12" />
  <line x1="52" y1="37" x2="40" y2="85" />
  <line x1="48" y1="52" x2="95" y2="45" />
  <line x1="48" y1="58" x2="95" y2="52" />
  <line x1="40" y1="85" x2="15" y2="140" />
  <line x1="40" y1="85" x2="55" y2="140" />
  <line x1="95" y1="30" x2="95" y2="70" />
</svg>`,

  "figures/group_of_figures": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 150" width="300" height="300" fill="none" stroke="black" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
  <circle cx="35" cy="22" r="10" />
  <line x1="35" y1="32" x2="35" y2="78" />
  <line x1="35" y1="48" x2="18" y2="62" />
  <line x1="35" y1="48" x2="52" y2="62" />
  <line x1="35" y1="78" x2="20" y2="140" />
  <line x1="35" y1="78" x2="50" y2="140" />
  <circle cx="80" cy="18" r="11" />
  <line x1="80" y1="29" x2="80" y2="80" />
  <line x1="80" y1="48" x2="60" y2="64" />
  <line x1="80" y1="48" x2="100" y2="64" />
  <line x1="80" y1="80" x2="65" y2="140" />
  <line x1="80" y1="80" x2="95" y2="140" />
  <circle cx="125" cy="22" r="10" />
  <line x1="125" y1="32" x2="125" y2="78" />
  <line x1="125" y1="48" x2="108" y2="62" />
  <line x1="125" y1="48" x2="142" y2="62" />
  <line x1="125" y1="78" x2="110" y2="140" />
  <line x1="125" y1="78" x2="140" y2="140" />
</svg>`,

  "figures/figure_looking_at_something": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 150" width="300" height="300" fill="none" stroke="black" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
  <circle cx="50" cy="20" r="12" />
  <line x1="50" y1="32" x2="50" y2="85" />
  <line x1="50" y1="50" x2="25" y2="70" />
  <line x1="50" y1="50" x2="62" y2="38" />
  <line x1="62" y1="38" x2="72" y2="14" />
  <line x1="62" y1="14" x2="78" y2="12" />
  <line x1="50" y1="85" x2="28" y2="140" />
  <line x1="50" y1="85" x2="72" y2="140" />
</svg>`,

  // ── PROPS ────────────────────────────────────────────────────────────────
  "props/magnifying_glass": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="300" height="300" fill="none" stroke="black" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
  <circle cx="40" cy="40" r="28" />
  <line x1="60" y1="60" x2="90" y2="90" />
</svg>`,

  "props/telescope": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="300" height="300" fill="none" stroke="black" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
  <line x1="15" y1="25" x2="70" y2="50" />
  <line x1="15" y1="32" x2="70" y2="57" />
  <line x1="70" y1="48" x2="70" y2="59" />
  <line x1="15" y1="22" x2="15" y2="35" />
  <line x1="55" y1="55" x2="35" y2="92" />
  <line x1="55" y1="55" x2="55" y2="92" />
  <line x1="55" y1="55" x2="75" y2="92" />
</svg>`,

  "props/beaker": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="300" height="300" fill="none" stroke="black" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
  <line x1="25" y1="10" x2="25" y2="85" />
  <line x1="75" y1="10" x2="75" y2="85" />
  <line x1="25" y1="85" x2="75" y2="85" />
  <line x1="20" y1="10" x2="30" y2="10" />
  <line x1="70" y1="10" x2="80" y2="10" />
  <line x1="20" y1="10" x2="15" y2="18" />
  <line x1="27" y1="55" x2="73" y2="55" />
  <line x1="25" y1="35" x2="35" y2="35" />
  <line x1="25" y1="55" x2="35" y2="55" />
  <line x1="25" y1="70" x2="35" y2="70" />
</svg>`,

  "props/book": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="300" height="300" fill="none" stroke="black" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
  <path d="M50 15 Q30 12 10 18 L10 85 Q30 80 50 82 Z" />
  <path d="M50 15 Q70 12 90 18 L90 85 Q70 80 50 82 Z" />
  <line x1="50" y1="15" x2="50" y2="82" />
  <line x1="20" y1="35" x2="42" y2="33" />
  <line x1="20" y1="45" x2="42" y2="43" />
  <line x1="20" y1="55" x2="42" y2="53" />
  <line x1="58" y1="33" x2="80" y2="35" />
  <line x1="58" y1="43" x2="80" y2="45" />
  <line x1="58" y1="53" x2="80" y2="55" />
</svg>`,

  "props/computer": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="300" height="300" fill="none" stroke="black" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
  <rect x="15" y="8" width="70" height="50" rx="3" />
  <rect x="20" y="13" width="60" height="38" rx="2" />
  <line x1="50" y1="58" x2="50" y2="72" />
  <line x1="30" y1="72" x2="70" y2="72" />
  <rect x="22" y="80" width="56" height="12" rx="2" />
  <line x1="28" y1="86" x2="72" y2="86" />
</svg>`,

  "props/globe": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="300" height="300" fill="none" stroke="black" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
  <circle cx="50" cy="50" r="38" />
  <ellipse cx="50" cy="50" rx="38" ry="10" />
  <ellipse cx="50" cy="50" rx="12" ry="38" />
  <ellipse cx="50" cy="30" rx="32" ry="8" />
  <ellipse cx="50" cy="70" rx="32" ry="8" />
</svg>`,

  "props/rocket": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="300" height="300" fill="none" stroke="black" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
  <path d="M50 5 Q65 25 65 60 L35 60 Q35 25 50 5 Z" />
  <circle cx="50" cy="35" r="7" />
  <path d="M35 50 L20 70 L35 60 Z" />
  <path d="M65 50 L80 70 L65 60 Z" />
  <line x1="43" y1="60" x2="40" y2="78" />
  <line x1="50" y1="60" x2="50" y2="82" />
  <line x1="57" y1="60" x2="60" y2="78" />
</svg>`,

  "props/brain": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="300" height="300" fill="none" stroke="black" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
  <path d="M50 15 Q25 10 20 30 Q10 35 15 50 Q10 60 20 70 Q25 85 45 85 Q50 90 55 85 Q75 85 80 70 Q90 60 85 50 Q90 35 80 30 Q75 10 50 15 Z" />
  <path d="M50 15 Q48 40 50 55 Q52 70 50 85" />
  <path d="M25 35 Q35 40 40 50" />
  <path d="M20 55 Q30 55 38 62" />
  <path d="M75 35 Q65 40 60 50" />
  <path d="M80 55 Q70 55 62 62" />
</svg>`,

  "props/atom": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="300" height="300" fill="none" stroke="black" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
  <circle cx="50" cy="50" r="5" fill="black" stroke="none" />
  <ellipse cx="50" cy="50" rx="40" ry="14" />
  <ellipse cx="50" cy="50" rx="40" ry="14" transform="rotate(60 50 50)" />
  <ellipse cx="50" cy="50" rx="40" ry="14" transform="rotate(-60 50 50)" />
</svg>`,

  // ── INDICATORS ───────────────────────────────────────────────────────────
  "indicators/question_mark": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="300" height="300">
  <text x="50" y="78" font-family="Arial, Helvetica, sans-serif" font-size="90" font-weight="bold" fill="black" text-anchor="middle" dominant-baseline="auto">?</text>
</svg>`,

  "indicators/exclamation_mark": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="300" height="300">
  <text x="50" y="78" font-family="Arial, Helvetica, sans-serif" font-size="90" font-weight="bold" fill="black" text-anchor="middle" dominant-baseline="auto">!</text>
</svg>`,

  "indicators/thought_bubble": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="300" height="300" fill="none" stroke="black" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
  <path d="M30 55 Q15 55 15 42 Q15 28 30 28 Q32 15 50 15 Q68 15 70 28 Q85 28 85 42 Q85 55 70 55 Z" />
  <circle cx="35" cy="68" r="5" />
  <circle cx="25" cy="80" r="3" />
  <circle cx="18" cy="90" r="2" />
</svg>`,

  "indicators/speech_bubble": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="300" height="300" fill="none" stroke="black" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
  <path d="M10 15 Q10 8 18 8 L82 8 Q90 8 90 15 L90 55 Q90 62 82 62 L35 62 L18 82 L22 62 L18 62 Q10 62 10 55 Z" />
</svg>`,

  "indicators/lightbulb": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="300" height="300" fill="none" stroke="black" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
  <path d="M35 55 Q20 45 20 32 Q20 10 50 10 Q80 10 80 32 Q80 45 65 55 L65 65 L35 65 Z" />
  <line x1="35" y1="70" x2="65" y2="70" />
  <line x1="37" y1="75" x2="63" y2="75" />
  <line x1="40" y1="80" x2="60" y2="80" />
  <path d="M44 45 L47 35 L53 35 L56 45" />
  <line x1="50" y1="2" x2="50" y2="6" />
  <line x1="85" y1="32" x2="90" y2="32" />
  <line x1="15" y1="32" x2="10" y2="32" />
  <line x1="78" y1="12" x2="82" y2="8" />
  <line x1="22" y1="12" x2="18" y2="8" />
</svg>`,

  "indicators/arrow_right": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="300" height="300" fill="none" stroke="black" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
  <line x1="10" y1="50" x2="80" y2="50" />
  <line x1="65" y1="30" x2="85" y2="50" />
  <line x1="65" y1="70" x2="85" y2="50" />
</svg>`,

  "indicators/arrow_left": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="300" height="300" fill="none" stroke="black" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
  <line x1="20" y1="50" x2="90" y2="50" />
  <line x1="35" y1="30" x2="15" y2="50" />
  <line x1="35" y1="70" x2="15" y2="50" />
</svg>`,

  "indicators/arrow_up": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="300" height="300" fill="none" stroke="black" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
  <line x1="50" y1="90" x2="50" y2="20" />
  <line x1="30" y1="35" x2="50" y2="15" />
  <line x1="70" y1="35" x2="50" y2="15" />
</svg>`,

  "indicators/arrow_down": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="300" height="300" fill="none" stroke="black" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
  <line x1="50" y1="10" x2="50" y2="80" />
  <line x1="30" y1="65" x2="50" y2="85" />
  <line x1="70" y1="65" x2="50" y2="85" />
</svg>`,

  "indicators/circle": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="300" height="300" fill="none" stroke="black" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
  <circle cx="50" cy="50" r="40" />
</svg>`,

  "indicators/x_mark": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="300" height="300" fill="none" stroke="black" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
  <line x1="20" y1="20" x2="80" y2="80" />
  <line x1="80" y1="20" x2="20" y2="80" />
</svg>`,

  "indicators/checkmark": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="300" height="300" fill="none" stroke="black" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
  <polyline points="15,55 40,80 85,20" />
</svg>`,

  "indicators/versus": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="300" height="300">
  <text x="50" y="68" font-family="Arial, Helvetica, sans-serif" font-size="55" font-weight="bold" fill="black" text-anchor="middle" dominant-baseline="auto">VS</text>
</svg>`,
};

// ---------------------------------------------------------------------------
// Convert each SVG to a 300x300 PNG with transparent background
// ---------------------------------------------------------------------------

async function generatePNGs(): Promise<void> {
  const entries = Object.entries(pictograms);
  console.log(`Generating ${entries.length} pictogram PNGs...`);

  let success = 0;
  let failed = 0;

  for (const [key, svgString] of entries) {
    const outputPath = path.join(ASSETS_DIR, `${key}.png`);
    const outputDir = path.dirname(outputPath);

    // Ensure the category subfolder exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    try {
      const svgBuffer = Buffer.from(svgString);

      await sharp(svgBuffer)
        .resize(300, 300, {
          fit: "contain",
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .png()
        .toFile(outputPath);

      console.log(`  [OK] ${key}.png`);
      success++;
    } catch (err) {
      console.error(`  [FAIL] ${key}.png:`, err);
      failed++;
    }
  }

  console.log(
    `\nDone. ${success} succeeded, ${failed} failed out of ${entries.length} total.`
  );
}

generatePNGs().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
