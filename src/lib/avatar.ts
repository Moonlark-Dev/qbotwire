/**
 * QQ avatars for users of an official Bot.
 *
 * The gateway payload only carries the OpenID of a group / C2C sender, never an
 * avatar URL. QQ exposes the real avatar through qlogo, keyed by the Bot AppID
 * and the OpenID issued under that AppID:
 *
 *   https://q.qlogo.cn/qqapp/{appid}/{user_openid}/100
 */

export interface UserAvatarSource {
  openid: string
  avatar?: string | null
}

/** Build the qlogo URL for one user OpenID, or null when it cannot be derived. */
export function qqAvatarUrl(
  appId: string | null | undefined,
  openid: string | null | undefined,
): string | null {
  const app = appId?.trim()
  const id = openid?.trim()
  if (!app || !id) return null
  if (!/^\d{5,20}$/.test(app)) return null
  return `https://q.qlogo.cn/qqapp/${app}/${encodeURIComponent(id)}/100`
}

/**
 * Pick the avatar to render for a cached user: an avatar supplied by the API
 * wins, otherwise fall back to the real QQ avatar behind the OpenID.
 */
export function resolveUserAvatar(
  appId: string | null | undefined,
  user: UserAvatarSource | null | undefined,
): string | null {
  if (!user) return null
  const supplied = user.avatar?.trim()
  if (supplied) return supplied
  return qqAvatarUrl(appId, user.openid)
}
