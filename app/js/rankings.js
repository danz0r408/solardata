/* Rankings: maior oportunidade (IPNE) e maior adoção, com filtro de estado e porte */
(function () {
  "use strict";
  if (!SD.sessao.exige()) return;

  var fmt = SD.fmt, el = SD.el, texto = SD.fmt.texto;
  var selEstado = el("rk-estado"), selPorte = el("rk-porte");
  var LIMITE = 10;

  var ufInicial = new URLSearchParams(location.search).get("uf");

  function item(m, tipo) {
    var li = document.createElement("li");
    li.className = "rank";
    var meta, valor;
    if (tipo === "oportunidade") {
      var pct = Math.round(Math.abs(m.diferenca_pct) * 100);
      meta = pct + "% " + (m.diferenca_pct < 0 ? "abaixo" : "acima") + " do esperado · " + texto(fmt.compacto(m.populacao)) + " hab.";
      valor = m.ipne;
    } else {
      meta = texto(fmt.potencia(m.potencia_kw));
      valor = texto(fmt.compacto(m.instalacoes));
    }
    li.innerHTML =
      '<span class="rank__pos">' + m.posicao + "</span>" +
      '<span><a class="rank__name" href="inicio.html">' + SD.escapa(m.nome + ", " + m.uf) + '</a><span class="rank__meta">' + SD.escapa(meta) + "</span></span>" +
      '<span class="rank__value">' + SD.escapa(String(valor)) + "</span>" +
      (tipo === "oportunidade" ? '<span class="rank__bar" aria-hidden="true"><span style="width: ' + m.ipne + '%"></span></span>' : "");
    li.querySelector("a").addEventListener("click", function () {
      SD.local.escolhe({ tipo: "municipio", codigo: m.codigo, nome: m.nome, uf: m.uf });
    });
    return li;
  }

  function preenche(lista, itens, tipo) {
    lista.innerHTML = "";
    if (!itens.length) {
      lista.innerHTML = '<li class="empty-state">Nenhum município com esses filtros.</li>';
    } else {
      itens.forEach(function (m) { lista.appendChild(item(m, tipo)); });
    }
    lista.setAttribute("aria-busy", "false");
  }

  var controle = null;

  function carrega() {
    // cancela a carga anterior: sem isso, uma resposta antiga pode chegar depois e sobrescrever o filtro novo
    if (controle) controle.abort();
    controle = new AbortController();
    var sinal = controle.signal;
    var params = "&limite=" + LIMITE + "&pop_min=" + selPorte.value + (selEstado.value ? "&uf=" + selEstado.value : "");
    ["oportunidade", "adocao"].forEach(function (tipo) {
      var lista = el("lista-" + tipo);
      lista.setAttribute("aria-busy", "true");
      SD.api("/rankings?tipo=" + tipo + params, { signal: sinal })
        .then(function (itens) { preenche(lista, itens, tipo); })
        .catch(function (e) {
          if (e.name === "AbortError") return;
          el("erro").hidden = false;
          el("erro").textContent = e.message;
        });
    });
  }

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
    carrega();
  }).catch(function (e) { el("erro").hidden = false; el("erro").textContent = e.message; });

  selEstado.addEventListener("change", carrega);
  selPorte.addEventListener("change", carrega);
})();
