# Roteiro de skill futura - Banco de dados e login seguro

Este documento e a base para uma skill do Ayho que deve permitir a uma LLM criar, configurar e validar banco de dados, autenticaçao, permissoes, storage e backups de forma quase one-shot. A skill deve automatizar tudo que for seguro automatizar e parar explicitamente quando uma açao manual do usuario for necessaria.

## Objetivo da skill

Criar a fundacao segura de um app interno ou SaaS simples/medio:

- Banco Postgres/Supabase com migrations versionadas.
- Auth com cadastro publico fechado quando o app for interno.
- Primeiro usuario dono com bootstrap controlado.
- RBAC por papeis.
- RLS por tenant/organizacao e, quando existir, loja/unidade.
- Storage privado por tenant/unidade.
- Backups em dois niveis.
- Tela de login real.
- Checks de seguranca antes e depois de cada marco.
- Documentacao operacional para futuro pentest/auditoria.

## Principio central

Seguranca e parte do processo, nao uma revisao decorativa no final. Depois de cada marco critico, a LLM deve rodar um check curto antes de seguir:

1. Banco/RLS.
2. Auth/login.
3. Roles/permissoes.
4. Storage/upload.
5. Backup/restore.
6. Deploy/config.
7. Webhook/integracao externa.
8. Agente de IA.

Antes de entregar ao cliente, rodar auditoria completa com conselho de agentes.

## Quando usar

Use esta futura skill quando o usuario pedir:

- Criar banco de dados seguro.
- Configurar Supabase/Postgres.
- Criar login/autenticacao.
- Criar CRM interno.
- Criar SaaS com multi-tenant.
- Configurar RLS.
- Criar bootstrap do primeiro owner.
- Configurar backups.
- Preparar projeto para entrega segura.

Nao usar para:

- Prototipo descartavel sem dados pessoais.
- Tela puramente visual sem auth/banco.
- Migraçao complexa de banco legado sem planejamento separado.

## Ordem one-shot recomendada

### 0. Descoberta minima

A LLM deve descobrir:

- Tipo de app: interno, publico, SaaS, white-label.
- Dados pessoais tratados.
- Papeis de usuario.
- Unidade operacional: loja, filial, equipe, unidade, projeto.
- Stack atual.
- Se ja existe Supabase/DB/Auth configurado.
- Se o repo tem `.env.example`, `AGENTS.md`, `SECURITY.md`, docs ou migrations.

Perguntar apenas o que nao puder ser inferido e for bloqueador real.

### 1. Guardrail de segredos

Antes de qualquer comando sensivel:

- Nunca ler, imprimir, copiar, commitar ou resumir `.env`, tokens, senha de banco, `service_role`, `sb_secret`, cookies ou private keys.
- Se precisar de chave publica de frontend, pedir explicitamente apenas publishable/anon key.
- Nunca usar comando que liste chave publica e secreta juntas, salvo se houver ferramenta que redija/filtre secrets.
- Se uma senha aparecer no chat/log, tratar como temporaria e exigir rotacao antes de dados reais.

Checks:

```powershell
rg -n --glob '!node_modules/**' --glob '!dist/**' --glob '!.env*' "(service_role|sb_secret_|postgresql://.*:.*@|sk-[A-Za-z0-9_-]{20,}|BEGIN .*PRIVATE KEY)" .
```

Se houver `gitleaks`/`trufflehog`, usar com redacao.

### 2. Instalar ferramentas

Preferir CLI/MCP oficial:

- Supabase CLI como dependencia dev do projeto ou binario oficial.
- `psql`, `pg_dump`, `pg_restore`.
- Usar MCP Supabase quando disponivel para buscar publishable keys/advisors sem expor service role.
- Verificar comandos com `--help` antes de usar.

Se Docker local falhar, usar Postgres temporario local para validar migrations.

### 3. Criar projeto Supabase

Se nao existir projeto:

1. Verificar login CLI/MCP.
2. Se usuario pedir criacao automatica, criar staging primeiro.
3. Escolher regiao proxima do cliente.
4. Registrar `project_ref`, URL do dashboard e ambiente.
5. Nunca salvar senha real no repo.

Se precisar de senha inicial e ela aparecer no chat, registrar como temporaria/comprometida e exigir rotacao antes de producao.

### 4. Configurar Auth

Para app interno:

