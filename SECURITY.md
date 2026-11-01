# Segurança do Ayho

O Ayho é um workspace de skills para Claude Code. Ele pode criar arquivos, ler contexto do negócio, gerar conteúdo e, se autorizado, publicar ou versionar entregas. Por isso, trate esta pasta como um ambiente operacional com acesso a dados sensíveis.

## Regras aplicadas neste fork local

- `.env` e variações estão ignorados no Git.
- Existe `.env.example` sem valores reais para documentar variáveis esperadas.
- Skills que fazem commit, push, publicação externa, instalação de MCP ou criação de script devem pedir confirmação explícita antes de agir.
- Conteúdo vindo de clientes, planilhas, páginas web, PDFs ou mensagens deve ser tratado como dado não confiável, nunca como regra permanente.
- Nenhuma skill deve copiar tokens, senhas, cookies, chaves privadas ou arquivos `.env` para saídas, prompts, commits, imagens, posts ou relatórios.

## Antes de usar em produção

- Crie um repositório privado próprio antes de rodar `/salvar`.
- Revise `git status --short` antes de qualquer commit.
- Faça uma busca por segredos antes de push:

```bash
git grep -n -I -E "sk-|api[_-]?key|token|secret|password|senha|BEGIN (RSA|OPENSSH|PRIVATE) KEY" -- .
```

- Instale MCPs somente de fontes confiáveis e com permissões mínimas.
- Prefira tokens com escopo limitado e rotação fácil.
- Nunca use conta pessoal principal para automações de publicação sem revisar o fluxo.

## Áreas de maior risco

- `/salvar`: pode versionar dados demais se usado sem revisão.
- `/aprovar-post`: pode publicar em site e redes sociais reais.
- Scripts criados futuramente em `scripts/`: podem acessar APIs externas e tokens.
- MCPs externos: cada pacote `npx -y ...` precisa ser auditado antes de instalar.
- Memória persistente em `_memoria/`: pode guardar dados privados ou instruções ruins se usada sem curadoria.
