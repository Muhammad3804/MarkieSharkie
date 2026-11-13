import starFilledIcon from '../../assets/icons/venue/star-filled.svg'
import starOutlineIcon from '../../assets/icons/venue/star-outline.svg'

export default function StarRow({ rating, size = 12 }) {
  return (
    <span role="img" aria-label={`${rating} out of 5 stars`} className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <img key={star} src={star <= rating ? starFilledIcon : starOutlineIcon} alt="" width={size} height={size} />
      ))}
    </span>
  )
}
