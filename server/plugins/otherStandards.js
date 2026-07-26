export let otherStandardsList = [];
export const OTHER_STANDARDS = otherStandardsList;
export function updateLiveOtherStandards(newList) {
  if (Array.isArray(newList)) {
    otherStandardsList = newList;
  }
  return otherStandardsList;
}
