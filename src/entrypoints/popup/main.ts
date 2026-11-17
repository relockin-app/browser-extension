import { mount } from 'svelte';
import App from './App.svelte';
import './app.css';

document.documentElement.lang = browser.i18n.getUILanguage();

function loadFont(fileName: string, fontName: string, weightRange: string) {
  const url = browser.runtime.getURL(`fonts/${fileName}` as any);
  const style = document.createElement('style');
  style.textContent = `
    @font-face {
      font-family: '${fontName}';
      src: url('${url}') format('truetype');
      font-weight: ${weightRange};
    }
  `;
  document.head.appendChild(style);
}

loadFont('CascadiaCode-VariableFont_wght.ttf', 'CascadiaCode', '200 700');
loadFont('DMSans-VariableFont_opsz,wght.ttf', 'DM Sans', '100 900');

const app = mount(App, {
  target: document.getElementById('app')!,
});

export default app;
