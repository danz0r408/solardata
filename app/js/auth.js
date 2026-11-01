/* Login e Cadastro */
(function () {
  "use strict";

  SD.ligaMostrarSenha();

  function envia(form, erroEl, valida, caminho, corpo) {
    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      erroEl.textContent = "";
      var problema = valida();
      if (problema) { erroEl.textContent = problema; return; }

      var botao = form.querySelector("button[type=submit]");
      var rotulo = botao.textContent;
      botao.disabled = true;
      botao.textContent = "Aguarde…";
      SD.api(caminho, { metodo: "POST", corpo: corpo(), publica: true })
        .then(function (dados) {
          SD.sessao.entra(dados);
          location.replace("inicio.html");
        })
        .catch(function (e) {
          erroEl.textContent = e.message;
          botao.disabled = false;
          botao.textContent = rotulo;
        });
    });
  }

  var login = SD.el("form-login");
  if (login) {
    var email = SD.el("login-email"), senha = SD.el("login-senha");
    envia(login, SD.el("login-erro"), function () {
      if (!email.value.trim() || !senha.value) return "Informe e-mail e senha.";
    }, "/auth/login", function () {
      return { email: email.value.trim(), senha: senha.value };
    });

    SD.el("esqueci").addEventListener("click", function (ev) {
      ev.preventDefault();
      SD.el("esqueci-aviso").hidden = false;
    });
  }

  var cadastro = SD.el("form-cadastro");
  if (cadastro) {
    var nome = SD.el("cad-nome"), cEmail = SD.el("cad-email"), cSenha = SD.el("cad-senha"), conf = SD.el("cad-confirma");
    envia(cadastro, SD.el("cadastro-erro"), function () {
      if (nome.value.trim().length < 2) return "Informe seu nome.";
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cEmail.value.trim())) return "Informe um e-mail válido.";
      if (cSenha.value.length < 8) return "A senha precisa ter pelo menos 8 caracteres.";
      if (cSenha.value !== conf.value) return "As senhas não conferem.";
    }, "/auth/cadastro", function () {
      return { nome: nome.value.trim(), email: cEmail.value.trim(), senha: cSenha.value };
    });
  }
})();
