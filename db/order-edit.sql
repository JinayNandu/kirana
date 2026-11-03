-- ---------------------------------------------------------------------
--  edit_order() -- the customer changing their own order.
--
--  Run this ONCE in Supabase -> SQL Editor. Nothing in it needs
--  editing.
--
--  WHY A FUNCTION
--
--  A customer has no UPDATE on `orders` at all, and should not: with
--  one they could set their own status to 'delivered' or rewrite
--  `grand`. See the note above ord_staff_write in schema.sql. So an
--  edit goes the same way "I have paid" does -- through a
--  SECURITY DEFINER function that can do one thing and nothing else.
--
--  WHAT THIS GUARANTEES, AND WHAT IT DOES NOT
--
--  Guaranteed here, by the server, whatever the browser says:
--    - the order belongs to the caller
--    - it has not been delivered, failed or cancelled
--    - it still has at least one line
--
--  NOT guaranteed here: the one-hour-before-the-window rule. The
--  server cannot check it, because the timetable lives in
--  app/data/runplan.json and not in this database -- there is no
--  window time on the row to compare against. The app enforces it in
--  domain.js, which is exactly the standing of the existing cut-off:
--  place() checks isBookable() in the browser too. Worth knowing
--  before anyone builds something on the belief that the hour is a
--  hard edge. It is the same promise the rest of the app makes, and
--  no weaker -- but no stronger either.
-- ---------------------------------------------------------------------

create or replace function edit_order(oid uuid, newlines jsonb, t jsonb)
  returns void language plpgsql volatile security definer
  set search_path = public, extensions as $edit$
declare o orders%rowtype;
begin
  select * into o from orders where id = oid;
  if not found then raise exception 'NO_SUCH_ORDER'; end if;

  -- Not yours, not your business. `is distinct from` rather than <>
  -- so a null user_id (an order whose account was deleted) fails
  -- closed instead of comparing to null and vanishing.
  if o.user_id is distinct from auth.uid() then
    raise exception 'NOT_YOURS';
  end if;

  -- Once it is out of the shop's hands there is nothing to change.
  if o.status <> 'placed' and o.status <> 'accepted' then
    raise exception 'TOO_LATE';
  end if;

  if newlines is null or jsonb_array_length(newlines) < 1 then
    raise exception 'EMPTY';
  end if;

  delete from order_lines where order_id = oid;

  insert into order_lines
    (order_id, pid, name_en, pack, qty, unit_price, unit_mrp, line_total)
  select oid, x.pid, x.name_en, x.pack, x.qty,
         x.unit_price, x.unit_mrp, x.line_total
    from jsonb_to_recordset(newlines) as x(
      pid text, name_en text, pack jsonb, qty int,
      unit_price int, unit_mrp int, line_total int);

  update orders set
    items_total = (t->>'items_total')::int,
    mrp_total   = (t->>'mrp_total')::int,
    saved       = (t->>'saved')::int,
    discount    = (t->>'discount')::int,
    fee         = (t->>'fee')::int,
    grand       = (t->>'grand')::int,
    -- An edit is not a status change, so it draws no step on the
    -- customer's progress trail -- ORDER_TRAIL lists the stages and
    -- this is not one. It is here so the shop can see that the order
    -- in its hand is not the order it was.
    history     = o.history || jsonb_build_array(
                    jsonb_build_object('at', now(), 'to', 'edited'))
  where id = oid;
end;
$edit$;

revoke all on function edit_order(uuid, jsonb, jsonb) from public;
grant execute on function edit_order(uuid, jsonb, jsonb) to authenticated;
