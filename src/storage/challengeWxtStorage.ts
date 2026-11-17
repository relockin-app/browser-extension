import type { ChallengeStorage } from "./challengeInterface";
import type {
  ChallengeDifficultySpec,
  ChallengeOverride,
  TriggerDefaultDifficulty,
} from "~/types/challengeModels";
import { withKeyLock } from "./keyLock";

// ── Storage keys ────────────────────────────────────────────────────

const SPECS_KEY = "local:relockrChallengeSpecs";
const OVERRIDES_KEY = "local:relockrChallengeOverrides";
const TRIGGER_DEFAULTS_KEY = "local:relockrTriggerDefaults";

// ── Helpers ─────────────────────────────────────────────────────────

async function loadSpecs(): Promise<ChallengeDifficultySpec[]> {
  return (
    (await storage.getItem<ChallengeDifficultySpec[]>(SPECS_KEY)) ?? []
  );
}

async function saveSpecs(specs: ChallengeDifficultySpec[]): Promise<void> {
  await storage.setItem(SPECS_KEY, specs);
}

async function loadOverrides(): Promise<ChallengeOverride[]> {
  return (
    (await storage.getItem<ChallengeOverride[]>(OVERRIDES_KEY)) ?? []
  );
}

async function saveOverrides(overrides: ChallengeOverride[]): Promise<void> {
  await storage.setItem(OVERRIDES_KEY, overrides);
}

async function loadTriggerDefaults(): Promise<TriggerDefaultDifficulty[]> {
  return (
    (await storage.getItem<TriggerDefaultDifficulty[]>(
      TRIGGER_DEFAULTS_KEY,
    )) ?? []
  );
}

async function saveTriggerDefaults(
  tds: TriggerDefaultDifficulty[],
): Promise<void> {
  await storage.setItem(TRIGGER_DEFAULTS_KEY, tds);
}

// ── Implementation ──────────────────────────────────────────────────

export function createWxtChallengeStorage(): ChallengeStorage {
  return {
    // ── Specs ─────────────────────────────────────────────────────

    async getAllSpecs() {
      return loadSpecs();
    },

    async getSpec(id) {
      const specs = await loadSpecs();
      return specs.find((s) => s.id === id) ?? null;
    },

    async getSpecByName(name) {
      const specs = await loadSpecs();
      return specs.find((s) => s.name === name) ?? null;
    },

    async upsertSpec(spec) {
      return withKeyLock(SPECS_KEY, async () => {
        const specs = await loadSpecs();
        let idx = specs.findIndex((s) => s.id === spec.id);
        // Names are unique: a new spec whose name is taken updates that row
        // (keeping its id) rather than adding a second spec with the name.
        if (idx === -1) idx = specs.findIndex((s) => s.name === spec.name);
        const persisted = idx === -1 ? spec : { ...spec, id: specs[idx].id };
        if (idx === -1) {
          specs.push(persisted);
        } else {
          specs[idx] = persisted;
        }
        await saveSpecs(specs);
        return persisted;
      });
    },

    async deleteSpec(id) {
      await withKeyLock(SPECS_KEY, async () => {
        const specs = await loadSpecs();
        await saveSpecs(specs.filter((s) => s.id !== id));
      });

      // Cascade: remove overrides and trigger defaults referencing this spec
      await withKeyLock(OVERRIDES_KEY, async () => {
        const overrides = await loadOverrides();
        await saveOverrides(overrides.filter((o) => o.specId !== id));
      });

      await withKeyLock(TRIGGER_DEFAULTS_KEY, async () => {
        const tds = await loadTriggerDefaults();
        await saveTriggerDefaults(tds.filter((td) => td.specId !== id));
      });
    },

    // ── Per-Rule Overrides ────────────────────────────────────────

    async getOverridesForRule(ruleId) {
      const overrides = await loadOverrides();
      return overrides.filter((o) => o.ruleId === ruleId);
    },

    async upsertOverride(override) {
      return withKeyLock(OVERRIDES_KEY, async () => {
        const overrides = await loadOverrides();
        const idx = overrides.findIndex((o) => o.id === override.id);
        if (idx !== -1) {
          overrides[idx] = override;
        } else {
          overrides.push(override);
        }
        await saveOverrides(overrides);
        return override;
      });
    },

    async deleteOverride(id) {
      await withKeyLock(OVERRIDES_KEY, async () => {
        const overrides = await loadOverrides();
        await saveOverrides(overrides.filter((o) => o.id !== id));
      });
    },

    async deleteOverridesForRule(ruleId) {
      await withKeyLock(OVERRIDES_KEY, async () => {
        const overrides = await loadOverrides();
        await saveOverrides(overrides.filter((o) => o.ruleId !== ruleId));
      });
    },

    // ── Global Trigger Defaults ───────────────────────────────────

    async getAllTriggerDefaults() {
      return loadTriggerDefaults();
    },

    async getTriggerDefault(trigger) {
      const tds = await loadTriggerDefaults();
      return tds.find((td) => td.trigger === trigger) ?? null;
    },

    async upsertTriggerDefault(td) {
      return withKeyLock(TRIGGER_DEFAULTS_KEY, async () => {
        const tds = await loadTriggerDefaults();
        const idx = tds.findIndex((t) => t.id === td.id);
        if (idx !== -1) {
          tds[idx] = td;
        } else {
          tds.push(td);
        }
        await saveTriggerDefaults(tds);
        return td;
      });
    },

    async deleteTriggerDefault(id) {
      await withKeyLock(TRIGGER_DEFAULTS_KEY, async () => {
        const tds = await loadTriggerDefaults();
        await saveTriggerDefaults(tds.filter((t) => t.id !== id));
      });
    },
  };
}
