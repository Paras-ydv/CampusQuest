-- Let a requester reopen a request they previously withdrew, or that was declined
-- ---------------------------------------------------------------------------
-- `connection_requests_requester_cancel` allowed the requester to update their
-- own row only to 'cancelled'. That is right for withdrawing, but it also meant
-- a row could never return to 'pending' — so once a request was declined or
-- withdrawn, asking again was silently impossible.
--
-- The recipient's own policy is unchanged: only they can accept or reject.

drop policy if exists connection_requests_requester_cancel on public.connection_requests;

create policy connection_requests_requester_manage on public.connection_requests
  for update to authenticated
  using (requester_id = auth.uid())
  -- Withdraw, or ask again. Never accept your own request.
  with check (requester_id = auth.uid() and status in ('cancelled', 'pending'));
