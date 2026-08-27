import { z } from 'zod';

export const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string().nullable().default(null),
  avatarUrl: z.string().url().nullable().default(null),
  createdAt: z.string().datetime(),
});
export type User = z.infer<typeof UserSchema>;

export const GoogleAuthRequestSchema = z.object({
  credential: z.string().min(1),
});
export type GoogleAuthRequest = z.infer<typeof GoogleAuthRequestSchema>;

export const AuthResponseSchema = z.object({
  token: z.string(),
  user: UserSchema,
});
export type AuthResponse = z.infer<typeof AuthResponseSchema>;

export const RefreshResponseSchema = z.object({
  token: z.string(),
});
export type RefreshResponse = z.infer<typeof RefreshResponseSchema>;

export const MeResponseSchema = z.object({
  user: UserSchema,
});
export type MeResponse = z.infer<typeof MeResponseSchema>;

/** Claims carried by the short-lived access JWT. */
export const AccessTokenClaimsSchema = z.object({
  sub: z.string().uuid(),
  email: z.string().email(),
});
export type AccessTokenClaims = z.infer<typeof AccessTokenClaimsSchema>;

/** Claims carried by the long-lived refresh token cookie. */
export const RefreshTokenClaimsSchema = z.object({
  sub: z.string().uuid(),
});
export type RefreshTokenClaims = z.infer<typeof RefreshTokenClaimsSchema>;
