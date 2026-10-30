# Knight Wallet lists (the admin backend)

The files in `lists/` control what the app shows. The app downloads them from this
repo every time it opens, so a change reaches phones without a new app build.

| File | What it controls |
| --- | --- |
| `dapps.json` | The dApps on the Explore tab |
| `tokens.json` | The tokens shown in everyone's wallet (besides the main coins) |
| `blocklist.json` | Scam tokens and NFTs that get hidden, and scam websites the dApp browser blocks |
| `banners.json` (+ pictures in `banners/`) | Promo banners on the Home screen, Explore tab or Swap screen |
| `app-config.json` | Messages to all users, emergency off switches, and the "please update" prompt |

**Scam websites** come from two free public lists, rebuilt every day by the
"Scam websites" workflow and published on the
[scam-sites release](https://github.com/stefanxbt/knight-wallet-lists/releases/tag/scam-sites):
[MetaMask eth-phishing-detect](https://github.com/MetaMask/eth-phishing-detect)
(DBAD licence) and [ScamSniffer scam-database](https://github.com/scamsniffer/scam-database)
(GPL-3.0). Our own `blocklist.json` is checked first and always wins.

Nothing about users is ever sent here. These are public lists that every phone
downloads the same way, which keeps the wallet non-custodial.

## Admin panel

**[Open the admin panel](https://stefanxbt.github.io/knight-wallet-lists/admin/)**
to see everything at a glance: which features are on, which banners and
messages are showing, all dApps, tokens and blocked scams, and anything that
needs you. Every button opens the right form already filled in, so you only
press **Create**.

## How to make a change (no coding)

Click one of these links, fill in the form and press **Create**. A robot makes
the change within about a minute, replies on the page and closes it.

- [Add a dApp](https://github.com/stefanxbt/knight-wallet-lists/issues/new?template=1-add-dapp.yml)
- [Remove a dApp](https://github.com/stefanxbt/knight-wallet-lists/issues/new?template=2-remove-dapp.yml)
- [Add a token](https://github.com/stefanxbt/knight-wallet-lists/issues/new?template=3-add-token.yml)
- [Remove a token](https://github.com/stefanxbt/knight-wallet-lists/issues/new?template=4-remove-token.yml)
- [Block a scam token, NFT or website](https://github.com/stefanxbt/knight-wallet-lists/issues/new?template=5-block-scam.yml)
- [Unblock something](https://github.com/stefanxbt/knight-wallet-lists/issues/new?template=6-unblock.yml)
- [Add a banner](https://github.com/stefanxbt/knight-wallet-lists/issues/new?template=7-add-banner.yml)
- [Switch a banner on or off](https://github.com/stefanxbt/knight-wallet-lists/issues/new?template=8-switch-banner.yml)
- [Remove a banner](https://github.com/stefanxbt/knight-wallet-lists/issues/new?template=9-remove-banner.yml)
- [Send a message to all users](https://github.com/stefanxbt/knight-wallet-lists/issues/new?template=10-send-message.yml)
- [Switch a message on, off or delete it](https://github.com/stefanxbt/knight-wallet-lists/issues/new?template=11-switch-message.yml)
- [Emergency switch: turn a feature off for everyone](https://github.com/stefanxbt/knight-wallet-lists/issues/new?template=12-emergency-switch.yml)
- [Ask users to update](https://github.com/stefanxbt/knight-wallet-lists/issues/new?template=13-ask-to-update.yml)

For **Add a token**, you usually only need the network and the contract
address. The robot reads the symbol, name and decimals from the network itself
(on Solana it can only read the decimals, so type the symbol and name there).

If something is wrong (for example a mistyped address), the robot replies with
what to fix and changes nothing.

Anyone can use the forms to report a scam. Requests from people other than the
owner wait until the owner adds the **approved** label on the right side of the
page.

## Banners

Each banner has a title, one line of text, a link, an optional picture, and a
place where it shows. It is either switched **on** or **off**, and can have a
first and last day. A banner only shows while it is on and inside its days, so
you can keep some running and others ready but switched off. After every banner
change, the robot replies with a table of all banners and whether each one is
showing.

The app never counts views or taps and sends nothing back. If a partner wants to
know how many people came from Knight Wallet, use their referral link as the
banner link: they count the visits on their side.

## Messages, switches and updates

- **Messages** show in the app for everyone: *Info* for news, *Warning* for
  "be careful", *Critical* for urgent things like a scam going around (shown on
  top in red). Like banners, they can have a first and last day.
- **Emergency switches** turn Swaps, WalletConnect, the dApp browser or Sending
  off for everyone right away, for example while a partner service has
  problems. They can only switch things off and back on. They can never turn on
  something the app itself keeps off, like sending real money before the
  security audit.
- **Ask users to update** shows an update prompt to everyone below a version
  you choose, for example after an important fix.

## Weekly check-up

Every Monday the robot opens one "Weekly check-up" issue. GitHub emails it to
you. It lists anything that needs attention:
- dApp or banner links that stopped working or are now on MetaMask's scam list
- banners and messages that ended but are still on, or that start or end soon
- requests from other people that are waiting for your **approved** label

If nothing needs doing, it says so. You can also run it any time: open
**Actions**, then **Weekly check-up**, then **Run workflow**.

## Built-in safety

- Every change is checked before it is saved: addresses must be valid for their
  network, dApps must use `https://`, and nothing can be listed twice.
- If the download fails, the app uses the copy built into it.
- A download can only add blocks, never remove ones that were built into the
  app. So if a block was already built into the app, unblocking it reaches
  phones with the next app update.
- Tokens that are on neither list (for example random airdropped tokens) are not
  shown at all, which is how most scam tokens are kept out.
- Banners are never built into the app. If the download fails, no banners
  show, so a banner you switched off can never come back. Banners whose link is
  on the scam blocklist are hidden.
- Scam websites are also checked against MetaMask's open-source phishing list
  (about 113,000 known scam sites), right on the phone.
