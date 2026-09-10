'use strict';
var MTG = globalThis.MTG || (globalThis.MTG = {});
// Individual native implementations reviewed against the pinned Oracle source.
// Executable coverage: tests/restricted-legacy-*.test.mjs.
MTG.REVIEWED_LEGACY_IMPORTS = Object.freeze({
  "Boros Reckoner": {
    "oracleId": "5f079a75-899e-467d-b443-3b87ce2fb548",
    "scryfallId": "55a2f767-5928-44c5-91b7-2300bade458f",
    "review": "restricted-legacy-2026-09-10",
    "sourceSha256": "a85e1309439fcaca2639b5eaf0cd2f71a0f4de8bd3926617fae3eded1dda5528"
  },
  "Darien, King of Kjeldor": {
    "oracleId": "d05336cb-6157-47e7-942f-43becd67a5bf",
    "scryfallId": "50875c99-c5c3-41dd-a0f9-08c98edfebc9",
    "review": "restricted-legacy-2026-09-10",
    "sourceSha256": "a85e1309439fcaca2639b5eaf0cd2f71a0f4de8bd3926617fae3eded1dda5528"
  },
  "Feather, Radiant Arbiter": {
    "oracleId": "957413ae-e756-4afe-886a-b57bf59d5f8d",
    "scryfallId": "d763695b-c184-409d-962d-5aaf39a6264e",
    "review": "restricted-legacy-2026-09-10",
    "sourceSha256": "a85e1309439fcaca2639b5eaf0cd2f71a0f4de8bd3926617fae3eded1dda5528"
  },
  "Fiendish Duo": {
    "oracleId": "ab0dfae5-b9d4-417b-8a0d-2525ae3a73b9",
    "scryfallId": "ebb44595-56f6-4be5-80bb-618ddd320f4a",
    "review": "restricted-legacy-2026-09-10",
    "sourceSha256": "a85e1309439fcaca2639b5eaf0cd2f71a0f4de8bd3926617fae3eded1dda5528"
  },
  "Gideon's Sacrifice": {
    "oracleId": "1af63a5e-2bec-4f8d-a373-d9ce43a7d242",
    "scryfallId": "d483b409-1853-4456-a077-daeb77e165ba",
    "review": "restricted-legacy-2026-09-10",
    "sourceSha256": "a85e1309439fcaca2639b5eaf0cd2f71a0f4de8bd3926617fae3eded1dda5528"
  },
  "Havoc Eater": {
    "oracleId": "769c511c-37ce-4a9d-85f8-1ba91c2daf82",
    "scryfallId": "17054e75-d801-4962-83c1-0b52e7b65f66",
    "review": "restricted-legacy-2026-09-10",
    "sourceSha256": "a85e1309439fcaca2639b5eaf0cd2f71a0f4de8bd3926617fae3eded1dda5528"
  },
  "Hot Pursuit": {
    "oracleId": "00bf9859-d5bf-455a-a4be-965ea4250c7e",
    "scryfallId": "bbba7b9f-d944-4987-b60d-34733382ec53",
    "review": "restricted-legacy-2026-09-10",
    "sourceSha256": "a85e1309439fcaca2639b5eaf0cd2f71a0f4de8bd3926617fae3eded1dda5528"
  },
  "Immortal Obligation": {
    "oracleId": "b34080fe-69d1-4cc9-9feb-c37762f26a23",
    "scryfallId": "bdadc60f-942f-47e2-b8fc-51deb3d0b86d",
    "review": "restricted-legacy-2026-09-10",
    "sourceSha256": "a85e1309439fcaca2639b5eaf0cd2f71a0f4de8bd3926617fae3eded1dda5528"
  },
  "Labyrinth of Skophos": {
    "oracleId": "9ec5a487-d8ed-459a-8f58-56f6e9a2dfe8",
    "scryfallId": "388169df-4cce-452d-9215-e3f814ff4fdf",
    "review": "restricted-legacy-2026-09-10",
    "sourceSha256": "a85e1309439fcaca2639b5eaf0cd2f71a0f4de8bd3926617fae3eded1dda5528"
  },
  "Loran of the Third Path": {
    "oracleId": "b3d81980-76f2-44e2-b1c9-01e30c726312",
    "scryfallId": "9e83a0ef-4fea-45ba-86c0-130d6687f7fe",
    "review": "restricted-legacy-2026-09-10",
    "sourceSha256": "a85e1309439fcaca2639b5eaf0cd2f71a0f4de8bd3926617fae3eded1dda5528"
  },
  "Mob Verdict": {
    "oracleId": "cb91e09e-f7fb-44bc-b78f-de29705bd2d6",
    "scryfallId": "e9bdc40b-ab7a-44a4-afb5-41b6fc2dffdc",
    "review": "restricted-legacy-2026-09-10",
    "sourceSha256": "a85e1309439fcaca2639b5eaf0cd2f71a0f4de8bd3926617fae3eded1dda5528"
  },
  "Nelly Borca, Impulsive Accuser": {
    "oracleId": "7ef5b2b6-86da-4e4a-9456-dcbb878936c4",
    "scryfallId": "2ef59aa9-f5e1-413a-869b-d287db95efd0",
    "review": "restricted-legacy-2026-09-10",
    "sourceSha256": "a85e1309439fcaca2639b5eaf0cd2f71a0f4de8bd3926617fae3eded1dda5528"
  },
  "Otherworldly Escort": {
    "oracleId": "c0ebc1df-51ea-413b-bb88-7666a53ad783",
    "scryfallId": "b50bfde2-6c2d-403e-ab47-c932bcb2116d",
    "review": "restricted-legacy-2026-09-10",
    "sourceSha256": "a85e1309439fcaca2639b5eaf0cd2f71a0f4de8bd3926617fae3eded1dda5528"
  },
  "Prisoner's Dilemma": {
    "oracleId": "fecbbc79-2f74-46b3-a049-45736f904f58",
    "scryfallId": "d678e736-7c29-433a-9a2a-b78749252377",
    "review": "restricted-legacy-2026-09-10",
    "sourceSha256": "a85e1309439fcaca2639b5eaf0cd2f71a0f4de8bd3926617fae3eded1dda5528"
  },
  "Redemption Arc": {
    "oracleId": "c22e5fc6-9b4e-4197-b472-70d168eb4330",
    "scryfallId": "49326de1-d3b0-4f2b-95bc-5f2878e14a89",
    "review": "restricted-legacy-2026-09-10",
    "sourceSha256": "a85e1309439fcaca2639b5eaf0cd2f71a0f4de8bd3926617fae3eded1dda5528"
  },
  "Take the Bait": {
    "oracleId": "5d39cce9-afa1-422a-8e6c-8f50c710a681",
    "scryfallId": "97425844-dd1b-4f3c-985c-e198e8b9a16b",
    "review": "restricted-legacy-2026-09-10",
    "sourceSha256": "a85e1309439fcaca2639b5eaf0cd2f71a0f4de8bd3926617fae3eded1dda5528"
  },
  "Trouble in Pairs": {
    "oracleId": "f349f58b-8cc8-45e4-9565-2b46fdf976c9",
    "scryfallId": "0f61e93f-5f97-4c7d-b3d5-0e05242faeb3",
    "review": "restricted-legacy-2026-09-10",
    "sourceSha256": "a85e1309439fcaca2639b5eaf0cd2f71a0f4de8bd3926617fae3eded1dda5528"
  },
  "Vow of Lightning": {
    "oracleId": "bfed67f3-70d2-49c2-8f25-16e4d10fa5be",
    "scryfallId": "a0742d43-8a67-4485-b0ce-5a4e057fa915",
    "review": "restricted-legacy-2026-09-10",
    "sourceSha256": "a85e1309439fcaca2639b5eaf0cd2f71a0f4de8bd3926617fae3eded1dda5528"
  }
});
