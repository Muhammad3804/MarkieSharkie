import multer from 'multer'
import { AppError } from '../lib/AppError.js'
import { UPLOAD_RULES } from '../lib/fileType.js'

// multipart/form-data with one file in field "file" (kept in memory: the largest allowed file is 50 MB). Types and
// per-kind sizes are checked from the file's bytes in the service; this only caps the request.
const largest = Math.max(...Object.values(UPLOAD_RULES).map((r) => r.maxBytes))
const parser = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: largest, files: 1, fields: 4, fieldSize: 1024, parts: 6 },
}).single('file')

export function singleFile(req, res, next) {
  parser(req, res, (err) => {
    if (!err) return next()
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return next(
          new AppError(413, 'FILE_TOO_LARGE', 'That file is too large.', [
            { field: 'file', message: 'That file is too large.' },
          ]),
        )
      }
      return next(
        new AppError(400, 'BAD_UPLOAD', 'Send one file in the "file" field.', [
          { field: 'file', message: 'Send one file.' },
        ]),
      )
    }
    next(err)
  })
}
