/** The two kinds of account that hold a token. */
export const USER_TYPES = ['customer', 'partner'] as const;

export type UserType = (typeof USER_TYPES)[number];

/** Whoever the bearer token identifies, of either kind. */
export interface UserPrincipal {
  id: string;
  userType: UserType;
}
