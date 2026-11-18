/* Splash: aproveita o tempo em que o SQL Warehouse acorda e segue quando os dados estão prontos */
(function () {
  "use strict";

  var msg = SD.el("splash-msg");
  var inicio = Date.now();
  var LIMITE_MS = 90000;
  var MINIMO_MS = 1200; // o suficiente para a marca aparecer

  function segue() {
    var destino = SD.sessao.token() ? "inicio.html" : "login.html";
    setTimeout(function () { location.replace(destino); }, Math.max(0, MINIMO_MS - (Date.now() - inicio)));
  }

  function verifica() {
    SD.api("/status", { publica: true }).then(function (s) {
      if (s.pronto) return segue();
      if (Date.now() - inicio > 6000) msg.textContent = "Carregando os dados…";
      agenda();
    }).catch(function () {
      msg.textContent = "Aguardando o servidor do SolarData…";
      agenda();
    });
  }

  function agenda() {
    if (Date.now() - inicio > LIMITE_MS) {
      msg.textContent = "Os dados estão demorando. Recarregue a página para tentar de novo.";
      return;
    }
    setTimeout(verifica, 1500);
  }

  verifica();
})();
