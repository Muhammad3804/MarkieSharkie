// Checks what a file really is from its first bytes ("magic numbers"), never from its name or the Content-Type the
// browser sent (both are chosen by the client). REQ-8: JPEG / PNG photos; floor plans may also be PDF; REQ-11
// walkthroughs are binary glTF (.glb) or a 360° JPEG.

const startsWith = (buffer, bytes, offset = 0) =>
  buffer.length >= offset + bytes.length && bytes.every((b, i) => buffer[offset + i] === b)

const SIGNATURES = [
  { mime: 'image/jpeg', ext: 'jpg', test: (b) => startsWith(b, [0xff, 0xd8, 0xff]) },
  { mime: 'image/png', ext: 'png', test: (b) => startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) },
  { mime: 'application/pdf', ext: 'pdf', test: (b) => startsWith(b, [0x25, 0x50, 0x44, 0x46, 0x2d]) }, // %PDF-
  { mime: 'model/gltf-binary', ext: 'glb', test: (b) => startsWith(b, [0x67, 0x6c, 0x54, 0x46]) }, // glTF
]

// -> { mime, ext } or null when the bytes are none of the types we accept.
export function detectFileType(buffer) {
  if (!Buffer.isBuffer(buffer)) return null
  const match = SIGNATURES.find((signature) => signature.test(buffer))
  return match ? { mime: match.mime, ext: match.ext } : null
}

const MB = 1024 * 1024

// Per kind: which real types are accepted and the largest size. Matches client/src/features/host/options.js.
export const UPLOAD_RULES = Object.freeze({
  photo: { types: ['image/jpeg', 'image/png'], maxBytes: 5 * MB, label: 'Photos must be JPEG or PNG, up to 5 MB.' },
  floor_plan: {
    types: ['image/jpeg', 'image/png', 'application/pdf'],
    maxBytes: 10 * MB,
    label: 'Floor plans must be JPEG, PNG or PDF, up to 10 MB.',
  },
  walkthrough: {
    types: ['model/gltf-binary', 'image/jpeg'],
    maxBytes: 50 * MB,
    jpegMaxBytes: 20 * MB,
    label: 'Walkthroughs must be a .glb 3D model (up to 50 MB) or a 360° JPEG (up to 20 MB).',
  },
})
