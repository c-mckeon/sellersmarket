// Sellers Market: map symbols. Simple 24×24 line icons, drawn in white on the owner's colour.
const ICONS = {
  wheat: '<path d="M12 22V8M12 8c-2-1-3-3-3-5 2 0 3 2 3 5zm0 0c2-1 3-3 3-5-2 0-3 2-3 5zM12 13c-2-1-3-3-3-5 2 0 3 2 3 5zm0 0c2-1 3-3 3-5-2 0-3 2-3 5zM12 18c-2-1-3-3-3-5 2 0 3 2 3 5zm0 0c2-1 3-3 3-5-2 0-3 2-3 5z"/>',
  drop: '<path d="M12 3c3 4 6 7.5 6 11a6 6 0 0 1-12 0c0-3.5 3-7 6-11z"/>',
  tree: '<path d="M12 2l-6 9h3l-4 6h14l-4-6h3zM12 17v5"/>',
  pick: '<path d="M4 9c4-5 12-5 16 0M12 6v16M12 6"/><path d="M9 22h6"/>',
  factory: '<path d="M3 21V11l5 3v-3l5 3v-3l5 3V4h3v17zM7 17h2M12 17h2M17 17h2"/>',
  flame: '<path d="M12 22a7 7 0 0 0 7-7c0-4-3-6-4-9-1 3-3 4-3 4s0-3-2-6c-1 4-5 6-5 11a7 7 0 0 0 7 7z"/>',
  bread: '<path d="M4 11a8 5 0 0 1 16 0v1a2 2 0 0 1-2 2v6H6v-6a2 2 0 0 1-2-2z"/>',
  mill: '<path d="M12 12L5 5M12 12l7-7M12 12l-7 7M12 12l7 7M10 22l2-10 2 10"/>',
  bricks: '<path d="M3 6h18v12H3zM3 12h18M8 6v6M16 6v6M12 12v6"/>',
  paper: '<path d="M6 2h9l4 4v16H6zM15 2v4h4M9 11h7M9 15h7M9 19h4"/>',
};

// Which symbol each business gets
const BIZ_ICON = {
  farm: "wheat", water_works: "drop", logging_camp: "tree", sand_pit: "pick", clay_pit: "pick", limestone_quarry: "pick",
  coal_mine: "pick", iron_mine: "pick",
  flour_mill: "mill", sawmill: "tree", blast_furnace: "flame", glassworks: "flame", kiln: "flame", cement_kiln: "bricks",
  paper_mill: "paper", bakery: "bread", steelworks: "factory", concrete_plant: "bricks",
};

// An icon as SVG, centred on (x, y), `size` across
const iconSVG = (name, x, y, size, colour = "#fff") =>
  `<g transform="translate(${x - size / 2},${y - size / 2}) scale(${size / 24})" fill="none" stroke="${colour}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ICONS.factory}</g>`;

// A pawn shape, for where players stand
const pawnSVG = (x, y, h, fill) =>
  `<path transform="translate(${x - h * 0.35},${y - h * 0.55}) scale(${h / 24})" d="M8.4 0a3.6 3.6 0 0 1 2.1 6.5c1.6 1 2.6 2.5 2.6 4.4h-2c.4 3 1.8 5.6 3.4 7.6l2 1.9v3.6H0v-3.6l2-1.9c1.6-2 3-4.6 3.4-7.6h-2c0-1.9 1-3.4 2.6-4.4A3.6 3.6 0 0 1 8.4 0z" fill="${fill}" stroke="#fff" stroke-width="2"/>`;
