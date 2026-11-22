-- =====================================================================
-- Split Bill · database (Supabase, skema public, awalan sb_)
-- Prinsip keamanan:
--   1. Semua tabel dikunci RLS tanpa policy: tidak bisa dibaca atau
--      diubah langsung dari browser. Semua akses lewat fungsi sb_*.
--   2. Nomor HP dan PIN tidak pernah dikirim ke halaman teman.
--   3. Teman hanya bisa mengubah klaimnya sendiri (token sesi dari PIN).
--   4. Fungsi admin butuh kunci admin (disimpan sebagai hash).
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.sb_config (
  k text primary key,
  v text not null
);

create table if not exists public.sb_people (
  id uuid primary key default gen_random_uuid(),
  phone text unique not null,
  name text not null,
  pin_hash text,
  avatar text not null default 'koki',
  fails int not null default 0,
  locked_until timestamptz,
  created_at timestamptz not null default now()
);

alter table public.sb_people add column if not exists avatar text not null default 'koki';
alter table public.sb_people add column if not exists scan_day date;
alter table public.sb_people add column if not exists scan_count int not null default 0;

create table if not exists public.sb_sessions (
  token text primary key,
  person_id uuid not null references public.sb_people on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.sb_bills (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  title text not null,
  place text,
  bill_date date,
  total numeric(14,2) not null check (total >= 0),
  payer_name text,
  payer_phone text,
  payment_info text,
  locked boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.sb_items (
  id uuid primary key default gen_random_uuid(),
  bill_id uuid not null references public.sb_bills on delete cascade,
  name text not null,
  price numeric(14,2) not null check (price >= 0),
  sort int not null default 0
);
create index if not exists sb_items_bill on public.sb_items (bill_id);

alter table public.sb_bills add column if not exists host_id uuid references public.sb_people on delete set null;
create index if not exists sb_bills_host on public.sb_bills (host_id);

create table if not exists public.sb_members (
  bill_id uuid not null references public.sb_bills on delete cascade,
  person_id uuid not null references public.sb_people on delete cascade,
  status text not null default 'belum' check (status in ('belum','sudah_transfer','lunas')),
  joined_at timestamptz not null default now(),
  primary key (bill_id, person_id)
);

create table if not exists public.sb_claims (
  item_id uuid not null references public.sb_items on delete cascade,
  person_id uuid not null references public.sb_people on delete cascade,
  bill_id uuid not null references public.sb_bills on delete cascade,
  primary key (item_id, person_id)
);
create index if not exists sb_claims_bill on public.sb_claims (bill_id);

alter table public.sb_config   enable row level security;
alter table public.sb_people   enable row level security;
alter table public.sb_sessions enable row level security;
alter table public.sb_bills    enable row level security;
alter table public.sb_items    enable row level security;
alter table public.sb_members  enable row level security;
alter table public.sb_claims   enable row level security;
revoke all on public.sb_config, public.sb_people, public.sb_sessions, public.sb_bills,
              public.sb_items, public.sb_members, public.sb_claims from anon, authenticated;

-- ---------------------------------------------------------------- helpers
create or replace function public.sb_norm_phone(p text) returns text
language plpgsql immutable as $$
declare d text := regexp_replace(coalesce(p,''), '\D', '', 'g');
begin
  if d like '0%' then d := '62' || substr(d, 2);
  elsif d like '8%' then d := '62' || d;
  end if;
  if length(d) < 10 or length(d) > 15 then return null; end if;
  return d;
end $$;

create or replace function public.sb_master_ok(p_master text) returns boolean
language sql stable security definer set search_path = public, extensions, pg_temp as $$
  select exists (select 1 from sb_config where k = 'master_hash'
                 and v = extensions.crypt(coalesce(p_master,''), v));
$$;

create or replace function public.sb_require_master(p_master text) returns void
language plpgsql stable security definer set search_path = public, extensions, pg_temp as $$
begin
  if not sb_master_ok(p_master) then raise exception 'Kunci admin salah'; end if;
end $$;

create or replace function public.sb_person_from_token(p_token text) returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select person_id from sb_sessions where token = coalesce(p_token,'');
$$;

-- Ringkasan lengkap satu tagihan. p_admin = true menyertakan nomor HP.
create or replace function public.sb_bill_json(p_bill uuid, p_admin boolean) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  b sb_bills;
  v_sub numeric; v_factor numeric; v_unclaimed numeric;
  v_items jsonb; v_members jsonb;
begin
  select * into b from sb_bills where id = p_bill;
  if not found then return null; end if;

  select coalesce(sum(price),0) into v_sub from sb_items where bill_id = b.id;
  v_factor := case when v_sub > 0 then b.total / v_sub else 0 end;

  select coalesce(sum(i.price),0) into v_unclaimed from sb_items i
   where i.bill_id = b.id and not exists (select 1 from sb_claims c where c.item_id = i.id);

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', i.id, 'name', i.name, 'price', i.price,
           'claimers', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'avatar', p.avatar) order by p.name)
                                   from sb_claims c join sb_people p on p.id = c.person_id
                                  where c.item_id = i.id), '[]'::jsonb)
         ) order by i.sort, i.name), '[]'::jsonb)
    into v_items from sb_items i where i.bill_id = b.id;

  with share as (
    select c.person_id, sum(i.price / (select count(*) from sb_claims c2 where c2.item_id = i.id)) s
      from sb_claims c join sb_items i on i.id = c.item_id
     where c.bill_id = b.id group by c.person_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', p.id, 'name', p.name, 'avatar', p.avatar, 'status', m.status,
           'subtotal', round(coalesce(s.s,0)),
           'owe', round(coalesce(s.s,0) * v_factor),
           'is_payer', (b.payer_phone is not null and p.phone = b.payer_phone),
           'phone', case when p_admin then p.phone end
         ) order by m.joined_at), '[]'::jsonb)
    into v_members
    from sb_members m join sb_people p on p.id = m.person_id
    left join share s on s.person_id = m.person_id
   where m.bill_id = b.id;

  return jsonb_build_object(
    'code', b.code, 'title', b.title, 'place', b.place, 'bill_date', b.bill_date,
    'total', b.total, 'subtotal', v_sub, 'adjust', b.total - v_sub,
    'unclaimed', v_unclaimed, 'unclaimed_owe', round(v_unclaimed * v_factor),
    'payer_name', b.payer_name, 'payment_info', b.payment_info, 'locked', b.locked,
    'payer_phone', case when p_admin then b.payer_phone end,
    'created_at', b.created_at, 'host_id', b.host_id,
    'items', v_items, 'members', v_members);
