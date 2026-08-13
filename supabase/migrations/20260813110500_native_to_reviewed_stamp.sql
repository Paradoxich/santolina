-- A "phrase reviewed and kept" stamp for native_to, and the backfill that
-- has been waiting on it since 2026-07-30.
--
-- WHY. The 2026-07-30 native_to review read 179 ranked rows against WCVP
-- evidence; 28 were rewritten and 151 were KEPT. A keep is a decision, not an
-- absence of one — but the only record of it is the committed review file
-- (apps/web/reference/native-to-review-2026-07-30.json), which catalog state
-- cannot see. So cross-check-native-to re-ranks the same 151 phrases on every
-- later run, and the queue never shrinks (queued behind standing rule 11,
-- database-log).
--
-- THE STAMP means "a person read this exact phrase against the evidence and
-- left it standing". It is an editorial-style verdict, not a *_checked_at
-- operational stamp: it survives re-seeds and cross-checks, and only an edit
-- to the phrase itself withdraws it.
--
-- THE TRIGGER mirrors invalidate_editorial_verdict (20260729101133), same
-- escape hatch and for the same reason: a review of a phrase is ABOUT that
-- phrase. When an UPDATE changes native_to without taking responsibility for
-- the verdict in the same statement, the stamp clears. Writing the old stamp
-- value back is not taking responsibility — see the fix-oversized-heroes
-- incident in that migration's header; a caller that knows better re-asserts
-- in a second statement.
--
-- THE BACKFILL matches on scientific_name AND the exact phrase the reviewer
-- read (phrase_at_review). A row whose phrase changed since review does not
-- inherit the verdict. The stamp is dated 2026-07-30 — the day the review
-- happened, not the day this migration ran.

alter table public.plants
  add column native_to_reviewed_at timestamptz;

comment on column public.plants.native_to_reviewed_at is
  'When a person last read this row''s native_to phrase against WCVP evidence and kept it. Cleared by trigger when native_to changes (unless the same statement re-stamps). cross-check-native-to excludes stamped rows from its partial-gap queue. Added 2026-08-13; backfilled from the 2026-07-30 review.';

create or replace function public.invalidate_native_to_review()
returns trigger
language plpgsql
as $$
begin
  -- The caller took responsibility for the verdict in this same statement.
  if new.native_to_reviewed_at is distinct from old.native_to_reviewed_at then
    return new;
  end if;

  -- Nothing to invalidate.
  if old.native_to_reviewed_at is null then
    return new;
  end if;

  if new.native_to is distinct from old.native_to then
    new.native_to_reviewed_at := null;
  end if;

  return new;
end;
$$;

drop trigger if exists invalidate_native_to_review on public.plants;

create trigger invalidate_native_to_review
  before update on public.plants
  for each row
  execute function public.invalidate_native_to_review();

comment on function public.invalidate_native_to_review is
  'Clears native_to_reviewed_at when an UPDATE changes native_to, unless the same UPDATE writes the stamp itself. Mirror of invalidate_editorial_verdict, added 2026-08-13.';

