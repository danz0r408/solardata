---
name: grill-me
description: >
  Entrevista o usuario de forma rigorosa para stress-testar um plano, ideia, campanha,
  oferta, skill, automacao, projeto, design ou decisao antes de executar. Use quando o
  usuario disser "grill me", "/grill-me", "critica meu plano", "desafia essa ideia",
  "me faz perguntas", "stress-testar", ou quando quiser reduzir ambiguidade antes de
  usar skills como /seo, /carrossel, /publicar-tema, /anuncio-google, /mapear-rotinas
  ou /novo-projeto.
---

# /grill-me - Stress test de planos e decisoes

Skill de pre-decisao. O objetivo e fazer perguntas duras, uma por vez, ate o plano ficar claro o bastante para executar sem chute.

Inspirada na skill `grill-me` de `mattpocock/skills` e adaptada ao fluxo do Ayho.

## Dependencias

Ler conforme o caso:

- `_memoria/empresa.md` - contexto do negocio, oferta, clientes e entregas
- `_memoria/preferencias.md` - tom desejado e coisas a evitar
- `_memoria/estrategia.md` - prioridade atual e o que pode esperar
- `identidade/design-guide.md` - se a decisao envolver visual, marca ou conteudo
- Arquivos do projeto/campanha/skill mencionados pelo usuario

Se a resposta puder ser descoberta olhando o workspace, olhar o workspace antes de perguntar.

## Quando usar

Use antes de:

- Criar ou alterar uma skill importante
- Rodar `/seo`, `/anuncio-google` ou uma campanha paga
- Transformar um tema em conteudo com `/publicar-tema`
- Criar carrossel, landing page, oferta, proposta ou funil
- Abrir um novo projeto/cliente com `/novo-projeto`
- Implementar uma decisao tecnica, operacional ou comercial ainda ambigua

## Quando nao usar

- Tarefa simples e bem especificada
- Usuario pediu execucao direta e o risco e baixo
- Revisao final que ja tem guardrail proprio, como `/aprovar-post`
- Quando o objetivo for apenas gerar ideias livres, sem fechar decisao

## Modo de conversa

Perguntar uma coisa por vez.

Cada pergunta deve vir com uma recomendacao inicial:

```markdown
Pergunta [N]
[pergunta direta]

Minha recomendacao: [resposta recomendada, baseada no contexto atual]
Por que importa: [risco ou decisao que essa pergunta resolve]
```

Depois, esperar a resposta do usuario antes da proxima pergunta.

## Workflow

### Passo 1 - Identificar o alvo

Classificar o que esta sendo grillado:

- **Oferta/negocio:** promessa, publico, prova, preco, entrega
- **Conteudo/marketing:** angulo, publico, canal, CTA, prova, risco de genericidade
- **Ads/SEO:** busca, intencao, conversao, pagina destino, orcamento, mensuracao
- **Skill/automacao:** trigger, input, output, dependencia, risco, guardrail
- **Projeto/codigo:** objetivo, usuarios, fluxo, contratos, testes, migracao, rollback
- **Publicacao:** audiencia, aprovacao, impacto, checklist, reversibilidade

Se o alvo nao estiver claro, a primeira pergunta deve ser: "O que exatamente voce quer que eu grille: ideia, plano, copy, campanha, skill, projeto ou decisao tecnica?"

### Passo 2 - Carregar contexto

Ler os arquivos relevantes da memoria e os documentos citados pelo usuario.

Se houver codigo, campanha, post, skill ou proposta existente, inspecionar os arquivos antes de perguntar sobre algo que ja esta escrito.

### Passo 3 - Descer a arvore de decisoes

Seguir a ordem abaixo, pulando o que ja estiver resolvido pelo contexto:

1. Objetivo: o que precisa mudar no mundo depois disso?
2. Usuario/cliente: quem recebe valor e qual dor real esta sendo resolvida?
3. Sucesso: como saberemos que funcionou?
4. Input: quais dados, assets, permissoes ou contexto entram?
5. Output: o que exatamente precisa sair no final?
6. Restricoes: prazo, orcamento, canal, ferramentas, tom, seguranca.
7. Prova: que evidencias sustentam a promessa ou decisao?
8. Riscos: onde isso pode falhar, ficar generico, caro, lento ou perigoso?
9. Trade-offs: o que estamos escolhendo nao fazer?
10. Proximo passo minimo: qual menor acao valida a direcao?

Nao fazer todas as perguntas mecanicamente. Se uma resposta abrir uma dependencia, seguir esse ramo antes de avancar.

### Passo 4 - Fechar entendimento

Quando a decisao estiver suficientemente clara, devolver:

```markdown
## Decisoes fechadas
- ...

## Riscos restantes
- ...

## Plano minimo
1. ...
2. ...
3. ...

## Proxima skill recomendada
`/<skill>` - [por que essa skill e o proximo passo]
```

Se nao houver skill seguinte, sugerir a acao manual mais simples.

### Passo 5 - Salvar somente se pedir

Por padrao, nao criar arquivos.

Se o usuario pedir registro, salvar em:

```text
saidas/decisoes/grill-me-<slug>-<YYYY-MM-DD>.md
```

O arquivo deve conter perguntas, respostas, decisoes fechadas, riscos e proximo passo.

## Integracao com outras skills

- Antes de `/mapear-rotinas`: validar se a rotina e repetivel, qual input/output e quais guardrails importam.
- Antes de `/seo`: fechar nicho, regiao, prioridade comercial, oferta e conversao desejada.
- Antes de `/anuncio-google`: validar pagina destino, verba, conversao, negativas obvias e promessa do anuncio.
- Antes de `/publicar-tema`: validar tema, angulo, publico, prova e CTA.
- Antes de `/carrossel`: validar objetivo do post, tipo de conteudo e mensagem central.
- Antes de `/novo-projeto`: validar escopo, entregas, dono, prazo e criterio de pronto.
- Antes de `/aprovar-post`: pode revisar risco e coerencia, mas nunca substitui a confirmacao explicita da skill de publicacao.

## Regras

- Ser direto e criterioso, sem sarcasmo e sem atacar o usuario.
- Criticar o plano, nao a pessoa.
- Nao transformar a sessao em brainstorm infinito: cada pergunta deve fechar uma decisao.
- Nao perguntar o que pode ser lido no workspace.
- Nao executar a solucao durante o grill, a menos que o usuario encerre a revisao e peca a execucao.
- Se o usuario responder "decide por mim", escolher a opcao mais simples, reversivel e alinhada a `_memoria/estrategia.md`.
- Se encontrar risco de seguranca, publicacao externa, gasto com ads ou uso de credenciais, parar e apontar o guardrail aplicavel.