end $$;

-- ---------------------------------------------------------------- publik
create or replace function public.sb_ping() returns text
language sql stable as $$ select 'ok'::text $$;

-- Masuk dengan nama + HP + PIN. Membuat akun saat pertama kali. Tidak terikat tagihan.
create or replace function public.sb_login(p_name text, p_phone text, p_pin text, p_avatar text default null)
returns jsonb language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  v_phone text := sb_norm_phone(p_phone); v_name text := btrim(coalesce(p_name,''));
  p sb_people; v_token text;
  v_av text := case when p_avatar in ('koki','robo','boba','onigiri','kapi') then p_avatar end;
begin
  if v_phone is null then return jsonb_build_object('error','Nomor HP tidak valid'); end if;
  if coalesce(p_pin,'') !~ '^\d{4}$' then return jsonb_build_object('error','PIN harus 4 angka'); end if;
  if length(v_name) < 1 or length(v_name) > 40 then return jsonb_build_object('error','Nama wajib diisi (maksimal 40 huruf)'); end if;

  select * into p from sb_people where phone = v_phone for update;
  if not found then
    insert into sb_people (phone, name, pin_hash, avatar)
    values (v_phone, v_name, extensions.crypt(p_pin, extensions.gen_salt('bf', 8)), coalesce(v_av, 'koki'))
    returning * into p;
  else
    if p.locked_until is not null and p.locked_until > now() then
      return jsonb_build_object('error','Terlalu banyak PIN salah. Coba lagi dalam 15 menit.');
    end if;
    if p.pin_hash is null then
      update sb_people set pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf', 8)),
             name = v_name, avatar = coalesce(v_av, avatar), fails = 0, locked_until = null where id = p.id;
    elsif p.pin_hash <> extensions.crypt(p_pin, p.pin_hash) then
      update sb_people set fails = fails + 1,
             locked_until = case when fails + 1 >= 5 then now() + interval '15 minutes' end
       where id = p.id;
      update sb_people set fails = 0 where id = p.id and locked_until is not null;
      return jsonb_build_object('error','PIN salah untuk nomor ini. Lupa PIN? Minta host tagihan meresetnya.');
    else
      update sb_people set name = v_name, avatar = coalesce(v_av, avatar), fails = 0, locked_until = null where id = p.id;
    end if;
  end if;

  v_token := encode(extensions.gen_random_bytes(24), 'hex');
  insert into sb_sessions (token, person_id) values (v_token, p.id);
  return jsonb_build_object('token', v_token, 'person_id', p.id, 'name', v_name,
    'avatar', (select avatar from sb_people where id = p.id));
