/* Indicadores: busca de estado/município e ficha completa */
(function () {
  "use strict";
  if (!SD.sessao.exige()) return;

  var fmt = SD.fmt, el = SD.el, texto = SD.fmt.texto;
  var controle = null;

  function renderRecentes() { SD.preencheRecentes(el("recentes"), escolhe); }

  function escolhe(l) {
    SD.local.escolhe(l);
    renderRecentes();
    carrega();
  }

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

    var aviso = el("f-oport-aviso");
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

    var rotulo = r.tipo === "uf" ? r.nome : r.nome + ", " + r.uf;
    SD.linhaFonte(r.referencias).then(function (linha) { el("rodape").textContent = rotulo + " · " + linha; });
  }

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
