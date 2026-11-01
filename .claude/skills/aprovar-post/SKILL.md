---
name: aprovar-post
description: >
  Aprova e publica um post da fila: blog, assets do carrossel, commit/push e
  publicacao em Instagram/Facebook via Meta Graph API. Use quando o usuario disser
  "aprovar post X", "publicar o post do tema Y", "/aprovar-post X" ou quando
  quiser disparar publicacao automatica de conteudo ja criado por /publicar-tema.
---

# /aprovar-post - Pipeline seguro de publicacao

Faz a ponte entre conteudo aprovado e publicacao real no site e redes sociais.

## Quando nao usar

- Conteudo ainda nao foi criado.
- Usuario ainda esta revisando.
- Site, deploy ou Meta API nao estao configurados.
- Qualquer credencial, `.env`, token, cookie ou chave privada apareceu no diff ou nos arquivos de publicacao.

## Pre-requisitos

- `.env` local com `META_PAGE_ACCESS_TOKEN`, `META_PAGE_ID`, `META_IG_USER_ID` e `SITE_URL`.
- `.env` precisa estar ignorado no Git.
- Site com deploy automatico a partir do repositorio privado/correto.
- Conta Instagram Business conectada a Pagina Facebook.
- Scripts `scripts/postar-instagram.js` e `scripts/postar-facebook.js` revisados e aprovados.

Se algo faltar, parar e criar/atualizar `marketing/automacao-meta-setup.md` com o que precisa ser feito.

## Guardrails de seguranca

- Antes de publicar, rodar `git status --short` e mostrar exatamente quais arquivos serao alterados, commitados ou publicados.
- Nunca abrir, imprimir, copiar ou commitar `.env`; scripts devem ler variaveis por ambiente, sem registrar valores em log.
- Se a skill precisar criar ou alterar scripts em `scripts/`, mostrar o conteudo e pedir aprovacao antes de executar.
- A confirmacao final precisa ser explicita, por exemplo: "sim, publicar no site, Instagram e Facebook".
- Se a resposta for ambigua, pedir confirmacao clara.
- Nao postar em redes sociais se a URL publica do site ou das imagens nao responder HTTP 200.

## Workflow

1. Localizar o blog em draft e a pasta do carrossel em `marketing/conteudo/`.
2. Validar `legenda.md`, `legenda-linkedin.md` e PNGs em `instagram/`.
3. Mostrar resumo: titulo, quantidade de slides, legenda resumida, URLs finais e arquivos que mudarao.
4. Pedir confirmacao explicita.
5. Alterar `draft: true` para `draft: false`.
6. Copiar os PNGs para o public folder do site.
7. Rodar checagem de segredos e `git status --short`.
8. Commitar somente os caminhos aprovados.
9. Fazer push somente para o remoto confirmado pelo usuario.
10. Aguardar deploy e validar HTTP 200 do post e de `slide-01.png`.
11. Publicar Instagram.
12. Publicar Facebook somente se Instagram funcionar.
13. Entregar resumo com links e avisar que LinkedIn continua manual.

## Tratamento de erro

- Push falhou: restaurar `draft: true`, relatar e parar.
- Deploy nao subiu em 5 minutos: perguntar se aborta ou continua.
- Instagram falhou: nao seguir para Facebook.
- Facebook falhou: relatar e sugerir retry isolado.

## Principios

- Confirmacao humana antes de qualquer coisa irreversivel.
- Falhar cedo quando faltar requisito.
- Nao esconder logs de decisao, mas nunca logar segredo.
- Reexecutar com o mesmo slug deve detectar publicacao previa e perguntar se atualiza ou republica.
