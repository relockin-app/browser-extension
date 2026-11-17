<script lang="ts">
  // Shown in place of an add button once a phone user reaches the free
  // version's limit, pointing them at the app.
  import { phoneStore } from "~/shared/upsell/storeUrls";

  let { title }: { title: string } = $props();

  const appStore = phoneStore();
</script>

<div class="upsell">
  <p class="upsell-title">{title}</p>
  <a class="upsell-store" href={appStore.url} target="_blank" rel="noopener noreferrer">
    <img src={appStore.badge} alt={appStore.name} />
  </a>
</div>

<style>
  .upsell {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 8px 18px;
    text-align: center;
  }

  .upsell-title {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.9);
  }

  .upsell-store {
    display: inline-flex;
    transition: transform 0.15s ease;
  }

  .upsell-store:hover {
    transform: translateY(-1px);
  }

  .upsell-store img {
    height: 48px;
    width: auto;
  }
</style>
