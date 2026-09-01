-- Person 2: provider linkage and deterministic cache for Genie conversations.
alter table public.genie_conversations
  add column if not exists provider_conversation_id text;

alter table public.genie_messages
  add column if not exists request_hash text,
  add column if not exists provider_message_id text,
  add column if not exists status text not null default 'complete' check (status in ('pending','interpreting','executing','complete','failed')),
  add column if not exists result_table jsonb,
  add column if not exists generated_sql text;

create unique index if not exists genie_assistant_request_cache_idx
  on public.genie_messages(user_id, request_hash)
  where role = 'assistant' and request_hash is not null;

create index if not exists genie_messages_request_hash_idx
  on public.genie_messages(user_id, request_hash)
  where request_hash is not null;
