-- Allow 'system' as a valid sender_role for superadmin messages
alter table public.messages
  drop constraint messages_sender_role_check;

alter table public.messages
  add constraint messages_sender_role_check
  check (sender_role in ('admin', 'resident', 'system'));
