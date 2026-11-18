// Cliente da API do SolarData (a mesma FastAPI que serve o site).
// Padrão: produção na Vercel. Para testar com a API local: EXPO_PUBLIC_API_URL=http://<ip-do-pc>:8000
export const URL_BASE = (process.env.EXPO_PUBLIC_API_URL || "https://solardata-zeta.vercel.app").replace(/\/+$/, "");

let token = null;
let aoExpirar = null;

export function defineToken(t) { token = t; }
export function quandoSessaoExpirar(fn) { aoExpirar = fn; }

// Erros que a tela não precisa mostrar: carga cancelada ou sessão expirada (o app já volta ao login)
export function ignoravel(e) { return !e || e.name === "AbortError" || e.silencioso === true; }

export async function api(caminho, { metodo = "GET", corpo, publica = false, signal } = {}) {
  const headers = { Accept: "application/json" };
  if (token) headers.Authorization = "Bearer " + token;
  if (corpo !== undefined) headers["Content-Type"] = "application/json";

  let r;
  try {
    r = await fetch(URL_BASE + "/api" + caminho, {
      method: metodo,
      headers,
      body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
      signal,
    });
  } catch (e) {
    if (e.name === "AbortError") throw e;
    throw new Error("Sem conexão com o servidor. Verifique a internet e tente de novo.");
  }

  if (r.status === 401 && !publica) {
    if (aoExpirar) aoExpirar();
    const erro = new Error("Sessão expirada. Entre de novo.");
    erro.silencioso = true;
    erro.status = 401;
    throw erro;
  }

  let dados = {};
  try { dados = await r.json(); } catch { /* corpo vazio */ }
  if (!r.ok) {
    const erro = new Error(typeof dados.detail === "string" ? dados.detail : "Não foi possível concluir. Tente novamente.");
    erro.status = r.status;
    throw erro;
  }
  return dados;
}

// Arquivos estáticos do site (contornos dos municípios do mapa)
export async function estatico(caminho, { signal } = {}) {
  let r;
  try {
    r = await fetch(URL_BASE + "/" + caminho, { signal });
  } catch (e) {
    if (e.name === "AbortError") throw e;
    throw new Error("Sem conexão com o servidor.");
  }
  if (!r.ok) throw new Error("Contornos dos municípios indisponíveis.");
  return r.json();
}
