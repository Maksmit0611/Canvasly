import { OAuth2Client } from 'google-auth-library';
import { config } from '../config.js';
import { unauthenticated } from '../errors.js';

const client = new OAuth2Client(config.GOOGLE_CLIENT_ID);

export interface GoogleIdentity {
  subject: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
}

/**
 * Verify a Google ID token's signature, issuer and audience, then return the
 * identity it asserts. Never decode without verifying, and never trust an
 * address Google has not confirmed.
 */
export async function verifyGoogleCredential(credential: string): Promise<GoogleIdentity> {
  let payload;
  try {
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: config.GOOGLE_CLIENT_ID,
    });
    payload = ticket.getPayload();
  } catch {
    throw unauthenticated('Google credential could not be verified');
  }

  if (!payload?.email || !payload.email_verified) {
    throw unauthenticated('Email not verified by Google');
  }
  if (!payload.sub) {
    throw unauthenticated('Google credential is missing a subject');
  }

  return {
    subject: payload.sub,
    email: payload.email,
    name: payload.name ?? null,
    avatarUrl: payload.picture ?? null,
  };
}
