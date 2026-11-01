---
name: novo-projeto
description: >
  Cria uma pasta de projeto ou iniciativa dentro do repo atual com `CLAUDE.md` dedicado,
  depois de uma entrevista curta sobre objetivo e entregas previstas. Use quando o usuário
  disser "novo projeto", "/novo-projeto", "começar iniciativa X" ou pedir pra estruturar
  um trabalho dentro do cliente/projeto atual. Se for um cliente totalmente novo, orientar
  criar um novo repo privado a partir do framework Ayho em vez de criar uma subpasta.
---

# /novo-projeto — Pasta de projeto novo com contexto dedicado

Quando o usuário começa uma iniciativa, entrega ou subprojeto dentro do repo atual, cria uma pasta com `CLAUDE.md` próprio que herda contexto da raiz e adiciona o que é específico do projeto.

Se for um cliente totalmente novo, não criar uma pasta dentro do repo atual. Recomendar criar um novo repo privado a partir do framework Ayho, clonar esse repo e rodar `/instalar` nele.

## Workflow

### Passo 1 — Entrevista (4 perguntas)

1. "Qual o nome do projeto ou iniciativa?"
2. "Isso pertence ao cliente/projeto deste repo ou é um cliente totalmente novo?"
3. "Qual o objetivo principal? (uma frase)"
4. "Que tipo de entrega vai ter? (ex: ads, site, conteúdo, automação, proposta — pode ser mais de uma)"

Se a resposta 2 indicar cliente totalmente novo, parar e responder:

> "Para cliente novo, o melhor caminho no Ayho é repo novo, não subpasta. Cria um repo privado a partir do template `ayho-framework`, clona com o nome do cliente e roda `/instalar` lá. Assim a memória, dados e histórico desse cliente ficam isolados."

### Passo 2 — Decidir local

Baseado na resposta 2, quando for dentro do repo atual:

- **Entrega/iniciativa do cliente atual:** criar em `projetos/<nome>/` ou na pasta equivalente do perfil — ler `CLAUDE.md` da raiz pra confirmar a convenção
- **Projeto interno do repo atual:** criar em `projetos/<nome>/` (criar `projetos/` se não existir)
- **Iniciativa pessoal dentro deste repo:** perguntar onde o usuário prefere
- **Cliente totalmente novo:** não criar pasta; orientar novo repo a partir do framework Ayho

### Passo 3 — Estrutura básica

Criar a pasta com:

- `CLAUDE.md` do projeto (instruções herdadas + específicas)
- `briefing.md` (com o que foi coletado na entrevista)
- Subpastas conforme as entregas mencionadas (ex: se mencionou "ads e conteúdo", criar `ads/` e `conteudo/`)

### Passo 4 — Conteúdo do `CLAUDE.md` do projeto

Template:

```markdown
# [Nome do projeto]

> Projeto criado em [data]. Pasta dedicada — instruções aqui sobrescrevem as da raiz quando relevantes.

## Sobre

[Objetivo da resposta 3]

## Tipo

[Entrega do cliente atual / Projeto interno / Iniciativa pessoal]

## Entregas previstas

- [entrega 1 da resposta 4]
- [entrega 2 da resposta 4]
- ...

## Onde salvar o que

- Briefings e contexto: nessa pasta na raiz
- Entregas: cada subpasta criada (ads/, conteudo/, site/, etc.)

## Contexto que herda da raiz

Esse projeto herda automaticamente o tom de voz, marca e contexto do negócio definidos em `_memoria/` e `identidade/` da raiz. Não duplicar essas informações aqui.

## Específico desse projeto

[Vazio — preencher com regras que valem só pra esse projeto, conforme for descobrindo]
```

### Passo 5 — Resumo

Responder pro usuário:

```
Pasta criada: [caminho]
✓ CLAUDE.md do projeto
✓ briefing.md
✓ Subpastas: [lista]

Quando for trabalhar nesse projeto, abre o terminal já dentro da pasta — assim eu carrego o CLAUDE.md específico junto com o da raiz.
```

## Regras

- Nome de pasta: usar o nome como o usuário falou, sem normalizar agressivamente (manter acentos, espaços viram hífen, mas o nome reconhecível)
- Não criar subpastas que não foram pedidas ("pra organizar melhor"). Só o que foi mencionado nas entregas
- Se o projeto já existe (pasta com mesmo nome), avisar e perguntar se é pra adicionar dentro ou criar com sufixo
- Cliente totalmente novo deve virar repo novo a partir do framework Ayho, não subpasta
