# scripts/ - utilitarios do Ayho

Scripts Node.js e Python que as skills podem chamar quando precisam gerar imagem, publicar em rede social, renderizar HTML em PNG ou integrar APIs.

A pasta vem vazia por padrao. Scripts so devem ser criados quando uma skill realmente precisar.

## Scripts comuns

| Skill | Script esperado | O que faz |
|---|---|---|
| `/carrossel` com foto IA | `gerar-imagem.js` | Gera foto via API configurada |
| `/carrossel` render PNG | `render.js` | Playwright tira screenshots dos slides |
| `/aprovar-post` | `postar-instagram.js` | Publica carrossel via Meta Graph API |
| `/aprovar-post` | `postar-facebook.js` | Publica carrossel no Facebook |

## Seguranca obrigatoria

- Nunca hardcodar tokens dentro de scripts.
- Scripts devem ler segredos por variavel de ambiente.
- `.env` real e ignorado pelo Git; use `.env.example` como modelo.
- Antes de executar script novo, mostrar o conteudo ao usuario e pedir aprovacao.
- Scripts nao devem imprimir tokens, headers de autorizacao, cookies ou respostas completas de APIs com dados sensiveis.
- Preferir tokens de escopo minimo.

## Pre-requisitos comuns

Node.js 20+ instalado.

`.env` local na raiz do projeto, nunca commitado:

```bash
OPENAI_API_KEY=
META_PAGE_ACCESS_TOKEN=
META_PAGE_ID=
META_IG_USER_ID=
SITE_URL=
```

Playwright, quando precisar renderizar HTML:

```bash
npm install playwright
npx playwright install chromium
```

## Como o Ayho lida com isso

Quando uma skill precisar de script ausente:

1. Detectar que falta o script.
2. Explicar o que o script vai fazer.
3. Pedir confirmacao para criar.
4. Criar o script sem credenciais hardcoded.
5. Mostrar o script antes de executar.
6. Executar somente depois da aprovacao.
