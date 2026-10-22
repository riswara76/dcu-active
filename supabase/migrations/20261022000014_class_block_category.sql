-- DCU Active — 0014 block category for classes (CR-03).
-- Kept in its own migration: a new enum value cannot be used in the transaction that adds it.

alter type app.block_category add value if not exists 'CLASS';
