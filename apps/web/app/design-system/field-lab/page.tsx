'use client'

import { useState } from 'react'
import { Chip, cn, FormError, Icon } from '@paradoxui/ui'
import { icons } from '@/lib/icons'

/**
 * Field lab — every text-entry surface in the product, as it is today and as
 * it would look unified. Lives under the public /design-system area (no auth),
 * alongside dither-lab, and is NOT in the chapter nav: it is a decision aid for
 * the Input redesign, not reference documentation.
 *
 * The "today" column is markup copied verbatim from each real call site, so it
 * drifts if they change. That is deliberate — this page is meant to be deleted
 * when the redesign lands, not maintained.
 *
 * Interaction states are frozen previews (the Components chapter's convention):
 * the toggle applies the focus/error classes directly rather than asking you to
 * tab through six fields to compare them.
 */

type State = 'rest' | 'focus' | 'error'

const STATES: { id: State; label: string }[] = [
  { id: 'rest', label: 'Rest' },
  { id: 'focus', label: 'Focus' },
  { id: 'error', label: 'Error' },
]

/* ------------------------------------------------------------------ */
/* The proposal                                                        */
/* ------------------------------------------------------------------ */

/**
 * One shell for every field. Fill plus hairline, one radius, one focus
 * mechanism, one text size, three heights. Spacing is on the semantic
 * tokens rather than the numeric scale — the second half of the backlog
 * item, done here rather than as a separate sweep.
 */
function UnifiedField({
  state,
  size = 'md',
  leading,
  trailing,
  placeholder,
  label,
  helper,
  errorMessage,
  multiline,
  value,
}: {
  state: State
  size?: 'sm' | 'md' | 'lg'
  leading?: React.ReactNode
  trailing?: React.ReactNode
  placeholder?: string
  label?: string
  helper?: string
  errorMessage?: string
  multiline?: boolean
  value?: string
}) {
  const isError = state === 'error'
  const isFocus = state === 'focus'

  const heights = { sm: 'h-9', md: 'h-10', lg: 'h-12' }

  return (
    <div className="flex flex-col gap-inline-gap">
      {label && (
        <label className="text-body-small font-medium text-secondary">
          {label}
        </label>
      )}
      <div
        className={cn(
          'flex w-full items-center gap-inline-gap',
          'rounded-md border bg-surface-field px-item-gap',
          'transition-colors duration-normal',
          multiline ? 'min-h-[88px] items-start py-item-gap' : heights[size],
          // The note pair's treatment, which is the one Ana picked twice:
          // an edge BRIGHTER than the fill it borders (white over a
          // translucent white field) reads as a soft inset rather than a
          // drawn line. It survives both grounds because the fill is
          // translucent — the same relationship, not the same two colours.
          isError ? 'border-critical' : 'border-card',
          // One focus mechanism, also the note pair's. In error the outline
          // stays critical THROUGH focus — focusing a field to fix it must
          // not hide the reason it is wrong. (The login pill's rule.)
          isError
            ? 'outline outline-2 outline-offset-2 outline-critical'
            : isFocus && 'outline outline-2 outline-offset-2 outline-focus'
        )}
      >
        {leading}
        {multiline ? (
          <span
            className={cn(
              'w-full flex-1 text-body',
              value ? 'text-primary' : 'text-muted'
            )}
          >
            {value || placeholder}
          </span>
        ) : (
          <span
            className={cn(
              'min-w-0 flex-1 truncate text-body',
              value ? 'text-primary' : 'text-muted'
            )}
          >
            {value || placeholder}
          </span>
        )}
        {trailing}
      </div>
      {isError && errorMessage && <FormError>{errorMessage}</FormError>}
      {helper && !isError && (
        <p className="text-body-small text-muted">{helper}</p>
      )}
    </div>
  )
}

function Magnifier({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      className={cn('shrink-0 text-secondary', className)}
    >
      <path
        d="M14 14L11.0093 11.004M12.6667 7C12.6667 8.50289 12.0696 9.94423 11.0069 11.0069C9.94423 12.0696 8.50289 12.6667 7 12.6667C5.49711 12.6667 4.05577 12.0696 2.99306 11.0069C1.93036 9.94423 1.33333 8.50289 1.33333 7C1.33333 5.49711 1.93036 4.05577 2.99306 2.99306C4.05577 1.93036 5.49711 1.33333 7 1.33333C8.50289 1.33333 9.94423 1.93036 11.0069 2.99306C12.0696 4.05577 12.6667 5.49711 12.6667 7Z"
        stroke="currentColor"
        strokeWidth="1.33333"
        strokeLinecap="round"
      />
    </svg>
  )
}

