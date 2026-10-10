# Terra Board

A classroom board for Terra School at Serenbe: drag-and-resize widgets on one screen, with the bell schedule as the main widget. Installable on a tablet, phone or TV browser; hosted free on GitHub Pages.

**This is a separate project from the original `bell-schedule` app. Deploy it in its own repository so the two never overwrite each other.**

## Deploy (new repository, about 10 minutes)

1. On github.com click **+** > **New repository**. Name it `terra-board`. Set it to **Public**. Do not add a README. Click **Create repository**.
2. Unzip `terra-board.zip`. Open the `terra-board` folder.
3. In the new repository click **Add file > Upload files**. Drag in **all 12 files** from inside the folder (not the folder itself) so they sit at the top level. Click **Commit changes**.
4. Go to **Settings > Pages**. Under "Build and deployment" choose **Deploy from a branch**, branch `main`, folder `/ (root)`. Save.
5. After 1 to 2 minutes the page shows your address: `https://YOUR-USERNAME.github.io/terra-board/`
6. Open it on each room's device, then install it (Chrome: menu > Install app. iPad/iPhone Safari: Share > Add to Home Screen).
7. On each launch, tap **Start with sound** once. Browsers will not play audio until someone taps the page.

Your original bell-schedule repository and its address are not affected.

## Using the board

- **Edit layout** (in the Menu) shows controls on every widget. Drag a widget to move it. Drag the gold corner to resize. **Settings** and **Remove** appear at the top of each widget. **Add widget** and **Reset layout** appear in a bar along the bottom while you edit. A new widget goes into an empty spot; if the board is full it appears in the middle, on top of the others, so drag it where you want it. Tap **Done editing** when finished.
- Tap the **bell widget** to flip between the countdown ring and the full day's schedule.
- A small **Menu** button sits in the top-right corner. Tap it to open a short panel with Edit layout, Theme, Sound, Test bell and Full screen. The panel closes when you tap anywhere else, or by itself after 8 seconds. Nothing ever sits across the bottom of the board, so every control on the bottom row stays tappable.
- The Menu button fades after 4 seconds so the room only sees the board. Tap the corner once to bring it back. That first tap only wakes the button; it will not press anything behind it.
- **Theme** (in the Menu) cycles Forest, Slate, Dusk, Paper and Black.
- **Test bell** (in the Menu) plays the chime so you can check the volume.

### Widgets

Bell schedule, Clock, Date, Timer, Stopwatch, Notepad, Traffic light, Work symbols, Name picker.

## Changing the bell times

Edit `schedule.json` in the repository on github.com (open the file, click the pencil, edit, commit). Times are 24-hour, for example `13:45`. Open boards pick up the change within 5 minutes, or on reload. The file also holds:

- `preStartMinutes` and `preStartWarningMinutes`: the countdown before the first period, and the point within it where the warning chime sounds (set either to `0` to turn it off).
- `dayOverrides`: Tuesday's Specials block is split into Government (11:15 to 11:45) and Advisory (11:45 to 12:15).

## Things to know

- **Layouts are saved per device.** Each room's board remembers its own layout, notes and name list in that device's browser. Changing the layout on one device does not change the others. The bell times are the only thing shared (through `schedule.json`).
- **Student names stay on the device.** The name picker saves its list only in the browser's local storage. Nothing is uploaded and nothing goes into the repository. Clearing the browser's site data erases it. Do not paste names into any file in a public repository.
- **The bell rings on every board that is open and unlocked.** If two boards are open in the same room you will hear both. The bell sounds even if the Bell schedule widget has been removed from that board; use **Sound** in the toolbar to silence a device.
- **Late wake-ups do not cause late bells.** If a device was asleep through a bell and wakes more than 15 seconds late, it stays silent rather than ringing at the wrong time.
- **The screen must stay on.** The board asks the device to keep the screen awake. This works in recent Chrome and Safari but is a request, not a guarantee, so test it on each device. A locked or sleeping device cannot ring the bell.
- **Each device uses its own clock.** Set all devices to automatic network time so the rooms stay in step.
- **Fonts** load from Google Fonts. Without internet the board falls back to the device's standard fonts.

## Updating the code later

Whenever any code file changes (`index.html`, `style.css`, `app.js`, `widgets.js`, `bell-engine.js`, `audio.js`), also change the number in `service-worker.js` (`terra-board-v2` to `terra-board-v3`, and so on). Without that, installed devices keep running the old copy. Then close and reopen the installed app on each device.

## Files

`index.html`, `style.css`: page and styling. `app.js`: grid, drag and resize, toolbar, saving. `widgets.js`: the nine widgets. `bell-engine.js`: schedule logic and chime timing. `audio.js`: bell and timer sounds. `schedule.json`: bell times. `manifest.json`, `service-worker.js`, `icon-192.png`, `icon-512.png`: installability and offline loading.
