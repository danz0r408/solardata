# SolarData

**Onde vender energia solar?** O SolarData mostra a vendedores e instaladores de painéis solares em quais municípios e estados do Brasil ainda faltam mais instalações, comparando cada cidade com cidades de perfil parecido.

Projeto Integrador VI · Big Data para Negócios · Faculdade de Tecnologia do Ipiranga (2026).

- App publicado: https://solardata-zeta.vercel.app (crie uma conta para entrar)
- Web e celular (React Native + Expo) usando a mesma API

---

## O problema

O Brasil passou de 4,6 milhões de sistemas solares, mas a adoção é desigual entre os municípios. Os dados existem (ANEEL, IBGE, INPE), só que estão espalhados, em milhões de linhas, e nenhum deles responde à pergunta prática de quem vende: **em quais cidades perto de mim ainda falta mais gente instalando painel?**

## A ideia

Cidades com renda, população, moradia e sol parecidos, no mesmo estado, costumam ter um número parecido de instalações. O SolarData estima esse número para cada município e compara com o que existe hoje:

```
clientes em potencial = instalações que cidades parecidas têm − instalações que a cidade tem hoje
```

Exemplo real: Campinas (SP) tem 17,9 mil instalações; cidades parecidas teriam cerca de 31,7 mil. São **cerca de 13,8 mil clientes em potencial (≈ 110 MW)**.

## Como funciona, passo a passo

1. **Coleta dos dados públicos.**
   - ANEEL: os 4,67 milhões de sistemas de micro e minigeração distribuída do país, com município, classe de consumo e potência.
   - IBGE: PIB, população, densidade, renda, domicílios, percentual de apartamentos e a localização de cada município.
   - INPE: a irradiação solar de cada município.

2. **Tratamento no Databricks (arquitetura medalhão).**
   - **bronze**: o dado como veio da fonte.
   - **silver**: dado limpo e tipado. Aqui saem CPF, CNPJ e nome dos titulares da base da ANEEL.
   - **gold**: tabelas agregadas por município, as únicas que o app lê.

3. **Modelo de oportunidade (IPNE).** Uma regressão estima quantas instalações cada município teria pelo seu perfil, comparando com os municípios do mesmo estado. Explica 86% da variação entre municípios, também fora da amostra (validação cruzada). Dele saem:
   - os **clientes em potencial**, ou seja, o que falta para chegar ao nível de cidades parecidas;
   - a **nota de oportunidade**, de 0 a 100: quanto maior, menos explorada a cidade.

4. **Segundo modelo (Machine Learning).** Um *Random Forest* estima a potência (MW) de cada município. Quando os dois modelos apontam na mesma direção, o app mostra o selo **"Confirmado por 2 modelos"**.

5. **Regras de decisão na API.** Regras fixas, sem texto gerado por IA, transformam os números em recomendações:
   - alerta **"Muitos prédios"** quando 25% ou mais dos domicílios são apartamentos;
   - cidades com ressalvas vão para o fim da lista;
   - até 3 motivos para **"Por que vender aqui"**;
   - filtro por **raio a partir da cidade-base**.

6. **API.** FastAPI lê as tabelas gold, mantém uma cópia em memória e entrega tudo com os textos prontos. Por isso web e celular dizem exatamente a mesma coisa.

7. **Telas.** O vendedor escolhe a cidade-base e vê os municípios com mais clientes em potencial num raio de 50, 100 ou 200 km.

## O que o app mostra

| Aba | Para que serve |
|---|---|
| **Início** | "Oportunidades perto de você": os 5 municípios com mais clientes em potencial no raio escolhido, e a ficha da cidade-base (nota, alertas, motivos para vender, evolução) |
| **Explorar** | Busca e mapa do Brasil; ficha completa de qualquer município ou estado |
| **Rankings** | Municípios por *mais clientes em potencial*, *menos exploradas* ou *onde já se vende mais*; estados pelo total ou por mil domicílios |
| **Perfil** | Conta, aparência, como ler a nota e de onde vêm os dados |

### Glossário

| Na tela | O que significa |
|---|---|
| Clientes em potencial | Instalações que faltam para a cidade chegar ao nível de cidades parecidas |
| Cidades parecidas têm | O número que o modelo espera para aquele perfil, no mesmo estado |
| Nota de oportunidade (0–100) | Quanto a cidade está atrás do esperado (no método, IPNE: Índice de Potencial Não Explorado) |
| Confirmado por 2 modelos | O IPNE e o modelo de Machine Learning apontam na mesma direção |
| Muitos prédios | 25% ou mais dos domicílios são apartamentos, sem telhado próprio |
| Onde já se vende mais | Mercado consolidado, com mais concorrência; não é oportunidade |

## Tecnologias

| Camada | Stack |
|---|---|
| Dados | Databricks (Delta, PySpark, pandas, numpy), SQL Warehouse serverless |
| API | Python, FastAPI, uvicorn, databricks-sdk, bcrypt e JWT; PostgreSQL (Neon) para as contas, SQLite no ambiente local |
| Web | HTML, CSS e JavaScript puros, sem framework e sem build; mapas em SVG |
| Mobile | React Native 0.88 + Expo SDK 58, expo-router, expo-secure-store |
| Hospedagem | Vercel (API e web), Neon, Databricks |

## Estrutura do repositório

