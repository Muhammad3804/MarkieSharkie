// Initials avatar. Colour pairs come from the review avatars in the Figma frame.
const PALETTES = [
  ['bg-rose', 'text-primary'],
  ['bg-[#e3f1e8]', 'text-[#137a26]'],
  ['bg-[#f1ede3]', 'text-[#8a6413]'],
  ['bg-[#e3eaf1]', 'text-[#28507a]'],
]

const initials = (name) =>
  name
    .replace(/[^a-z ]/gi, '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join('')

export default function Avatar({ name, size = 44 }) {
  const [bg, fg] = PALETTES[[...name].reduce((sum, char) => sum + char.charCodeAt(0), 0) % PALETTES.length]
  return (
    <span
      aria-hidden
      style={{ width: size, height: size, fontSize: size * 0.36 }}
      className={`font-heading flex shrink-0 items-center justify-center rounded-full font-bold ${bg} ${fg}`}
    >
      {initials(name)}
    </span>
  )
}
