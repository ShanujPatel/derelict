/** The field manual in the hub's LOG tab: controls and a guide to what's aboard. Static content. */

const CONTROLS: [string, string, string, string][] = [
  ['Move', 'WASD / arrows', 'Left thumb', 'Left stick'],
  ['Aim and fire', 'Mouse, left click', 'Right thumb (push to fire)', 'Right stick, RT'],
  ['Swap gun', 'Q, 1 / 2, wheel', 'GUN', 'Y'],
  ['Use tool', 'F, right click', 'Tool button', 'X or RB'],
  ['Dodge roll', 'Shift or Space', 'ROLL', 'A or LB'],
  ['Scanner map', 'Tab', 'MAP', 'Back or B'],
  ['Pause', 'Esc or P', 'II', 'Start'],
  ['Mute', 'M', '(pause menu)', '(pause menu)'],
];

const GUIDE: [string, string][] = [
  ['Patrol drone', 'Hovers after you once it spots you. Shock floors can’t touch it.'],
  ['Wall turret', 'Bolted to the wall, fires bursts. Hack it to make it yours.'],
  ['Mimic crate', 'Looks like salvage, bites when you get close. Your scanner won’t show it as loot.'],
  ['Crawler', 'Fast and fragile. Smells you round corners.'],
  ['Stalker', 'Cloaked crawler cousin: just a shimmer until it’s on you. Hitting it lights it up.'],
  ['Spitter', 'Lobs acid and backs off when you close in.'],
  ['Egg sac', 'Keeps hatching crawlers while it can see you.'],
  ['Sapper (mining haulers)', 'Keeps its distance and lays proximity mines behind it. A blinking mine goes off a moment after you get close.'],
  ['Sweeper laser (mining haulers)', 'A cutting beam that sweeps round its room. Cross behind it or roll through. Hack it and it burns hostiles.'],
  ['Ore vein (mining haulers)', 'The cracked rock on mining haulers: cut it with the torch, or blast it, for salvage.'],
  ['Gravecutter raider', 'Boards mid-run, steals loose salvage. Kill it to get your loot back.'],
  ['Gravecutter brute', 'Riot shield blocks shots from the front: flank, stun, railgun or arc it.'],
  ['Elite (gold)', 'Double health, a bit faster, always drops extra salvage.'],
  ['Bounty (pink, named)', 'Tougher still, tracked on your scanner, worth a big payout.'],
  ['Fuel drum', 'Two hits and it blows: hurts everything nearby and opens cracked walls.'],
  ['Shock floor', 'Flickers, then goes live. Cross while it’s dark, or roll over it.'],
  ['Lift (purple pad)', 'Takes you to a deeper, richer, nastier deck. You keep what you carry.'],
];

export function manualSection(): string {
  const rows = CONTROLS.map(([a, k, t, p]) => `<tr><th>${a}</th><td>${k}</td><td>${t}</td><td>${p}</td></tr>`).join('');
  const guide = GUIDE.map(([name, what]) => `<li><b>${name}</b><span>${what}</span></li>`).join('');
  return `<section class="hub-section"><h3>Field manual</h3>
    <details class="manual">
      <summary>Controls</summary>
      <div class="manual-scroll"><table class="controls">
        <thead><tr><th></th><th>Keyboard + mouse</th><th>Touch</th><th>Gamepad</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
    </details>
    <details class="manual">
      <summary>What's aboard</summary>
      <ul class="guide">${guide}</ul>
    </details>
  </section>`;
}
