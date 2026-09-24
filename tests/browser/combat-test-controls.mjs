// Catalog-specific regressions still exercise the optional detailed overview.
// Battlefield defaults are covered by battlefield-combat and player-gameplay.
export async function openCombatOverview(page) {
  const details = page.locator('.ct-combat-dock [data-testid="back-to-combat-overlay"]:visible');
  if (await details.count()) await details.click();
}
