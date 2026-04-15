import { Button } from '@paradoxui/ui'
import { Badge } from '@paradoxui/ui'
import { Card, CardHeader, CardBody, CardFooter } from '@paradoxui/ui'
import { Avatar } from '@paradoxui/ui'
import { Spinner } from '@paradoxui/ui'

const featuredPlants = [
  {
    id: '1',
    name: 'Monstera Deliciosa',
    status: 'Healthy',
    statusVariant: 'success' as const,
    initials: 'MD',
    description: 'Thrives in bright indirect light. Water when topsoil is dry.',
  },
  {
    id: '2',
    name: 'Fiddle Leaf Fig',
    status: 'Needs water',
    statusVariant: 'warning' as const,
    initials: 'FL',
    description: 'Prefers consistent watering and bright indirect light.',
  },
  {
    id: '3',
    name: 'Snake Plant',
    status: 'Healthy',
    statusVariant: 'success' as const,
    initials: 'SP',
    description: 'Very tolerant. Low light, infrequent watering.',
  },
]

export default function HomePage() {
  return (
    <main
      style={{
        minHeight: '100vh',
        background:
          'linear-gradient(135deg, var(--color-primary-50) 0%, var(--color-neutral-50) 100%)',
      }}
    >
      {/* Header */}
      <header
        style={{
          borderBottom: '1px solid var(--color-neutral-200)',
          background: 'white',
          padding: 'var(--spacing-4) var(--spacing-6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--spacing-3)',
          }}
        >
          <span
            style={{
              fontSize: 'var(--font-size-xl)',
              fontWeight: 'var(--font-weight-bold)',
              color: 'var(--color-primary-700)',
            }}
          >
            🌿 Santolina
          </span>
          <Badge variant="info">Beta</Badge>
        </div>
        <div style={{ display: 'flex', gap: 'var(--spacing-2)' }}>
          <Button variant="ghost" size="sm">
            Sign in
          </Button>
          <Button variant="primary" size="sm">
            Get started
          </Button>
        </div>
      </header>

      {/* Hero */}
      <section
        style={{
          textAlign: 'center',
          padding: 'var(--spacing-24) var(--spacing-6)',
          maxWidth: '720px',
          margin: '0 auto',
        }}
      >
        <h1
          style={{
            fontSize: 'var(--font-size-4xl)',
            fontWeight: 'var(--font-weight-bold)',
            color: 'var(--color-neutral-900)',
            lineHeight: 'var(--line-height-tight)',
            marginBottom: 'var(--spacing-4)',
          }}
        >
          Care for your plants,{' '}
          <span style={{ color: 'var(--color-primary-600)' }}>
            effortlessly.
          </span>
        </h1>
        <p
          style={{
            fontSize: 'var(--font-size-lg)',
            color: 'var(--color-neutral-600)',
            marginBottom: 'var(--spacing-8)',
            lineHeight: 'var(--line-height-relaxed)',
          }}
        >
          Santolina helps you track watering schedules, identify problems, and
          keep your plant collection thriving — all in one place.
        </p>
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: 'var(--spacing-3)',
          }}
        >
          <Button variant="primary" size="lg">
            Start for free
          </Button>
          <Button variant="secondary" size="lg">
            View demo
          </Button>
        </div>
      </section>

      {/* Plant cards */}
      <section
        style={{
          maxWidth: '1080px',
          margin: '0 auto',
          padding: '0 var(--spacing-6) var(--spacing-24)',
        }}
      >
        <h2
          style={{
            fontSize: 'var(--font-size-2xl)',
            fontWeight: 'var(--font-weight-semibold)',
            color: 'var(--color-neutral-800)',
            marginBottom: 'var(--spacing-6)',
            textAlign: 'center',
          }}
        >
          Your garden
        </h2>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: 'var(--spacing-4)',
          }}
        >
          {featuredPlants.map((plant) => (
            <Card key={plant.id}>
              <CardHeader>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--spacing-3)',
                  }}
                >
                  <Avatar initials={plant.initials} size="md" />
                  <div>
                    <p
                      style={{
                        margin: 0,
                        fontWeight: 'var(--font-weight-semibold)',
                        fontSize: 'var(--font-size-md)',
                        color: 'var(--color-neutral-900)',
                      }}
                    >
                      {plant.name}
                    </p>
                    <Badge variant={plant.statusVariant}>{plant.status}</Badge>
                  </div>
                </div>
              </CardHeader>
              <CardBody>
                <p
                  style={{
                    margin: 0,
                    color: 'var(--color-neutral-600)',
                    fontSize: 'var(--font-size-sm)',
                    lineHeight: 'var(--line-height-relaxed)',
                  }}
                >
                  {plant.description}
                </p>
              </CardBody>
              <CardFooter>
                <Button variant="ghost" size="sm">
                  View details
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      </section>

      {/* Loading state example */}
      <section
        style={{
          display: 'flex',
          justifyContent: 'center',
          paddingBottom: 'var(--spacing-16)',
        }}
      >
        <Spinner size="md" />
      </section>
    </main>
  )
}
