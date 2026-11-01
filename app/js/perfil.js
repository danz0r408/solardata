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
    el("modelo-info").textContent =
      "Modelo atual: regressão com " + fmt.numero(m.n_municipios) + " municípios, R² de " + fmt.numero(m.r2, 2) +
      " (só PIB e população: " + fmt.numero(m.r2_so_pib_populacao, 2) + "). PIB " + m.ano_pib +
      ", Censo " + m.ano_populacao_modelo + ", base ANEEL " + m.periodo_referencia + ".";
  }).catch(function () { /* informação complementar */ });

  el("sair").addEventListener("click", function () {
    SD.sessao.sai();
    location.replace("login.html");
  });
})();
