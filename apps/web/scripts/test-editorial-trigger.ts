/**
 * Contract test for the `invalidate_editorial_verdict` trigger.
 *
 * WHY THIS EXISTS. The trigger surprised its own author three times on
 * 2026-07-29, and every single time it was caught by RUNNING it — never by
 * reading it. Once the migration comment itself was wrong ("skipped when the
 * same UPDATE writes editorial_checked_at"), `fix-oversized-heroes` was built
 * against that wording, and it was silently un-curating every row it resized.
 * The rule "writing the old value back is not a change" is not something you
 * can see by reading either the function or the script; it only appears when
 * both run against a real Postgres.
 *
 * So the trigger's behaviour is asserted here rather than described anywhere.
 * This is the executable half of migrations 20260729120000 and 20260729140000;
 * their comments are the reasoning, this file is the contract.
 *
 * WHY IT IS NOT A VITEST TEST. `pnpm test` runs in CI, and CI has no database
 * secrets on `pull_request` (deliberately — a PR-triggered job holding the
 * service-role key is worth less than the drift check it buys). A vitest file
 * would therefore have to skip, and a guard that skips in the only place it
 * runs automatically is the failure mode this repo has already paid for twice.
 * It is a script that must be run and must be seen to pass. When local
 * Supabase is unblocked this should move into `supabase test db` and then it
 * can be a real CI job.
 *
 * WHAT IT COSTS. Nothing. No model calls, one scratch row, a few UPDATEs.
 *
 * THE SCRATCH ROW IS REAL AND IT IS IN THE LIVE CATALOG. supabase-js speaks
 * PostgREST, which cannot hold a transaction open across statements, so this
 * cannot be a BEGIN/ROLLBACK the way the same probe run through raw SQL can.
 * The row is therefore inserted, exercised and deleted, with the delete in a
 * `finally` and a sweep of any leftovers at startup. It is named so that a
 * leftover is unmistakable, and it carries `data_source = 'test'` so no
 * catalog pass can mistake it for a plant.
 *
 * Usage (from apps/web):
 *   pnpm trigger:contract
 */

import { getSupabaseAdmin } from '../lib/supabase-admin'

/** Unmistakable in a table of real plants, and easy to sweep. */
const SCRATCH_NAME = 'ZZ TEST editorial trigger contract row'

/** Any timestamp works; distinct values make a failure readable. */
const T0 = '2026-01-01T00:00:00+00:00'
const T1 = '2026-06-06T00:00:00+00:00'

const supabase = getSupabaseAdmin()

type Verdict = {
  is_curated: boolean
  editorial_checked_at: string | null
  editorial_image_at: string | null
  editorial_description_at: string | null
  editorial_tags_at: string | null
}

/** What a criterion stamp is after an update: cleared, or holding a value. */
type Stamp = 'cleared' | typeof T0 | typeof T1

let plantId = ''
let failures = 0
let passes = 0

async function update(patch: Record<string, unknown>) {
  const { error } = await supabase
    .from('plants')
    .update(patch)
    .eq('id', plantId)
  if (error) throw new Error(`update failed: ${error.message}`)
}

async function read(): Promise<Verdict> {
  const { data, error } = await supabase
    .from('plants')
    .select(
      'is_curated, editorial_checked_at, editorial_image_at, editorial_description_at, editorial_tags_at'
    )
    .eq('id', plantId)
    .single()
  if (error) throw new Error(`read failed: ${error.message}`)
  return data as Verdict
}

/**
 * Put the row back to fully signed off, so each case starts from one state.
 *
 * IN TWO STATEMENTS, and not by choice. The first draft did it in one and this
 * function became its own best example of the bug below: restoring the content
 * fields is a change to them, while writing T0 back over an existing T0 is not
 * a change to the stamps, so the trigger cleared exactly what the reset was
 * trying to assert. The guard at the bottom caught it on the first run.
 *
 * Content first, verdict second — the same shape `fix-oversized-heroes` needs,
 * for the same reason. Against the stamps the first statement just cleared,
 * the second statement's write is a change, and a change is a claim.
 */
