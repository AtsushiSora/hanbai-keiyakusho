alter table public.order_auto_contracts
  add column if not exists customer_pdf_path text,
  add column if not exists download_access_hash text,
  add column if not exists download_access_expires_at timestamptz,
  add column if not exists reviewed_at timestamptz,
  add column if not exists customer_confirmation_sent_at timestamptz,
  add column if not exists confirmation_email_status text;

alter table public.order_auto_remote_contracts
  add column if not exists customer_pdf_path text;

create unique index if not exists order_auto_contracts_download_access_hash_key
on public.order_auto_contracts (download_access_hash)
where download_access_hash is not null;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('order-auto-contract-files', 'order-auto-contract-files', false, 15728640, array['application/pdf'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.submit_order_auto_remote_contract_for_review(
  p_access_token text,
  p_passcode text,
  p_signer_name text,
  p_consent_items jsonb,
  p_signature_data_url text,
  p_customer_data jsonb
)
returns table(
  remote_id uuid,
  contract_id text,
  owner_user_id uuid,
  signed_at timestamptz,
  contract_number text,
  buyer_email text,
  contract_data jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_remote public.order_auto_remote_contracts%rowtype;
  v_now timestamptz := now();
  v_clean_name text := btrim(coalesce(p_signer_name, ''));
  v_customer jsonb := coalesce(p_customer_data, '{}'::jsonb);
  v_clean_zip text;
  v_clean_phone text;
  v_clean_email text;
  v_contract_data jsonb;
begin
  if p_access_token is null or p_access_token !~ '^[A-Za-z0-9_-]{43,128}$'
    or p_passcode is null or p_passcode !~ '^[0-9]{8}$' then
    return;
  end if;
  if jsonb_typeof(v_customer) <> 'object'
    or length(v_clean_name) < 1 or length(v_clean_name) > 120 then
    return;
  end if;

  v_clean_zip := regexp_replace(coalesce(v_customer->>'buyerZip', ''), '[^0-9]', '', 'g');
  v_clean_phone := regexp_replace(coalesce(v_customer->>'buyerPhone', ''), '[^0-9]', '', 'g');
  v_clean_email := btrim(coalesce(v_customer->>'buyerEmail', ''));
  if btrim(coalesce(v_customer->>'buyerAddress', '')) = ''
    or v_clean_zip !~ '^[0-9]{7}$'
    or v_clean_phone !~ '^[0-9]{10,11}$'
    or v_clean_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then
    return;
  end if;
  if p_consent_items is null or jsonb_typeof(p_consent_items) <> 'array'
    or jsonb_array_length(p_consent_items) < 1 then
    return;
  end if;
  if p_signature_data_url is null or p_signature_data_url !~ '^data:image/png;base64,'
    or octet_length(p_signature_data_url) > 750000 then
    return;
  end if;

  select * into v_remote
  from public.order_auto_remote_contracts as remote
  where remote.access_token_hash = extensions.digest(convert_to(p_access_token, 'UTF8'), 'sha256')
  for update;
  if not found or v_remote.status in ('完了', '確認待ち', '取消')
    or v_remote.expires_at <= v_now
    or (v_remote.locked_until is not null and v_remote.locked_until > v_now)
    or extensions.crypt(p_passcode, v_remote.passcode_hash) <> v_remote.passcode_hash then
    return;
  end if;

  v_customer := jsonb_build_object(
    'buyerLastName', left(btrim(coalesce(v_customer->>'buyerLastName', '')), 60),
    'buyerFirstName', left(btrim(coalesce(v_customer->>'buyerFirstName', '')), 60),
    'buyerName', v_clean_name,
    'buyerKana', left(btrim(coalesce(v_customer->>'buyerKana', '')), 120),
    'buyerBirthday', left(btrim(coalesce(v_customer->>'buyerBirthday', '')), 20),
    'buyerZip', substr(v_clean_zip, 1, 3) || '-' || substr(v_clean_zip, 4),
    'buyerAddress', left(btrim(v_customer->>'buyerAddress'), 300),
    'buyerPhone', left(btrim(v_customer->>'buyerPhone'), 30),
    'buyerEmail', left(v_clean_email, 254),
    'buyerWorkplace', left(btrim(coalesce(v_customer->>'buyerWorkplace', '')), 200)
  );
  v_contract_data := v_remote.contract_data || v_customer;

  update public.order_auto_remote_contracts
  set contract_data = v_contract_data,
      status = '確認待ち',
      signer_name = v_clean_name,
      consent_items = p_consent_items,
      signature_data_url = p_signature_data_url,
      completed_at = v_now,
      customer_pdf_path = null,
      failed_attempts = 0,
      locked_until = null
  where id = v_remote.id;

  update public.order_auto_contracts
  set buyer_name = v_clean_name,
      buyer_email = v_clean_email,
      status = '確認待ち',
      completed_at = null,
      customer_pdf_path = null,
      download_access_hash = null,
      download_access_expires_at = null,
      reviewed_at = null,
      customer_confirmation_sent_at = null,
      confirmation_email_status = null,
      data = jsonb_set(
        jsonb_set(data || v_customer, '{contractStatus}', '"確認待ち"'::jsonb, true),
        '{remoteStatus}', '"確認待ち"'::jsonb, true
      )
  where id = v_remote.contract_id and user_id = v_remote.owner_user_id;

  insert into public.order_auto_remote_events (remote_contract_id, owner_user_id, event_type, metadata)
  values (
    v_remote.id,
    v_remote.owner_user_id,
    'submitted_for_review',
    jsonb_build_object('signer_name', v_clean_name, 'buyer_email', v_clean_email)
  );

  return query select
    v_remote.id,
    v_remote.contract_id,
    v_remote.owner_user_id,
    v_now,
    coalesce(v_contract_data->>'estimateNo', ''),
    v_clean_email,
    v_contract_data;
end;
$$;

revoke all privileges on function public.submit_order_auto_remote_contract_for_review(text, text, text, jsonb, text, jsonb)
from public, anon, authenticated;
grant execute on function public.submit_order_auto_remote_contract_for_review(text, text, text, jsonb, text, jsonb)
to service_role;
