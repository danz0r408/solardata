/* Explorar: busca única de cidade/estado, mapa dos estados e ficha completa.
   O local aberto aqui é independente da "minha cidade" do Início (SD.explorar x SD.local). */
(function () {
  "use strict";
  if (!SD.sessao.exige()) return;

  var fmt = SD.fmt, el = SD.el, texto = SD.fmt.texto;
  var controle = null;
  // Média das 5.549 sedes municipais com dado no INPE (silver.inpe_solar_consolidado_2017)
  var IRRADIACAO_MEDIA_BRASIL = 5.04;

  function renderRecentes() { SD.preencheRecentes(el("recentes"), function (l) { escolhe(l, true); }, SD.explorar.atual()); }

  // rolar = true quando a escolha vem da busca, do mapa ou de uma lista: leva o usuário até a ficha
  function escolhe(l, rolar) {
    SD.explorar.escolhe(l);
    renderRecentes();
    marcaNoMapa();
    carrega();
    if (rolar) {
      var ficha = el("ficha");
      ficha.focus({ preventScroll: true });
      ficha.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    }
  }

  SD.ligaBusca(el("busca"), el("resultados"), function (l) { escolhe(l, true); });

  // sugestões só são buscadas quando o usuário abre a seção
  document.querySelector(".suggest").addEventListener("toggle", function (ev) {
    if (ev.target.open) SD.preencheSugestoes(el("sugestoes"), function (l) { escolhe(l, true); });
  });

  // ---------- Mapa dos estados ----------

  var MAPA = window.SD_MAPA;
  var NS = "http://www.w3.org/2000/svg";
  var METRICAS = {
    ipne_ponderado: {
      nome: "Oportunidade", classe: "map--oportunidade",
      valor: function (v) { return fmt.numero(v, 0); },
      legenda: "Oportunidade: IPNE médio dos municípios, ponderado pela população. Mostra onde mais gente vive em " +
        "cidades abaixo do esperado pelo perfil; por isso é puxado pelas cidades grandes. O Distrito Federal não tem IPNE."
    },
    inst_por_mil_hab: {
      nome: "Adoção", classe: "map--adocao",
      valor: function (v) { return fmt.numero(v, 1) + " por mil hab."; },
      legenda: "Adoção: instalações solares por 1.000 habitantes (ANEEL). Dado bruto, sem modelo."
    }
  };
  var estados = {};   // sigla -> {codigo, nome, regiao, ipne_ponderado, inst_por_mil_hab}
  var formas = {};    // sigla -> <path>
  var metrica = "ipne_ponderado", regiao = "";

  function desenhaMapa() {
    var svg = el("mapa");
    svg.setAttribute("viewBox", "0 0 " + MAPA.largura + " " + MAPA.altura);
    var frag = document.createDocumentFragment();
    Object.keys(MAPA.ufs).forEach(function (sigla) {
      var p = document.createElementNS(NS, "path");
      p.setAttribute("d", MAPA.ufs[sigla]);
      p.setAttribute("class", "map__uf");
      p.setAttribute("role", "button");
      p.dataset.uf = sigla;
      formas[sigla] = p;
      frag.appendChild(p);
    });
    svg.appendChild(frag);

    function alvo(ev) {
      var p = ev.target.closest ? ev.target.closest(".map__uf") : null;
      return p && estados[p.dataset.uf] && !p.classList.contains("map__uf--fora") ? p : null;
    }
    function abre(p) { var u = estados[p.dataset.uf]; escolhe({ tipo: "uf", codigo: u.codigo, nome: u.nome, uf: u.codigo }, true); }
    svg.addEventListener("click", function (ev) { var p = alvo(ev); if (p) abre(p); });
    svg.addEventListener("keydown", function (ev) {
      var p = alvo(ev);
      if (p && (ev.key === "Enter" || ev.key === " ")) { ev.preventDefault(); abre(p); }
    });
    // passar o mouse ou focar mostra o valor sem precisar abrir
    function mostra(ev) { var p = alvo(ev); if (p) leitura(estados[p.dataset.uf]); }
    svg.addEventListener("pointerover", mostra);
    svg.addEventListener("focusin", mostra);
    svg.addEventListener("pointerleave", function () { leitura(null); });
  }

  function leitura(u) {
    var m = METRICAS[metrica];
    el("mapa-leitura").textContent = !u ? "Toque num estado para abrir a ficha."
      : u.nome + " · " + m.nome + ": " + (u[metrica] == null ? "sem dado" : m.valor(u[metrica]));
  }

  function pintaMapa() {
    var m = METRICAS[metrica];
    var valores = Object.keys(estados).map(function (s) { return estados[s][metrica]; })
      .filter(function (v) { return v != null; });
    if (!valores.length) return;
    // escala sobre o Brasil todo: trocar de região não muda a cor de um estado
    var min = Math.min.apply(null, valores), max = Math.max.apply(null, valores), faixa = max - min || 1;
    el("mapa").setAttribute("class", "map__svg " + m.classe);

    Object.keys(formas).forEach(function (sigla) {
      var p = formas[sigla], u = estados[sigla];
      var v = u ? u[metrica] : null;
      var dentro = !regiao || (u && u.regiao === regiao);
      p.classList.toggle("map__uf--fora", !dentro);
      p.classList.toggle("map__uf--sem", v == null);
      p.style.setProperty("--t", v == null ? "0" : ((v - min) / faixa).toFixed(3));
      p.setAttribute("tabindex", dentro && u ? "0" : "-1");
      p.setAttribute("aria-hidden", dentro ? "false" : "true");
      p.setAttribute("aria-label", u ? u.nome + ", " + m.nome.toLowerCase() + " " + (v == null ? "sem dado" : m.valor(v)) : sigla);
    });

    el("mapa-min").textContent = m.valor(min);
    el("mapa-max").textContent = m.valor(max);
    el("mapa-legenda-texto").textContent = m.legenda;

    // os 3 maiores da região escolhida: a leitura do mapa em texto (e o alvo fácil para estados pequenos)
    var top = Object.keys(estados).map(function (s) { return estados[s]; })
      .filter(function (u) { return u[metrica] != null && (!regiao || u.regiao === regiao); })
      .sort(function (a, b) { return b[metrica] - a[metrica]; }).slice(0, 3);
    var lista = el("mapa-top");
    lista.innerHTML = "";
    top.forEach(function (u, i) {
      var li = document.createElement("li");
      var b = document.createElement("button");
      b.type = "button";
      b.innerHTML = '<span class="rank__pos">' + (i + 1) + '</span><span class="results__name">' + SD.escapa(u.nome) +
        '</span><span class="map__top-valor">' + SD.escapa(m.valor(u[metrica])) + "</span>";
      b.addEventListener("click", function () { escolhe({ tipo: "uf", codigo: u.codigo, nome: u.nome, uf: u.codigo }, true); });
      li.appendChild(b);
      lista.appendChild(li);
    });
    el("mapa-top-titulo").textContent = "Maior " + m.nome.toLowerCase() + (regiao ? " · " + regiao : " · Brasil");

    enquadra();
    marcaNoMapa();
  }

  // Zoom na região escolhida (com margem); Brasil inteiro sem região
  function enquadra() {
    var svg = el("mapa");
    if (!regiao) { svg.setAttribute("viewBox", "0 0 " + MAPA.largura + " " + MAPA.altura); return; }
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    Object.keys(formas).forEach(function (s) {
      if (!estados[s] || estados[s].regiao !== regiao) return;
      var b = formas[s].getBBox();
      x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y);
      x1 = Math.max(x1, b.x + b.width); y1 = Math.max(y1, b.y + b.height);
    });
    if (x0 === Infinity) return;
    var pad = Math.max(x1 - x0, y1 - y0) * 0.06;
    svg.setAttribute("viewBox", [x0 - pad, y0 - pad, x1 - x0 + pad * 2, y1 - y0 + pad * 2]
      .map(function (n) { return n.toFixed(1); }).join(" "));
  }

  // destaca o estado aberto (ou o estado do município aberto)
  function marcaNoMapa() {
    var atual = SD.explorar.atual();
    var sigla = atual.tipo === "uf" ? atual.codigo : atual.uf;
    Object.keys(formas).forEach(function (s) {
      var p = formas[s];
      p.classList.toggle("map__uf--atual", s === sigla);
      // o contorno do atual fica por cima dos vizinhos
      if (s === sigla && p.parentNode) p.parentNode.appendChild(p);
    });
  }

  function ligaGrupo(seletor, aoTrocar) {
    var botoes = document.querySelectorAll(seletor + " button");
    botoes.forEach(function (b) {
      b.addEventListener("click", function () {
        botoes.forEach(function (o) { o.setAttribute("aria-pressed", String(o === b)); });
        aoTrocar(b);
      });
    });
  }
  ligaGrupo(".map .toggle", function (b) { metrica = b.dataset.mapa; pintaMapa(); leitura(null); });
  ligaGrupo("#regioes", function (b) { regiao = b.dataset.regiao; pintaMapa(); leitura(null); });

  if (MAPA) {
    desenhaMapa();
    SD.api("/ufs").then(function (ufs) {
      ufs.forEach(function (u) { estados[u.codigo] = u; });
      pintaMapa();
    }).catch(function () {
      el("mapa-leitura").textContent = "Não foi possível carregar o mapa agora. A busca acima continua funcionando.";
    });
  } else {
    document.querySelector(".map").hidden = true;
  }

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
    var ipne = r.ipne;
    var legenda = el("f-oport-legenda");
    legenda.hidden = !ipne;
    legenda.textContent = SD.textos.legendaIPNE + " " + SD.textos.esperadoPerfil;
    el("f-oport-contexto").hidden = !(ipne && ipne.contexto);
    el("f-oport-contexto").textContent = (ipne && ipne.contexto) || "";
    if (ipne) {
      el("f-oport").hidden = false;
      aviso.hidden = true;
      el("f-ipne").textContent = ipne.score + " / 100";
      el("f-nivel").textContent = ipne.nivel;
      el("f-hoje").textContent = fmt.numero(r.instalacoes);
      el("f-ref").textContent = "cerca de " + texto(fmt.compacto(ipne.referencia));
      el("f-espaco").textContent = ipne.em_linha ? "Em linha com o perfil"
        : ipne.espaco > 0 ? "cerca de " + texto(fmt.compacto(ipne.espaco)) + " instalações"
        : "Já " + texto(fmt.compacto(-ipne.espaco)) + " acima";
      el("f-pos").textContent = fmt.numero(ipne.posicao) + "º de " + fmt.numero(ipne.total);
    } else {
      el("f-oport").hidden = true;
      aviso.hidden = false;
      aviso.innerHTML = SD.textos.semIPNE(r);
    }

    renderML(r);

    SD.linhaFonte(r.referencias).then(function (linha) { el("rodape").textContent = SD.local.rotulo(r) + " · " + linha; });
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
      : "Já " + mw(-ml.potencial_adicional_mw) + " acima";
    aviso.hidden = ml.confiavel;
    aviso.textContent = "Estimativa menos confiável para municípios com mais de 1 milhão de habitantes: " +
      "o modelo não estima valores além dos que viu no treino, então tende a subestimar as maiores cidades.";
    el("f-ml-nota").textContent = ml.algoritmo + " treinado com população, PIB per capita, densidade, domicílios, " +
      "renda, empresas, irradiação e estado. Estimativa fora da amostra (validação cruzada)" +
      (metricasML ? ": erro médio de " + fmt.numero(metricasML.erro_medio_mw, 1) + " MW." : ".") +
      " Complementa o IPNE com a ordem de grandeza em MW. " + SD.textos.ressalva;
  }

  // métricas do modelo, buscadas uma vez para a nota de rodapé
  var metricasML = null;
  SD.api("/modelo").then(function (m) {
    metricasML = m.ml && m.ml.erro_medio_mw != null ? m.ml : null;
    if (ultimoResumo) renderML(ultimoResumo);  // a ficha pode ter chegado antes das métricas
  }).catch(function () { /* nota fica sem o erro médio */ });

  // ---------- Carga ----------

  // Link direto: indicadores.html?m=<código IBGE> ou ?uf=<sigla> (rankings, cidades semelhantes)
  var params = new URLSearchParams(location.search);
  var doLink = params.get("m") ? { tipo: "municipio", codigo: params.get("m"), nome: "", uf: "" }
    : params.get("uf") ? { tipo: "uf", codigo: params.get("uf").toUpperCase(), nome: "", uf: params.get("uf").toUpperCase() }
    : null;

  function carrega() {
    var ficha = el("ficha");
    var alvo = doLink || SD.explorar.atual();
    if (controle) controle.abort();
    controle = new AbortController();
    ficha.setAttribute("aria-busy", "true");
    el("erro").hidden = true;
    el("ficha-titulo").textContent = doLink ? "" : SD.local.rotulo(alvo);
    SD.api(SD.local.caminho(alvo), { signal: controle.signal })
      .then(function (r) {
        if (doLink) {
          // o link vira o local aberto em Explorar; a URL volta a ser limpa
          doLink = null;
          SD.explorar.escolhe({ tipo: r.tipo, codigo: r.codigo, nome: r.nome, uf: r.uf });
          history.replaceState(null, "", "indicadores.html");
          renderRecentes();
          marcaNoMapa();
        }
        el("ficha-titulo").textContent = SD.local.rotulo(r);
        document.title = SD.local.rotulo(r) + " · Explorar · SolarData";
        renderFicha(r);
        ficha.setAttribute("aria-busy", "false");
      })
      .catch(function (e) {
        if (e.name === "AbortError") return;
        doLink = null;
        el("erro").hidden = false;
        el("erro").textContent = e.status === 404 ? "Local não encontrado. Busque outro acima." : e.message;
      });
  }

  renderRecentes();
  carrega();
})();
