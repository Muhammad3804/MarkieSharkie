import { AppError } from './AppError.js'

export const EMAIL_TAKEN_MESSAGE = 'This email is already registered. Log in or use another email.'
export const PHONE_TAKEN_MESSAGE = 'This mobile number is already registered. Log in or use another number.'

// REQ-1 duplicate email / mobile -> 409 with a fix-it message and per-field details for the form.
export function takenError({ emailTaken = false, phoneTaken = false }) {
  const details = []
  if (emailTaken) details.push({ field: 'email', message: EMAIL_TAKEN_MESSAGE })
  if (phoneTaken) details.push({ field: 'phone', message: PHONE_TAKEN_MESSAGE })
  return new AppError(409, emailTaken ? 'EMAIL_TAKEN' : 'PHONE_TAKEN', details[0].message, details)
}

// Two requests can both pass the "is it free?" check; the UNIQUE constraints catch the loser (23505).
// Returns the mapped AppError, or the original error if it is not one of ours.
export function mapUserUniqueViolation(err) {
  if (err?.code !== '23505') return err
  if (err.constraint === 'users_email_key') return takenError({ emailTaken: true })
  if (err.constraint === 'users_phone_key') return takenError({ phoneTaken: true })
  return err
}