```
api/         API FastAPI: leitura do Databricks, regras de decisão, contas e snapshot de contingência
app/         telas web (HTML, CSS e JS), servidas pela própria API
mobile/      app React Native + Expo (mesmas telas, mesma API)
databricks/  notebooks do pipeline e dos modelos
```

## Como rodar

### API e site

Pré-requisitos: Python 3.12 e a [Databricks CLI](https://docs.databricks.com/dev-tools/cli/install.html) com acesso ao workspace do projeto.

```powershell
databricks auth login --host <endereco-do-workspace> --profile solardata
python -m venv .venv
.venv\Scripts\python -m pip install -r api\requirements.txt
.venv\Scripts\python -m uvicorn api.main:app --port 8000
```

Depois, abra:
- http://localhost:8000 para o app;
- http://localhost:8000/docs para a documentação interativa da API.

Contas e dados:
- **Contas:** sem `DATABASE_URL`, ficam num SQLite local.
- **Primeira consulta:** o SQL Warehouse pode levar alguns segundos para ligar.
- **Sem Databricks:** se ele não responder, a API usa o snapshot que acompanha o código.

As variáveis de ambiente opcionais estão em [.env.example](.env.example).

### App no celular (Expo Go)

Pré-requisitos: Node.js 20+ e o app **Expo Go** no celular.

```powershell
cd mobile
npm install
npx expo start
```

Escaneie o QR code com o Expo Go. O app usa a API publicada por padrão. Para usar a API local:
1. rode a API com `--host 0.0.0.0`;
2. inicie o Expo com o IP do computador:

```powershell
$env:EXPO_PUBLIC_API_URL = "http://<ip-do-computador>:8000"; npx expo start
```

## Atualizar os dados

Os notebooks de `databricks/` são executados no Databricks, nesta ordem:

| Notebook | O que faz |
|---|---|
| `dmm_01_pib_municipal` | PIB (SIDRA 5938) e densidade (SIDRA 4714) |
| `dmm_05_localizacao_moradia` | Centro de cada município (API de Malhas do IBGE) e % de apartamentos (SIDRA 6326) |
| `dmm_02_ipne_municipio` | Indicadores, série anual e IPNE. Rode primeiro com `modo = comparar` (só mede) e depois com `modo = publicar` (grava) |
| `dmm_04_qualidade_iqd` | Índice de Qualidade de Dados das 19 tabelas usadas; todas devem ficar verdes |
| `dmm_03_ml_potencial` | Avaliação do modelo de Machine Learning (modo comparar) |
| `dmm_06_backtest_ipne` | Teste retrospectivo do IPNE (só lê) |

Depois de publicar:
- a API vê os dados novos em até 10 minutos;
- atualize o snapshot com `.venv\Scripts\python -m api.exportar` e faça o deploy.

## API

Todas as rotas, menos status, cadastro e login, exigem `Authorization: Bearer <token>`.

| Rota | Retorno |
|---|---|
| `POST /api/auth/cadastro`, `POST /api/auth/login` | token e usuário |
| `GET`/`PATCH /api/auth/me` | conta logada |
| `GET /api/rankings` | municípios por `tipo=espaco\|oportunidade\|adocao\|populacao`, com `uf`, `pop_min`, `base` + `raio_km`, `concordam` e `todas` |
| `GET /api/rankings/estados` | estados por `ordem=absoluto\|relativo` |
| `GET /api/municipios/{ibge}` | ficha: indicadores, nota, clientes em potencial, alertas, veredito dos modelos e motivos para vender |
| `GET /api/municipios/{ibge}/historico` e `/semelhantes` | série anual e municípios de perfil semelhante |
| `GET /api/ufs`, `/api/ufs/{uf}`, `/municipios` e `/historico` | estados, mapa e séries |
| `GET /api/busca?q=` | busca por nome |
| `GET /api/modelo` | fórmula, coeficientes e métricas dos modelos |
| `GET /api/status` | se os dados estão prontos e de onde vêm |

## Privacidade e qualidade

- **Dados pessoais:** a API só lê tabelas agregadas por município. CPF, CNPJ e nome dos titulares da ANEEL não chegam ao app.
- **Contas:** guardam só nome, e-mail, senha protegida com bcrypt e data de criação. O login bloqueia após 5 senhas erradas em 5 minutos.
- **Qualidade:** é medida por tabela (completude, integridade, unicidade e validade). Na medição de novembro de 2026, as 19 tabelas usadas ficaram verdes.

## Limitações

- **Oportunidade, não previsão.** Um teste retrospectivo mostrou que a nota de 2023 não antecipou onde o mercado mais cresceu em 2024–2025 nas cidades acima de 50 mil habitantes. A nota mede o atraso atual, não o ritmo futuro.
- **Público-alvo não validado.** O perfil do integrador regional ainda é uma hipótese a validar com usuários reais.
- **Cidades com muitos prédios** podem ter o potencial superestimado. Por isso levam um alerta.
- **Datas aproximadas.** A data da instalação é a data de atualização cadastral da ANEEL, uma aproximação.
- **Distâncias em linha reta**, entre os centros dos municípios.

## Equipe

Breno Cunha, Bruno Ramos, Daniel Mussoi, Eduardo Yokomizo, Gustavo Camargo e Gustavo Henrique Santos.
