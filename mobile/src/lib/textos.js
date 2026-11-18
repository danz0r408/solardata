// Textos explicativos, no mesmo vocabulário do site: clientes em potencial, cidades parecidas, nota de oportunidade.
// Manchete, nível, contexto, argumentos e veredito de cada município vêm prontos da API.

export const CIDADES_PARECIDAS =
  "Cidades parecidas: o que o modelo espera para uma cidade com essa renda, PIB, população, domicílios e sol, no mesmo estado.";

export const LEGENDA_NOTA =
  "Quanto maior a nota, menos explorada a cidade em relação a cidades parecidas. Perto de 0, já está bem explorada.";

export const RESSALVA = "Mostra onde procurar clientes. Não garante vendas.";

// Painel do ⓘ ao lado da nota: parágrafos com trechos em negrito ([texto, negrito?])
export const COMO_LER_NOTA = [
  [["A "], ["nota de oportunidade", true], [" (IPNE) compara as instalações solares de hoje com as de "],
    ["cidades parecidas", true], [": mesma renda, PIB, população, domicílios e sol, no mesmo estado."]],
  [["Vai de 0 a 100. "], ["Perto de 100", true], [": muito pouco explorada. "],
    ["Perto de 0", true], [": muito bem explorada."]],
  [[RESSALVA]],
];

export function semelhantes(nome) {
  return "Cidades do Brasil com população, renda, PIB e domicílios mais próximos de " + nome + ". Servem para comparar.";
}

// Quando não há nota (estado ou DF)
export function semNota(r) {
  if (r.tipo === "uf") return "A nota de oportunidade é calculada por cidade. Escolha uma cidade do estado para vê-la.";
  return "Sem nota: ela compara cada cidade com outras do mesmo estado, e o Distrito Federal tem uma só.";
}

// Média das 5.549 sedes municipais com dado no INPE (a mesma do site)
export const IRRADIACAO_MEDIA_BRASIL = 5.04;

// ---------- Rankings ----------

export const MAIS_CLIENTES =
  "Quantas instalações faltam para a cidade chegar ao nível de cidades parecidas. Favorece as cidades grandes.";

export const MENOS_EXPLORADAS =
  "Cidades com a maior nota: poucas instalações para o tamanho, comparadas a cidades parecidas.";

export const ONDE_JA_SE_VENDE =
  "Mostra onde já existem mais instalações hoje: mercado consolidado, com mais concorrência. Não é oportunidade.";

export const COM_RESSALVAS = "Com ressalvas (muitos prédios ou modelos em desacordo)";

export const ESTADOS_CLIENTES =
  "Soma dos clientes em potencial das cidades do estado. Por domicílio compara estados de tamanhos diferentes (o DF fica de fora).";

// "10/2026" ou "2026-10" -> "out/2026"
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
export function mesAno(ref) {
  const s = String(ref || "");
  let m = s.match(/^(\d{1,2})[/-](\d{4})/);
  if (m) return (MESES[Number(m[1]) - 1] || m[1]) + "/" + m[2];
  m = s.match(/^(\d{4})[/-](\d{1,2})/);
  if (m) return (MESES[Number(m[2]) - 1] || m[2]) + "/" + m[1];
  return s;
}

// Rodapé curto das telas (a origem no Databricks fica em Perfil > Sobre os dados)
export function fonteCurta(ref) {
  return "Dados ANEEL de " + mesAno(ref.aneel) + " · IBGE (PIB " + ref.pib + ", pop. " + ref.populacao + ")";
}
