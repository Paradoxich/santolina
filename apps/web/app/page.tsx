import styles from './page.module.css'

type ItemStatus = 'done' | 'active' | 'pending'

interface TrackItem {
  label: string
  status: ItemStatus
}

const items: TrackItem[] = [
  { label: 'Product research & definition', status: 'done' },
  { label: 'Information architecture', status: 'done' },
  { label: 'Product name & domains', status: 'done' },
  { label: 'Define architecture & stack', status: 'done' },
  { label: 'Set up monorepo', status: 'done' },
  { label: 'Define data sources', status: 'done' },
  { label: 'User flows & states', status: 'active' },
  { label: 'Visual direction & branding', status: 'active' },
  { label: 'UI & interaction design', status: 'active' },
  { label: 'Design system', status: 'active' },
  { label: 'Landing page', status: 'pending' },
  { label: 'Build core experience', status: 'pending' },
  { label: 'Alpha: test & validate', status: 'pending' },
  { label: 'Build additional features', status: 'pending' },
  { label: 'Public launch', status: 'pending' },
]

export default function InProgressPage() {
  return (
    <div className={styles.root}>
      <div className={styles.inner}>
        <h1 className={styles.headline}>Santolina</h1>
        <p className={styles.meta}>
          Passion project from{' '}
          <a
            href="https://www.anabeverin.com/"
            target="_blank"
            rel="noopener noreferrer"
          >
            Ana,
          </a>{' '}
          check it out on{' '}
          <a
            href="https://github.com/Paradoxich/santolina"
            target="_blank"
            rel="noopener noreferrer"
          >
            GitHub.
          </a>
          <br />
        </p>

        <p className={styles.label}>Roadmap</p>

        <ul className={styles.track}>
          {items.map((item) => (
            <li
              key={item.label}
              className={`${styles.item} ${styles[item.status]}`}
            >
              <span className={styles.text}>{item.label}</span>
              {item.status === 'done' && (
                <span className={`${styles.tag} ${styles.tagDone}`}>Done</span>
              )}
              {item.status === 'active' && (
                <span className={`${styles.tag} ${styles.tagNow}`}>
                  Exploring
                </span>
              )}
            </li>
          ))}
        </ul>

        <p className={styles.footer}>April 2026</p>
      </div>
    </div>
  )
}