-- The 151 kept rows from the 2026-07-30 review. Generated from
-- apps/web/reference/native-to-review-2026-07-30.json (verdict = keep);
-- that file stays the narrative record, this is its stamp reaching the
-- database. Match is exact on both columns, so already-drifted rows are
-- (correctly) left unstamped.
update public.plants p
set native_to_reviewed_at = '2026-07-30T12:00:00+00'
from (
  values
    ('Hibiscus rosa-sinensis', 'tropical Asia and the Pacific'),
    ('Helianthus annuus', 'North America'),
    ('Chelone obliqua', 'eastern North America'),
    ('Origanum majorana', 'the Mediterranean and Turkey'),
    ('Calendula officinalis', 'southern Europe and the Mediterranean'),
    ('Lathyrus odoratus', 'southern Italy and the Mediterranean region'),
    ('Hyacinthus orientalis', 'Turkey and the eastern Mediterranean'),
    ('Santolina chamaecyparissus', 'the central Mediterranean'),
    ('Dianthus caryophyllus', 'the Mediterranean region'),
    ('Antirrhinum majus', 'the Mediterranean region'),
    ('Eryngium amethystinum', 'central and southern Europe'),
    ('Tropaeolum majus', 'South America'),
    ('Erodium reichardii', 'the western Mediterranean'),
    ('Citrus reticulata', 'southeastern Asia and China'),
    ('Citrus japonica', 'southern China and southeast Asia'),
    ('Pulmonaria saccharata', 'central and southern Europe'),
    ('Tiarella cordifolia', 'eastern North America'),
    ('Origanum laevigatum', 'Turkey and the eastern Mediterranean'),
    ('Osmunda regalis', 'Europe, Asia, Africa, and North America'),
    ('Polypodium vulgare', 'Europe, western Asia, and North America'),
    ('Hepatica nobilis', 'Europe and Asia'),
    ('Dictamnus albus', 'southern Europe and Asia'),
    ('Athyrium filix-femina', 'Europe, Asia, and North America'),
    ('Agastache foeniculum', 'North America'),
    ('Inula helenium', 'Europe and western Asia'),
    ('Cistus ladanifer', 'western Mediterranean'),
    ('Lavandula angustifolia', 'the Mediterranean'),
    ('Amelanchier lamarckii', 'eastern North America'),
    ('Asphodelus albus', 'the Mediterranean region'),
    ('Physalis peruviana', 'South America'),
    ('Omphalodes verna', 'central and southern Europe'),
    ('Satureja hortensis', 'southern Europe and the Mediterranean'),
    ('Aloysia citrodora', 'South America'),
    ('Chamaemelum nobile', 'western Europe and the Mediterranean'),
    ('Colutea arborescens', 'southern Europe and the Mediterranean region'),
    ('Petroselinum crispum', 'the Mediterranean region'),
    ('Calibrachoa parviflora', 'South America'),
    ('Thymus vulgaris', 'western Mediterranean'),
    ('Opuntia humifusa', 'eastern and central North America'),
    ('Iris lutescens', 'southern Europe and the western Mediterranean'),
    ('Salvia officinalis', 'the Mediterranean'),
    ('Hosta ventricosa', 'eastern Asia'),
    ('Sesleria autumnalis', 'southern Europe and the Balkans'),
    ('Helleborus multifidus', 'the Balkans and southern Europe'),
    ('Campanula garganica', 'southern Italy and the Balkans'),
    ('Crocus tommasinianus', 'southern and eastern Europe'),
    ('Symphytum grandiflorum', 'the Caucasus and eastern Europe'),
    ('Papaver cambricum', 'western Europe'),
    ('Capsicum pubescens', 'the Andes mountains of South America'),
    ('Aconitum carmichaelii', 'China and eastern Asia'),
    ('Primula denticulata', 'the Himalayas and mountains of central Asia'),
    ('Allium tuberosum', 'eastern Asia'),
    ('Sempervivum calcareum', 'the Alps and Jura Mountains'),
    ('Ruta graveolens', 'southern Europe and the Balkans'),
    ('Hydrangea macrophylla', 'Japan and coastal East Asia'),
    ('Nassella tenuissima', 'southwestern North America and Argentina'),
    ('Achillea clypeolata', 'southeastern Europe and Turkey'),
    ('Angelica archangelica', 'northern Europe and western Asia'),
    ('Pseudofumaria lutea', 'southern Europe'),
    ('Knautia macedonica', 'the Balkans and Romania'),
    ('Tulipa gesneriana', 'Turkey and central Asia'),
    ('Dianthus cruentus', 'the Balkans and eastern Europe'),
    ('Pimpinella anisum', 'the eastern Mediterranean and western Asia'),
    ('Achillea millefolium', 'Europe, Asia, and North America'),
    ('Koeleria glauca', 'Europe and Asia'),
    ('Fritillaria meleagris', 'Europe and western Asia'),
    ('Anethum graveolens', 'southwestern Asia and the Mediterranean'),
    ('Aruncus dioicus', 'Europe, Asia, and North America'),
    ('Silene acaulis', 'arctic and alpine regions of the northern hemisphere'),
    ('Artemisia absinthium', 'Europe, North Africa, and Asia'),
    ('Rudbeckia fulgida', 'eastern North America'),
    ('Dicentra eximia', 'eastern North America'),
    ('Verbascum phoeniceum', 'southern Europe and western Asia'),
    ('Lamium orvala', 'central and southern Europe'),
    ('Geranium nodosum', 'central and southern Europe'),
    ('Cercis canadensis', 'eastern North America'),
    ('Digitalis ferruginea', 'southern Europe and western Asia'),
    ('Heuchera villosa', 'eastern North America'),
    ('Dianthus gratianopolitanus', 'central and southern Europe'),
    ('Convolvulus sabatius', 'southern Europe and North Africa'),
    ('Filipendula rubra', 'eastern North America'),
    ('Helleborus niger', 'central and southern Europe'),
    ('Aurinia saxatilis', 'central and southern Europe'),
    ('Hylotelephium telephium', 'Europe and Asia'),
    ('Convallaria majalis', 'Europe and Asia'),
    ('Sternbergia lutea', 'the Mediterranean region and southwestern Asia'),
    ('Echinacea purpurea', 'eastern and central North America'),
    ('Thalictrum aquilegiifolium', 'Europe and Asia'),
    ('Myosotis sylvatica', 'Europe and Asia'),
    ('Rosa gallica', 'Europe and western Asia'),
    ('Capsicum baccatum', 'South America'),
    ('Rosmarinus officinalis', 'the Mediterranean region'),
    ('Borago officinalis', 'the Mediterranean region'),
    ('Eranthis hyemalis', 'southern Europe and the eastern Mediterranean'),
    ('Verbena rigida', 'South America'),
    ('Weigela florida', 'northeastern Asia'),
    ('Euphorbia rigida', 'the Mediterranean region and Turkey'),
    ('Satureja montana', 'southern Europe and the Mediterranean'),
    ('Lathyrus latifolius', 'southern Europe and the Mediterranean'),
    ('Linum narbonense', 'the Mediterranean region'),
    ('Spartium junceum', 'the Mediterranean region'),
    ('Cistus albidus', 'the western Mediterranean region'),
    ('Cyclamen hederifolium', 'the Mediterranean region'),
    ('Chamaerops humilis', 'the Mediterranean region'),
    ('Teucrium fruticans', 'the Mediterranean'),
    ('Agave americana', 'Mexico and the southern United States'),
    ('Paeonia mascula', 'southern Europe and the Mediterranean'),
    ('Acis autumnalis', 'the western Mediterranean'),
    ('Bupleurum fruticosum', 'the Mediterranean region'),
    ('Cynara cardunculus', 'the Mediterranean region'),
    ('Allium siculum', 'the Mediterranean region and southwestern Asia'),
    ('Juniperus oxycedrus', 'the Mediterranean region'),
    ('Leucanthemum vulgare', 'Europe and Asia'),
    ('Echium vulgare', 'Europe and Asia'),
    ('Origanum vulgare', 'Europe, North Africa, and Asia'),
    ('Helianthus tuberosus', 'North America'),
    ('Verbena hastata', 'North America'),
    ('Capsicum annuum', 'Central and South America'),
    ('Thymus praecox', 'Europe'),
    ('Capsicum frutescens', 'Central and South America'),
    ('Iris unguicularis', 'the Mediterranean region and Algeria'),
    ('Phlomis fruticosa', 'the Mediterranean region and the Caucasus'),
    ('Polygonatum odoratum', 'Europe and Asia'),
    ('Galium verum', 'Europe, Asia, and North Africa'),
    ('Carex pendula', 'Europe and western Asia'),
    ('Lilium martagon', 'Europe and western Asia'),
    ('Lonicera periclymenum', 'Europe and northwestern Africa'),
    ('Ilex aquifolium', 'Europe and the Mediterranean'),
    ('Salvia verticillata', 'Europe and western Asia'),
    ('Salvia nemorosa', 'Europe and central Asia'),
    ('Lamium maculatum', 'Europe to western Asia'),
    ('Anthriscus cerefolium', 'Europe and western Asia'),
    ('Hesperis matronalis', 'Europe and western Asia'),
    ('Primula veris', 'Europe and Asia'),
    ('Lantana camara', 'tropical Americas and the Caribbean'),
    ('Papaver rhoeas', 'Europe, North Africa, and western Asia'),
    ('Ribes uva-crispa', 'Europe and western Asia'),
    ('Armeria maritima', 'northern coasts of Europe, Asia, and North America'),
    ('Buxus sempervirens', 'Europe, North Africa, and western Asia'),
    ('Nepeta cataria', 'Europe, western Asia, and North Africa'),
    ('Delphinium elatum', 'Europe to central Asia and Siberia'),
    ('Sanguisorba officinalis', 'Europe, Asia, and North America'),
    ('Fragaria vesca', 'Europe, Asia, and North America'),
    ('Dryopteris filix-mas', 'Europe, Asia, and North America'),
    ('Deschampsia cespitosa', 'Europe, Asia, and North America'),
    ('Helianthemum nummularium', 'Europe and the Mediterranean region'),
    ('Helenium autumnale', 'North America'),
    ('Panicum virgatum', 'North America and Central America'),
    ('Briza media', 'Europe to the Himalayas'),
    ('Asplenium trichomanes', 'Europe, Asia, and North America'),
    ('Juniperus communis', 'Europe, Asia, and North America')
) as review(scientific_name, phrase_at_review)
where p.scientific_name = review.scientific_name
  and p.native_to = review.phrase_at_review;
