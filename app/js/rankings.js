/* Rankings: maior oportunidade (IPNE) e maior adoção, com filtro de estado e porte */
(function () {
  "use strict";
  if (!SD.sessao.exige()) return;

  var fmt = SD.fmt, el = SD.el, texto = SD.fmt.texto;
  var selEstado = el("rk-estado"), selPorte = el("rk-porte");
  var PASSO = 10, MAXIMO = 50;
  var TIPOS = ["oportunidade", "adocao"];
  var limites = { oportunidade: PASSO, adocao: PASSO };
  var controles = {};

  var params = new URLSearchParams(location.search);
  var ufInicial = params.get("uf"), porteInicial = params.get("porte");
  el("rodape-rankings").textContent = "Maior oportunidade: municípios com mais espaço para crescer em relação ao esperado pelo perfil (IPNE). " +
    SD.textos.esperadoPerfil + " " + SD.textos.ressalva;

  function item(m, tipo) {
    var li = document.createElement("li");
    li.className = "rank";
    var meta, valor;
    if (tipo === "oportunidade") {
      // mesma manchete do card do município (vem da API)
      meta = m.manchete + " · " + texto(fmt.compacto(m.populacao)) + " hab.";
      valor = m.ipne;
    } else {
      meta = texto(fmt.potencia(m.potencia_kw)) + " instalados";
      valor = texto(fmt.compacto(m.instalacoes));
    }
    li.innerHTML =
      '<span class="rank__pos">' + m.posicao + "</span>" +
      '<span><a class="rank__name" href="' + SD.explorar.link({ tipo: "municipio", codigo: m.codigo }) + '">' + SD.escapa(m.nome + ", " + m.uf) + "</a>" +
      '<span class="rank__meta">' + SD.escapa(meta) + "</span></span>" +
      '<span class="rank__value">' + SD.escapa(String(valor)) + "</span>" +
      (tipo === "oportunidade" ? '<span class="rank__bar" aria-hidden="true"><span style="width: ' + m.ipne + '%"></span></span>' : "");
    return li;
  }

  function preenche(tipo, itens) {
    var lista = el("lista-" + tipo);
    lista.innerHTML = "";
    if (!itens.length) {
      lista.innerHTML = '<li class="empty-state">Nenhum município com esses filtros.</li>';
    } else {
      var frag = document.createDocumentFragment();
      itens.forEach(function (m) { frag.appendChild(item(m, tipo)); });
      lista.appendChild(frag);
    }
    lista.setAttribute("aria-busy", "false");
    // se veio a lista cheia, provavelmente há mais
    el("mais-" + tipo).hidden = itens.length < limites[tipo] || limites[tipo] >= MAXIMO;
  }

  function carregaTipo(tipo) {
    // cancela a carga anterior: sem isso, uma resposta antiga pode chegar depois e sobrescrever o filtro novo
    if (controles[tipo]) controles[tipo].abort();
    controles[tipo] = new AbortController();
    var params = "?tipo=" + tipo + "&limite=" + limites[tipo] + "&pop_min=" + selPorte.value +
      (selEstado.value ? "&uf=" + selEstado.value : "");
    el("lista-" + tipo).setAttribute("aria-busy", "true");
    SD.api("/rankings" + params, { signal: controles[tipo].signal })
      .then(function (itens) { preenche(tipo, itens); })
      .catch(function (e) {
        if (e.name === "AbortError") return;
        el("erro").hidden = false;
        el("erro").textContent = e.message;
      });
  }

  function recarrega() {
    TIPOS.forEach(function (t) { limites[t] = PASSO; carregaTipo(t); });
  }

  TIPOS.forEach(function (t) {
    el("mais-" + t).addEventListener("click", function () {
      limites[t] = Math.min(limites[t] + PASSO, MAXIMO);
      carregaTipo(t);
    });
  });

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
    // vindo do selo de posição do Início: todos os portes, para a posição bater com a lista
    if (porteInicial !== null && selPorte.querySelector('option[value="' + CSS.escape(porteInicial) + '"]')) selPorte.value = porteInicial;
    recarrega();
  }).catch(function (e) { el("erro").hidden = false; el("erro").textContent = e.message; });

  selEstado.addEventListener("change", recarrega);
  selPorte.addEventListener("change", recarrega);
})();
