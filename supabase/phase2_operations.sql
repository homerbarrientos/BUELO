-- BUELO Phase 2: payment review, refunds, rescheduling, reporting/audit foundation

alter table public.bookings
  add column if not exists admin_notes text not null default '',
  add column if not exists updated_at timestamptz not null default now();

alter table public.bookings drop constraint if exists bookings_payment_status_check;
alter table public.bookings
  add constraint bookings_payment_status_check
  check (payment_status in ('unpaid','pending_verification','verified','paid','rejected','refunded'));

create table if not exists public.booking_events (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  event_type text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists booking_events_booking_id_created_at_idx
  on public.booking_events (booking_id, created_at desc);

create table if not exists public.refunds (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings(id) on delete cascade,
  amount numeric(10,2) not null default 0,
  reason text not null default '',
  notes text not null default '',
  status text not null default 'requested'
    check (status in ('requested','approved','completed','rejected')),
  requested_at timestamptz not null default now(),
  approved_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists refunds_status_idx on public.refunds(status);

-- Keep this index aligned with the rule that only confirmed reservations lock a slot.
drop index if exists uniq_active_court_slot;
drop index if exists uniq_active_slot;
drop index if exists uniq_confirmed_court_slot;
create unique index uniq_confirmed_court_slot
on public.booking_slots (court_id, booking_date, start_minute)
where status = 'confirmed';

-- Helpful indexes for large reservation volumes.
create index if not exists booking_slots_date_idx on public.booking_slots(booking_date);
create index if not exists booking_slots_court_date_idx on public.booking_slots(court_id, booking_date);
create index if not exists bookings_created_at_idx on public.bookings(created_at desc);
create index if not exists bookings_booking_status_idx on public.bookings(booking_status);
create index if not exists bookings_payment_status_idx on public.bookings(payment_status);
