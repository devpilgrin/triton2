// Ported from triton-diagram-editor (devpilgrin, MIT): apps/web/src/mermaid/keywords.ts
/** Russian color words accepted anywhere a CSS color is expected in the text
 * syntax, mapped to their standard CSS (English) name. Input is matched
 * case-insensitively; anything not found here is passed through as-is, so
 * English names and hex codes keep working untouched. */
const RU_COLOR_NAMES = {
  красный: 'red',
  зелёный: 'green',
  зеленый: 'green',
  синий: 'blue',
  жёлтый: 'yellow',
  желтый: 'yellow',
  оранжевый: 'orange',
  фиолетовый: 'purple',
  розовый: 'pink',
  чёрный: 'black',
  черный: 'black',
  белый: 'white',
  серый: 'gray',
  бирюзовый: 'teal',
  коричневый: 'brown',
  голубой: 'cyan',
  пурпурный: 'magenta',
  лайм: 'lime',
  тёмно_синий: 'navy',
  темно_синий: 'navy',
  бордовый: 'maroon',
  оливковый: 'olive',
  серебристый: 'silver',
  золотой: 'gold',
  индиго: 'indigo',
  коралловый: 'coral',
  хаки: 'khaki',
  лавандовый: 'lavender',
};

export function resolveColorName(raw) {
  const normalized = raw.trim().toLowerCase().replace(/[\s-]+/g, '_');
  return RU_COLOR_NAMES[normalized] ?? raw.trim();
}

const LINE_STYLE_WORDS = {
  solid: 'solid',
  сплошная: 'solid',
  сплошной: 'solid',
  dashed: 'dashed',
  прерывистая: 'dashed',
  прерывистый: 'dashed',
  dashdot: 'dashdot',
  'dash-dot': 'dashdot',
  пунктир: 'dashdot',
  пунктирная: 'dashdot',
  прерывистаясточками: 'dashdot',
};

/** Recognizes a line-style keyword in either language (in addition to the
 * punctuation tokens "-", "--", "-.-", which are handled separately). */
export function resolveLineStyleWord(raw) {
  const normalized = raw.trim().toLowerCase().replace(/[\s_-]+/g, '');
  return LINE_STYLE_WORDS[normalized] ?? null;
}
