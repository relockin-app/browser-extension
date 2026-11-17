import { ReelockrStorage } from "@/storage";
import { OnboardingSiteKey, RuleTargetType } from "@/types/models";
import { t } from "~/lib/i18n";

const SITE_DEFINITIONS: Record<
  OnboardingSiteKey,
  { name: string; domain: string }
> = {
  youtube: { name: "YouTube", domain: "youtube.com" },
  x: { name: "X", domain: "x.com" },
  instagram: { name: "Instagram", domain: "instagram.com" },
  reddit: { name: "Reddit", domain: "reddit.com" },
  tiktok: { name: "TikTok", domain: "tiktok.com" },
  facebook: { name: "Facebook", domain: "facebook.com" },
  linkedin: { name: "LinkedIn", domain: "linkedin.com" },
  pinterest: { name: "Pinterest", domain: "pinterest.com" },
};

const SOCIAL_MEDIA_KEYS: readonly OnboardingSiteKey[] = [
  "x",
  "tiktok",
  "instagram",
  "facebook",
  "pinterest",
];

export const DEFAULT_ALLOWED_SECONDS = 60 * 30;

export interface PlannedRule {
  name: string;
  domains: string[];
}

/** Given the user's selected sites, return the rules we'll create (or did
 * create) — exposed so the rule confirmation slide can preview the same list
 * the helper writes to storage. Social-media sites collapse into a single
 * "Social Media" rule with multiple domain targets; everything else is its
 * own rule. With `singleRule` (the free version on a phone, which has one
 * rule), they all go in one rule named after them. */
export function planRulesFromSurvey(
  sites: OnboardingSiteKey[],
  singleRule = false,
): PlannedRule[] {
  const planned: PlannedRule[] = [];
  const socialMedia = sites.filter((s) => SOCIAL_MEDIA_KEYS.includes(s));
  if (socialMedia.length > 0) {
    planned.push({
      name: t("limitsOnboarding_v2SurveyCategoriesOptionSocialMedia"),
      domains: socialMedia.map((k) => SITE_DEFINITIONS[k].domain),
    });
  }
  for (const key of sites.filter((s) => !SOCIAL_MEDIA_KEYS.includes(s))) {
    const def = SITE_DEFINITIONS[key];
    planned.push({ name: def.name, domains: [def.domain] });
  }
  if (singleRule && planned.length > 1) {
    const names = new Intl.ListFormat(browser.i18n.getUILanguage()).format(planned.map((p) => p.name));
    return [{ name: names, domains: planned.flatMap((p) => p.domains) }];
  }
  return planned;
}

/** `allowedSecondsByRule` overrides the daily limit, keyed by planned rule name. */
export async function createRulesFromSurvey(
  store: ReelockrStorage,
  sites: OnboardingSiteKey[],
  allowedSecondsByRule: Record<string, number> = {},
  singleRule = false,
): Promise<void> {
  for (const plan of planRulesFromSurvey(sites, singleRule)) {
    await store.createRule({
      name: plan.name,
      allowedSeconds: allowedSecondsByRule[plan.name] ?? DEFAULT_ALLOWED_SECONDS,
      targets: plan.domains.map((d) => ({
        targetType: RuleTargetType.Domain,
        pattern: d,
        enabled: true,
      })),
    });
  }
}
