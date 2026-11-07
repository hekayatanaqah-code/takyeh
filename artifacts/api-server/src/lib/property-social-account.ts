import { db } from "@workspace/db";
import { chaletSubmissionsTable, chaletsTable } from "@workspace/db/schema";
import { and, ne, sql, type SQL } from "drizzle-orm";
import { sqlRegex,sqlRegexReplace,sqlText,sqlDistinct } from "@workspace/db/sql-expressions";

export interface SocialAccountIdentity {
  platform: "instagram" | "snapchat" | null;
  username: string;
}

export function socialAccountIdentity(value: string): SocialAccountIdentity | null {
  const input = value.trim().toLowerCase().split(/[?#]/)[0].replace(/\/+$/, "");
  let platform: SocialAccountIdentity["platform"] = null;
  let username = input;
  const prefixed = input.match(/^(instagram|snapchat):@?(.+)$/);
  if (prefixed) {
    platform = prefixed[1] as "instagram" | "snapchat";
    username = prefixed[2];
  } else if (/^(https?:\/\/)?(www\.|m\.)?(instagram\.com|instagr\.am|snapchat\.com)\//.test(input)) {
    const url = new URL(/^https?:\/\//.test(input) ? input : `https://${input}`);
    platform = url.hostname.includes("snapchat") ? "snapchat" : "instagram";
    const path = url.pathname.replace(/^\/|\/$/g, "").split("/");
    if (platform === "snapchat" && path[0] === "add") path.shift();
    if (path.length !== 1) return null;
    username = path[0].replace(/^@/, "");
    if (["p", "reel", "reels", "stories", "explore", "accounts", "add", "t"].includes(username)) return null;
  } else {
    username = input.replace(/^@/, "");
  }
  return /^[a-z0-9_][a-z0-9_.-]{0,49}$/.test(username) ? { platform, username } : null;
}

function accountMatch(column: typeof chaletsTable.socialLink | typeof chaletSubmissionsTable.socialLink, account: SocialAccountIdentity): SQL {
  const raw = sql`lower(${sqlRegexReplace(sql`trim(coalesce(${column}, ''))`,"[?#].*$","")})`;
  const instagramPrefix = "^(https?://)?(www\\.|m\\.)?(instagram\\.com|instagr\\.am)/";
  const snapchatPrefix = "^(https?://)?(www\\.|m\\.)?snapchat\\.com/";
  const platform = sql`CASE
    WHEN ${sqlRegex(raw,instagramPrefix)} OR ${raw} LIKE 'instagram:%' THEN 'instagram'
    WHEN ${sqlRegex(raw,snapchatPrefix)} OR ${raw} LIKE 'snapchat:%' THEN 'snapchat'
    ELSE NULL END`;
  const prefix = "^((https?://)?(www\\.|m\\.)?(instagram\\.com/|instagr\\.am/|snapchat\\.com/(add/)?)|instagram:|snapchat:)";
  const username = sqlRegexReplace(sqlRegexReplace(sqlRegexReplace(raw,prefix,""),"/+$",""),"^@","");
  // A bare handle has no platform: conservatively check it against either platform.
  return sql`${username} = ${account.username}
    AND (${sqlText(sql`${account.platform}`)} IS NULL OR ${platform} IS NULL OR ${platform} = ${account.platform})`;
}

export async function hasPropertySocialConflict(value: string, excludeSubmissionId?: number): Promise<boolean> {
  const account = socialAccountIdentity(value);
  if (!account) return false;
  const [submissions, chalets] = await Promise.all([
    db.select({ id: chaletSubmissionsTable.id }).from(chaletSubmissionsTable).where(and(
      accountMatch(chaletSubmissionsTable.socialLink, account),
      ne(chaletSubmissionsTable.status, "rejected"),
      excludeSubmissionId === undefined ? undefined : ne(chaletSubmissionsTable.id, excludeSubmissionId),
    )).limit(1),
    db.select({ id: chaletsTable.id }).from(chaletsTable).where(and(
      accountMatch(chaletsTable.socialLink, account),
      excludeSubmissionId === undefined ? undefined : sqlDistinct(chaletsTable.submissionId,sql`${excludeSubmissionId}`),
    )).limit(1),
  ]);
  return submissions.length > 0 || chalets.length > 0;
}