function ChevronDown() {
  return (
    <svg
      aria-hidden="true"
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      className="shrink-0 text-secondary"
    >
      <path
        d="M4 6l4 4 4-4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/* ------------------------------------------------------------------ */
/* Layout scaffolding                                                  */
/* ------------------------------------------------------------------ */

/** The ground a field actually sits on in the product. */
type Ground = 'page' | 'card' | 'overlay'

const grounds: Record<Ground, string> = {
  page: 'bg-surface-page',
  card: 'bg-surface-card',
  overlay: 'bg-surface-card',
}

function Row({
  name,
  where,
  ground,
  today,
  unified,
  note,
  metrics,
}: {
  name: string
  where: string
  ground: Ground
  today: React.ReactNode
  unified: React.ReactNode
  note?: string
  metrics: { today: string; unified: string }
}) {
  return (
    <section className="flex flex-col gap-item-gap">
      <div className="flex flex-col gap-tight-gap">
        <h3 className="text-body font-semibold text-primary">{name}</h3>
        <p className="text-body-small text-muted">{where}</p>
      </div>

      <div className="grid gap-item-gap md:grid-cols-2">
        <div className="flex flex-col gap-inline-gap">
          <span className="text-label uppercase tracking-label text-muted">
            Today
          </span>
          <div
            className={cn(
              'rounded-md border border-card-translucent p-card-padding',
              grounds[ground]
            )}
          >
            {today}
          </div>
          <p className="text-label text-faint">{metrics.today}</p>
        </div>

        <div className="flex flex-col gap-inline-gap">
          <span className="text-label uppercase tracking-label text-muted">
            Unified
          </span>
          <div
            className={cn(
              'rounded-md border border-card-translucent p-card-padding',
              grounds[ground]
            )}
          >
            {unified}
          </div>
          <p className="text-label text-faint">{metrics.unified}</p>
        </div>
      </div>

      {note && (
        <p className="border-l-2 border-divider pl-item-gap text-body-small text-secondary">
          {note}
        </p>
      )}
    </section>
  )
}

/* ------------------------------------------------------------------ */

export default function FieldLabPage() {
  const [state, setState] = useState<State>('rest')

  const err = state === 'error'
  const foc = state === 'focus'

  return (
    <div className="flex flex-col gap-section-break">
      <header className="flex flex-col gap-item-gap">
        <h1 className="text-display font-semibold text-primary">Field lab</h1>
        <p className="max-w-[62ch] text-body text-secondary">
          Every text-entry surface in the product, measured in the running app,
          shown as it is today and as it would look on one shell. Interaction
          states are frozen previews, so you can compare six fields in one
          glance instead of tabbing through them.
        </p>

        <div className="flex items-center gap-inline-gap">
          {STATES.map((s) => (
            <Chip
              key={s.id}
              selected={state === s.id}
              onClick={() => setState(s.id)}
            >
              {s.label}
            </Chip>
          ))}
        </div>

        {state === 'focus' && (
          <p className="max-w-[62ch] border-l-2 border-divider pl-item-gap text-body-small text-secondary">
            Four mechanisms in the left column: a ring, an outline with an
            offset, a border tint, and — on City search — a fill change from 60%
            to 100% white that is invisible on the modal it appears in.
          </p>
        )}
        {state === 'error' && (
          <p className="max-w-[62ch] border-l-2 border-critical pl-item-gap text-body-small text-secondary">
            The login pill is the only field that itself changes in error. City
            search and the note modal print a FormError beside a field that
            stays exactly as it was, so the message and the thing it is about
            are not visibly connected. Plant search has no error state at all.
          </p>
        )}
      </header>

      {/* ---------------------------------------------------------- */}

      <div className="flex flex-col gap-section-gap">
        <h2 className="text-title font-semibold text-primary">
          What disagrees today
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] border-collapse text-body-small">
            <thead>
              <tr className="border-b border-divider text-left">
                <th className="py-inline-gap pr-item-gap font-medium text-muted">
                  Axis
                </th>
                <th className="py-inline-gap pr-item-gap font-medium text-muted">
                  Values in the product
                </th>
              </tr>
            </thead>
            <tbody className="text-secondary">
              {[
                ['Height', '36 · 40 · 42 · 48'],
                ['Text size', '13 · 14 · 16'],
                ['Edge', 'none · white 1px · sage-300 1px · sage-100 1px'],
                [
                  'Focus',
                  'accent ring · accent outline+offset · border tint · fill swap',
                ],
                ['Radius', '12px everywhere, except one pill'],
              ].map(([axis, values]) => (
                <tr key={axis} className="border-b border-divider-subtle">
                  <td className="py-inline-gap pr-item-gap font-medium text-primary">
                    {axis}
                  </td>
                  <td className="py-inline-gap pr-item-gap">{values}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ---------------------------------------------------------- */}

      <div className="flex flex-col gap-section-gap">
        <h2 className="text-title font-semibold text-primary">
          The three that already work
        </h2>
        <p className="max-w-[62ch] text-body text-secondary">
          Plant search, note scope and note body are the surfaces worth keeping.
          Two of them already agree on everything except height. The third is
          the same idea at different absolute values, because its fill is opaque
          and cannot adapt to the ground it sits on.
        </p>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] border-collapse text-body-small">
            <thead>
              <tr className="border-b border-divider text-left">
                {['', 'Plant search', 'Note scope', 'Note body'].map((h) => (
                  <th
                    key={h}
                    className="py-inline-gap pr-item-gap font-medium text-muted"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="text-secondary">
              {[
                ['Radius', '12px', '12px', '12px', true],
                ['Height', '40', '36', '88 · 3 rows', false],
                ['Edge', 'sage-100', 'white', 'white', false],
                ['Fill', 'opaque card', 'white 50%', 'white 50%', false],
                ['Text', '13px', '14px', '14px', false],
                [
                  'Focus',
                  '1px sage-50 ring',
                  'outline +2',
                  'outline +2',
                  false,
                ],
              ].map(([axis, a, b, c, agree]) => (
                <tr
                  key={axis as string}
                  className="border-b border-divider-subtle"
                >
                  <td className="py-inline-gap pr-item-gap font-medium text-primary">
                    {axis}
                  </td>
                  {[a, b, c].map((v, i) => (
                    <td
                      key={i}
                      className={cn(
                        'py-inline-gap pr-item-gap',
                        agree && 'text-muted'
                      )}
                    >
                      {v}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="max-w-[62ch] border-l-2 border-divider pl-item-gap text-body-small text-secondary">
          The one swap you cannot judge from a table: plant search sits on the
          page, not on a modal, and the note pair&apos;s edge is white. Below is
          that exact treatment on the page ground, beside what ships today.
        </p>

        <div className="grid gap-item-gap md:grid-cols-2">
          <div className="flex flex-col gap-inline-gap">
            <span className="text-label uppercase tracking-label text-muted">
              Today · sage-100 on opaque card
            </span>
            <div className="rounded-md border border-card-translucent bg-surface-page p-card-padding">
              <div className="flex h-10 w-full items-center gap-item-gap rounded-md border bg-surface-card pl-item-gap pr-tight-gap [border-color:var(--color-sage-100)]">
                <Magnifier className="text-primary" />
                <span className="min-w-0 flex-1 text-body-small text-secondary">
                  Search plants
                </span>
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-inline-gap">
            <span className="text-label uppercase tracking-label text-muted">
              Note pair&apos;s treatment, on the page ground
            </span>
            <div className="rounded-md border border-card-translucent bg-surface-page p-card-padding">
              <div className="flex h-10 w-full items-center gap-inline-gap rounded-md border border-card bg-surface-field px-item-gap">
                <Magnifier className="text-primary" />
                <span className="min-w-0 flex-1 text-body text-muted">
                  Search plants
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ---------------------------------------------------------- */}

      <div className="flex flex-col gap-section-break">
        <h2 className="text-title font-semibold text-primary">
          Surface by surface
        </h2>

        <Row
          name="Login email"
          where="AuthOptions.tsx — /login"
          ground="card"
          metrics={{
            today: '48px · 13px · no edge · ring on focus',
            unified: '48px · 14px · white edge · outline on focus',
          }}
          note="The comment above this field says the pill has no border because it sits on a photographic background. That background was dropped in 058bb56 — it is a plain card now, the same ground as every other field. The inline submit button is real and worth keeping; the borderlessness is left over."
          today={
            <div className="flex flex-col gap-2">
              <div
                className={cn(
                  'flex h-12 w-full items-center gap-2 rounded-md bg-white py-2 pl-3 pr-2',
                  err ? 'ring-2 ring-critical' : foc && 'ring-2 ring-focus'
                )}
              >
                <span className="min-w-0 flex-1 text-body-small font-medium text-faint">
                  Enter your email
                </span>
                <span className="flex h-full shrink-0 items-center rounded-sm border border-login bg-accent px-2 text-body-small font-medium text-on-accent">
                  <Icon src={icons.arrowRight} />
                </span>
              </div>
              {err && <FormError>Enter a valid email address.</FormError>}
            </div>
          }
          unified={
            <UnifiedField
              state={state}
              size="lg"
              placeholder="Enter your email"
              errorMessage="Enter a valid email address."
              trailing={
                <span className="flex h-8 shrink-0 items-center rounded-sm bg-accent px-inline-gap text-body-small font-medium text-on-accent">
                  <Icon src={icons.arrowRight} />
                </span>
              }
            />
          }
        />

        <Row
          name="City search"
          where="CitySearch.tsx — location picker, /welcome"
          ground="card"
          metrics={{
            today: '48px · 13px · pill · fill swap only',
            unified: '48px · 14px · white edge · outline on focus',
          }}
          note="The only place the kit's pill still renders. Its focus affordance is a fill change from 60% to 100% white — on this near-white modal that is invisible, which is the one finding here I would call a defect rather than a difference."
          today={
            <div className="flex flex-col gap-item-gap">
              <label
                className={cn(
                  'flex h-12 w-full items-center gap-item-gap rounded-full bg-surface-field px-section-gap shadow-soft',
                  foc && 'bg-white'
                )}
              >
                <Magnifier />
                <span className="min-w-0 flex-1 text-body-small text-secondary">
                  Search for a city...
                </span>
              </label>
              {err && <FormError>We couldn&apos;t find this city.</FormError>}
            </div>
          }
          unified={
            <UnifiedField
              state={state}
              size="lg"
              leading={<Magnifier />}
              placeholder="Search for a city"
              errorMessage="We couldn't find this city."
            />
          }
        />

        <Row
          name="Plant search"
          where="ExploreClient.tsx — /explore"
          ground="page"
          metrics={{
            today: '40px · 13px · sage-100 · sage-50 ring',
            unified: '40px · 14px · white edge · outline on focus',
          }}
          note="The same SearchField as above, overridden back into a bordered rounded rect by eleven classes at the call site. The override is the honest signal: the product already rejected the pill here."
          today={
            <div
              className={cn(
                'flex h-10 w-full items-center gap-item-gap rounded-md border bg-surface-card pl-item-gap pr-tight-gap',
                foc
                  ? '[border-color:var(--color-sage-50)] [box-shadow:0_0_0_1px_var(--color-sage-50)]'
                  : '[border-color:var(--color-sage-100)]'
              )}
            >
              <Magnifier className="text-primary" />
              <span className="min-w-0 flex-1 text-body-small text-secondary">
                Search plants
              </span>
            </div>
          }
          unified={
            <UnifiedField
              state={state}
              leading={<Magnifier className="text-primary" />}
              placeholder="Search plants"
              errorMessage="No plants match that search."
            />
          }
        />

        <Row
          name="Note scope"
          where="AddNoteModal.tsx — the 'what is this about' selector"
          ground="overlay"
          metrics={{
            today: '36px · 14px · white edge · outline+offset',
            unified: '40px · 14px · white edge · outline on focus',
          }}
          note="A menu trigger dressed as a field. Its edge is border-card, which resolves to pure white — a lift, not a hairline. The sidebar hairline was moved off white in July for exactly this reason: too harsh against the sage ground."
          today={
            <button
              type="button"
              className={cn(
                'flex w-full items-center gap-inline-gap rounded-md border border-card bg-surface-overlay px-item-gap py-inline-gap text-left',
                foc && 'outline outline-2 outline-offset-2 outline-focus'
              )}
            >
              <span className="flex-1 truncate text-body text-primary">
                Your garden
              </span>
              <ChevronDown />
            </button>
          }
          unified={
            <UnifiedField
              state={state}
              value="Your garden"
              errorMessage="Pick what this note is about."
              trailing={<ChevronDown />}
            />
          }
        />

        <Row
          name="Note body"
          where="AddNoteModal.tsx — the textarea"
          ground="overlay"
          metrics={{
            today: '3 rows · 14px · white edge · outline+offset',
            unified: '3 rows · 14px · white edge · outline on focus',
          }}
          note="Closest to the proposal already, and the only pair on this page that agrees with each other — except that it runs 14px directly beneath a 16px selector."
          today={
            <div className="flex flex-col gap-item-gap">
              <div
                className={cn(
                  'min-h-[88px] w-full rounded-md border border-card bg-surface-overlay p-item-gap',
                  foc && 'outline outline-2 outline-offset-2 outline-focus'
                )}
              >
                <span className="text-body text-muted">
                  What happened in your garden?
                </span>
              </div>
              {err && <FormError>Write a note or attach a photo.</FormError>}
            </div>
          }
          unified={
            <UnifiedField
              state={state}
              multiline
              placeholder="What happened in your garden?"
              errorMessage="Write a note or attach a photo."
            />
          }
        />

        <Row
          name="Kit Input"
          where="packages/ui — rendered only on /design-system"
          ground="page"
          metrics={{
            today: '42px · 16px · sage-300 · ring on focus',
            unified: '40px · 14px · white edge · outline on focus',
          }}
          note="No product surface imports this. Its focus treatment is the strongest of the six and is what the proposal adopts; its height and text size are accidents of px/py plus line-height rather than chosen numbers."
          today={
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-secondary">
                Garden name
              </label>
              <div
                className={cn(
                  'w-full rounded-md border bg-surface-field px-3 py-2 text-base text-faint',
                  err
                    ? 'border-critical ring-2 ring-critical'
                    : foc
                      ? 'border-accent ring-2 ring-focus'
                      : 'border-divider'
                )}
              >
                e.g. Balcony south
              </div>
              {err ? (
                <FormError>We couldn&apos;t save that name.</FormError>
              ) : (
                <p className="text-sm text-muted">Shown on your dashboard.</p>
              )}
            </div>
          }
          unified={
            <UnifiedField
              state={state}
              label="Garden name"
              placeholder="e.g. Balcony south"
              helper="Shown on your dashboard."
              errorMessage="We couldn't save that name."
            />
          }
        />
      </div>

      {/* ---------------------------------------------------------- */}

      <div className="flex flex-col gap-item-gap">
        <h2 className="text-title font-semibold text-primary">The shell</h2>
        <p className="max-w-[62ch] text-body text-secondary">
          Three sizes, one of everything else. Leading and trailing slots absorb
          the magnifier, the chevron and the login submit button, so no call
          site needs to override the shell to get its own affordance.
        </p>
        <div className="flex flex-col gap-item-gap rounded-md border border-card-translucent bg-surface-page p-card-padding">
          <UnifiedField state={state} size="sm" placeholder="Small · 36px" />
          <UnifiedField
            state={state}
            placeholder="Medium · 40px — the default"
          />
          <UnifiedField state={state} size="lg" placeholder="Large · 48px" />
        </div>
        <dl className="grid gap-inline-gap text-body-small md:grid-cols-2">
          {[
            ['Fill', 'surface-field — white at 60%'],
            ['Edge', '1px border-card (white) — brighter than the fill'],
            ['Radius', 'rounded-md — 12px'],
            ['Text', 'text-body — 14px'],
            ['Focus', '2px accent outline, 2px offset'],
            [
              'Error',
              'border-critical + 2px ring-critical, held through focus',
            ],
            ['Padding', 'px-item-gap · gap-inline-gap'],
            ['Heights', '36 / 40 / 48'],
          ].map(([k, v]) => (
            <div key={k} className="flex gap-inline-gap">
              <dt className="w-[72px] shrink-0 font-medium text-muted">{k}</dt>
              <dd className="text-secondary">{v}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="flex flex-col gap-item-gap">
        <h2 className="text-title font-semibold text-primary">
          What this does not cover
        </h2>
        <p className="max-w-[62ch] text-body text-secondary">
          StoryComposer&apos;s textarea is not on this page because it cannot
          render: it is mounted only for non-growing plants, and it returns a
          read-only prompt for exactly that case. It is code to delete, not a
          field to redesign.
        </p>
      </div>
    </div>
  )
}
