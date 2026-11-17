<p align="center">
  <img src="public/images/iconOutline48.png" alt="RelockIn logo" width="48" height="48">
</p>

<h1 align="center">RelockIn for Web</h1>

<p align="center">
  Block AI videos, YouTube Shorts, Instagram Reels and endless feeds on the sites you already use.<br>
  Plus time limits and schedules for any website. Free for Chrome, Firefox and Chromium-based browsers on your PC.
</p>

<p align="center">
  <a href="https://chromewebstore.google.com/detail/relockin-block-websites-s/claapejehbiikjaehheghcgofhbnllng">Chrome Web Store</a> ·
  <a href="https://addons.mozilla.org/firefox/addon/relockin/">Firefox Add-ons</a> ·
  <a href="https://relockin.com">relockin.com</a>
</p>

This is the source code of the RelockIn browser extension. We publish it for trust and transparency, so anyone can check how RelockIn changes the sites it supports, what it stores on your device and what it sends to our servers.

## What it does

**Remove distractions.** Over 40 options, so you turn on only what you want:

- **YouTube:** hide Shorts, the Home feed, recommended videos and video previews. Turn off autoplay. Blur or grey out thumbnails.
- **Instagram:** hide the Reels tab, Stories, comments, ads and videos in your feed. Cover posts from accounts you don't follow.
- **Reddit:** hide Popular, All or every feed. Limit Home to subreddits you've joined. Switch to Old Reddit.
- **LinkedIn:** hide posts from strangers, promoted posts, and images and videos in your feed.
- **X:** hide the For You tab and ads.

**Block AI content.** Spot AI YouTube channels with a community-voted list, and choose whether their videos are labelled, covered or hidden.

**Limit any website.** Choose how long you'll stay before each visit, and get locked out when time's up. Add daily limits, schedules for sleep or work, and breaks after too many sessions in a row.

**Protect your setup.** Require a challenge, like typing a paragraph, solving math problems or emailing a friend, before you delete a rule or override a schedule.

**Private by design.** No ads, and no account needed. AI checks run in your browser, and your browsing history is never uploaded. See the [extension's privacy policy](https://relockin.com/privacy-policy/extension).

## On your phone too

RelockIn is also a browser and screen time app for iPhone and Android, with the same site customizations plus time limits for apps.

<p>
  <a href="https://apps.apple.com/us/app/id6759315272"><img src="public/images/AppleStoreButton.svg" alt="Download on the App Store" height="44"></a>
  <a href="https://play.google.com/store/apps/details?id=com.storiator.relockin.androidbrowser"><img src="public/images/GooglePlayButton.svg" alt="Get it on Google Play" height="44"></a>
</p>

## Support and feedback

- **Help with RelockIn or your account:** visit [relockin.com/support](https://relockin.com/support).
- **Bugs and feature requests:** [open an issue](https://github.com/relockin-app/browser-extension/issues) on GitHub. This includes wrong or awkward translations; tell us the language and where the text appears.
- **Community:** chat with other users on our [Discord](https://discord.gg/HARDPXTjqp).

## Contributing

We aren't accepting code contributions. This repository is a copy of each release, so pull requests can't be merged here. Bug reports, feature requests and feedback are always welcome, through any of the channels above.

## Building from source

Requires Node.js 22.12 or later and pnpm 9 (`corepack enable` picks the pinned version). Works on Windows, macOS and Linux.

```bash
pnpm install --frozen-lockfile
pnpm build            # Chrome, written to .output/chrome-mv3/
pnpm build:firefox    # Firefox, written to .output/firefox-mv2/
```

No environment variables or other setup are needed. `pnpm zip:firefox` also creates the add-on zip and the sources zip for addons.mozilla.org in `.output/`.

To try a build, load the output folder as an unpacked extension (`chrome://extensions` with Developer mode on) or as a temporary add-on (`about:debugging` in Firefox).

The translations in `public/_locales/` and `src/shared/dom/generated/siteLabels.ts` are generated from a separate repository, but are committed here, so the build doesn't need it.

## License

RelockIn is source-available, not open source. You can install it from the official stores, read the code, and build it for your own personal, non-commercial use. Copying, redistributing, making derivative works and using the code to train AI models aren't allowed. See [LICENSE.md](LICENSE.md) for the full terms.

Third-party names, logos, badges and fonts in this repository aren't covered by that license. See [TRADEMARKS.md](TRADEMARKS.md).
