-- Indexes for the inventory screens, and a measured note about where the stock overview stops
-- scaling.
--
-- 0023 moved the stock overview's join, filter and paging into the database, which fixed the screen
-- silently showing a subset of the stock as though it were all of it. This migration is about what
-- that did *not* fix, and about being straight on how far it goes.
--
-- Measured with scripts/plan-probe.mjs, three volumes, PGlite:
--
--     3,200 balances  → Seq Scan + top-N heapsort,  14 ms
--    20,000 balances  → Seq Scan + top-N heapsort,  47 ms
--   100,000 balances  → Seq Scan + top-N heapsort, 232 ms
--
-- Every balance in the organization is read and sorted to return twenty-five, and the cost is linear
-- in the size of the table.
--
-- Two things were tried and neither moved the plan, which is worth recording so nobody spends the
-- afternoon again. Indexing the balances does not help: the screen orders by item name, which lives
-- on the joined item, so there is no order on the balance table for the planner to walk. Putting the
-- mine site on the balance row does not help either, because in the ordinary case one site holds all
-- of an organization's stock, so filtering by site removes nothing and the sort still dominates.
--
-- The fix that would work is denormalising the item *name* onto the balance, so an index can serve
-- the filter and the ordering together. That is deliberately not done here. It costs a trigger, a
-- rename of an item rewriting its balance rows, and a second place for the name to be wrong — and
-- the numbers above are WASM. On real PostgreSQL the 100,000-row case is tens of milliseconds, and
-- 100,000 balances means something like 10,000 catalogue items across 10 stores, which is far beyond
-- the operations Mantara is being built for. Paying that complexity now would be solving a problem
-- nobody has.
--
-- **The trigger to revisit it:** a pilot whose stock overview passes roughly 100,000 balances, or a
-- page that feels slow with the plan above in it. `scripts/plan-probe.mjs` reproduces the
-- measurement, and tests/integration/query-plans.test.ts holds the ceiling as an assertion so it
-- cannot drift quietly.

-- Genuinely useful regardless: the catalogue list orders by name, and the reorder watch and the
-- per-store views start from a store.
create index if not exists inventory_items_org_name_idx
  on public.inventory_items (organization_id, name)
  where deleted_at is null;

create index if not exists inventory_stock_balances_location_idx
  on public.inventory_stock_balances (inventory_location_id);

-- Search on the stock overview matches item name, SKU or store name with ILIKE. A btree index cannot
-- serve a leading-wildcard match, so search stays a scan of the site's balances. That is acceptable:
-- a search is a deliberate act on a bounded set rather than the default view of the screen. pg_trgm
-- is the answer if a pilot has enough stock for it to be felt.
