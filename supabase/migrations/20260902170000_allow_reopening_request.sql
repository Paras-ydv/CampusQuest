-- Let a requester ask again after a decline or a withdrawal
-- ---------------------------------------------------------------------------
-- `guard_connection_request_update` allowed the requester to move their row
-- only to 'cancelled', and refused any update once the row had left 'pending'.
-- Together those meant a declined or withdrawn request was permanently frozen:
-- asking again was impossible, and the application's attempt surfaced as a 500.
--
-- Reopening is now allowed, with the message updated to whatever was sent this
-- time. Everything else is unchanged — in particular the recipient is still the
-- only person who can accept or reject, and neither party can rewrite who the
-- request is between.

create or replace function public.guard_connection_request_update()
returns trigger language plpgsql set search_path = public as $$
begin
  if auth.uid() = old.recipient_id then
    if new.requester_id <> old.requester_id
       or new.recipient_id <> old.recipient_id
       or new.message is distinct from old.message
       or new.status not in ('accepted', 'rejected') then
      raise exception 'recipient may only accept or reject a request';
    end if;
    if old.status <> 'pending' then
      raise exception 'request has already been resolved';
    end if;

  elsif auth.uid() = old.requester_id then
    if new.requester_id <> old.requester_id or new.recipient_id <> old.recipient_id then
      raise exception 'a request cannot change who it is between';
    end if;

    if new.status = 'cancelled' then
      -- Withdrawing only makes sense while it is still outstanding.
      if old.status <> 'pending' then
        raise exception 'request has already been resolved';
      end if;
      if new.message is distinct from old.message then
        raise exception 'requester may not edit the message when withdrawing';
      end if;

    elsif new.status = 'pending' then
      -- Asking again. Only from a settled state, and the note may be rewritten.
      if old.status not in ('rejected', 'cancelled') then
        raise exception 'request is already open';
      end if;
      new.responded_at = null;

    else
      raise exception 'requester may only withdraw or reopen a request';
    end if;

  else
    raise exception 'not a request participant';
  end if;

  return new;
end; $$;
