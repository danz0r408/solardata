/* Explorar: busca única de cidade/estado, mapa (estados e, dentro de um estado, municípios) e ficha completa.
   O local aberto aqui é independente da "minha cidade" do Início (SD.explorar x SD.local). */
(function () {
  "use strict";
  if (!SD.sessao.exige()) return;

  var fmt = SD.fmt, el = SD.el, texto = SD.fmt.texto;
  var controle = null;
  // Média das 5.549 sedes municipais com dado no INPE (silver.inpe_solar_consolidado_2017)
  var IRRADIACAO_MEDIA_BRASIL = 5.04;
  var reduzMovimento = matchMedia("(prefers-reduced-motion: reduce)");

  function renderRecentes() { SD.preencheRecentes(el("recentes"), function (l) { escolhe(l, true); }, SD.explorar.atual()); }

  function rolaParaFicha() {
    var ficha = el("ficha");
    ficha.focus({ preventScroll: true });
    ficha.scrollIntoView({ behavior: reduzMovimento.matches ? "auto" : "smooth", block: "start" });
  }

  // Estado escolhido (de qualquer lugar): o mapa entra nele e mostra os municípios; a tela fica no mapa.
  // Município escolhido: abre a ficha (rolar = true leva o usuário até ela).
  function escolhe(l, rolar) {
    SD.explorar.escolhe(l);
    renderRecentes();
    carrega();
    if (l.tipo === "uf") {
      entraNoEstado(l.codigo);
      if (rolar) el("mapa-titulo").scrollIntoView({ behavior: reduzMovimento.matches ? "auto" : "smooth", block: "start" });
      return;
    }
    marcaNoMapa();
    if (rolar) rolaParaFicha();
  }

  SD.ligaBusca(el("busca"), el("resultados"), function (l) { escolhe(l, true); });

  // sugestões só são buscadas quando o usuário abre a seção
  document.querySelector(".suggest").addEventListener("toggle", function (ev) {
    if (ev.target.open) SD.preencheSugestoes(el("sugestoes"), function (l) { escolhe(l, true); });
  });

  // ---------- Mapa ----------

  var MAPA = window.SD_MAPA;
  var NS = "http://www.w3.org/2000/svg";
  var METRICAS = {
    oportunidade: {
      nome: "Oportunidade", classe: "map--oportunidade", campoUF: "ipne_ponderado", campoMun: "ipne",
      valor: function (v) { return fmt.numero(v, 0); },
      legenda: "Oportunidade: IPNE médio dos municípios, ponderado pela população. Mostra onde mais gente vive em " +
        "cidades abaixo do esperado pelo perfil; por isso é puxado pelas cidades grandes. O Distrito Federal não tem IPNE.",
      legendaMun: "Oportunidade: IPNE de cada município (0 a 100), em relação ao esperado pelo perfil no estado. " +
        "Cor mais forte, mais espaço para crescer."
    },
    adocao: {
      nome: "Adoção", classe: "map--adocao", campoUF: "inst_por_mil_hab", campoMun: "inst_por_mil_hab",
      valor: function (v) { return fmt.numero(v, 1) + " por mil hab."; },
      legenda: "Adoção: instalações solares por 1.000 habitantes (ANEEL). Dado bruto, sem modelo.",
      legendaMun: "Adoção: instalações solares por 1.000 habitantes (ANEEL), em escala logarítmica para os " +
        "municípios de adoção baixa não ficarem todos da mesma cor."
    }
  };
  var estados = {};       // sigla -> {codigo, nome, regiao, ipne_ponderado, inst_por_mil_hab}
  var formas = {};        // sigla -> <path> do estado
  var metrica = "oportunidade", regiao = "", regiaoNome = "Brasil";
  var dentro = null;      // sigla do estado aberto no mapa (null = Brasil)
  var camadaMun = null;   // <g> com os municípios do estado aberto
  var formasMun = {};     // código IBGE -> <path> do município
  var dadosMun = {};      // código IBGE -> {codigo, nome, populacao, instalacoes, inst_por_mil_hab, ipne}
  var cacheUF = {};       // sigla -> Promise<{paths, dados}>
  var pendente = null;    // estado a abrir assim que a lista de estados chegar

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
    // municípios ficam numa camada própria, por cima dos estados (o teclado usa a lista abaixo do mapa)
    camadaMun = document.createElementNS(NS, "g");
    camadaMun.setAttribute("class", "map__muns");
    camadaMun.setAttribute("aria-hidden", "true");
    svg.appendChild(camadaMun);

    function alvo(ev) {
      var p = ev.target.closest ? ev.target.closest(".map__uf, .map__mun") : null;
      if (!p) return null;
      if (p.dataset.mun) return dadosMun[p.dataset.mun] ? p : null;
      return estados[p.dataset.uf] && !p.classList.contains("map__uf--fora") && !dentro ? p : null;
    }
    function abre(p) {
      if (p.dataset.mun) {
        var m = dadosMun[p.dataset.mun];
        escolhe({ tipo: "municipio", codigo: m.codigo, nome: m.nome, uf: dentro }, true);
      } else {
        var u = estados[p.dataset.uf];
        escolhe({ tipo: "uf", codigo: u.codigo, nome: u.nome, uf: u.codigo }, false);
      }
    }
    svg.addEventListener("click", function (ev) { var p = alvo(ev); if (p) abre(p); });
    svg.addEventListener("keydown", function (ev) {
      var p = alvo(ev);
      if (p && (ev.key === "Enter" || ev.key === " ")) { ev.preventDefault(); abre(p); }
    });
    // passar o mouse ou focar mostra o valor sem precisar abrir
    function mostra(ev) {
      var p = alvo(ev);
      if (p) leitura(p.dataset.mun ? dadosMun[p.dataset.mun] : estados[p.dataset.uf], !!p.dataset.mun);
    }
    svg.addEventListener("pointerover", mostra);
    svg.addEventListener("focusin", mostra);
    svg.addEventListener("pointerleave", function () { leitura(null); });
  }

  function leitura(item, ehMun) {
    var m = METRICAS[metrica];
    if (!item) {
      el("mapa-leitura").textContent = dentro ? "Toque num município para abrir a ficha." : "Toque num estado para ver os municípios.";
      return;
    }
    var v = item[ehMun ? m.campoMun : m.campoUF];
    el("mapa-leitura").textContent = item.nome + " · " + m.nome + ": " + (v == null ? "sem dado" : m.valor(v));
  }

  function atualizaMapa() { if (dentro) pintaMunicipios(); else pintaMapa(); leitura(null); }

  function pintaMapa() {
    var m = METRICAS[metrica], campo = m.campoUF;
    var valores = Object.keys(estados).map(function (s) { return estados[s][campo]; })
      .filter(function (v) { return v != null; });
    if (!valores.length) return;
    // escala sobre o Brasil todo: trocar de região não muda a cor de um estado
    var min = Math.min.apply(null, valores), max = Math.max.apply(null, valores), faixa = max - min || 1;
    el("mapa").setAttribute("class", "map__svg " + m.classe);

    Object.keys(formas).forEach(function (sigla) {
      var p = formas[sigla], u = estados[sigla];
      var v = u ? u[campo] : null;
      var naRegiao = !regiao || (u && u.regiao === regiao);
      p.classList.remove("map__uf--aberto");
      p.classList.toggle("map__uf--fora", !naRegiao);
      p.classList.toggle("map__uf--sem", v == null);
      p.style.setProperty("--t", v == null ? "0" : ((v - min) / faixa).toFixed(3));
      p.setAttribute("tabindex", naRegiao && u ? "0" : "-1");
      p.setAttribute("aria-hidden", naRegiao ? "false" : "true");
      p.setAttribute("aria-label", u ? u.nome + ", " + m.nome.toLowerCase() + " " + (v == null ? "sem dado" : m.valor(v)) : sigla);
    });

    el("mapa-min").textContent = m.valor(min);
    el("mapa-max").textContent = m.valor(max);
    el("mapa-legenda-texto").textContent = m.legenda;

    // os 3 maiores da região escolhida: a leitura do mapa em texto (e o alvo fácil para estados pequenos)
    var top = Object.keys(estados).map(function (s) { return estados[s]; })
      .filter(function (u) { return u[campo] != null && (!regiao || u.regiao === regiao); })
      .sort(function (a, b) { return b[campo] - a[campo]; }).slice(0, 3);
    var lista = el("mapa-top");
    lista.innerHTML = "";
    top.forEach(function (u, i) {
      lista.appendChild(itemLista(i + 1, u.nome, m.valor(u[campo]), function () {
        escolhe({ tipo: "uf", codigo: u.codigo, nome: u.nome, uf: u.codigo }, false);
      }));
    });
    el("mapa-top-titulo").textContent = "Maior " + m.nome.toLowerCase() + " · " + regiaoNome;

    enquadra(regiao ? Object.keys(estados).filter(function (s) { return estados[s].regiao === regiao; }) : null);
    marcaNoMapa();
  }

  function itemLista(pos, nome, valor, aoClicar) {
    var li = document.createElement("li");
    var b = document.createElement("button");
    b.type = "button";
    b.innerHTML = '<span class="rank__pos">' + pos + '</span><span class="results__name">' + SD.escapa(nome) +
      '</span><span class="map__top-valor">' + SD.escapa(valor) + "</span>";
    b.addEventListener("click", aoClicar);
    li.appendChild(b);
    return li;
  }

  // ---------- Dentro de um estado: municípios ----------

  function carregaUF(sigla) {
    if (!cacheUF[sigla]) {
      cacheUF[sigla] = Promise.all([
        fetch("mapas/municipios/" + encodeURIComponent(sigla) + ".json").then(function (r) {
          if (!r.ok) throw new Error("Contornos dos municípios indisponíveis.");
          return r.json();
        }),
        SD.api("/ufs/" + encodeURIComponent(sigla) + "/municipios")
      ]).then(function (res) { return { paths: res[0], dados: res[1] }; });
      cacheUF[sigla].catch(function () { delete cacheUF[sigla]; });  // permite tentar de novo
    }
    return cacheUF[sigla];
  }

  function entraNoEstado(sigla) {
    if (!estados[sigla]) { pendente = sigla; return; }   // a lista de estados ainda não chegou
    if (dentro === sigla) { marcaNoMapa(); return; }
    dentro = sigla;
    var u = estados[sigla];
    el("mapa-titulo").textContent = u.nome;
    el("mapa-voltar").hidden = false;
    el("regioes").hidden = true;
    el("mapa-estados").hidden = true;
    el("mapa-municipios").hidden = false;
    el("mun-titulo").textContent = "Municípios de " + u.nome;
    el("mun-total").textContent = "";
    el("mun-filtro").value = "";
    el("mun-lista").innerHTML = '<li class="results__empty">Carregando municípios…</li>';
    el("mun-mais").hidden = true;

    // vizinhos ficam apagados como contexto; o estado aberto vira só o contorno, por cima dos municípios
    Object.keys(formas).forEach(function (s) {
      var p = formas[s];
      p.classList.toggle("map__uf--fora", s !== sigla);
      p.classList.toggle("map__uf--aberto", s === sigla);
      p.setAttribute("tabindex", "-1");
      p.setAttribute("aria-hidden", "true");
    });
    camadaMun.innerHTML = "";
    formasMun = {};
    dadosMun = {};
    enquadra([sigla]);
    leitura(null);

    carregaUF(sigla).then(function (r) {
      if (dentro !== sigla) return;   // o usuário já saiu ou trocou de estado
      r.dados.forEach(function (m) { dadosMun[m.codigo] = m; });
      var frag = document.createDocumentFragment();
      Object.keys(r.paths).forEach(function (cod) {
        var p = document.createElementNS(NS, "path");
        p.setAttribute("d", r.paths[cod]);
        p.setAttribute("class", "map__mun");
        p.dataset.mun = cod;
        formasMun[cod] = p;
        frag.appendChild(p);
      });
      camadaMun.appendChild(frag);
      // contorno do estado por cima dos municípios
      el("mapa").appendChild(formas[sigla]);
      pintaMunicipios();
    }).catch(function (e) {
      if (dentro !== sigla) return;
      el("mun-lista").innerHTML = '<li class="results__empty">' + SD.escapa(e.message) + "</li>";
    });
  }

  function saiDoEstado() {
    dentro = null;
    camadaMun.innerHTML = "";
    formasMun = {};
    dadosMun = {};
    el("mapa-titulo").textContent = "Estados";
    el("mapa-voltar").hidden = true;
    el("regioes").hidden = false;
    el("mapa-estados").hidden = false;
    el("mapa-municipios").hidden = true;
    pintaMapa();
    leitura(null);
  }
  el("mapa-voltar").addEventListener("click", saiDoEstado);

  function pintaMunicipios() {
    var m = METRICAS[metrica], campo = m.campoMun;
    var lista = Object.keys(dadosMun).map(function (c) { return dadosMun[c]; });
    var escala;
    if (metrica === "oportunidade") {
      // o IPNE já é uma nota de 0 a 100
      escala = function (v) { return v / 100; };
      el("mapa-min").textContent = "0";
      el("mapa-max").textContent = "100";
    } else {
      // adoção é muito assimétrica: escala log para separar os municípios de adoção baixa
      var vals = lista.map(function (x) { return x[campo]; }).filter(function (v) { return v != null; });
      var lmin = Math.log1p(Math.min.apply(null, vals)), lmax = Math.log1p(Math.max.apply(null, vals));
      var faixa = lmax - lmin || 1;
      escala = function (v) { return (Math.log1p(v) - lmin) / faixa; };
      el("mapa-min").textContent = m.valor(Math.min.apply(null, vals));
      el("mapa-max").textContent = m.valor(Math.max.apply(null, vals));
    }
    el("mapa").setAttribute("class", "map__svg " + m.classe);
    Object.keys(formasMun).forEach(function (cod) {
      var p = formasMun[cod], d = dadosMun[cod];
      var v = d ? d[campo] : null;
      p.classList.toggle("map__mun--sem", v == null);
      p.style.setProperty("--t", v == null ? "0" : escala(v).toFixed(3));
    });
    el("mapa-legenda-texto").textContent = m.legendaMun;
    el("mun-total").textContent = fmt.numero(lista.length) + " municípios";
    marcaNoMapa();
    limiteMun = PASSO_MUN;
    renderListaMun();
  }

  // Lista ranqueada pela métrica do mapa, com filtro por nome
  var PASSO_MUN = 10, limiteMun = PASSO_MUN;

  function semAcento(s) { return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(); }

  function renderListaMun() {
    var m = METRICAS[metrica], campo = m.campoMun;
    var termo = semAcento(el("mun-filtro").value.trim());
    var ordenados = Object.keys(dadosMun).map(function (c) { return dadosMun[c]; })
      .sort(function (a, b) {
        if (a[campo] == null) return 1;
        if (b[campo] == null) return -1;
        return b[campo] - a[campo] || b.populacao - a.populacao;
      });
    var lista = el("mun-lista");
    lista.innerHTML = "";
    var mostrados = 0, encontrados = 0, frag = document.createDocumentFragment();
    ordenados.forEach(function (x, i) {
      if (termo && semAcento(x.nome).indexOf(termo) < 0) return;
      encontrados++;
      if (mostrados >= limiteMun) return;
      mostrados++;
      // a posição é sempre a do ranking do estado, mesmo filtrando
      frag.appendChild(itemLista(i + 1, x.nome, x[campo] == null ? "sem dado" : m.valor(x[campo]), function () {
        escolhe({ tipo: "municipio", codigo: x.codigo, nome: x.nome, uf: dentro }, true);
      }));
    });
    if (!encontrados) lista.innerHTML = '<li class="results__empty">Nenhum município com esse nome.</li>';
    else lista.appendChild(frag);
    el("mun-mais").hidden = mostrados >= encontrados;
    el("mun-menos").hidden = limiteMun <= PASSO_MUN || mostrados <= PASSO_MUN;
  }

  var timerFiltro = null;
  el("mun-filtro").addEventListener("input", function () {
    clearTimeout(timerFiltro);
    timerFiltro = setTimeout(function () { limiteMun = PASSO_MUN; renderListaMun(); }, 120);
  });
  el("mun-mais").addEventListener("click", function () { limiteMun += 20; renderListaMun(); });
  el("mun-menos").addEventListener("click", function () {
    limiteMun = PASSO_MUN;
    renderListaMun();
    SD.trazParaTela(el("mun-titulo"));
  });

  // ---------- Enquadramento ----------
  // Zoom num conjunto de estados (região ou estado aberto); Brasil inteiro com null.
  // A moldura do mapa tem proporção fixa (a do Brasil): o recorte é ampliado para essa mesma proporção,
  // centrado no conjunto. Assim o mapa não muda de altura e a tela abaixo dele não pula.
  var vbAtual = null, animacao = null;

  function recorte(siglas) {
    var W = MAPA.largura, H = MAPA.altura;
    if (!siglas || !siglas.length) return [0, 0, W, H];
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    siglas.forEach(function (s) {
      if (!formas[s]) return;
      var b = formas[s].getBBox();
      x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y);
      x1 = Math.max(x1, b.x + b.width); y1 = Math.max(y1, b.y + b.height);
    });
    if (x0 === Infinity) return [0, 0, W, H];
    var w = (x1 - x0) * 1.12, h = (y1 - y0) * 1.12;   // 6% de margem de cada lado
    if (w / h > W / H) h = w * H / W; else w = h * W / H;
    var cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    return [cx - w / 2, cy - h / 2, w, h];
  }

  function aplicaViewBox(vb) {
    vbAtual = vb;
    el("mapa").setAttribute("viewBox", vb.map(function (n) { return n.toFixed(2); }).join(" "));
    // traço constante na tela, qualquer que seja o zoom
    el("mapa").style.setProperty("--zoom", (MAPA.largura / vb[2]).toFixed(3));
  }

  function enquadra(siglas) {
    var alvo = recorte(siglas);
    if (animacao) cancelAnimationFrame(animacao);
    var inicio = vbAtual;
    if (!inicio || reduzMovimento.matches) { aplicaViewBox(alvo); return; }
    var t0 = performance.now(), DURACAO = 320;
    function passo(agora) {
      var t = Math.min((agora - t0) / DURACAO, 1);
      var e = 1 - Math.pow(1 - t, 4);   // ease-out-quart
      aplicaViewBox(inicio.map(function (v, i) { return v + (alvo[i] - v) * e; }));
      animacao = t < 1 ? requestAnimationFrame(passo) : null;
    }
    animacao = requestAnimationFrame(passo);
  }

  // destaca o que está aberto: o estado (no Brasil) ou o município (dentro do estado)
  function marcaNoMapa() {
    var atual = SD.explorar.atual();
    var sigla = atual.tipo === "uf" ? atual.codigo : atual.uf;
    Object.keys(formas).forEach(function (s) {
      var p = formas[s];
      p.classList.toggle("map__uf--atual", !dentro && s === sigla);
      if (!dentro && s === sigla && p.parentNode) p.parentNode.insertBefore(p, camadaMun);  // contorno por cima dos vizinhos
    });
    Object.keys(formasMun).forEach(function (c) {
      var ativo = atual.tipo === "municipio" && String(atual.codigo) === c;
      formasMun[c].classList.toggle("map__mun--atual", ativo);
      if (ativo) camadaMun.appendChild(formasMun[c]);
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
  ligaGrupo(".map .toggle", function (b) { metrica = b.dataset.mapa; atualizaMapa(); });
  // data-regiao segue o nome dos dados ("Centro Oeste"); o texto do botão é o nome exibido
  ligaGrupo("#regioes", function (b) { regiao = b.dataset.regiao; regiaoNome = b.textContent; pintaMapa(); leitura(null); });

  if (MAPA) {
    desenhaMapa();
    SD.api("/ufs").then(function (ufs) {
      ufs.forEach(function (u) { estados[u.codigo] = u; });
      pintaMapa();
      if (pendente) { var s = pendente; pendente = null; entraNoEstado(s); }
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
        // estado aberto (link, recente ou escolha anterior): o mapa entra nele
        if (r.tipo === "uf") entraNoEstado(r.codigo);
        // município de outro estado com o mapa aberto num estado: o mapa acompanha
        else if (dentro && dentro !== r.uf) entraNoEstado(r.uf);
        else marcaNoMapa();
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
