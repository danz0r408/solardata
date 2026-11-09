/* Indicadores: busca de estado/município e ficha completa */
(function () {
  "use strict";
  if (!SD.sessao.exige()) return;

  var fmt = SD.fmt, el = SD.el, texto = SD.fmt.texto;
  var controle = null;
  // Média das 5.549 sedes municipais com dado no INPE (silver.inpe_solar_consolidado_2017)
  var IRRADIACAO_MEDIA_BRASIL = 5.04;

  var selUf = el("sel-uf");

  function renderRecentes() { SD.preencheRecentes(el("recentes"), escolhe); }

  // O seletor mostra o estado quando o local atual é um estado; para municípios, volta ao texto inicial
  function sincronizaSeletor() {
    var atual = SD.local.atual();
    selUf.value = atual.tipo === "uf" ? atual.codigo : "";
  }

  function escolhe(l) {
    SD.local.escolhe(l);
    renderRecentes();
    sincronizaSeletor();
    carrega();
  }

  SD.api("/ufs").then(function (ufs) {
    var frag = document.createDocumentFragment();
    ufs.forEach(function (u) {
      var o = document.createElement("option");
      o.value = u.codigo;
      o.textContent = u.nome;
      frag.appendChild(o);
    });
    selUf.appendChild(frag);
    sincronizaSeletor();
  }).catch(function () { selUf.disabled = true; });

  selUf.addEventListener("change", function () {
    if (!selUf.value) return;
    var opcao = selUf.options[selUf.selectedIndex];
    escolhe({ tipo: "uf", codigo: selUf.value, nome: opcao.textContent, uf: selUf.value });
  });

  SD.ligaBusca(el("busca"), el("resultados"), escolhe);

  // sugestões só são buscadas quando o usuário abre a seção
  document.querySelector(".suggest").addEventListener("toggle", function (ev) {
    if (ev.target.open) SD.preencheSugestoes(el("sugestoes"), escolhe);
  });

  // ---------- Ficha ----------

  function renderFicha(r) {
    el("f-inst").textContent = fmt.numero(r.instalacoes);
    el("f-pot").textContent = texto(fmt.potencia(r.potencia_kw));
    el("f-mil").textContent = fmt.numero(r.inst_por_mil_hab, 1);
    el("f-hab").textContent = fmt.numero(r.kw_por_hab, 2) + " kW";
    el("f-uc").textContent = r.uc_recebem_credito != null ? fmt.numero(r.uc_recebem_credito) : "–";
    el("f-pop").textContent = texto(fmt.compacto(r.populacao));
    el("f-pib").textContent = fmt.reaisMil(r.pib_mil_reais);
    el("f-pibpc").textContent = r.pib_per_capita != null ? "R$ " + texto(fmt.compacto(r.pib_per_capita)) : "–";
    el("f-mildom").textContent = r.inst_por_mil_domicilios != null ? fmt.numero(r.inst_por_mil_domicilios, 1) : "–";
    el("f-dom").textContent = r.domicilios != null ? texto(fmt.compacto(r.domicilios)) : "–";
    el("f-renda").textContent = r.renda_pc != null ? "R$ " + fmt.numero(r.renda_pc) + "/mês" : "–";

    // Irradiação: kWh/m²/dia e comparação com a média brasileira das sedes municipais
    if (r.irradiacao_kwh_m2_dia != null) {
      el("f-irr").textContent = fmt.numero(r.irradiacao_kwh_m2_dia, 2) + " kWh/m²" + (r.irradiacao_estimada ? " (estimada)" : "");
      var rel = r.irradiacao_kwh_m2_dia / IRRADIACAO_MEDIA_BRASIL - 1;
      el("f-irr-comp").textContent = Math.abs(rel) < 0.02 ? "Na média"
        : Math.round(Math.abs(rel) * 100) + "% " + (rel > 0 ? "mais sol" : "menos sol");
    } else {
      el("f-irr").textContent = "–";
      el("f-irr-comp").textContent = "–";
    }
    el("f-irr-nota").textContent = "INPE, Atlas Brasileiro de Energia Solar 2017 (irradiação global horizontal)" +
      (r.irradiacao_estimada ? ". Sem medição para este município: média do estado." : ".") +
      (r.tipo === "uf" ? " Média dos municípios, ponderada pela população." : "");

    var aviso = el("f-oport-aviso");
    el("f-oport-legenda").hidden = !r.ipne;
    if (r.ipne) {
      el("f-oport").hidden = false;
      aviso.hidden = true;
      var pct = Math.round(Math.abs(r.ipne.diferenca_pct) * 100);
      el("f-ipne").textContent = r.ipne.score + " / 100 · " + r.ipne.nivel;
      el("f-esp").textContent = texto(fmt.compacto(r.ipne.esperado));
      el("f-dif").textContent = pct < 5 ? "Em linha" : pct + "% " + (r.ipne.diferenca_pct < 0 ? "abaixo" : "acima");
      el("f-pos").textContent = fmt.numero(r.ipne.posicao) + "º de " + fmt.numero(r.ipne.total);
    } else {
      el("f-oport").hidden = true;
      aviso.hidden = false;
      aviso.innerHTML = r.tipo === "uf"
        ? 'O IPNE é calculado por município, comparando cada um com os do próprio estado. <a href="rankings.html?uf=' +
          encodeURIComponent(r.uf) + '">Ver ranking de oportunidade em ' + SD.escapa(r.nome) + "</a>."
        : "Sem score: o Distrito Federal tem um único município, então não há com quem comparar dentro da UF.";
    }

    renderML(r);

    var rotulo = r.tipo === "uf" ? r.nome : r.nome + ", " + r.uf;
    SD.linhaFonte(r.referencias).then(function (linha) { el("rodape").textContent = rotulo + " · " + linha; });
  }

  // ---------- Machine Learning (Random Forest de potência esperada) ----------

  function mw(v) { return fmt.numero(v, v >= 100 ? 0 : 1) + " MW"; }

  var ultimoResumo = null;

  function renderML(r) {
    ultimoResumo = r;
    var aviso = el("f-ml-aviso");
    var ml = r.ml;
    el("f-ml").hidden = !ml;
    if (!ml) {
      aviso.hidden = false;
      aviso.textContent = r.tipo === "uf"
        ? "A estimativa por Machine Learning é feita por município. Escolha um município do estado para vê-la."
        : "Sem estimativa por Machine Learning para este município.";
      el("f-ml-nota").textContent = "";
      return;
    }
    el("f-ml-inst").textContent = mw(ml.instalada_mw);
    el("f-ml-est").textContent = mw(ml.estimada_mw);
    // positivo = espaço para crescer; negativo = já instalou mais do que o modelo estima
    el("f-ml-pot").textContent = ml.potencial_adicional_mw > 0
      ? "+" + mw(ml.potencial_adicional_mw)
      : "Já acima em " + mw(-ml.potencial_adicional_mw);
    el("f-ml-sit").textContent = ml.situacao;
    aviso.hidden = ml.confiavel;
    aviso.textContent = "Estimativa menos confiável para municípios com mais de 1 milhão de habitantes: " +
      "o modelo não estima valores além dos que viu no treino, então tende a subestimar as maiores cidades.";
    el("f-ml-nota").textContent = ml.algoritmo + " treinado com população, PIB per capita, densidade, domicílios, " +
      "renda, empresas, irradiação e estado. Estimativa fora da amostra (validação cruzada)" +
      (metricasML ? ": erro médio de " + fmt.numero(metricasML.erro_medio_mw, 1) + " MW." : ".") +
      " É uma comparação estatística, não garante demanda nem viabilidade técnica.";
  }

  // métricas do modelo, buscadas uma vez para a nota de rodapé
  var metricasML = null;
  SD.api("/modelo").then(function (m) {
    metricasML = m.ml && m.ml.erro_medio_mw != null ? m.ml : null;
    if (ultimoResumo) renderML(ultimoResumo);  // a ficha pode ter chegado antes das métricas
  }).catch(function () { /* nota fica sem o erro médio */ });

  function carrega() {
    var ficha = el("ficha");
    if (controle) controle.abort();
    controle = new AbortController();
    ficha.setAttribute("aria-busy", "true");
    el("erro").hidden = true;
    el("ficha-titulo").textContent = SD.local.rotulo(SD.local.atual());
    SD.api(SD.local.caminho(SD.local.atual()), { signal: controle.signal })
      .then(function (r) { renderFicha(r); ficha.setAttribute("aria-busy", "false"); })
      .catch(function (e) {
        if (e.name === "AbortError") return;
        el("erro").hidden = false;
        el("erro").textContent = e.message;
      });
  }

  renderRecentes();
  carrega();
})();