async function signedOff() {
  await update({
    description: 'original description',
    style_tags: ['cottage'],
    space_types: ['border'],
    image_url_curated: 'https://example.test/a.jpg',
    image_pick_confidence: 'high',
    bloom_color: ['pink'],
  })
  await update({
    is_curated: true,
    editorial_checked_at: T0,
    editorial_image_at: T0,
    editorial_description_at: T0,
    editorial_tags_at: T0,
  })
  const v = await read()
  if (!v.is_curated || v.editorial_image_at === null) {
    // The reset itself goes through the trigger. If this ever fails, every
    // case below is meaningless, so it is worth its own explicit death.
    throw new Error(
      'could not return the scratch row to a signed-off state — the reset ' +
        'update is being invalidated, so the trigger no longer behaves as ' +
        'this file assumes at all. Fix that before reading any case below.'
    )
  }
}

function stamp(value: string | null): Stamp {
  if (value === null) return 'cleared'
  return new Date(value).toISOString() === new Date(T1).toISOString() ? T1 : T0
}

/**
 * One case: do `mutate`, then assert the whole verdict. Every case states all
 * five columns — a per-criterion trigger is exactly the thing where asserting
 * only the column you care about hides the bug.
 */
async function check(
  name: string,
  mutate: () => Promise<void>,
  expected: {
    is_curated: boolean
    checked: Stamp
    image: Stamp
    description: Stamp
    tags: Stamp
  }
) {
  await signedOff()
  await mutate()
  const v = await read()
  const actual = {
    is_curated: v.is_curated,
    checked: stamp(v.editorial_checked_at),
    image: stamp(v.editorial_image_at),
    description: stamp(v.editorial_description_at),
    tags: stamp(v.editorial_tags_at),
  }

  const wrong = (Object.keys(expected) as (keyof typeof expected)[]).filter(
    (k) => actual[k] !== expected[k]
  )

  if (wrong.length === 0) {
    passes++
    console.log(`  PASS  ${name}`)
    return
  }

  failures++
  console.log(`  FAIL  ${name}`)
  for (const k of wrong) {
    console.log(`          ${k}: expected ${expected[k]}, got ${actual[k]}`)
  }
}