```toml
[auth]
enable_signup = false
jwt_expiry = 3600
enable_anonymous_sign_ins = false
minimum_password_length = 10

[auth.email]
enable_signup = true
double_confirm_changes = true
enable_confirmations = true
secure_password_change = true
max_frequency = "1m"
otp_length = 8
otp_expiry = 3600

[auth.mfa.totp]
enroll_enabled = true
verify_enabled = true
```

Importante:

- `[auth] enable_signup = false` fecha cadastro publico.
- `[auth.email] enable_signup = true` mantem provider e-mail/senha funcionando para usuarios criados manualmente/admin.
- Sessao com `timebox`/`inactivity_timeout` pode exigir plano Pro. Se falhar, documentar e compensar com JWT curto, MFA e logout.
- Leaked password protection tambem pode exigir plano Pro. Se advisor apontar, documentar como ressalva/upgrade.

Rodar:

```powershell
npx supabase config push --project-ref <project_ref>
```

### 5. Modelar banco seguro

Padrao base:

- `organizations` como tenant.
- `stores` ou unidade operacional quando existir.
- `profiles` ligado a `auth.users.id`.
- `organization_memberships` com `role`, `store_id`, `active`.
- Tabelas de negocio sempre com `organization_id`.
- Dados de loja sempre com `store_id`.
- FKs compostas para impedir relacionamento entre tenants.
- `audit_logs`.
- `privacy_processing_records`.
- `backup_restore_tests`.

Roles sugeridas:

- `owner`
- `admin`
- `manager`
- `sales`
- `technician`
- `finance`
- `readonly`

Regras:

- Role e loja do usuario nunca vem do frontend como fonte de verdade.
- `sales` e `technician` devem ser restritos por loja, salvo decisao explicita.
- `owner/admin` podem ser globais.
- `manager/finance/readonly` podem ser globais ou restritos conforme `store_id`.
- Tabelas filhas devem validar permissao subindo ate a tabela pai com `store_id`.

### 6. RLS e policies

Obrigatorio:

- Ativar RLS em toda tabela exposta.
- Revogar acesso anonimo a dados sensiveis.
- Usar helpers em schema privado.
- `security definer` somente em schema privado, com `set search_path = ''`.
- Evitar `auth.uid()` direto em policies; usar `(select auth.uid())`.
- Separar policies por acao quando `FOR ALL` gerar sobreposicao/performance ruim.
- Criar indices em `organization_id`, `store_id`, `user_id` e colunas usadas em policies.

Checks:

```sql
select count(*) from information_schema.tables where table_schema = 'public';
select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity;
select count(*) from pg_policies where schemaname in ('public','storage');
```

### 7. Storage privado

Padrao:

```text
org/<organization_id>/store/<store_id>/...
org/<organization_id>/global/...
```

Regras:

- Bucket privado.
- URLs assinadas quando necessario.
- Limite de tamanho.
- MIME/extensao validados no backend quando houver upload real.
- Nunca bucket publico com dados pessoais.

### 8. Bootstrap do primeiro owner

A LLM deve explicar:

- O usuario Auth guarda login/senha/sessao.
- O banco do CRM guarda permissao/role/membership.
- O primeiro owner nasce com usuario Auth criado manualmente ou Admin API segura.

Fluxo seguro:

1. Usuario cria Auth user no Supabase Dashboard.
2. Usuario envia somente UUID, nunca senha.
3. Script bootstrap cria organizacao, lojas, profile e membership owner.
4. Validar:

```sql
select count(*) from profiles where id = '<uuid>';
select count(*) from organization_memberships where user_id = '<uuid>' and role = 'owner' and active = true;
```

O script nao deve receber senha, service role ou secret no chat.

### 9. Frontend login

Regras:

- Usar `@supabase/supabase-js`.
- No browser, somente `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`/anon.
- Nunca `service_role`, `sb_secret`, `DATABASE_URL`.
- Login com `signInWithPassword`.
- Validar sessao com `auth.getUser()`, nao apenas localStorage.
- Apos login, buscar `profiles` e `organization_memberships` via RLS.
- Usuario sem profile ativo ou membership ativa nao entra.
- Mostrar erro tecnico seguro quando auth falhar: `error.code`.
- Nao mascarar todos erros como "senha errada"; isso atrapalha debug.

Armadilhas conhecidas:

