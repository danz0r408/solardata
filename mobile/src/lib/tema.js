// Paleta do site (app/css/styles.css) convertida de OKLCH para hex.
// Petróleo = dados, ações e seleção. Âmbar = reservado para "oportunidade" (IPNE).

export const CORES = {
  claro: {
    escuro: false,
    bg: "#F7FBFA", surface: "#FCFEFE", ink: "#131F22", muted: "#5B6568", faint: "#8C9496",
    line: "#DFE4E5", track: "#E9EEEE", petrol: "#005657", petrolStrong: "#004546",
    amber: "#ED9E20", danger: "#A13124", dangerBg: "#FFEBE6", bar: "#C8D3D4",
    onPetrol: "#FCFEFE",
  },
  escuro: {
    escuro: true,
    bg: "#0D1416", surface: "#131C1F", ink: "#E7ECED", muted: "#A3ADAF", faint: "#788284",
    line: "#273031", track: "#20282A", petrol: "#5EBDBC", petrolStrong: "#77CFCF",
    amber: "#F5A939", danger: "#EF806F", dangerBg: "#3B1C17", bar: "#314042",
    onPetrol: "#0D1416",
  },
};

export const FONTE = {
  regular: "HankenGrotesk_400Regular",
  media: "HankenGrotesk_500Medium",
  forte: "HankenGrotesk_600SemiBold",
};

// Escala tipográfica do site: 12 / 14 / 16 / 20 / 28 / 40
export const T = { xs: 12, sm: 14, md: 16, lg: 20, xl: 28, xxl: 40 };

export const GUTTER = 20;
export const RAIO = 8;

// ---------- Mistura de cores em OKLab (como o color-mix do mapa no site) ----------

function hexParaLinear(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
}

function linearParaOklab([r, g, b]) {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function oklabParaHex([L, a, b]) {
  const l = Math.pow(L + 0.3963377774 * a + 0.2158037573 * b, 3);
  const m = Math.pow(L - 0.1055613458 * a - 0.0638541728 * b, 3);
  const s = Math.pow(L - 0.0894841775 * a - 1.291485548 * b, 3);
  const rgb = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return "#" + rgb.map((x) => {
    const v = Math.min(1, Math.max(0, x));
    const c = Math.round(255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055));
    return c.toString(16).padStart(2, "0");
  }).join("");
}

// Rampa de cor do mapa: t em [0,1] -> cor entre o fundo (track) e a cor da métrica.
// Pré-calcula 21 tons para não converter cor a cada município.
export function rampa(corFundo, corForte) {
  const a = linearParaOklab(hexParaLinear(corFundo));
  const b = linearParaOklab(hexParaLinear(corForte));
  const tons = [];
  for (let i = 0; i <= 20; i++) {
    const p = (i / 20) * 0.88 + 0.08; // mesma faixa do site: nunca some no fundo
    tons.push(oklabParaHex([0, 1, 2].map((k) => a[k] + (b[k] - a[k]) * p)));
  }
  return (t) => tons[Math.round(Math.min(1, Math.max(0, t)) * 20)];
}
