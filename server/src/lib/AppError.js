// CLAUDE.md "Errors": throw AppError(status, code, message, details?); errorHandler formats
// { error: { code, message, details? } }. Messages are user-facing and say how to fix the problem (NFR-3).
export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message)
    this.name = 'AppError'
    this.status = status
    this.code = code
    if (details !== undefined) this.details = details
  }
}

export const unauthenticated = () =>
  new AppError(401, 'UNAUTHENTICATED', 'Your session has ended. Log in again to continue.')

export const forbidden = () => new AppError(403, 'FORBIDDEN', "Your account type can't use this feature.")

export const accountSuspended = () =>
  new AppError(403, 'ACCOUNT_SUSPENDED', 'Your account has been suspended by an administrator. Contact support.')

// 404 for something the caller may not see: not found, not theirs, or not public (never says which).
export const notFoundError = (message = 'We couldn’t find that.') => new AppError(404, 'NOT_FOUND', message)