- `email_provider_disabled`: `[auth.email] enable_signup` esta false ou provider email desativado.
- Login volta para tela sem mensagem: a tela nao sincronizou erro/estado do parent.
- Login aceita senha e volta para a tela de login: verificar se a validaçao interna falhou ao buscar `profiles`/`organization_memberships`. Testar RLS simulando `role authenticated` e `request.jwt.claim.sub`.
- `infinite recursion detected in policy for relation "profiles"`: policy de `profiles` esta consultando `profiles` diretamente. Mover a logica para helper `security definer` em schema privado ou reescrever a policy sem self-join.
- Flicker ao trocar de aba/foco: `onAuthStateChange` pode reemitir evento de sessao e disparar nova validaçao. Nao desmontar a tela principal se o operador ja foi carregado. Usar `useRef`/estado estavel como `hasLoadedOperator` para diferenciar validaçao inicial de revalidaçao silenciosa.
- Usuario confirmado mas nao entra: verificar membership/profile/RLS.
- Public key/URL de outro projeto: login pode falhar ou nao encontrar membership.
- Cliente criado com telefone existente mas nome nao salva: a API nao deve apenas retornar o registro antigo. Se o telefone ja existir no mesmo tenant, atualizar campos seguros como nome, origem e consentimento, preservando `organization_id` e evitando sobrescrever `store_id` com `null`.

### 10. Backend/API

Frontend protegido nao basta. O backend deve:

- Receber Bearer token.
- Validar JWT no Supabase Auth ou verificar `getUser`.
- Buscar profile/membership no servidor/banco usando client por request com `Authorization: Bearer <jwt>` para respeitar RLS.
- Nao aceitar role enviada pelo client como fonte de verdade.
- Aplicar RBAC no backend.
- Usar service role apenas para tarefas administrativas estritas e nunca para requests normais de usuario.
- `ALLOW_DEMO_AUTH` deve ser opt-in explicito e nunca ficar ativo por padrao em staging/producao.
- Remover fallback de dados demo em build de producao; fallback pode mascarar auth quebrada e vazar dataset no bundle.
- Se a API nasceu com `db.json`/mock local, migrar leituras e writes simples primeiro, mas bloquear writes compostos ate haver transacao/RPC.
- Em operacoes que mexem em varias tabelas, como venda + pagamentos + baixa de estoque + caixa, nao fazer uma cadeia de requests independentes ao PostgREST. Criar RPC transacional no Postgres ou usar conexao server-side com transacao explicita.
- Se frontend e API forem hospedados separados, criar `VITE_API_BASE_URL` para o frontend e restringir `CORS_ORIGIN` na API.
- Hostinger/domino/DNS nao e problema. O risco e tratar VPS generica como banco/API/backup gerenciado sem hardening, patches, restore testado, secrets e monitoramento.

Sequencia segura para migrar uma API demo:

1. API valida Bearer JWT e monta contexto real do usuario.
2. `GET /api/bootstrap` passa a ler Supabase/Postgres com RLS.
3. Writes simples de uma tabela, como cliente e caixa, passam ao Supabase.
4. Writes compostos retornam erro claro, como `501`, ate existir RPC/transacao.
5. Criar RPCs para vendas, estoque, OS e integraÃ§oes.
6. So depois liberar esses botoes no app real.

Checklist de smoke/pentest leve para deploy:

1. Health publico retorna 200.
2. Rota privada sem Bearer retorna 401.
3. `x-user-role: admin` sem Bearer nao bypassa auth.
4. Bearer invalido retorna 401.
5. Endpoints demo ficam 401/404 em producao.
6. Endpoints n8n/webhook ficam 401/404/501 enquanto desativados.
7. CORS nao aceita origem arbitraria.
8. CSP/HSTS/nosniff/clickjacking/referrer/permissions headers presentes.
9. `X-Powered-By` ausente.
10. HTML/bundle sem `service_role`, `sb_secret`, `DATABASE_URL`, senha ou marcador de segredo.
11. Body grande rejeitado antes de regra de negocio.
12. Logs do provedor sem erro apos smoke.

Hardening obrigatorio para CRM:

- Falhar boot se `NODE_ENV=production` e `ALLOW_DEMO_AUTH=true`.
- Falhar boot se webhook/n8n estiver ativo sem token interno em producao.
- Vendedor operacional so registra venda em seu proprio usuario; owner/admin/manager podem atribuir.
- Tecnico operacional so abre/assume OS em seu proprio usuario; owner/admin/manager podem atribuir.
- Endpoint autenticado nunca deve consultar mock/`db.json` em deploy real.
- Headers de seguranca devem existir no servidor API e no hosting estatico.

### 11. Backups em dois niveis

Nivel 1:

- Backup automatico do provedor.

Nivel 2:

