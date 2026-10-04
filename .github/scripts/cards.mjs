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

/* ------------------------------------------------------------------ */
/* Snake                                                               */
/* ------------------------------------------------------------------ */

/**
 * A snake that eats your contribution graph, cell by cell.
 *
 * Inspired by Platane/snk, but drawn here so it matches the rest of the
 * design system, fits GitHub's content column, and ships a light and a
 * dark variant. The upstream SVG is 880px wide and light-only, which is
 * why this is reimplemented rather than embedded.
 *
 * The path is precomputed here and revealed with a CSS animation, so the
 * browser only has to interpolate one dash-offset. No JavaScript, which
 * GitHub strips from SVGs anyway.
 */
export function snakeSvg({ mode, cells, totalContributions }) {
  const width = 495;
  const padding = 20;
  const usable = width - padding * 2;
  const gap = 3;
  const rows = 7;
  const top = 54;
  const c = PALETTE[mode];
  const levels = LEVELS[mode];

  const cols = cells.cols;
  const cell = Math.max(4, Math.floor((usable - gap * (cols - 1)) / cols));
  const height = top + rows * (cell + gap) + 18;

  // The snake only visits days that had a contribution, so the whole scene
  // is offset to the first active week instead of idling through dead space.
  const firstActiveCol = cells.grid.length ? cells.grid[0].col : 0;
  const activeCols = cols - firstActiveCol;

  // Wider cells look better once the empty weeks are cropped away.
  const liveCell = Math.max(
    4,
    Math.min(9, Math.floor((usable - gap * (activeCols - 1)) / activeCols)),
  );
  const step = liveCell + gap;
  const offsetX = padding + Math.round((usable - (activeCols * step - gap)) / 2);

  const pos = (point) => ({
    x: offsetX + (point.col - firstActiveCol) * step + liveCell / 2,
    y: top + point.row * step + liveCell / 2,
  });

  // Draw the whole calendar so the snake has something to eat.
  const squares = cells.all
    .map((point) => {
      const p = pos(point);
      return `<rect x="${(p.x - liveCell / 2).toFixed(1)}" y="${(p.y - liveCell / 2).toFixed(1)}" width="${liveCell}" height="${liveCell}" rx="1.5" fill="${levels[point.level]}"/>`;
    })
    .join("");

  // The body travels the path as a short bright segment rather than
  // growing from nothing, so there is always something visible to look at.
  const pathPoints = cells.grid.map(pos);
  let length = 0;
  const segments = [];
  pathPoints.forEach((p, index) => {
    segments.push(`${index === 0 ? "M" : "L"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`);
    if (index > 0) {
      const prev = pathPoints[index - 1];
      length += Math.hypot(p.x - prev.x, p.y - prev.y);
    }
  });

  const total = Math.ceil(length) + 2;
  const bodyLength = Math.max(26, Math.min(90, Math.round(activeCols * step * 0.55)));
  const stroke = Math.max(3, liveCell * 0.72);

  // Roughly 170px per second: quick enough to feel alive, slow enough to
  // follow with your eyes.
  const duration = Math.min(14, Math.max(6, Number((total / 170).toFixed(1))));

  const head = pathPoints[0] ?? { x: offsetX + liveCell / 2, y: top + liveCell / 2 };

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="A snake eating ${escapeXml(totalContributions)} contributions">
  <style>
    @keyframes slither {
      from { stroke-dashoffset: ${bodyLength}; }
      to   { stroke-dashoffset: ${-total - bodyLength}; }
    }
    @keyframes blink {
      0%, 100% { opacity: 1; }
      50%      { opacity: 0.35; }
    }
    .snake {
      fill: none;
      stroke-linecap: round;
      stroke-linejoin: round;
      stroke-dasharray: ${bodyLength} ${total + bodyLength * 2};
      animation: slither ${duration}s linear infinite;
    }
    .eye { animation: blink 0.9s steps(1) infinite; }
  </style>
  <defs>
    <linearGradient id="snakeSkin" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#a371f7"/>
      <stop offset="55%" stop-color="#58a6ff"/>
      <stop offset="100%" stop-color="#3fb950"/>
    </linearGradient>
  </defs>
  <rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="12" fill="${c.bg}" stroke="${c.border}"/>
  <text x="${padding}" y="30" font-family="${FONT}" font-size="13.5" font-weight="600" fill="${c.title}">Contribution Snake</text>
  <text x="${width - padding}" y="30" text-anchor="end" font-family="${FONT}" font-size="11.5" fill="${c.muted}">${escapeXml(totalContributions)} commits · ${escapeXml(activeCols)} active weeks</text>
  ${squares}
  <path class="snake" d="${segments.join(" ")}" stroke="url(#snakeSkin)" stroke-width="${stroke.toFixed(2)}"/>
  <circle class="eye" cx="${head.x.toFixed(1)}" cy="${head.y.toFixed(1)}" r="${(liveCell * 0.26).toFixed(2)}" fill="#a371f7"/>
</svg>
`;
}

/* ------------------------------------------------------------------ */
/* Hero banner                                                         */
/* ------------------------------------------------------------------ */

/**
 * The wide banner at the top of the profile.
 *
 * Drawn as an SVG rather than an image so it stays sharp at any width and
 * so the ambient gradient animation survives GitHub's sanitiser, which
 * strips <script> but keeps <style>.
 */
export function heroSvg({ name, tagline, mode = "dark" }) {
  const width = 780;
  const height = 190;
  const c = PALETTE[mode];

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(name)} — ${escapeXml(tagline)}">
  <style>
    @keyframes drift {
      0%, 100% { transform: translate(0, 0) scale(1); }
      33%      { transform: translate(26px, -18px) scale(1.06); }
      66%      { transform: translate(-22px, 14px) scale(0.97); }
    }
    @keyframes sweep {
      from { transform: translateX(-120%); }
      to   { transform: translateX(220%); }
    }
    @keyframes glow {
      0%, 100% { opacity: 0.55; }
      50%      { opacity: 0.95; }
    }
    .blob   { animation: drift 26s ease-in-out infinite; transform-origin: center; }
    .blob-2 { animation-duration: 34s; animation-direction: reverse; }
    .sheen  { animation: sweep 7.5s linear infinite; }
    .halo   { animation: glow 4.5s ease-in-out infinite; }
  </style>
  <defs>
    <linearGradient id="backdrop" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0d1117"/>
      <stop offset="55%" stop-color="#161b22"/>
      <stop offset="100%" stop-color="#0d1117"/>
    </linearGradient>
    <radialGradient id="glowA">
      <stop offset="0%" stop-color="#1f6feb" stop-opacity="0.75"/>
      <stop offset="100%" stop-color="#1f6feb" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glowB">
      <stop offset="0%" stop-color="#8957e5" stop-opacity="0.7"/>
      <stop offset="100%" stop-color="#8957e5" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glowC">
      <stop offset="0%" stop-color="#238636" stop-opacity="0.6"/>
      <stop offset="100%" stop-color="#238636" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#e6edf3"/>
      <stop offset="100%" stop-color="#79c0ff"/>
    </linearGradient>
    <clipPath id="frame">
      <rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="18"/>
    </clipPath>
  </defs>

  <g clip-path="url(#frame)">
    <rect width="${width}" height="${height}" fill="url(#backdrop)"/>
    <circle class="blob"   cx="130" cy="60"  r="150" fill="url(#glowA)"/>
    <circle class="blob blob-2" cx="660" cy="150" r="170" fill="url(#glowB)"/>
    <circle class="blob"   cx="420" cy="200" r="130" fill="url(#glowC)"/>
    <rect class="sheen" x="0" y="0" width="180" height="${height}" fill="#ffffff" opacity="0.045" transform="skewX(-18)"/>
  </g>

  <circle class="halo" cx="${width / 2}" cy="${height / 2}" r="120" fill="none" stroke="#1f6feb" stroke-opacity="0.14" stroke-width="1.5"/>
  <rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="18" fill="none" stroke="#30363d"/>

  <text x="40" y="92" font-family="${FONT}" font-size="42" font-weight="700" fill="url(#title)">${escapeXml(name)}</text>
  <text x="40" y="128" font-family="${MONO}" font-size="15" fill="#9198a1">${escapeXml(tagline)}</text>
  <g transform="translate(40 150)">
    <rect width="104" height="24" rx="12" fill="#1f6feb" fill-opacity="0.16" stroke="#1f6feb" stroke-opacity="0.45"/>
    <text x="52" y="16" text-anchor="middle" font-family="${MONO}" font-size="11.5" fill="#79c0ff">automation</text>
    <rect x="112" width="86" height="24" rx="12" fill="#8957e5" fill-opacity="0.16" stroke="#8957e5" stroke-opacity="0.45"/>
    <text x="155" y="16" text-anchor="middle" font-family="${MONO}" font-size="11.5" fill="#d2a8ff">file viewers</text>
    <rect x="206" width="72" height="24" rx="12" fill="#238636" fill-opacity="0.18" stroke="#238636" stroke-opacity="0.5"/>
    <text x="242" y="16" text-anchor="middle" font-family="${MONO}" font-size="11.5" fill="#56d364">web apps</text>
  </g>
  <text x="${width - 40}" y="${height - 22}" text-anchor="end" font-family="${MONO}" font-size="11" fill="#6e7681">github.com/Chickenman67</text>
</svg>
`;
}

export { PALETTE, FONT, MONO, escapeXml, shell, wrap };