end $$;

drop function if exists public.sb_join(text, text, text, text);
create or replace function public.sb_join(p_code text, p_name text, p_phone text, p_pin text, p_avatar text default null)
returns jsonb language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare b sb_bills; r jsonb; v_me uuid;
begin
  select * into b from sb_bills where code = upper(btrim(coalesce(p_code,'')));
  if not found then return jsonb_build_object('error','Tagihan tidak ditemukan'); end if;
  r := sb_login(p_name, p_phone, p_pin, p_avatar);
  if r ? 'error' then return r; end if;
  v_me := (r->>'person_id')::uuid;
  if not exists (select 1 from sb_members where bill_id = b.id and person_id = v_me) then
    if b.locked then return jsonb_build_object('error','Tagihan sudah dikunci host'); end if;
    insert into sb_members (bill_id, person_id) values (b.id, v_me);
  end if;
  return r;
end $$;

-- Data diri sendiri (untuk mengisi otomatis form host). Nomor HP hanya untuk pemiliknya.
create or replace function public.sb_whoami(p_token text) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('id', p.id, 'name', p.name, 'phone', p.phone, 'avatar', p.avatar)
    from sb_people p where p.id = sb_person_from_token(p_token);
$$;

-- Batas scan foto struk per orang per hari (menjaga kuota gratis Gemini).
create or replace function public.sb_scan_allow(p_token text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_me uuid := sb_person_from_token(p_token); v_today date := (now() at time zone 'Asia/Jakarta')::date; n int;
begin
  if v_me is null then return jsonb_build_object('ok', false, 'error', 'Sesi habis, silakan masuk lagi'); end if;
  update sb_people set scan_count = case when scan_day = v_today then scan_count + 1 else 1 end, scan_day = v_today
   where id = v_me returning scan_count into n;
  if n > 15 then return jsonb_build_object('ok', false, 'error', 'Batas 15 scan per hari sudah tercapai. Isi item secara manual atau coba besok.'); end if;
  return jsonb_build_object('ok', true, 'left', 15 - n);
end $$;


-- Teman yang sudah punya sesi di HP ini cukup sekali ketuk untuk gabung tagihan baru.
create or replace function public.sb_join_token(p_token text, p_code text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare b sb_bills; v_me uuid := sb_person_from_token(p_token);
begin
  if v_me is null then return jsonb_build_object('error','Sesi habis, silakan masuk lagi'); end if;
  select * into b from sb_bills where code = upper(btrim(coalesce(p_code,'')));
  if not found then return jsonb_build_object('error','Tagihan tidak ditemukan'); end if;
  if not exists (select 1 from sb_members where bill_id = b.id and person_id = v_me) then
    if b.locked then return jsonb_build_object('error','Tagihan sudah dikunci host'); end if;
    insert into sb_members (bill_id, person_id) values (b.id, v_me);
  end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.sb_get_bill(p_code text, p_token text default null)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare b sb_bills; v_me uuid := sb_person_from_token(p_token); r jsonb;
begin
  select * into b from sb_bills where code = upper(btrim(coalesce(p_code,'')));
  if not found then return jsonb_build_object('error','Tagihan tidak ditemukan'); end if;
  r := sb_bill_json(b.id, false);
  if v_me is not null then
    r := r || jsonb_build_object('me', (select jsonb_build_object('id', p.id, 'name', p.name, 'avatar', p.avatar,
            'is_member', exists (select 1 from sb_members m where m.bill_id = b.id and m.person_id = p.id))
            from sb_people p where p.id = v_me));
  end if;
  return r;
end $$;

create or replace function public.sb_set_claims(p_token text, p_code text, p_item_ids uuid[])
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare b sb_bills; v_me uuid := sb_person_from_token(p_token);
begin
  if v_me is null then return jsonb_build_object('error','Sesi habis, silakan masuk lagi'); end if;
  select * into b from sb_bills where code = upper(btrim(coalesce(p_code,''))) for update;
  if not found then return jsonb_build_object('error','Tagihan tidak ditemukan'); end if;
  if b.locked then return jsonb_build_object('error','Tagihan sudah dikunci host'); end if;
  if not exists (select 1 from sb_members where bill_id = b.id and person_id = v_me) then
    return jsonb_build_object('error','Kamu belum terdaftar di tagihan ini');
  end if;
  delete from sb_claims where bill_id = b.id and person_id = v_me;
  insert into sb_claims (item_id, person_id, bill_id)
  select i.id, v_me, b.id from sb_items i
   where i.bill_id = b.id and i.id = any(coalesce(p_item_ids, '{}'));
  return sb_get_bill(b.code, p_token);
end $$;

create or replace function public.sb_set_my_status(p_token text, p_code text, p_status text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare b sb_bills; v_me uuid := sb_person_from_token(p_token);
begin
  if v_me is null then return jsonb_build_object('error','Sesi habis, silakan masuk lagi'); end if;
  if p_status not in ('belum','sudah_transfer') then return jsonb_build_object('error','Status tidak valid'); end if;
  select * into b from sb_bills where code = upper(btrim(coalesce(p_code,'')));
  if not found then return jsonb_build_object('error','Tagihan tidak ditemukan'); end if;
  update sb_members set status = p_status
   where bill_id = b.id and person_id = v_me and status <> 'lunas';
  return sb_get_bill(b.code, p_token);
end $$;

-- ---------------------------------------------------------------- host & admin
-- p_master boleh berisi kunci admin (semua tagihan) ATAU token sesi host (hanya tagihannya sendiri).
create or replace function public.sb_can_manage(p_auth text, p_bill uuid) returns boolean
language sql stable security definer set search_path = public, extensions, pg_temp as $$
  select sb_master_ok(p_auth) or exists (
    select 1 from sb_bills b where b.id = p_bill and b.host_id is not null and b.host_id = sb_person_from_token(p_auth));
$$;

create or replace function public.sb_manage_bill(p_auth text, p_code text) returns sb_bills
language plpgsql stable security definer set search_path = public, extensions, pg_temp as $$
declare b sb_bills;
begin
  select * into b from sb_bills where code = upper(btrim(coalesce(p_code,'')));
  if not found then raise exception 'Tagihan tidak ditemukan'; end if;
  if not sb_can_manage(p_auth, b.id) then raise exception 'Kamu bukan host tagihan ini'; end if;
  return b;
end $$;

create or replace function public.sb_admin_check(p_master text) returns boolean
language sql stable security definer set search_path = public, extensions, pg_temp as $$
  select sb_master_ok(p_master);
$$;

create or replace function public.sb_admin_list(p_master text) returns jsonb
language plpgsql stable security definer set search_path = public, extensions, pg_temp as $$
declare v_all boolean := sb_master_ok(p_master); v_me uuid := sb_person_from_token(p_master);
begin
  if not v_all and v_me is null then raise exception 'Sesi habis, silakan masuk lagi'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'code', b.code, 'title', b.title, 'place', b.place, 'bill_date', b.bill_date,
      'total', b.total, 'locked', b.locked, 'created_at', b.created_at,
      'host', (select name from sb_people where id = b.host_id),
      'members', (select count(*) from sb_members m where m.bill_id = b.id),
      'lunas', (select count(*) from sb_members m join sb_people p on p.id = m.person_id
                 where m.bill_id = b.id and (m.status = 'lunas' or p.phone = b.payer_phone))
    ) order by b.created_at desc) from sb_bills b where v_all or b.host_id = v_me), '[]'::jsonb);
