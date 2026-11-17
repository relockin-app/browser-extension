<script lang="ts">
  // Dev builds only, so not translated. Switches between what a phone user
  // (the free version) and a computer user see, everywhere at once: the popup,
  // onboarding and the customizations applied on sites.
  import { onMount } from "svelte";
  import {
    getDeviceOverride,
    setDeviceOverride,
    type DeviceOverride,
  } from "~/shared/pro/proAccess";
  import { useProAccess } from "./proAccess.svelte";

  const ORDER: (DeviceOverride | null)[] = [null, "phone", "computer"];

  const pro = useProAccess();
  let override = $state<DeviceOverride | null>(null);

  onMount(async () => {
    override = await getDeviceOverride();
  });

  async function cycle(): Promise<void> {
    override = ORDER[(ORDER.indexOf(override) + 1) % ORDER.length];
    await setDeviceOverride(override);
  }

  const label = $derived(
    override === null ? `auto (${pro.access.isPhone ? "phone" : "computer"})` : override,
  );
</script>

<button class="dev-btn" onclick={cycle} title="Simulate the device: auto uses the real one">
  Device: {label}
</button>

<style>
  .dev-btn {
    all: unset;
    padding: 6px 12px;
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 6px;
    font-size: 13px;
    color: rgba(255, 255, 255, 0.7);
    cursor: pointer;
  }

  .dev-btn:hover {
    color: #fff;
  }
</style>
