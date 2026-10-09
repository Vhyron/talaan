/**
 * Balintong, Talaan's mascot: a Palawan pangolin whose scales are pages and which curls up
 * sealed, like the folders. Decorative only (alt=""), so screen readers skip it.
 *
 * `mix-blend-multiply` drops any white background into the light page behind it.
 */

// Poses on the 3×2 character sheet (talaan_2.png), as [column, row].
const SHEET = {
  front: [0, 0],
  side: [1, 0],
  curled: [2, 0],
  wave: [0, 1],
  search: [1, 1],
  key: [2, 1],
} as const

// Single images. The wide ones (677×369) are cropped to a square around the mascot.
const IMAGES = {
  folder: '/talaan_1.png', // standing, holding a sealed folder
  hug: '/talaan_4.png', // curled around a sealed folder
  sealed: '/talaan_3.png', // curled into a ball, keyhole in the middle
} as const

export type MascotPose = keyof typeof SHEET | keyof typeof IMAGES

export default function Mascot({ pose, className = 'h-24 w-24' }: { pose: MascotPose; className?: string }) {
  if (pose in SHEET) {
    const [col, row] = SHEET[pose as keyof typeof SHEET]
    return (
      <div
        aria-hidden="true"
        className={`shrink-0 bg-no-repeat mix-blend-multiply ${className}`}
        style={{
          backgroundImage: 'url(/talaan_2.png)',
          backgroundSize: '300% 200%',
          backgroundPosition: `${col * 50}% ${row * 100}%`,
        }}
      />
    )
  }
  return (
    <img
      src={IMAGES[pose as keyof typeof IMAGES]}
      alt=""
      aria-hidden="true"
      draggable={false}
      className={`shrink-0 object-cover mix-blend-multiply ${className}`}
    />
  )
}
