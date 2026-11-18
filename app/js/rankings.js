/* Rankings: onde vender. Municípios (mais clientes em potencial, menos exploradas, onde já se vende mais, com filtros)
   e Estados (clientes em potencial no total ou por domicílio) */
(function () {
  "use strict";
  if (!SD.sessao.exige()) return;

  var fmt = SD.fmt, el = SD.el, texto = SD.fmt.texto;
  var selEstado = el("rk-estado"), selPorte = el("rk-porte");
  var PASSO = 5;
  var TIPOS = { espaco: "Mais clientes em potencial", oportunidade: "Menos exploradas", adocao: "Onde já se vende mais" };

  var params = new URLSearchParams(location.search);
  var ufInicial = params.get("uf"), porteInicial = params.get("porte");
  var tipo = TIPOS[params.get("ordem")] ? params.get("ordem") : "espaco";
  var ordemEstados = "absoluto";
  // "Perto da minha base" só existe quando a base escolhida no Início é um município
  var base = SD.local.escolhido() && SD.local.atual().tipo === "municipio" ? SD.local.atual() : null;
  // todas: em "espaco", não manda para o fim as cidades com ressalvas (muitos prédios ou modelos em desacordo)
  var filtros = { perto: !!base && params.get("perto") === "1", concordam: false, todas: false };

  // ---------- Itens ----------

  // Estado: a coluna da direita segue a ordem escolhida (total ou por mil domicílios)
  function itemEstado(u) {
    var li = document.createElement("li");
    li.className = "rank";
    var valor = ordemEstados === "relativo"
      ? (u.por_mil_domicilios != null ? fmt.numero(u.por_mil_domicilios, 1) : "–") + '<span class="rank__sub">por mil domicílios</span>'
      : SD.escapa(texto(fmt.compacto(u.espaco))) + '<span class="rank__sub">clientes</span>';
    li.innerHTML =
      '<span class="rank__pos">' + u.posicao + "</span>" +
      '<span><a class="rank__name" href="' + SD.explorar.link({ tipo: "uf", codigo: u.codigo }) + '">' + SD.escapa(u.nome) + "</a>" +
      '<span class="rank__meta">' + SD.escapa(u.manchete) + "</span>" +
      '<span class="rank__meta rank__meta--leve">' + fmt.numero(u.municipios_com_espaco) + " de " + fmt.numero(u.municipios) +
        " municípios com clientes em potencial</span></span>" +
      '<span class="rank__value">' + valor + "</span>";
    return li;
  }

  function preencheEstados(ol, itens) {
    var frag = document.createDocumentFragment();
    for (var i = 0; i < itens.length; i++) frag.appendChild(itemEstado(itens[i]));
    ol.innerHTML = "";
    ol.appendChild(frag);
  }

  // ---------- Lista de 5 em 5 (Ver mais / Ver menos), cancelando a carga anterior ----------

  // render(ol, itens) desenha a lista inteira (o de municípios põe o separador "Com ressalvas")
  function criaLista(nome, maximo, caminho, render, vazio, erroEl) {
    var lista = { limite: PASSO, controle: null, itens: [] };
    var ol = el("lista-" + nome), mais = el("mais-" + nome), menos = el("menos-" + nome);

    function preenche(itens) {
      lista.itens = itens;
      if (!itens.length) ol.innerHTML = '<li class="empty-state">' + vazio() + "</li>";
      else render(ol, itens);
      ol.setAttribute("aria-busy", "false");
      // se veio a lista cheia, provavelmente há mais
      mais.hidden = itens.length < lista.limite || lista.limite >= maximo;
      // "Ver menos" só depois de expandir
      menos.hidden = lista.limite <= PASSO || itens.length <= PASSO;
    }

    lista.carrega = function () {
      // sem cancelar, uma resposta antiga pode chegar depois e sobrescrever o filtro novo
      if (lista.controle) lista.controle.abort();
      lista.controle = new AbortController();
      ol.setAttribute("aria-busy", "true");
      erroEl.hidden = true;
      SD.api(caminho(lista.limite), { signal: lista.controle.signal })
        .then(preenche)
        .catch(function (e) {
          if (e.name === "AbortError") return;
          ol.setAttribute("aria-busy", "false");
          erroEl.hidden = false;
          erroEl.textContent = e.status === 404 && filtros.perto ? "Sua base não foi encontrada. Troque a base no Início."
            : e.status === 422 && filtros.perto ? "Sem localização para a sua base: não dá para filtrar por distância."
            : e.message;
        });
    };

    lista.recarrega = function () { lista.limite = PASSO; lista.carrega(); };

    mais.addEventListener("click", function () {
      lista.limite = Math.min(lista.limite + PASSO, maximo);
      lista.carrega();
    });
    // recolhe na hora, sem esperar a API: os 5 primeiros já estão na memória
    menos.addEventListener("click", function () {
      lista.limite = PASSO;
      // um "Ver mais" ainda carregando não pode reabrir a lista depois
      if (lista.controle) lista.controle.abort();
      ol.setAttribute("aria-busy", "false");
      var escondidos = lista.itens.length > PASSO;
      render(ol, lista.itens.slice(0, PASSO));
      menos.hidden = true;
      // "Ver mais" só volta se a lista recolhida escondeu itens (ou se já havia mais na API)
      mais.hidden = mais.hidden && !escondidos;
      SD.trazParaTela(el(nome));
    });
    return lista;
  }

  var municipios = criaLista("municipios", 50, function (limite) {
    var q = "?tipo=" + tipo + "&limite=" + limite + "&pop_min=" + selPorte.value;
    if (selEstado.value) q += "&uf=" + encodeURIComponent(selEstado.value);
    if (filtros.perto) q += "&base=" + encodeURIComponent(base.codigo) + "&raio_km=" + SD.raio.atual();
    if (filtros.concordam) q += "&concordam=true";
    if (tipo === "espaco" && filtros.todas) q += "&todas=true";
    return "/rankings" + q;
  }, function (ol, itens) {
    SD.preencheMunicipios(ol, itens, tipo, tipo === "espaco" && !filtros.todas);
  }, function () {
    return filtros.perto ? "Nenhum município com esses filtros a até " + SD.raio.atual() + " km. Tente um raio maior ou outro porte."
      : "Nenhum município com esses filtros.";
  }, el("erro"));

  var estados = criaLista("estados", 27, function (limite) {
    return "/rankings/estados?ordem=" + ordemEstados + "&limite=" + limite;
  }, preencheEstados, function () { return "Nenhum estado com clientes em potencial."; }, el("erro-estados"));

  // ---------- Botões de escolha única (aria-pressed) ----------

  function ligaGrupo(seletor, aoTrocar) {
    var botoes = document.querySelectorAll(seletor + " button");
    botoes.forEach(function (b) {
      b.addEventListener("click", function () {
        if (b.getAttribute("aria-pressed") === "true") return;
        botoes.forEach(function (o) { o.setAttribute("aria-pressed", String(o === b)); });
        aoTrocar(b);
      });
    });
  }

  function marca(seletor, atributo, valor) {
    document.querySelectorAll(seletor + " button").forEach(function (b) {
      b.setAttribute("aria-pressed", String(b.dataset[atributo] === String(valor)));
    });
  }

  function mostraTipo() {
    el("municipios-titulo").textContent = TIPOS[tipo];
    el("municipios-meta").textContent = SD.COLUNA[tipo];
    marca("#rk-ordem", "tipo", tipo);
    var aviso = el("rk-adocao-aviso");
    aviso.hidden = tipo !== "adocao";
    aviso.textContent = tipo === "adocao" ? SD.textos.adocaoAviso : "";
    // "Incluir cidades com ressalvas" só muda a lista de clientes em potencial
    el("rk-todas").hidden = tipo !== "espaco";
    rodape();
  }

  ligaGrupo("#rk-ordem", function (b) { tipo = b.dataset.tipo; mostraTipo(); municipios.recarrega(); });
  ligaGrupo("#est-ordem", function (b) { ordemEstados = b.dataset.ordem; estados.recarrega(); });

  // ---------- Filtros: perto da base, 2 modelos e cidades com ressalvas ----------

  function mostraPerto() {
    el("rk-perto").setAttribute("aria-pressed", String(filtros.perto));
    el("rk-raio-linha").hidden = !filtros.perto;
    if (filtros.perto) {
      el("rk-raio-base").textContent = "A partir de " + SD.local.rotulo(base);
      marca("#rk-raio", "raio", SD.raio.atual());
    }
  }

  if (base) {
    el("rk-perto").hidden = false;
    el("rk-perto").addEventListener("click", function () {
      filtros.perto = !filtros.perto;
      mostraPerto();
      municipios.recarrega();
    });
    ligaGrupo("#rk-raio", function (b) { SD.raio.escolhe(Number(b.dataset.raio)); municipios.recarrega(); });
  }
  el("rk-concordam").addEventListener("click", function () {
    filtros.concordam = !filtros.concordam;
    this.setAttribute("aria-pressed", String(filtros.concordam));
    municipios.recarrega();
  });
  el("rk-todas").addEventListener("click", function () {
    filtros.todas = !filtros.todas;
    this.setAttribute("aria-pressed", String(filtros.todas));
    municipios.recarrega();
  });

  // ---------- Abas Municípios | Estados ----------

  var estadosCarregados = false, abaAtual = "municipios";

  // Rodapé curto: o critério da lista aberta e, em linha separada, a ressalva
  function rodape() {
    el("rodape-rankings").textContent = abaAtual === "estados" ? SD.textos.estados : SD.textos.criterio[tipo];
    el("rodape-ressalva").textContent = SD.textos.ressalva;
  }

  function mostraAba(aba) {
    abaAtual = aba;
    var ehEstados = aba === "estados";
    el("painel-municipios").hidden = ehEstados;
    el("painel-estados").hidden = !ehEstados;
    if (ehEstados) { el("aba-estados").setAttribute("aria-current", "true"); el("aba-municipios").removeAttribute("aria-current"); }
    else { el("aba-municipios").setAttribute("aria-current", "true"); el("aba-estados").removeAttribute("aria-current"); }
    rodape();
    // a lista de estados só é buscada quando a aba é aberta
    if (ehEstados && !estadosCarregados) { estadosCarregados = true; estados.carrega(); }
  }

  ["municipios", "estados"].forEach(function (aba) {
    el("aba-" + aba).addEventListener("click", function (ev) {
      ev.preventDefault();
      mostraAba(aba);
      history.replaceState(null, "", aba === "estados" ? "rankings.html?aba=estados" : "rankings.html");
    });
  });

  mostraTipo();
  mostraPerto();
  mostraAba(params.get("aba") === "estados" ? "estados" : "municipios");

  SD.api("/ufs").then(function (ufs) {
    ufs.forEach(function (u) {
      var o = document.createElement("option");
      o.value = u.codigo;
      o.textContent = u.nome;
      selEstado.appendChild(o);
    });
    if (ufInicial) {
      selEstado.value = ufInicial.toUpperCase();
      selPorte.value = "0"; // dentro de um estado, mostra todos os portes
    }
    // vindo do Início ("perto de você"): todos os portes, para a lista bater com a do Início
    if (filtros.perto) selPorte.value = "0";
    // vindo do selo de posição do Início: todos os portes, para a posição bater com a lista
    if (porteInicial !== null && selPorte.querySelector('option[value="' + CSS.escape(porteInicial) + '"]')) selPorte.value = porteInicial;
    municipios.carrega();
  }).catch(function (e) { el("erro").hidden = false; el("erro").textContent = e.message; });

  selEstado.addEventListener("change", municipios.recarrega);
  selPorte.addEventListener("change", municipios.recarrega);
})();
