# Hardened deepmerge

Based on TehShrike/deepmerge 4.3.1 (MIT). Local override for GHSA-gcqx-w48m-w2h4, which has no upstream patched release as of 2026-11-13.

The bundled upstream CJS implementation is preserved except that both target and source keys named `__proto__`, `constructor`, or `prototype` are rejected before copying. TON Connect merges only application-owned UI options. Regression tests cover poisoned target objects, null-prototype source objects, nested keys, array semantics and the TON Connect options merger. This is a local mitigation, not an upstream security release. Revisit when upstream ships a fix.
