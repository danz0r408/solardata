-- dmm_04 - Qualidade da tabela usuarios (PostgreSQL do app SolarData)
-- Mesmas regras do notebook dmm_04_qualidade_iqd.py: o nulo e cobrado so na completude,
-- tabela vazia nao gera divisao por zero. Chave de negocio: email. Sem FK (integridade nao se aplica),
-- entao o IQD e a media da completude e da unicidade. Retorna apenas percentuais, sem dado pessoal.
WITH m AS (
  SELECT count(*)                                                     AS total,
         count(NULLIF(trim(nome), ''))                                AS c_nome,
         count(NULLIF(trim(email), ''))                               AS c_email,
         count(NULLIF(senha_hash, ''))                                AS c_senha,
         count(NULLIF(criado_em, ''))                                 AS c_criado,
         count(email)                                                 AS emails_preenchidos,
         count(DISTINCT lower(email))                                 AS emails_distintos,
         -- validade: nulo e aceito (a ausencia so e cobrada na completude)
         count(*) FILTER (WHERE coalesce(length(trim(nome)) BETWEEN 2 AND 80, true)
                            AND coalesce(email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$', true)
                            AND coalesce(senha_hash ~ '^\$2[aby]\$[0-9]{2}\$[./A-Za-z0-9]{53}$', true)
                            AND coalesce(criado_em ~ '^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}'
                                         AND left(criado_em, 10) <= to_char(now(), 'YYYY-MM-DD'), true))
                                                                      AS validos
  FROM usuarios
)
SELECT round(100.0 * (c_nome + c_email + c_senha + c_criado) / NULLIF(4 * total, 0), 3) AS completude_pct,
       round(100.0 * emails_distintos / NULLIF(emails_preenchidos, 0), 3)               AS unicidade_pct,
       round((100.0 * (c_nome + c_email + c_senha + c_criado) / NULLIF(4 * total, 0)
              + 100.0 * emails_distintos / NULLIF(emails_preenchidos, 0)) / 2, 3)       AS iqd_pct,
       round(100.0 * validos / NULLIF(total, 0), 3)                                     AS validade_pct
FROM m;
