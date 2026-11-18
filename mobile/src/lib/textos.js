// Textos explicativos: os mesmos do site (app/js/comum.js), para web e celular dizerem a mesma coisa.
// Manchete, nível e alertas de cada município vêm prontos da API.

export const ESPERADO_PERFIL =
  "Esperado pelo perfil: quantas instalações o modelo estima para um município com essa renda, PIB, população, " +
  "densidade, domicílios e sol, comparando com os outros municípios do mesmo estado.";

export const LEGENDA_IPNE =
  "Quanto maior o IPNE, mais espaço para crescer em relação ao esperado pelo perfil. Perto de 0, o mercado já está maduro.";

export const RESSALVA = "Indica onde investigar, não garante demanda.";

// Painel do ⓘ ao lado do IPNE: parágrafos com trechos em negrito ([texto, negrito?])
export const COMO_LER_IPNE = [
  [["O "], ["IPNE", true], [" (Índice de Potencial Não Explorado) compara as instalações solares de hoje com o "],
    ["esperado pelo perfil", true], [": quantas um município com essa renda, PIB, população, densidade, domicílios e sol costuma ter no mesmo estado."]],
  [["Vai de 0 a 100. "], ["Perto de 100", true], [": bem abaixo do esperado, alta oportunidade. "],
    ["Perto de 0", true], [": acima do esperado, mercado maduro."]],
  [["Indica onde investigar, não garante demanda."]],
];

export function semelhantes(nome) {
  return "Municípios do Brasil com população, PIB per capita, renda, densidade e domicílios por habitante mais próximos de " +
    nome + ". Servem para comparar pares; o IPNE de cada um compara com o próprio estado.";
}

// Quando não há score (estado ou DF)
export function semIPNE(r) {
  if (r.tipo === "uf") {
    return "O IPNE é calculado por município, comparando cada um com o esperado pelo perfil no mesmo estado.";
  }
  return "Sem score: o IPNE compara cada município com outros do mesmo estado, e o Distrito Federal tem um só.";
}

// Média das 5.549 sedes municipais com dado no INPE (a mesma do site)
export const IRRADIACAO_MEDIA_BRASIL = 5.04;

// ---------- Onde vender (rankings por espaço) ----------

export const MAIS_ESPACO =
  "Mais espaço: municípios com mais instalações faltando em relação ao esperado pelo perfil, em número absoluto. " +
  "Favorece as cidades maiores; o IPNE mostra esse espaço em proporção ao tamanho da cidade.";

export const MAIOR_IPNE =
  "Maior IPNE: municípios com mais espaço para crescer em proporção ao tamanho, em relação ao esperado pelo perfil.";

export const MAIOR_ADOCAO = "Maior adoção: municípios com mais instalações solares hoje (ANEEL).";

export const SELOS =
  "IPNE e ML concordam: o índice e o modelo de Machine Learning apontam espaço para crescer. " +
  "Muitos apartamentos: parte dos domicílios não tem telhado próprio, então o espaço pode estar superestimado.";

export const ESTADOS_ESPACO =
  "Espaço do estado: soma do que falta nos municípios para chegar ao esperado pelo perfil. " +
  "Por mil domicílios compara estados de tamanhos diferentes. O Distrito Federal fica de fora (sem IPNE).";
