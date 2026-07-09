-- Data correction: botanical fields flagged by the AI cross-check pass
-- (scripts/cross-check-plants.ts), reviewed and authorized 2026-07-09.
-- See docs/architecture.md §20.
--
-- This is a one-time record of corrections applied to the seeded catalog,
-- NOT schema. Every statement is guarded so it is idempotent and safe:
--   * matched on scientific_name (portable across environments, unlike the
--     per-row UUIDs, which are regenerated on a fresh seed),
--   * only touches rows still holding the exact pre-correction value, and
--   * only rows with is_curated = false, so a human-verified edit is never
--     overwritten.
-- On any row whose current value differs from the recorded "prior" value
-- (e.g. a fresh seed drafted something else), the guard makes it a no-op.

-- 1. Hardiness overstatements (single-zone corrections).
update public.plants set hardiness_zone_max = '9'
where scientific_name = 'Hedera helix'
  and is_curated = false and hardiness_zone_max = '11';

update public.plants set hardiness_zone_max = '8'
where scientific_name = 'Salvia officinalis'
  and is_curated = false and hardiness_zone_max = '10';

-- 2. Sun exposure: 61 under-reported ranges widened to the cross-check's
-- range, plus one contradiction corrected (Ajuga reptans, a shade
-- groundcover stored as full_sun). Applied via a guarded VALUES join.
update public.plants p set sun_requirements = v.corrected
from (values
  ('Artemisia absinthium', array['full_sun', 'partial_sun']::text[], array['full_sun']::text[]),
  ('Ajuga reptans', array['partial_sun', 'shade']::text[], array['full_sun']::text[]),
  ('Delphinium elatum', array['full_sun', 'partial_sun']::text[], array['partial_sun']::text[]),
  ('Nassella tenuissima', array['full_sun', 'partial_sun']::text[], array['full_sun']::text[]),
  ('Astrantia major', array['partial_sun', 'shade']::text[], array['partial_sun']::text[]),
  ('Penstemon barbatus', array['full_sun', 'partial_sun']::text[], array['full_sun']::text[]),
  ('Sedum acre', array['full_sun', 'partial_sun']::text[], array['full_sun']::text[]),
  ('Rudbeckia hirta', array['full_sun', 'partial_sun']::text[], array['full_sun']::text[]),
  ('Geranium sanguineum', array['full_sun', 'partial_sun']::text[], array['partial_sun']::text[]),
  ('Echium vulgare', array['full_sun', 'partial_sun']::text[], array['full_sun']::text[]),
  ('Festuca glauca', array['full_sun', 'partial_sun']::text[], array['full_sun']::text[]),
  ('Buxus sempervirens', array['full_sun', 'partial_sun', 'shade']::text[], array['partial_sun']::text[]),
  ('Pennisetum alopecuroides', array['full_sun', 'partial_sun']::text[], array['full_sun']::text[]),
  ('Wisteria sinensis', array['full_sun', 'partial_sun']::text[], array['full_sun']::text[]),
  ('Helleborus niger', array['partial_sun', 'shade']::text[], array['partial_sun']::text[]),
  ('Paeonia lactiflora', array['full_sun', 'partial_sun']::text[], array['partial_sun']::text[]),
  ('Jasminum officinale', array['full_sun', 'partial_sun']::text[], array['full_sun']::text[]),
  ('Syringa vulgaris', array['full_sun', 'partial_sun']::text[], array['full_sun']::text[]),
  ('Vinca minor', array['partial_sun', 'shade']::text[], array['shade']::text[]),
  ('Galanthus nivalis', array['partial_sun', 'shade']::text[], array['partial_sun']::text[]),
  ('Rosa canina', array['full_sun', 'partial_sun']::text[], array['full_sun']::text[]),
  ('Primula veris', array['full_sun', 'partial_sun']::text[], array['full_sun']::text[]),
  ('Sambucus nigra', array['full_sun', 'partial_sun']::text[], array['partial_sun']::text[]),
  ('Ilex aquifolium', array['full_sun', 'partial_sun', 'shade']::text[], array['partial_sun']::text[]),
  ('Aquilegia vulgaris', array['full_sun', 'partial_sun', 'shade']::text[], array['partial_sun']::text[]),
  ('Aster amellus', array['full_sun', 'partial_sun']::text[], array['full_sun']::text[]),
  ('Ribes sanguineum', array['full_sun', 'partial_sun']::text[], array['full_sun']::text[]),
  ('Hemerocallis fulva', array['full_sun', 'partial_sun']::text[], array['full_sun']::text[]),
  ('Cotinus coggygria', array['full_sun', 'partial_sun']::text[], array['full_sun']::text[]),
  ('Myosotis sylvatica', array['partial_sun', 'shade']::text[], array['partial_sun']::text[]),
  ('Alchemilla mollis', array['full_sun', 'partial_sun', 'shade']::text[], array['full_sun', 'partial_sun']::text[]),
  ('Iris × germanica', array['full_sun', 'partial_sun']::text[], array['full_sun']::text[]),
  ('Tulipa gesneriana', array['full_sun', 'partial_sun']::text[], array['full_sun']::text[]),
  ('Sempervivum tectorum', array['full_sun', 'partial_sun']::text[], array['full_sun']::text[]),
  ('Rosa gallica', array['full_sun', 'partial_sun']::text[], array['full_sun']::text[]),
  ('Hyacinthus orientalis', array['full_sun', 'partial_sun']::text[], array['full_sun']::text[]),
  ('Pulmonaria officinalis', array['partial_sun', 'shade']::text[], array['partial_sun']::text[]),
  ('Viburnum tinus', array['full_sun', 'partial_sun', 'shade']::text[], array['partial_sun']::text[]),
  ('Convallaria majalis', array['partial_sun', 'shade']::text[], array['partial_sun']::text[]),
  ('Buxus microphylla', array['full_sun', 'partial_sun', 'shade']::text[], array['full_sun', 'partial_sun']::text[]),
  ('Dryopteris filix-mas', array['partial_sun', 'shade']::text[], array['shade']::text[]),
  ('Armeria maritima', array['full_sun', 'partial_sun']::text[], array['full_sun']::text[]),
  ('Euphorbia characias', array['full_sun', 'partial_sun']::text[], array['full_sun']::text[]),
  ('Achillea millefolium', array['full_sun', 'partial_sun']::text[], array['full_sun']::text[]),
  ('Malva moschata', array['full_sun', 'partial_sun']::text[], array['full_sun']::text[]),
  ('Leucanthemum vulgare', array['full_sun', 'partial_sun']::text[], array['full_sun']::text[]),
  ('Briza media', array['full_sun', 'partial_sun']::text[], array['full_sun']::text[]),
  ('Scabiosa columbaria', array['full_sun', 'partial_sun']::text[], array['full_sun']::text[]),
  ('Molinia caerulea', array['full_sun', 'partial_sun']::text[], array['partial_sun']::text[]),
  ('Silene dioica', array['partial_sun', 'shade']::text[], array['partial_sun']::text[]),
  ('Hydrangea arborescens', array['full_sun', 'partial_sun', 'shade']::text[], array['partial_sun', 'shade']::text[]),
  ('Polystichum setiferum', array['partial_sun', 'shade']::text[], array['shade']::text[]),
  ('Lamium maculatum', array['partial_sun', 'shade']::text[], array['partial_sun']::text[]),
  ('Dianthus barbatus', array['full_sun', 'partial_sun']::text[], array['full_sun']::text[]),
  ('Narcissus pseudonarcissus', array['full_sun', 'partial_sun']::text[], array['partial_sun']::text[]),
  ('Deschampsia cespitosa', array['full_sun', 'partial_sun', 'shade']::text[], array['partial_sun']::text[]),
  ('Aconitum napellus', array['partial_sun', 'shade']::text[], array['partial_sun']::text[]),
  ('Teucrium chamaedrys', array['full_sun', 'partial_sun']::text[], array['full_sun']::text[]),
  ('Lupinus polyphyllus', array['full_sun', 'partial_sun']::text[], array['full_sun']::text[]),
  ('Origanum vulgare', array['full_sun', 'partial_sun']::text[], array['partial_sun']::text[]),
  ('Lonicera periclymenum', array['full_sun', 'partial_sun', 'shade']::text[], array['partial_sun']::text[]),
  ('Taxus baccata', array['full_sun', 'partial_sun', 'shade']::text[], array['partial_sun', 'shade']::text[])
) as v(sci, corrected, prior)
where p.scientific_name = v.sci
  and p.is_curated = false
  and p.sun_requirements = v.prior;
