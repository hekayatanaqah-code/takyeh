import type { ExperienceYears, Geo, Interval, Photographer } from "./shared";
import type { Bank } from "./finance";

export interface Profile {
  bio: string; email: string; sessionMinutes: number; availability: Interval[];
  experienceYears: ExperienceYears | ""; portfolioUrl: string; profileImagePath: string; blockedDates: string[];
}
export interface ProfileDraft { prof: Profile; geo: Geo; bank: Bank }
export interface DraftState { baseline: ProfileDraft; draft: ProfileDraft; latest: ProfileDraft }
export const sameDraftValue = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function photographerDraft(p: Photographer): ProfileDraft {
  return {
    prof: { bio: p.bio ?? "", email: p.email ?? "", sessionMinutes: p.sessionMinutes || 90, availability: p.availability ?? [], experienceYears: p.experienceYears ?? "", portfolioUrl: p.portfolioUrl ?? "", profileImagePath: p.profileImagePath ?? "", blockedDates: p.blockedDates ?? [] },
    geo: { regionId: p.regionId, cityId: p.cityId, districtIds: p.districtIds ?? [], allDistricts: p.allDistricts },
    bank: { iban: p.iban ?? "", bankName: p.bankName ?? "" },
  };
}
export const initialDraft = (draft: ProfileDraft): DraftState => ({ baseline: draft, draft, latest: draft });
export type DraftAction =
  | { type: "receive"; latest: ProfileDraft; busy: boolean }
  | { type: "edit"; group: "prof"; update: (value: Profile) => Profile }
  | { type: "edit"; group: "geo"; update: (value: Geo) => Geo }
  | { type: "edit"; group: "bank"; update: (value: Bank) => Bank }
  | { type: "saved"; saved: ProfileDraft }
  | { type: "merge" | "replace" };

export function profileDraftReducer(state: DraftState, action: DraftAction): DraftState {
  switch (action.type) {
    case "receive": {
      if (!action.busy && sameDraftValue(state.draft, state.baseline)) {
        return sameDraftValue(state.baseline, action.latest) && sameDraftValue(state.latest, action.latest)
          ? state : initialDraft(action.latest);
      }
      return sameDraftValue(state.latest, action.latest) ? state : { ...state, latest: action.latest };
    }
    case "edit":
      switch (action.group) {
        case "prof": return { ...state, draft: { ...state.draft, prof: action.update(state.draft.prof) } };
        case "geo": return { ...state, draft: { ...state.draft, geo: action.update(state.draft.geo) } };
        case "bank": return { ...state, draft: { ...state.draft, bank: action.update(state.draft.bank) } };
      }
    case "saved":
      return initialDraft(action.saved);
    case "replace":
      return initialDraft(state.latest);
    case "merge": {
      const prof = { ...state.latest.prof };
      for (const key of Object.keys(prof) as (keyof Profile)[]) {
        if (!sameDraftValue(state.draft.prof[key], state.baseline.prof[key])) {
          Object.assign(prof, { [key]: state.draft.prof[key] });
        }
      }
      // Coverage and bank details are dependent groups: never mix an IBAN with
      // another bank, or district selections with another city.
      return {
        baseline: state.latest, latest: state.latest,
        draft: {
          prof,
          geo: sameDraftValue(state.draft.geo, state.baseline.geo) ? state.latest.geo : state.draft.geo,
          bank: sameDraftValue(state.draft.bank, state.baseline.bank) ? state.latest.bank : state.draft.bank,
        },
      };
    }
  }
}
