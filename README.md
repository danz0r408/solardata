# SolarData

Aplicativo de inteligência de mercado para geração solar distribuída por município. Projeto Integrador VI, Big Data para Negócios (Fatec Ipiranga).

Dados da ANEEL e do IBGE processados no Databricks, uma API em FastAPI, e duas interfaces que consomem essa API: telas web e um app em React Native (Expo). O diferencial é o **IPNE (Índice de Potencial Não Explorado)**: quantas instalações solares cada município deveria ter pelo seu perfil socioeconômico, comparado com quantas tem.

## Arquitetura

```
ANEEL + IBGE (SIDRA)
      │
Databricks · catálogo pi-6
  bronze ──► silver ──► gold (fato_empreendimentos, dim_*)
                          │
          notebooks databricks/dmm_01, dmm_02
                          │
          gold.dmm_municipio_resumo · gold.dmm_kpi_municipio_anual · gold.dmm_ipne_modelo
          + gold.dmm_ml_potencial_municipio (Machine Learning do Gustavo)
                          │  (SQL Warehouse, ao vivo, cache de 10 min + snapshot local)
                     API FastAPI (api/)
                          │  JSON + token JWT
            Telas web (app/)        App React Native + Expo (mobile/)
```

- Tabelas criadas por este trabalho têm o prefixo `dmm_` e a tag `autor = dmm`. Nenhuma tabela existente é alterada.
- A API lê também a tabela do Machine Learning do Gustavo (Random Forest de potência esperada, validada em `databricks/dmm_03_ml_potencial.py`). Se ela não existir, o app segue sem essa seção.
- A API só lê tabelas agregadas por município. A camada silver, que tem CPF/CNPJ e nome de titulares, nunca é acessada.

## Como rodar

Pré-requisitos: Python 3.12 e a [Databricks CLI](https://docs.databricks.com/dev-tools/cli/install.html).

```powershell
# 1. Login no Databricks (abre o navegador; nenhum token vai para o código)
databricks auth login --host https://dbc-f58d5815-4257.cloud.databricks.com --profile solardata

# 2. Ambiente Python
python -m venv .venv
.venv\Scripts\python -m pip install -r api\requirements.txt

# 3. API + telas
.venv\Scripts\python -m uvicorn api.main:app --port 8000
```

Abra http://localhost:8000 (app) ou http://localhost:8000/docs (documentação da API).

Na primeira consulta, o SQL Warehouse serverless pode levar de 5 a 20 s para acordar. A splash espera por isso. Se o Databricks estiver indisponível, a API usa o último snapshot (`api/data/snapshot/`) e as telas mostram "cópia local de...".

### Variáveis opcionais

| Variável | Padrão | Para quê |
|---|---|---|
| `DATABRICKS_PROFILE` | `solardata` | perfil da CLI |
| `DATABRICKS_WAREHOUSE_ID` | primeiro do workspace | SQL Warehouse usado |
| `SOLARDATA_CACHE_TTL_S` | `600` | validade do cache em memória |
| `SOLARDATA_JWT_SECRET` | gerado em `api/data/.jwt_secret` | assinatura dos tokens |
| `SOLARDATA_CORS` | `*` | origens permitidas (restringir em produção) |

## App no celular (Expo Go)

O app em `mobile/` é React Native com Expo (SDK 58) e Expo Router. Ele usa a mesma API e tem as mesmas telas da versão web: login e cadastro, Início, Explorar (com o mapa dos estados e dos municípios), Rankings e Perfil. O token fica no cofre do aparelho (`expo-secure-store`).

Pré-requisitos: Node.js 20+ e o app **Expo Go** no celular (Play Store ou App Store).

```powershell
cd mobile
npm install
npx expo start
```

Escaneie o QR code com o Expo Go (Android) ou com a câmera (iPhone). O celular e o computador precisam estar na mesma rede Wi-Fi; se não estiverem, use `npx expo start --tunnel`.

Por padrão o app usa a API publicada (`https://solardata-zeta.vercel.app`). Para usar a API rodando no seu computador, rode a API com `--host 0.0.0.0` e inicie o Expo com o IP do computador:

```powershell
$env:EXPO_PUBLIC_API_URL = "http://192.168.0.10:8000"; npx expo start
```

## Atualizar os dados no Databricks

Os notebooks ficam em `databricks/` e no workspace em `/Users/<seu-email>/solardata_dmm/`.

1. `dmm_01_pib_municipal`: PIB municipal (SIDRA 5938) e densidade (Censo 2022, SIDRA 4714).
2. `dmm_02_ipne_municipio`: KPIs por município, série anual e o modelo do IPNE (v2: renda, irradiação e domicílios).
3. `dmm_03_ml_potencial`: validação do modelo de Machine Learning (modo `comparar`, não grava nada).

Depois de rodar, a API passa a usar os novos dados em até 10 minutos. Atualize também o snapshot que vai junto com o código (usado no deploy enquanto o Databricks acorda): `.venv\Scripts\python -m api.exportar`.

## Endpoints

| Rota | Retorno |
|---|---|
| `POST /api/auth/cadastro`, `POST /api/auth/login` | token JWT + usuário |
| `GET/PATCH /api/auth/me` | conta logada |
| `GET /api/busca?q=` | estados e municípios |
| `GET /api/municipios/{ibge}` e `/historico` | indicadores, IPNE e série anual |
| `GET /api/ufs`, `/api/ufs/{uf}` e `/historico` | agregados por estado |
| `GET /api/rankings?tipo=oportunidade\|adocao&uf=&pop_min=` | rankings |
| `GET /api/modelo` | fórmula, coeficientes e R² do IPNE |
| `GET /api/status` | prontidão e origem dos dados |

Todas as rotas de dados exigem `Authorization: Bearer <token>`.

## Metodologia e limitações

Ver [docs/ipne.md](docs/ipne.md).
