import { formatAmount } from '../../lib/money.js'

// One menu package with its items (Figma 71:75): menu_packages + menu_items, price per head. Dishes are grouped by
// menu_items.category (the host wizard's menu sections), in the order the items arrive.
function groupBySection(items) {
  const sections = new Map()
  for (const item of items) {
    if (!sections.has(item.category)) sections.set(item.category, [])
    sections.get(item.category).push(item)
  }
  return [...sections]
}

export default function MenuCard({ menu }) {
  return (
    <article aria-labelledby={`${menu.menuId}-name`} className="flex flex-col gap-4 rounded-[16px] border border-line bg-white p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex max-w-[420px] flex-col gap-1">
          <h3 id={`${menu.menuId}-name`} className="font-heading text-[18px] font-semibold text-ink-strong">{menu.name}</h3>
          <p className="text-[13px] leading-[1.45] text-muted-warm">{menu.description}</p>
        </div>
        <p className="flex shrink-0 flex-col items-end gap-1 font-semibold">
          <span className="text-[11px] text-muted-warm">Price</span>
          <span className="font-heading text-[18px] text-ink-strong">{formatAmount(menu.pricePerHead, 'Rs')}</span>
          <span className="sr-only">per guest</span>
        </p>
      </div>
      <dl className="grid gap-3 sm:grid-cols-2">
        {groupBySection(menu.items).map(([section, items]) => (
          <div key={section} className="flex flex-col gap-1">
            <dt className="text-[11px] font-semibold text-muted-warm">{section}</dt>
            <dd className="text-[13px] leading-[1.45] text-ink-strong">{items.map((item) => item.name).join(', ')}</dd>
          </div>
        ))}
      </dl>
    </article>
  )
}
