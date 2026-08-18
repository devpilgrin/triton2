// ArchiMate visual preset. Archify maps component types to CSS variables
// (--<type>-fill / --<type>-stroke); the ArchiMate converter uses those types
// as carriers for layers, and this preset recolors them to the canonical
// ArchiMate palette. Applied to svg[data-preset="archimate"].
//
// Text stays dark only inside node bodies (light fills); legend, boundary
// captions and edge labels keep the theme defaults so they remain readable on
// the dark canvas.
export const ARCHIMATE_CSS = `
svg[data-preset="archimate"] {
  --external-fill: #ffffb5;      --external-stroke: #8a7a00;   /* Business */
  --backend-fill: #b5ffff;       --backend-stroke: #007f8f;    /* Application */
  --database-fill: #c9e7b7;      --database-stroke: #4e7a1e;   /* Technology */
  --messagebus-fill: #ffe0b2;    --messagebus-stroke: #a05a00; /* Physical */
  --cloud-fill: #f5deaa;         --cloud-stroke: #8a6420;      /* Strategy */
  --security-fill: #ffd6e0;      --security-stroke: #90304c;   /* Motivation */
  --frontend-fill: #e8e8e8;      --frontend-stroke: #666666;   /* unassigned */
}
svg[data-preset="archimate"] g[data-node-id] .t-primary { fill: #1a1a1a; }
svg[data-preset="archimate"] g[data-node-id] .t-muted { fill: #404040; }
svg[data-preset="archimate"] g[data-node-id] [class^="t-"] { stroke: none; }
`;
