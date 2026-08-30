create or replace function public.lock_submitted_order_auto_remote_link()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = '確認待ち' and old.status is distinct from new.status then
    new.expires_at = least(new.expires_at, now());
  end if;
  return new;
end;
$$;

drop trigger if exists order_auto_remote_contracts_lock_submitted_link
on public.order_auto_remote_contracts;
create trigger order_auto_remote_contracts_lock_submitted_link
before update of status on public.order_auto_remote_contracts
for each row execute function public.lock_submitted_order_auto_remote_link();

revoke all privileges on function public.lock_submitted_order_auto_remote_link()
from public, anon, authenticated;