- `pg_dump -Fc` diario para storage externo separado.
- Backup separado do Storage/uploads.
- Retencao inicial 30 dias.
- Teste de restore mensal.
- Registrar restore em `backup_restore_tests`.

Scripts esperados:

- `scripts/backup-db.ps1`
- `scripts/restore-db.ps1`
- `scripts/backup-storage.ps1`
- `scripts/validate-db-local.ps1`

Sem restore testado, backup nao conta como validado.

### 12. Checks obrigatorios

Antes de dizer que terminou:

```powershell
npm run build
npm audit --audit-level=moderate
npm run db:validate:local
npx supabase db advisors --linked --type security --level warn --fail-on none
npx supabase db advisors --linked --type performance --level warn --fail-on none
```

Tambem verificar:

- App local responde.
- API health responde.
- Usuario sem login nao acessa tela privada.
- Usuario com Auth mas sem membership nao entra.
- Owner entra.
- Logout limpa sessao.
- Scan de secrets nao encontra valor real.

Rodar comandos remotos do Supabase de forma sequencial. O pooler pode bloquear temporariamente novas conexoes com `ECIRCUITBREAKER` quando muitas tentativas falham ou comandos CLI rodam em paralelo.

### 13. Acoes manuais pontuais aceitas

A skill pode pedir ao usuario:

- Logar no Supabase CLI/MCP.
- Criar Auth user no dashboard quando nao houver Admin API segura.
- Informar somente UUID do usuario criado.
- Colar publishable/anon key no `.env.local`, nunca service role.
- Rotacionar senha do banco quando ela apareceu em chat/log.
- Ativar recurso pago como leaked password protection ou session controls, se aplicavel.

Sempre dizer exatamente:

- O que o usuario precisa abrir.
- Qual campo copiar.
- O que nao copiar.
- Por que a açao e manual.

### 14. Evidencias/documentacao

Gerar ou atualizar:

- `docs/database-security-plan.md`
- `docs/backup-policy.md`
- `docs/backup-restore-runbook.md`
- `docs/internal-app-security-playbook.md`
- `.env.example`
- `README.md`
- `SECURITY.md` quando necessario.

Registrar:

- Project ref.
- Regiao.
- Migrations aplicadas.
- Resultado dos advisors.
- Resultado do restore testado.
- Ressalvas de plano Free/Pro.
- Proximos passos.

## Prompt-base para a skill

```text
Crie a fundacao segura de banco e login deste projeto.

Siga este roteiro:
1. Leia regras locais e docs existentes.
2. Faça pre-check de segredos sem ler .env real.
3. Instale/verifique Supabase CLI, psql, pg_dump e pg_restore.
4. Crie ou vincule projeto Supabase staging.
5. Configure Auth para app interno: cadastro publico fechado, e-mail/senha habilitado para usuarios criados, MFA TOTP, senha minima, rate limits.
6. Crie migrations com tenant/organization_id, roles, memberships, RLS, storage privado, audit logs, LGPD/ANPD e backup_restore_tests.
7. Valide migrations localmente com Postgres temporario e teste pg_dump/pg_restore.
8. Aplique no staging.
9. Rode advisors security/performance.
10. Peça apenas o UUID do primeiro usuario Auth quando a açao manual for necessaria.
11. Rode bootstrap do owner.
12. Implemente tela de login com Supabase Auth usando somente publishable/anon key no frontend.
13. Valide que usuario sem login nao entra, owner entra e usuario sem membership e bloqueado.
14. Documente tudo e liste ressalvas.

Nunca exponha service role, sb_secret, senha de banco, DATABASE_URL ou .env real.
Se qualquer segredo aparecer em chat/log, marque como comprometido e exija rotacao antes de dados reais.
```

## Checklist de aceite

- [ ] Nenhum segredo real no repo.
- [ ] Projeto Supabase staging criado/linkado.
- [ ] Auth configurado sem cadastro publico.
- [ ] Provider de e-mail/senha habilitado para login.
- [ ] MFA TOTP habilitado.
- [ ] Migrations aplicadas.
- [ ] Todas tabelas publicas sensiveis com RLS.
- [ ] Policies testadas ou smoke test criado.
- [ ] Storage privado.
- [ ] Primeiro owner bootstrapado.
- [ ] Tela de login funcionando.
- [ ] Backend nao confia em role enviada pelo frontend.
- [ ] Backups em dois niveis planejados.
- [ ] Restore testado.
- [ ] Advisors rodados.
- [ ] Ressalvas documentadas.
