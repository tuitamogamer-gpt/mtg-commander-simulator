# Mobile blocker cards — 28 September 2026

The mobile Combat tab makes defense explicit: tap an incoming attacker, then
the creatures in **Your blockers**. The roster counts assigned creatures, and
the existing blocker-first flow remains available. Assignments still use the
same legality checks and explicit **Block** confirmation.

Each assigned blocker now appears beneath its attacker with its actual card
art, current power/toughness and combat keywords. Tapping that card inspects it;
a separate 44px remove button edits only that assignment. After confirmation,
the public combat view retains the attacker/blocker card groups for inspection
during responses. Declared blocks have no removal controls. A blocker leaving
combat disappears from the group while the attacker remains marked blocked.
Unblocked attackers are identified during the post-block priority window.

The attack review explains that incoming defense opens in Combat after
responses. Review cards fill the phone panel width. The changes are scoped to
mobile presentation; combat rules, declaration timing and desktop controls
are unchanged.

## Validation

- Syntax checks and `git diff --check`: pass.
- Nine focused suites covering command-table, player tools, responsive UI,
  combat controls, drag controls, frontend, baseline and combat restrictions/
  assignments: **70 pass, 0 fail**.
- Chromium and WebKit combat acceptance: **14 check groups pass per browser**,
  including 320×568, 390×844, 844×390, 768×1024 and desktop 1280×720. Coverage
  includes both selection directions, menace, flying, exact declarations,
  inspect versus remove, retained navigation, real declared-blocker artwork,
  read-only confirmed assignments and a blocker leaving combat.
- Mobile navigation acceptance: **8 check groups pass**, including seeded Solo
  land play, empty/large hands, one to three opponents and desktop restoration.
- Four isolated Live clients: every seat attacks and blocks on a phone, every
  defending phone receives the declared blocker card beneath the right attacker,
  and all three guests recover their draft after reloading. Authoritative
  damage/life checks, manual payment, private choices and hidden-zone isolation
  pass. No browser errors in any of the browser suites.
- `npm.cmd run audit`, `npm.cmd run certify:strict` and
  `npm.cmd audit --omit=dev --audit-level=high`: pass. Certification checks
  25,792 card definitions and 14,566 card/deck combinations. No npm
  vulnerabilities; timestamp-only report changes were discarded.

The work starts from `ee46bbc` in an isolated checkout. Existing edits in the
original MTG checkout are excluded. The previous verified production deployment
is `dpl_325ymEJ49kFdmXRKHxiDdZTamwpu`.

Browser screenshots, command logs and the release verification record are kept
under `.local/mobile-blockers-2026-09-28/` in the original MTG checkout. Production
verification compares the shipped source bytes with this release and checks the
canonical https://mtgpod.xyz/ redirect, signed-out account and Redis Live health.

The full engine simulation sweep was not rerun for this interface change.
WebKit automation is not a physical iPhone test.
