-- Despeja as caixas do banco avila_mail no formato que
-- scripts/sincronizar-caixas-de-email.ts espera (CAIXAS_TSV).
--
--   su - postgres -c "psql -d avila_mail -At -F'|' -f caixas-do-mail.sql" > /tmp/caixas.txt
select m.local_part || '@' || d.name as endereco,
       d.name                        as dominio,
       m.status,
       coalesce(m.display_name, '')  as display_name,
       coalesce(m.quota_bytes::text, '') as quota_bytes
  from mail_mailboxes m
  join mail_domains d on d.id = m.domain_id
 order by d.name, m.local_part;
