// Formatação pt-BR. Mesmas regras do site (app/js/comum.js), escritas à mão para não depender do Intl do motor JS.

export function numero(n, casas = 0) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return "–";
  const fixo = Math.abs(Number(n)).toFixed(casas);
  const [inteiro, decimal] = fixo.split(".");
  const negativo = Number(n) < 0 && Number(fixo) !== 0;
  return (negativo ? "-" : "") + inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, ".") + (decimal ? "," + decimal : "");
}

// 23.800 -> {valor: "23,8", unidade: "mil"}
export function compacto(n) {
  if (n === null || n === undefined) return { valor: "–", unidade: "" };
  const abs = Math.abs(n);
  if (abs >= 1e9) return { valor: numero(n / 1e9, n / 1e9 < 10 ? 2 : 1), unidade: "bi" };
  if (abs >= 1e6) return { valor: numero(n / 1e6, n / 1e6 < 10 ? 2 : 1), unidade: "mi" };
  if (abs >= 1e4) return { valor: numero(n / 1e3, 1), unidade: "mil" };
  return { valor: numero(n), unidade: "" };
}

export function potencia(kw) {
  if (kw === null || kw === undefined) return { valor: "–", unidade: "" };
  if (kw >= 1e6) return { valor: numero(kw / 1e6, 2), unidade: "GW" };
  if (kw >= 1e3) return { valor: numero(kw / 1e3, kw >= 1e5 ? 0 : 1), unidade: "MW" };
  return { valor: numero(kw), unidade: "kW" };
}

export function texto(par) { return par.unidade ? par.valor + " " + par.unidade : par.valor; }

export function reaisMil(milReais) {
  if (milReais === null || milReais === undefined) return "–";
  return "R$ " + texto(compacto(milReais * 1000));
}

export function variacao(p) {
  if (p === null || p === undefined) return "";
  const v = Math.round(p * 100);
  return (v > 0 ? "+" : "") + v + "%";
}

export function mw(v) { return numero(v, v >= 100 ? 0 : 1) + " MW"; }

export function iniciais(nome) {
  const partes = (nome || "").trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return "?";
  const a = partes[0][0];
  const b = partes.length > 1 ? partes[partes.length - 1][0] : partes[0][1] || "";
  return (a + b).toUpperCase();
}

const dois = (n) => String(n).padStart(2, "0");
export function dataCurta(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return dois(d.getDate()) + "/" + dois(d.getMonth() + 1) + ", " + dois(d.getHours()) + ":" + dois(d.getMinutes());
}

export function semAcento(s) {
  return String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function rotulo(l) { return l.tipo === "uf" ? l.nome : l.nome + ", " + l.uf; }
export function caminho(l) { return (l.tipo === "uf" ? "/ufs/" : "/municipios/") + encodeURIComponent(l.codigo); }
export function mesmo(a, b) { return !!a && !!b && a.tipo === b.tipo && String(a.codigo) === String(b.codigo); }
