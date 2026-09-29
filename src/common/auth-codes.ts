/**
 * Returned when a Firebase-verified phone number has no account yet. The app
 * answers it by collecting the missing profile fields and calling the same
 * sign-in endpoint again with the same token.
 */
export const PROFILE_REQUIRED = 'PROFILE_REQUIRED';
