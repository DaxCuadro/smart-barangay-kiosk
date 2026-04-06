-- Chat system: conversations linked to document requests, messages between admin and resident.

-- ── conversations ──────────────────────────────────────────────────────────
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.resident_intake_requests(id) on delete cascade,
  barangay_id uuid not null references public.barangays(id) on delete cascade,
  resident_user_id uuid, -- auth.uid() of the resident (nullable for kiosk-originated requests)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One conversation per request
create unique index if not exists conversations_request_id_idx on public.conversations(request_id);
create index if not exists conversations_barangay_id_idx on public.conversations(barangay_id);
create index if not exists conversations_resident_user_id_idx on public.conversations(resident_user_id);

alter table public.conversations enable row level security;

-- Admins can see conversations in their barangay
create policy "conversations_select_admin"
  on public.conversations for select
  using (
    barangay_id = public.current_admin_barangay()
    or public.is_superadmin()
  );

-- Residents can see their own conversations
create policy "conversations_select_resident"
  on public.conversations for select
  using (resident_user_id = auth.uid());

-- Admins can create conversations for their barangay
create policy "conversations_insert_admin"
  on public.conversations for insert
  with check (
    barangay_id = public.current_admin_barangay()
    or public.is_superadmin()
  );

-- Residents can create conversations for their own requests
create policy "conversations_insert_resident"
  on public.conversations for insert
  with check (resident_user_id = auth.uid());

-- Allow updates (for updated_at bumps)
create policy "conversations_update_admin"
  on public.conversations for update
  using (
    barangay_id = public.current_admin_barangay()
    or public.is_superadmin()
  );

create policy "conversations_update_resident"
  on public.conversations for update
  using (resident_user_id = auth.uid());

-- ── messages ───────────────────────────────────────────────────────────────
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_role text not null check (sender_role in ('admin', 'resident')),
  sender_id uuid not null, -- auth.uid() of whoever sent it
  content text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz -- null = unread by the other party
);

create index if not exists messages_conversation_id_idx on public.messages(conversation_id);
create index if not exists messages_created_at_idx on public.messages(conversation_id, created_at);

alter table public.messages enable row level security;

-- Helper: check if a user can access a conversation
create or replace function public.can_access_conversation(conv_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1 from public.conversations c
    where c.id = conv_id
      and (
        c.resident_user_id = auth.uid()
        or c.barangay_id = public.current_admin_barangay()
        or public.is_superadmin()
      )
  );
$$;

-- Read messages in conversations you can access
create policy "messages_select"
  on public.messages for select
  using (public.can_access_conversation(conversation_id));

-- Insert messages into conversations you can access
create policy "messages_insert"
  on public.messages for insert
  with check (
    sender_id = auth.uid()
    and public.can_access_conversation(conversation_id)
  );

-- Update messages (for marking read_at)
create policy "messages_update"
  on public.messages for update
  using (public.can_access_conversation(conversation_id));

-- ── Enable realtime ────────────────────────────────────────────────────────
alter publication supabase_realtime add table public.messages;
