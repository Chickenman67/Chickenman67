/**
 * Generates the bespoke SVG cards used by the profile README.
 *
 * Why custom SVGs instead of the hosted card services?
 *  - The hosted pin endpoint silently ignores an unknown theme name and
 *    falls back to a white card, which looks broken in GitHub dark mode.
 *  - Mixing remote cards produces mismatched fonts, radii and shadows.
 * Building them here means one design system, exact control over both
 * colour schemes, and no runtime dependency on any third party.
 *
 * Every function returns a standalone SVG string. The two themes share the
 * same geometry and differ only in palette, so they never drift apart.
 */

const PALETTE = {
  light: {
    bg: "#ffffff",
    border: "#d0d7de",
    title: "#1f2328",
    text: "#1f2328",
    muted: "#59636e",
    accent: "#0969da",
    track: "#eaeef2",
  },
  dark: {
    bg: "#0d1117",
    border: "#30363d",
    title: "#e6edf3",
    text: "#e6edf3",
    muted: "#9198a1",
    accent: "#4493f8",
    track: "#21262d",
  },
};

const FONT =
  "'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, Helvetica, Arial, sans-serif";
const MONO = "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace";

/** XML-escape so a repo description can never break the document. */
const escapeXml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

/** Wrap a card body in the shared shell: background, border, title, clip. */
function shell({ title, body, width, height, mode, radius = 12 }) {
  const c = PALETTE[mode];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(title)}">
  <rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="${radius}" fill="${c.bg}" stroke="${c.border}"/>
  <text x="20" y="31" font-family="${FONT}" font-size="15" font-weight="600" fill="${c.title}">${escapeXml(title)}</text>
  ${body}
</svg>
`;
}

/* ------------------------------------------------------------------ */
/* Stats card                                                          */
/* ------------------------------------------------------------------ */

export function statsCard({ mode, stats }) {
  const width = 495;
  const height = 132;
  const c = PALETTE[mode];

  const entries = [
    { label: "Commits", value: stats.totalContributions },
    { label: "Repos", value: stats.totalRepos },
    { label: "Stars", value: stats.totalStars },
    { label: "Followers", value: stats.followers },
  ];

  const columnWidth = (width - 40) / entries.length;
  const cells = entries
    .map((entry, index) => {
      const cx = 20 + columnWidth * index + columnWidth / 2;
      return `  <g>
    <text x="${cx}" y="78" text-anchor="middle" font-family="${FONT}" font-size="26" font-weight="700" fill="${c.title}">${escapeXml(entry.value)}</text>
    <text x="${cx}" y="100" text-anchor="middle" font-family="${FONT}" font-size="12" fill="${c.muted}">${escapeXml(entry.label)}</text>
  </g>`;
    })
    .join("\n");

  // Thin accent rule under the title to tie the card together.
  const rule = `  <line x1="20" y1="46" x2="${width - 20}" y2="46" stroke="${c.track}" stroke-width="1"/>`;

  return shell({ title: stats.title, body: `${rule}\n${cells}`, width, height, mode });
}

/* ------------------------------------------------------------------ */
/* Top languages card                                                  */
/* ------------------------------------------------------------------ */

export function languagesCard({ mode, languages, limit = 5 }) {
  const width = 495;
  const rowHeight = 30;
  const height = 56 + rowHeight * languages.length;
  const c = PALETTE[mode];
  const total = languages.reduce((sum, l) => sum + l.percent, 0) || 1;

  const rows = languages
    .map((language, index) => {
      const y = 56 + index * rowHeight;
      const barWidth = Math.max(
        4,
        ((width - 150) * language.percent) / total,
      );
      return `  <g>
    <text x="20" y="${y + 13}" font-family="${FONT}" font-size="13" fill="${c.text}">${escapeXml(language.name)}</text>
    <rect x="150" y="${y + 4}" width="${width - 150 - 54}" height="11" rx="5.5" fill="${c.track}"/>
    <rect x="150" y="${y + 4}" width="${barWidth}" height="11" rx="5.5" fill="${language.color}"/>
    <text x="${width - 20}" y="${y + 13}" text-anchor="end" font-family="${MONO}" font-size="11.5" fill="${c.muted}">${language.percent.toFixed(1)}%</text>
  </g>`;
    })
    .join("\n");

  return shell({ title: "Most Used Languages", body: rows, width, height, mode });
}

/* ------------------------------------------------------------------ */
/* Activity graph                                                      */
/* ------------------------------------------------------------------ */

const LEVELS = {
  light: ["#ebedf0", "#9be9a8", "#40c463", "#30a14e", "#216e39"],
  dark: ["#161b22", "#0e4429", "#006d32", "#26a641", "#39d353"],
};

/**
 * A contribution heat-map in the familiar GitHub layout: one column per
 * week, one row per weekday.
 */
export function activityCard({ mode, weeks, totalContributions, currentStreak, longestStreak }) {
  // The card is a fixed 495px wide, so the cell size is derived from how
  // many weeks have to fit rather than hard-coded. A year of history must
  // never overflow the card and get clipped by the viewBox.
  const width = 495;
  const padding = 20;
  const usable = width - padding * 2;
  const gap = 3;
  const rows = 7;

  const cols = weeks.length;
  const cell = Math.max(4, Math.floor((usable - gap * (cols - 1)) / cols));
  const actualGraphWidth = cols * cell + (cols - 1) * gap;

  const cellGapY = Math.max(cell + gap, Math.floor((cell * 1.9) / rows));
  const top = 58;
  const height = top + (rows - 1) * cellGapY + cell + 56;
  const c = PALETTE[mode];
  const levels = LEVELS[mode];

  const offsetX = padding + Math.round((usable - actualGraphWidth) / 2);

  const squares = weeks
    .map((week, weekIndex) =>
      week.days
        .map((day, dayIndex) => {
          const x = offsetX + weekIndex * (cell + gap);
          const y = top + dayIndex * cellGapY;
          return `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" rx="${Math.min(2.5, cell / 4)}" fill="${levels[day.level]}"/>`;
        })
        .join(""),
    )
    .join("");

  const footerY = height - 30;
  const body = `${squares}
  <g font-family="${FONT}" font-size="12.5">
    <text x="${padding}" y="${footerY}" fill="${c.muted}">
      <tspan font-weight="700" fill="${c.text}">${escapeXml(totalContributions)}</tspan> contributions this year
    </text>
    <text x="${width / 2}" y="${footerY}" text-anchor="middle" fill="${c.muted}">
      <tspan font-weight="700" fill="${c.text}">${escapeXml(currentStreak)}</tspan> day streak
    </text>
    <text x="${width - padding}" y="${footerY}" text-anchor="end" fill="${c.muted}">
      best <tspan font-weight="700" fill="${c.text}">${escapeXml(longestStreak)}</tspan>
    </text>
  </g>`;

  return shell({ title: "Activity", body, width, height, mode });
}

