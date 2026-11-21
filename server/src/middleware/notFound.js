import { AppError } from '../lib/AppError.js'

export function notFound(req, _res, next) {
  next(new AppError(404, 'NOT_FOUND', `There is no ${req.method} ${req.path} endpoint. Check the URL and method.`))
}
