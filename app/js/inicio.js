/* Início: IPNE, indicadores e evolução do local selecionado */
(function () {
  "use strict";
  if (!SD.sessao.exige()) return;

  var fmt = SD.fmt, el = SD.el, texto = SD.fmt.texto;
  var ANOS_NO_GRAFICO = 7;
  var serie = [];
  var metrica = "acumulado";

  var usuario = SD.sessao.usuario();
  if (usuario) el("avatar").textContent = fmt.iniciais(usuario.nome);

  function mostraLocal(l) {
    el("place-nome").textContent = l.nome;
    el("place-uf").textContent = l.tipo === "uf" ? "" : l.uf;
    el("place").setAttribute("aria-label", "Trocar local. Atual: " + SD.local.rotulo(l));
  }

  function trocaLocal() {
    SD.abreSeletor(function () {
      el("dica").hidden = true;
      carrega();
    });
  }

  el("place").addEventListener("click", trocaLocal);
  el("dica-trocar").addEventListener("click", trocaLocal);
  // Primeira visita: deixa claro que Campinas é só um exemplo e que dá para trocar
  if (!SD.local.escolhido() && !location.search) el("dica").hidden = false;

  // ---------- Indicadores ----------

  function preenche(dd, par, delta) {
    dd.innerHTML = "";
    if (par.prefixo) dd.insertAdjacentHTML("beforeend", '<span class="unit unit--pre">' + par.prefixo + "</span>");
    dd.appendChild(document.createTextNode(par.valor));
    if (par.unidade) dd.insertAdjacentHTML("beforeend", '<span class="unit">' + SD.escapa(par.unidade) + "</span>");
    if (delta) dd.insertAdjacentHTML("beforeend", '<span class="delta">' + SD.escapa(delta) + "</span>");
  }

  function renderResumo(r) {
    var anoAnt = r.referencias.ano_completo - 1;
    var dInst = r.crescimento_instalacoes_pct != null ? fmt.variacao(r.crescimento_instalacoes_pct) + " vs. " + anoAnt : "";
    var dPot = r.crescimento_potencia_pct != null ? fmt.variacao(r.crescimento_potencia_pct) + " vs. " + anoAnt : "";

    fechaSemelhantes();
    preenche(el("m-inst"), fmt.compacto(r.instalacoes), dInst);
    preenche(el("m-pot"), fmt.potencia(r.potencia_kw), dPot);
    preenche(el("m-mil"), { valor: fmt.numero(r.inst_por_mil_hab, 1), unidade: "inst." });
    preenche(el("m-hab"), { valor: fmt.numero(r.kw_por_hab, 2), unidade: "kW" });
    preenche(el("m-pop"), fmt.compacto(r.populacao));
    var pib = fmt.compacto(r.pib_mil_reais * 1000);
    preenche(el("m-pib"), { prefixo: "R$", valor: pib.valor, unidade: pib.unidade });

    var ipne = r.ipne;
    el("ipne-contexto").hidden = true;
    if (ipne) {
      el("ipne-valor").textContent = ipne.score;
      el("ipne-nivel").textContent = ipne.nivel;
      renderComparacao(r, ipne);
    } else {
      el("ipne-valor").textContent = "–";
      el("ipne-nivel").textContent = "";
      el("ipne-manchete").textContent = "";
      el("ipne-compare").hidden = true;
      el("ipne-leitura").innerHTML = SD.textos.semIPNE(r);
    }
    // pares do Brasil todo existem para qualquer município, mesmo sem IPNE (DF)
    atual = r;
    el("ipne-links").hidden = r.tipo !== "municipio";
    el("ipne-posicao").hidden = !ipne;

    SD.linhaFonte(r.referencias).then(function (linha) { el("fonte").textContent = linha; });
  }

  // ---------- IPNE: hoje x esperado pelo perfil ----------
  // Manchete, nível e alerta de contexto vêm prontos da API (mesmo texto no web e no mobile).

  var atual = null;

  // ⓘ: explicação do IPNE ali mesmo, sem sair da tela
  el("ipne-ajuda").innerHTML = SD.textos.comoLerIPNE;
  el("ipne-ajuda-botao").addEventListener("click", function () {
    var abrir = el("ipne-ajuda").hidden;
    el("ipne-ajuda").hidden = !abrir;
    this.setAttribute("aria-expanded", String(abrir));
  });

  // ---------- Cidades com perfil semelhante (Brasil todo), buscadas só quando o usuário pede ----------

  var controleSem = null;

  function fechaSemelhantes() {
    if (controleSem) controleSem.abort();
    el("semelhantes").hidden = true;
    el("sem-lista").innerHTML = "";
    el("sem-botao").setAttribute("aria-expanded", "false");
  }

  function linhaSemelhante(m) {
    var li = document.createElement("li");
    var a = document.createElement("a");
    a.className = "similar__item";
    a.href = SD.explorar.link({ tipo: "municipio", codigo: m.codigo });
    var detalhes = [texto(fmt.compacto(m.populacao)) + " hab."];
    if (m.renda_pc != null) detalhes.push("renda R$ " + fmt.numero(m.renda_pc) + "/mês");
    if (m.inst_por_mil_hab != null) detalhes.push(fmt.numero(m.inst_por_mil_hab, 1) + " inst./mil hab.");
    a.innerHTML = '<span><span class="results__name">' + SD.escapa(m.nome + ", " + m.uf) + "</span>" +
      '<span class="similar__meta">' + SD.escapa(detalhes.join(" · ")) + "</span></span>" +
      (m.ipne != null ? '<span class="results__score" title="' + SD.escapa(m.nivel) + '">IPNE ' + m.ipne + "</span>"
        : '<span class="results__kind">Sem IPNE</span>');
    li.appendChild(a);
    return li;
  }

  el("sem-botao").addEventListener("click", function () {
    if (!el("semelhantes").hidden) { fechaSemelhantes(); return; }
    var r = atual;
    el("semelhantes").hidden = false;
    el("sem-botao").setAttribute("aria-expanded", "true");
    el("sem-nota").textContent = SD.textos.semelhantes(r.nome);
    el("sem-lista").innerHTML = '<li class="results__empty">Buscando…</li>';
    controleSem = new AbortController();
    SD.api("/municipios/" + encodeURIComponent(r.codigo) + "/semelhantes", { signal: controleSem.signal })
      .then(function (itens) {
        var lista = el("sem-lista");
        lista.innerHTML = "";
        if (!itens.length) {
          lista.innerHTML = '<li class="results__empty">Sem dados suficientes para comparar este município.</li>';
          return;
        }
        var frag = document.createDocumentFragment();
        itens.forEach(function (m) { frag.appendChild(linhaSemelhante(m)); });
        lista.appendChild(frag);
      })
      .catch(function (e) {
        if (e.name !== "AbortError") el("sem-lista").innerHTML = '<li class="results__empty">' + SD.escapa(e.message) + "</li>";
      });
  });

  function renderComparacao(r, ipne) {
    var hoje = r.instalacoes, ref = ipne.referencia;
    el("ipne-manchete").textContent = ipne.manchete;

    // Barras na mesma escala; a maior ocupa a largura toda
    var max = Math.max(hoje, ref) || 1;
    var barra = function (id, valor, rotulo) {
      var b = el(id);
      b.style.width = Math.max(valor / max * 100, valor > 0 ? 1.5 : 0) + "%";
      b.title = rotulo + ": " + fmt.numero(valor) + " instalações";
      el(id + "-v").textContent = texto(fmt.compacto(valor));
    };
    barra("cmp-hoje", hoje, "Hoje");
    barra("cmp-ref", ref, "Esperado pelo perfil");
    var cmp = el("ipne-compare");
    cmp.hidden = false;
    cmp.setAttribute("aria-label", r.nome + " tem " + fmt.numero(hoje) + " instalações; o esperado pelo perfil é cerca de " +
      fmt.numero(ref) + ".");

    el("ipne-leitura").textContent = "";
    el("ipne-posicao").textContent = fmt.numero(ipne.posicao) + "º de " + fmt.numero(ipne.total) + " em oportunidade";
    el("ipne-posicao").href = "rankings.html?porte=0";

    var contexto = el("ipne-contexto");
    contexto.hidden = !ipne.contexto;
    contexto.textContent = ipne.contexto || "";
  }

  // ---------- Gráfico de barras (SVG) ----------

  var W = 320, BASE = 150, TOPO = 26, LARGURA = 20;

  function passoBonito(max) {
    var bruto = max / 2, mag = Math.pow(10, Math.floor(Math.log10(bruto || 1)));
    var n = bruto / mag;
    return (n >= 5 ? 5 : n >= 2 ? 2 : 1) * mag;
  }

  function rotuloValor(v) {
    return metrica === "acumulado" ? texto(fmt.compacto(v)) : texto(fmt.potencia(v));
  }

  function renderGrafico() {
    var completos = serie.filter(function (p) { return !p.parcial; }).slice(-ANOS_NO_GRAFICO);
    var svg = el("grafico");
    if (!completos.length) {
      svg.innerHTML = '<text class="grid-label grid-label--start" x="0" y="90">Sem instalações registradas</text>';
      return;
    }
    var valores = completos.map(function (p) { return p[metrica]; });
    var max = Math.max.apply(null, valores) || 1;
    var escala = (BASE - TOPO) / max;
    var passo = passoBonito(max);
    var slot = W / completos.length;
    var partes = ['<line class="grid-line" x1="0" x2="320" y1="150" y2="150"/>'];

    // linhas perto do topo colidiriam com o rótulo da última barra
    for (var t = passo; t <= max * 0.85; t += passo) {
      var y = (BASE - t * escala).toFixed(1);
      partes.push('<line class="grid-line" x1="0" x2="320" y1="' + y + '" y2="' + y + '"/>');
      partes.push('<text class="grid-label grid-label--start" x="0" y="' + (y - 6) + '">' + rotuloValor(t) + "</text>");
    }

    completos.forEach(function (p, i) {
      var v = p[metrica], h = Math.max(v * escala, v > 0 ? 2 : 0);
      var x = slot * i + (slot - LARGURA) / 2, topo = BASE - h, r = Math.min(2, h / 2);
      var ultimo = i === completos.length - 1;
      var d = "M" + x.toFixed(1) + " 150V" + (topo + r).toFixed(1) + "Q" + x.toFixed(1) + " " + topo.toFixed(1) + " " + (x + r).toFixed(1) + " " + topo.toFixed(1) +
        "H" + (x + LARGURA - r).toFixed(1) + "Q" + (x + LARGURA).toFixed(1) + " " + topo.toFixed(1) + " " + (x + LARGURA).toFixed(1) + " " + (topo + r).toFixed(1) + "V150Z";
      var cx = (x + LARGURA / 2).toFixed(1);
      partes.push('<path class="bar' + (ultimo ? " bar--current" : "") + '" d="' + d + '"><title>' + p.ano + ": " + rotuloValor(v) + "</title></path>");
      partes.push('<text class="axis-label' + (ultimo ? " axis-label--current" : "") + '" x="' + cx + '" y="170">' + p.ano + "</text>");
      if (ultimo) partes.push('<text class="value-label" x="' + cx + '" y="' + Math.max(topo - 8, 10).toFixed(1) + '">' + rotuloValor(v) + "</text>");
    });
    svg.innerHTML = partes.join("");

    var nome = metrica === "acumulado" ? "Instalações acumuladas" : "Potência acumulada";
    var primeiro = completos[0].ano, ultimoAno = completos[completos.length - 1].ano;
    el("evolucao-legenda").textContent = nome + ", " + primeiro + " a " + ultimoAno + " · por data de atualização cadastral na ANEEL";
    el("tabela-legenda").textContent = nome + " por ano";
    el("tabela-col").textContent = metrica === "acumulado" ? "Instalações" : "Potência";
    el("tabela-corpo").innerHTML = completos.map(function (p) {
      return "<tr><td>" + p.ano + "</td><td>" + rotuloValor(p[metrica]) + "</td></tr>";
    }).join("");
  }

  document.querySelectorAll(".toggle button").forEach(function (b) {
    b.addEventListener("click", function () {
      metrica = b.dataset.metrica;
      document.querySelectorAll(".toggle button").forEach(function (o) { o.setAttribute("aria-pressed", String(o === b)); });
      renderGrafico();
    });
  });

  // ---------- Carga ----------

  var controle = null;

  // Link direto: inicio.html?m=<código IBGE> ou ?uf=<sigla> (usado pelos rankings e para compartilhar)
  var params = new URLSearchParams(location.search);
  var doLink = params.get("m") ? { tipo: "municipio", codigo: params.get("m"), nome: "Carregando", uf: "" }
    : params.get("uf") ? { tipo: "uf", codigo: params.get("uf").toUpperCase(), nome: "Carregando", uf: params.get("uf").toUpperCase() }
    : null;

  function carrega() {
    var local = doLink || SD.local.atual();
    mostraLocal(local);
    // cancela a carga anterior se o usuário trocar de local antes de ela terminar
    if (controle) controle.abort();
    controle = new AbortController();
    var opcoes = { signal: controle.signal };
    el("conteudo").setAttribute("aria-busy", "true");
    el("erro").hidden = true;

    var caminho = SD.local.caminho(local);
    Promise.all([SD.api(caminho, opcoes), SD.api(caminho + "/historico", opcoes)])
      .then(function (res) {
        var r = res[0];
        if (doLink) {
          // o link vira a escolha atual; a URL volta a ser limpa
          SD.local.escolhe({ tipo: r.tipo, codigo: r.codigo, nome: r.nome, uf: r.uf });
          mostraLocal(SD.local.atual());
          el("dica").hidden = true;
          history.replaceState(null, "", "inicio.html");
          doLink = null;
        }
        document.title = (r.tipo === "uf" ? r.nome : r.nome + ", " + r.uf) + " · SolarData";
        renderResumo(r);
        serie = res[1];
        renderGrafico();
        el("conteudo").setAttribute("aria-busy", "false");
      })
      .catch(function (e) {
        if (e.name === "AbortError") return;
        el("erro").hidden = false;
        el("erro").textContent = e.status === 404
          ? "Local não encontrado. Toque no nome no topo para escolher outro."
          : e.message;
      });
  }

  carrega();
})();