/* ------------------------------------------------------------------ */
/* Project card                                                        */
/* ------------------------------------------------------------------ */

/**
 * A compact project card. Uses GitHub's real language colour as the accent
 * so each project is visually identifiable at a glance.
 */
export function projectCard({ mode, name, description, language, languageColor, stars }) {
  const width = 236;
  const height = 116;
  const c = PALETTE[mode];
  const accent = languageColor ?? c.accent;
  const title = name.length > 26 ? `${name.slice(0, 25)}…` : name;

  const desc = description && description.trim()
    ? description.trim()
    : "No description yet.";

  // Three lines of body text maximum.
  const lines = wrap(desc, 30).slice(0, 3);

  const body = `  <rect x="0" y="0" width="4" height="${height}" rx="2" fill="${accent}"/>
  <text x="20" y="34" font-family="${FONT}" font-size="14.5" font-weight="650" fill="${c.title}">${escapeXml(title)}</text>
${lines
  .map(
    (line, index) =>
      `  <text x="20" y="${56 + index * 16}" font-family="${FONT}" font-size="11.5" fill="${c.muted}">${escapeXml(line)}</text>`,
  )
  .join("\n")}
  <text x="20" y="${height - 12}" font-family="${FONT}" font-size="11" fill="${c.muted}">
    <tspan fill="${accent}" font-weight="600">${escapeXml(language ?? "—")}</tspan>
    <tspan dx="8">·</tspan>
    <tspan>${escapeXml(stars)} ★</tspan>
  </text>`;

  return shell({ title: "", body, width, height, mode, radius: 12 });
}

/** Greedy word wrap. SVG has no automatic wrapping. */
function wrap(text, perLine) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = "";
  for (const word of words) {
    if ((line + word).length > perLine) {
      if (line) lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/* ------------------------------------------------------------------ */
/* Animated header                                                     */
/* ------------------------------------------------------------------ */

/**
 * Self-contained animated header.
 *
 * Replaces the hosted typing-SVG service for two reasons found while
 * testing the previous version:
 *  1. The hosted SVG is wrapped in a link to its author's repository, so
 *     clicking the header navigated away from this profile.
 *  2. Its embedded webfont left stray glyph dots under the text once the
 *     typing animation finished.
 *
 * This version draws its own shapes and embeds the CSS animation, so it
 * has no font dependency, no external link, and no rendering artefacts.
 * GitHub strips <script> but keeps <style>, so the animation still runs.
 */
export function headerSvg({ lines, colors, width = 720, height = 118 }) {
  const lineHeight = 34;
  const startY = 44;

  const rows = lines
    .map((line, index) => {
      const y = startY + index * lineHeight;
      const colour = colors[index % colors.length];
      return `    <text x="0" y="${y}" class="line" fill="${colour}" style="animation-delay:${index * 0.55}s">${escapeXml(line)}</text>`;
    })
    .join("\n");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(lines.join(", "))}">
  <style>
    @keyframes typeIn {
      0%, 12%   { opacity: 0; }
      4%, 30%   { opacity: 1; }
      40%, 100% { opacity: 0; }
    }
    @keyframes caret {
      0%, 45%   { opacity: 1; }
      50%, 95%  { opacity: 0; }
      100%      { opacity: 1; }
    }
    .line {
      font-family: ${MONO};
      font-size: 19px;
      font-weight: 600;
      opacity: 0;
      animation: typeIn 7.5s linear infinite;
    }
    .caret {
      animation: caret 0.9s steps(1) infinite;
    }
  </style>
  <g transform="translate(28 0)">
${rows}
    <rect class="caret" x="0" y="${startY - 19}" width="10" height="22" rx="2" fill="${colors[colors.length - 1]}"/>
  </g>
</svg>
`;
}

export { PALETTE, FONT, MONO, escapeXml, shell, wrap };