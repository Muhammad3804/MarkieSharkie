import { formatAmount } from '../../lib/money.js'

// One menu package with its items (Figma 71:75): menu_packages + menu_items, price per head.
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
      <dl className="flex flex-col gap-3">
        {menu.items.map((item) => (
          <div key={item.itemId} className="flex flex-col gap-1">
            <dt className="text-[11px] font-semibold text-muted-warm">{item.category}</dt>
            <dd className="text-[13px] leading-[1.45] text-ink-strong">{item.name}</dd>
          </div>
        ))}
      </dl>
    </article>
  )
}
