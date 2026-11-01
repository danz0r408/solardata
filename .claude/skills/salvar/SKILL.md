---
name: salvar
description: >
  Salva o trabalho do Ayho no GitHub com revisao de seguranca antes de commit e push.
  Use quando o usuario disser "salvar", "salva no github", "commit", "push", "/salvar"
  ou pedir backup do trabalho.
---

# /salvar - Salvar no GitHub com guardrails

Skill de uma funcao so: garantir que o trabalho do usuario esteja versionado sem vazar segredo ou publicar coisa errada.

## Workflow

### Passo 1 - Pre-checagem

1. Rodar `git status --short`.
2. Mostrar o status ao usuario.
3. Procurar sinais de segredo antes de qualquer add/commit:

```bash
git grep -n -I -E "sk-|api[_-]?key|token|secret|password|senha|BEGIN (RSA|OPENSSH|PRIVATE) KEY" -- .
```

4. Se aparecer `.env`, chave, token, arquivo privado, export com dados sensiveis ou algo duvidoso, parar e pedir decisao do usuario.

### Primeira vez - repositorio nao inicializado

Detectar com `git rev-parse --is-inside-work-tree`. Se falhar:

1. Perguntar se o usuario ja tem repositorio privado criado no GitHub.
2. Se tiver URL: rodar `git init`, configurar branch `main`, adicionar remoto e continuar para a etapa de arquivos aprovados.
3. Se nao tiver: orientar criar um repo privado ou, se `gh` existir, oferecer `gh repo create <nome> --private --source=. --push` somente depois da revisao de segredos.

### Commits seguintes

1. Se nao houver mudancas, responder que esta tudo sincronizado e parar.
2. Perguntar quais arquivos devem entrar no commit. Nao assumir "tudo" quando houver dados, exports, `.env`, credenciais ou arquivos de cliente.
3. Usar `git add -A -- <arquivos-aprovados>` ou uma lista de caminhos aprovada pelo usuario.
4. Criar mensagem curta baseada nos arquivos alterados, ou usar a mensagem do usuario.
5. Rodar `git commit -m "<mensagem>"`.
6. Antes de `git push`, confirmar o remoto com `git remote get-url origin`.
7. Rodar `git push` somente depois da confirmacao do usuario.

## Regras

- Nunca usar `git add .` automaticamente.
- Nunca commitar `.env`, `.env.*`, tokens, credenciais, chaves privadas, cookies ou arquivos com dados sensiveis sem revisao explicita.
- Nunca usar `--force` sem o usuario pedir explicitamente.
- Nunca rodar `git reset --hard`, `git clean`, `git checkout --` ou comandos destrutivos sem confirmacao clara.
- Se o push falhar por divergencia, avisar e oferecer `git pull --rebase` antes de tentar de novo.
- Se `git user.name` ou `git user.email` estiverem ausentes, perguntar antes de configurar.