end $$;

create or replace function public.sb_admin_get(p_master text, p_code text) returns jsonb
language plpgsql stable security definer set search_path = public, extensions, pg_temp as $$
declare b sb_bills := sb_manage_bill(p_master, p_code);
begin
  return sb_bill_json(b.id, true);
end $$;

create or replace function public.sb_gen_code() returns text
language plpgsql volatile security definer set search_path = public, extensions, pg_temp as $$
declare a text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; c text; bytes bytea; i int;
begin
  loop
    bytes := extensions.gen_random_bytes(6); c := '';
    for i in 0..5 loop c := c || substr(a, (get_byte(bytes, i) % length(a)) + 1, 1); end loop;
    exit when not exists (select 1 from sb_bills where code = c);
  end loop;
  return c;
end $$;

-- p_items: [{"name":"Nasi Goreng","price":25000,"qty":2}, ...]
create or replace function public.sb_admin_create_bill(
  p_master text, p_title text, p_place text, p_date date, p_total numeric, p_items jsonb,
  p_payer_name text, p_payer_phone text, p_payment_info text)
returns jsonb language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare b_id uuid; v_code text := sb_gen_code(); it jsonb; q int; k int; n int := 0;
  v_host uuid := sb_person_from_token(p_master); hp sb_people;
begin
  if not sb_master_ok(p_master) and v_host is null then raise exception 'Sesi habis, silakan masuk lagi'; end if;
  if v_host is not null and (select count(*) from sb_bills where host_id = v_host and created_at > now() - interval '1 day') >= 20 then
    raise exception 'Batas 20 tagihan per hari tercapai';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Daftar item kosong';
  end if;
  if jsonb_array_length(p_items) > 150
     or (select sum(least(greatest(coalesce((e->>'qty')::int, 1), 1), 50)) from jsonb_array_elements(p_items) e) > 300 then
    raise exception 'Item terlalu banyak (maksimal 300 porsi per tagihan)';
  end if;
  select * into hp from sb_people where id = v_host;
  insert into sb_bills (code, title, place, bill_date, total, payer_name, payer_phone, payment_info, host_id)
  values (v_code, coalesce(nullif(btrim(p_title),''), 'Tagihan'), nullif(btrim(p_place),''), p_date, p_total,
          coalesce(nullif(btrim(p_payer_name),''), hp.name),
          coalesce(sb_norm_phone(p_payer_phone), hp.phone),
          nullif(btrim(p_payment_info),''), v_host)
  returning id into b_id;
  for it in select * from jsonb_array_elements(p_items) loop
    q := least(greatest(coalesce((it->>'qty')::int, 1), 1), 50);
    for k in 1..q loop
      n := n + 1;
      insert into sb_items (bill_id, name, price, sort)
      values (b_id, left(btrim(it->>'name'), 80) || case when q > 1 then ' (' || k || '/' || q || ')' else '' end,
              (it->>'price')::numeric, n);
    end loop;
  end loop;
  if v_host is not null then insert into sb_members (bill_id, person_id) values (b_id, v_host) on conflict do nothing; end if;
  return sb_bill_json(b_id, true);
