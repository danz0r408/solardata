/* Perfil: dados da conta, edição do nome, explicação do IPNE e saída */
(function () {
  "use strict";
  if (!SD.sessao.exige()) return;

  var el = SD.el, fmt = SD.fmt;

  function mostra(u) {
    el("p-avatar").textContent = fmt.iniciais(u.nome);
    el("p-nome").textContent = u.nome;
    el("p-email").textContent = u.email;
    el("p-campo-nome").value = u.nome;
  }

  var salvo = SD.sessao.usuario();
  if (salvo) mostra(salvo);
  SD.api("/auth/me").then(function (u) { SD.sessao.atualizaUsuario(u); mostra(u); });

  el("form-perfil").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var erro = el("perfil-erro"), ok = el("perfil-ok");
    var botao = ev.target.querySelector("button[type=submit]");
    erro.textContent = "";
    ok.hidden = true;
    botao.disabled = true;
    SD.api("/auth/me", { metodo: "PATCH", corpo: { nome: el("p-campo-nome").value } })
      .then(function (u) { SD.sessao.atualizaUsuario(u); mostra(u); ok.hidden = false; })
      .catch(function (e) { erro.textContent = e.message; })
      .then(function () { botao.disabled = false; });
  });

  // Transparência do modelo: R² e período, direto da tabela dmm_ipne_modelo
  SD.api("/modelo").then(function (m) {
    if (!m || m.r2 == null) return;
    var validacao = m.r2_validacao_cruzada != null
      ? " (" + fmt.numero(m.r2_validacao_cruzada, 2) + " em validação cruzada, com municípios que o modelo não viu)"
      : "";
    el("modelo-info").textContent =
      "Modelo atual: regressão com " + fmt.numero(m.n_municipios) + " municípios, que explica " +
      Math.round(m.r2 * 100) + "% da variação entre eles" + validacao + ". PIB " + m.ano_pib +
      ", Censo " + m.ano_populacao_modelo + (m.ano_irradiacao ? ", INPE " + m.ano_irradiacao : "") +
      ", base ANEEL " + m.periodo_referencia + ".";
    if (m.ml && m.ml.r2_mw != null) {
      el("ml-info").textContent = "Machine Learning: " + fmt.numero(m.ml.n_municipios) + " municípios, explica " +
        Math.round(m.ml.r2_mw * 100) + "% da variação da potência, com erro médio de " +
        fmt.numero(m.ml.erro_medio_mw, 1) + " MW (estimativas fora da amostra).";
    }
  }).catch(function () { /* informação complementar */ });

  // Tema: aplica na hora e lembra a escolha (tema.js reaplica nas outras telas)
  var temaAtual = "sistema";
  try { temaAtual = JSON.parse(localStorage.getItem("sd.tema")) || "sistema"; } catch (e) { /* segue o sistema */ }
  document.querySelectorAll("input[name=tema]").forEach(function (r) {
    r.checked = r.value === temaAtual;
    r.addEventListener("change", function () {
      try { localStorage.setItem("sd.tema", JSON.stringify(r.value)); } catch (e) { /* vale só nesta tela */ }
      var raiz = document.documentElement;
      if (r.value === "sistema") raiz.removeAttribute("data-theme");
      else raiz.setAttribute("data-theme", r.value === "escuro" ? "dark" : "light");
    });
  });

  el("sair").addEventListener("click", function () {
    SD.sessao.sai();
    location.replace("login.html");
  });
})();