async function main() {
  console.log('Contract test — invalidate_editorial_verdict\n')

  // Sweep anything a previous crashed run left behind, so a leftover row can
  // never accumulate and never silently becomes two.
  const { data: leftovers } = await supabase
    .from('plants')
    .select('id')
    .eq('common_name', SCRATCH_NAME)
  if (leftovers?.length) {
    console.log(`Sweeping ${leftovers.length} leftover scratch row(s).`)
    await supabase.from('plants').delete().eq('common_name', SCRATCH_NAME)
  }

  const { data: created, error: insertErr } = await supabase
    .from('plants')
    .insert({ common_name: SCRATCH_NAME, data_source: 'test' })
    .select('id')
    .single()
  if (insertErr || !created) {
    throw new Error(`could not create the scratch row: ${insertErr?.message}`)
  }
  plantId = created.id

  try {
    console.log('The three criteria are invalidated separately:\n')

    await check(
      'a new hero image re-opens the image criterion and nothing else',
      () => update({ image_url_curated: 'https://example.test/b.jpg' }),
      {
        is_curated: false,
        checked: 'cleared',
        image: 'cleared',
        description: T0,
        tags: T0,
      }
    )

    await check(
      'a new image confidence re-opens the image criterion',
      () => update({ image_pick_confidence: 'medium' }),
      {
        is_curated: false,
        checked: 'cleared',
        image: 'cleared',
        description: T0,
        tags: T0,
      }
    )

    await check(
      'a rewritten description re-opens only the description',
      () => update({ description: 'rewritten' }),
      {
        is_curated: false,
        checked: 'cleared',
        image: T0,
        description: 'cleared',
        tags: T0,
      }
    )

    // This is the case the per-criterion split was built for: Rowan lost one
    // style tag and got its description rewritten by the pass that reopened.
    await check(
      'changed style tags re-open the tags criterion, NOT the description',
      () => update({ style_tags: ['mediterranean'] }),
      {
        is_curated: false,
        checked: 'cleared',
        image: T0,
        description: T0,
        tags: 'cleared',
      }
    )

    await check(
      'changed space types re-open the tags criterion',
      () => update({ space_types: ['balcony'] }),
      {
        is_curated: false,
        checked: 'cleared',
        image: T0,
        description: T0,
        tags: 'cleared',
      }
    )

    console.log('\nNothing else touches the verdict:\n')

    await check(
      'a column no criterion rests on leaves the verdict whole',
      () => update({ bloom_color: ['white'] }),
      { is_curated: true, checked: T0, image: T0, description: T0, tags: T0 }
    )

    await check(
      'an update that changes nothing leaves the verdict whole',
      () => update({ common_name: SCRATCH_NAME }),
      { is_curated: true, checked: T0, image: T0, description: T0, tags: T0 }
    )

    console.log('\nThe escape hatch is about CHANGING a stamp:\n')

    // The one that cost a day. PostgREST sends every column on an update, so
    // value equality is the only signal Postgres has, and an unchanged stamp
    // has to read as "no claim made".
    await check(
      'writing the SAME criterion stamp back does not protect it',
      () => update({ description: 'rewritten', editorial_description_at: T0 }),
      {
        is_curated: false,
        checked: 'cleared',
        image: T0,
        description: 'cleared',
        tags: T0,
      }
    )

    await check(
      'writing a NEW criterion stamp signs the change off in one statement',
      () => update({ description: 'rewritten', editorial_description_at: T1 }),
      { is_curated: true, checked: T0, image: T0, description: T1, tags: T0 }
    )

    // The v1 hatch is GONE and this is the assertion that says so. Under
    // migration 20260729120000, changing editorial_checked_at returned early
    // and protected the whole row. Since the per-criterion split it protects
    // nothing: the guard is per criterion, on that criterion's own stamp. Any
    // script still written against the old contract loses a stamp here.
    await check(
      'a new editorial_checked_at no longer protects a criterion (v1 hatch is gone)',
      () => update({ description: 'rewritten', editorial_checked_at: T1 }),
      {
        is_curated: false,
        checked: T1,
        image: T0,
        description: 'cleared',
        tags: T0,
      }
    )

    console.log('\nRe-asserting a verdict across two statements:\n')

    // fix-oversized-heroes' pattern. A smaller rendition of the same photo is
    // not a new editorial question, so it re-asserts rather than re-judges.
    // The point of this case: the re-assert has to include the CRITERION
    // stamp. Restoring is_curated and editorial_checked_at alone leaves the
    // row approved with a criterion outstanding, which is the one state the
    // trigger exists to make impossible.
    await check(
      're-asserting the criterion stamp restores the verdict',
      async () => {
        await update({ image_url_curated: 'https://example.test/small.jpg' })
        await update({
          is_curated: true,
          editorial_checked_at: T0,
          editorial_image_at: T0,
        })
      },
      { is_curated: true, checked: T0, image: T0, description: T0, tags: T0 }
    )

    await check(
      're-asserting WITHOUT the criterion stamp leaves it outstanding',
      async () => {
        await update({ image_url_curated: 'https://example.test/small.jpg' })
        await update({ is_curated: true, editorial_checked_at: T0 })
      },
      {
        is_curated: true,
        checked: T0,
        image: 'cleared',
        description: T0,
        tags: T0,
      }
    )
  } finally {
    const { error } = await supabase.from('plants').delete().eq('id', plantId)
    if (error) {
      console.error(
        `\nTHE SCRATCH ROW WAS NOT DELETED (${error.message}).\n` +
          `Delete it by hand: id ${plantId}, common_name "${SCRATCH_NAME}".`
      )
      failures++
    }
  }

  console.log(`\n${passes} passed, ${failures} failed.`)

  if (failures > 0) {
    console.log(
      '\nThe trigger does not behave the way this file says it does. One of\n' +
        'the two is wrong, and the scripts that write to plants are built on\n' +
        'whichever one you believe. Resolve it before running a pass.'
    )
    process.exit(1)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