end $$;

-- p_patch: kunci yang boleh: title, place, bill_date, total, payer_name, payer_phone, payment_info, locked
create or replace function public.sb_admin_update_bill(p_master text, p_code text, p_patch jsonb)
returns jsonb language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare b sb_bills := sb_manage_bill(p_master, p_code);
begin
  update sb_bills set
    title        = case when p_patch ? 'title' then coalesce(nullif(btrim(p_patch->>'title'),''), title) else title end,
    place        = case when p_patch ? 'place' then nullif(btrim(p_patch->>'place'),'') else place end,
    bill_date    = case when p_patch ? 'bill_date' then nullif(p_patch->>'bill_date','')::date else bill_date end,
    total        = case when p_patch ? 'total' then (p_patch->>'total')::numeric else total end,
    payer_name   = case when p_patch ? 'payer_name' then nullif(btrim(p_patch->>'payer_name'),'') else payer_name end,
    payer_phone  = case when p_patch ? 'payer_phone' then sb_norm_phone(p_patch->>'payer_phone') else payer_phone end,
    payment_info = case when p_patch ? 'payment_info' then nullif(btrim(p_patch->>'payment_info'),'') else payment_info end,
    locked       = case when p_patch ? 'locked' then (p_patch->>'locked')::boolean else locked end
  where id = b.id;
  return sb_bill_json(b.id, true);
end $$;

-- p_action: add | update | delete
create or replace function public.sb_admin_item(p_master text, p_code text, p_action text,
  p_item_id uuid default null, p_name text default null, p_price numeric default null)
returns jsonb language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare b sb_bills := sb_manage_bill(p_master, p_code);
begin
  if p_action = 'add' then
    insert into sb_items (bill_id, name, price, sort)
    values (b.id, btrim(p_name), p_price, coalesce((select max(sort) from sb_items where bill_id = b.id), 0) + 1);
  elsif p_action = 'update' then
    update sb_items set name = coalesce(nullif(btrim(p_name),''), name), price = coalesce(p_price, price)
     where id = p_item_id and bill_id = b.id;
  elsif p_action = 'delete' then
    delete from sb_items where id = p_item_id and bill_id = b.id;
  else
    raise exception 'Aksi tidak dikenal';
  end if;
  return sb_bill_json(b.id, true);
end $$;

create or replace function public.sb_admin_set_status(p_master text, p_code text, p_person uuid, p_status text)
returns jsonb language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare b sb_bills := sb_manage_bill(p_master, p_code);
begin
  if p_status not in ('belum','sudah_transfer','lunas') then raise exception 'Status tidak valid'; end if;
  update sb_members set status = p_status where bill_id = b.id and person_id = p_person;
  return sb_bill_json(b.id, true);
end $$;

create or replace function public.sb_admin_remove_member(p_master text, p_code text, p_person uuid)
returns jsonb language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare b sb_bills := sb_manage_bill(p_master, p_code);
begin
  delete from sb_claims where bill_id = b.id and person_id = p_person;
  delete from sb_members where bill_id = b.id and person_id = p_person;
  return sb_bill_json(b.id, true);
end $$;

-- Host hanya bisa mereset PIN orang yang ikut di salah satu tagihannya.
create or replace function public.sb_admin_reset_pin(p_master text, p_person uuid)
returns boolean language plpgsql security definer set search_path = public, extensions, pg_temp as $$
begin
  if not (sb_master_ok(p_master) or exists (
      select 1 from sb_members m join sb_bills b on b.id = m.bill_id
       where m.person_id = p_person and b.host_id = sb_person_from_token(p_master))) then
    raise exception 'Tidak diizinkan';
  end if;
  update sb_people set pin_hash = null, fails = 0, locked_until = null where id = p_person;
  if not found then return false; end if;
  delete from sb_sessions where person_id = p_person;
  return true;
end $$;

create or replace function public.sb_admin_delete_bill(p_master text, p_code text)
returns boolean language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare b sb_bills := sb_manage_bill(p_master, p_code);
begin
  delete from sb_bills where id = b.id;
  return found;
end $$;

-- ---------------------------------------------------------------- hak akses
revoke execute on function
  public.sb_norm_phone(text), public.sb_master_ok(text), public.sb_require_master(text),
  public.sb_person_from_token(text), public.sb_bill_json(uuid, boolean), public.sb_gen_code(),
  public.sb_can_manage(text, uuid), public.sb_manage_bill(text, text)
from public, anon, authenticated;

grant execute on function
  public.sb_ping(), public.sb_login(text,text,text,text), public.sb_join(text,text,text,text,text),
  public.sb_join_token(text,text), public.sb_whoami(text), public.sb_scan_allow(text),
  public.sb_get_bill(text,text),
  public.sb_set_claims(text,text,uuid[]), public.sb_set_my_status(text,text,text),
  public.sb_admin_check(text), public.sb_admin_list(text), public.sb_admin_get(text,text),
  public.sb_admin_create_bill(text,text,text,date,numeric,jsonb,text,text,text),
  public.sb_admin_update_bill(text,text,jsonb),
  public.sb_admin_item(text,text,text,uuid,text,numeric),
  public.sb_admin_set_status(text,text,uuid,text),
  public.sb_admin_remove_member(text,text,uuid),
  public.sb_admin_reset_pin(text,uuid), public.sb_admin_delete_bill(text,text)
to anon, authenticated;
