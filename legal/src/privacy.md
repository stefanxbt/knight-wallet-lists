# Privacy Policy

**Knight Wallet** · Draft version 0.9 · 1 November 2026 · Awaiting lawyer review

This policy explains what personal data Knight Wallet ("Knight") handles, why, and your rights. Knight is made by **Dyrection LLC**, 5th Floor Genesis Building, Genesis Close, PO Box 446, Grand Cayman KY1-1106, Cayman Islands ("Dyrection", "we"). We are the controller of the data described here. Contact: privacy@dyrection.com.

## 1. The short version

- **No account needed, no sign-up, no name, no email, no phone number.** You use Knight without telling us who you are. Signing in with a BlackFort ID is optional (see below).
- **Your recovery phrase and private keys never leave your device.** We cannot see them.
- **No ads, no ad tracking, no selling of data.** Knight does not track you across other apps or websites.
- To work, Knight has to send **public wallet addresses** and some technical data (such as your IP address) to blockchain and service providers. This section explains each one.

## 2. What we handle, and why

| Data | When | Who receives it | Why | Legal basis (GDPR) |
| --- | --- | --- | --- | --- |
| Public wallet addresses and balances you look up | Every time Knight loads balances, history or prices | Blockchain data providers (Alchemy, public RPC nodes, block explorers, Solana, Tron and BlackFort nodes, mempool.space) | To show your balances and history and to send your signed transactions | Contract (providing the app) |
| Swap, bridge and trade requests (tokens, amounts, addresses) | When you ask for a quote or trade | LI.FI and the routes it uses; Jupiter; Hyperliquid; Polymarket. Swap quotes may pass through our gateway (Cloudflare) | To get prices and prepare the transaction you sign | Contract |
| Push token and the addresses you choose to watch | Only if you turn on alerts | Our alerts service on Cloudflare; Google Firebase Cloud Messaging; Apple Push Notification service; Alchemy (for transfer notices) | To send you alerts about incoming funds, prices and new app versions | Consent (you can turn alerts off at any time) |
| Token, address and website safety lookups | When you open a token, a link or a transaction to sign | Dyrection Shield, GoPlus Security (through our gateway) | To warn you about scams | Legitimate interest (your safety) |
| Country of your internet connection and your phone's region setting | When features that are limited by country open | Cloudflare (public trace page); Polymarket (its own location check) | To switch off features that are not allowed where you are, and to meet sanctions laws | Legal obligation and legitimate interest |
| IP address and basic request data (time, app version) | Any time Knight contacts a server | Every server Knight contacts, including ours on Cloudflare | Needed for the internet to work; short-lived security logs | Legitimate interest |
| Price and exchange-rate requests | When prices load | CoinGecko, DefiLlama, open.er-api.com | To show values in your currency | Contract |
| Feature lists and settings | Each time Knight opens | GitHub (where our public lists are hosted), through our Cloudflare cache | To show tokens, dApps, scam lists and switches | Legitimate interest |
| Knight Pro purchase status | Only if you subscribe | Apple App Store or Google Play | To give you Pro features | Contract |
| Error reports: what went wrong (error text and code location), app version, phone model and system version | When the app hits an error, unless you turn reports off in Settings > Security > Send error reports | Sentry (Functional Software, Inc.), stored in the EU (Germany) | To find and fix bugs | Legitimate interest (you can opt out at any time) |
| Feedback you send from the app (test builds): your words, a category, an optional name, an optional screenshot you choose to add, and the same app and phone details as error reports | Only when you tap Send in Send feedback (shake the phone or Settings > Help) | Sentry (Functional Software, Inc.), stored in the EU (Germany) | To fix what testers report | Consent (you choose what to send, and nothing is sent unless you tap Send) |
| Messages you send us | Only if you email us | Our email provider | To answer you | Legitimate interest |
| BlackFort ID account: name, email, account number and sign-in tokens | Only if you choose to sign in with BlackFort ID | BlackFort ID, run by BlackFort (a separate company), which holds your account. Knight keeps the sign-in tokens, your name and your email only on your phone | To sign you in to optional account features | Consent (you can sign out at any time) |

**Card purchases (Ramp, MoonPay).** When you buy or sell crypto with a card or bank transfer, the provider collects your identity and payment details itself, under its own privacy policy. We do not receive your card number or ID documents.

**BlackFort ID (optional).** If you sign in with BlackFort ID, you type your password on BlackFort's own page, not in Knight. BlackFort is an independent controller of your account data under its own privacy notice. Knight does not send your wallet addresses, keys or recovery phrase to BlackFort ID, and your wallet works fully without an account. Signing out deletes the sign-in tokens from your phone and asks BlackFort ID to cancel them.

**dApps and WalletConnect.** When you connect a dApp, that dApp and the WalletConnect relay see your public address and the requests you approve. They are independent controllers.

## 3. What stays only on your phone

Recovery phrase, private keys, PIN, address book, wallet names, settings, transaction notes, Ledger pairing and your list of approved testers or contacts stay on your device. Deleting the app removes them. Backups of the encrypted wallet may exist in your own phone backup if your phone is set to do so.

## 4. What we do not do

We do not use analytics or ad tracking, we do not use advertising IDs, we do not build profiles, and we do not sell or rent personal data. The only diagnostics are the error reports above: before a report leaves your phone, Knight removes recovery phrases, private keys, wallet addresses, transaction hashes, sign-in tokens and email addresses, and it never attaches a user profile. Error reports never include screenshots; feedback includes one only when you tick "Add a screenshot", and you see it before it is sent. A screenshot can show what was on screen (for example a balance or an address), so leave it off if you prefer. Like any internet request, Sentry sees the connection's IP address; Knight does not ask it to store it with the report. You can turn reports off in Settings > Security > Send error reports. If we add analytics later, we will update this policy and the store privacy labels first and ask for consent where the law requires it.

## 5. Cookies

The Knight app does not use cookies. The built-in browser stores cookies for the websites you visit, as any browser does; those websites decide what they store. Our public web pages (such as this one) do not use tracking cookies.

## 6. How long we keep data

- Alert registrations (push token and watched addresses): until you turn alerts off, or 12 months after your app last checked in.
- Gateway and security logs at Cloudflare: up to 30 days. [CHECK: confirm Cloudflare log retention setting.]
- Safety-check results: cached up to 24 hours, not linked to you.
- Error reports and feedback at Sentry: up to 90 days, then deleted automatically.
- Emails: up to 2 years after the conversation ends.

## 7. Sharing

We share data only with the service providers listed above, to run Knight, and with authorities when the law requires it. Our main providers are Cloudflare (hosting and gateway), Google Firebase (push messages), Alchemy (blockchain data), GoPlus (safety checks), Sentry (error reports, EU) and GitHub (public lists). Each provider must protect data at least as well as this policy requires.

## 8. International transfers

Our providers work in many countries, including the United States. Where EU or UK law applies, we rely on the European Commission's Standard Contractual Clauses or other approved safeguards.

## 9. Your rights

Depending on where you live (for example under the EU and UK GDPR, the UAE Personal Data Protection Law, Thailand's PDPA or Kenya's Data Protection Act), you may have the right to access, correct, delete, restrict or object to the use of your data, to data portability, and to withdraw consent.

Because we do not know who you are, the easiest way to delete your data is: **turn alerts off in Settings and delete the app.** For any other request, email privacy@dyrection.com with the public address involved. We answer within 30 days. You can also complain to your local data protection authority.

**EU representative:** [TO APPOINT: name and address of our EU representative under Article 27 GDPR.]

## 10. Children

Knight is not meant for anyone under 18. We do not knowingly handle children's data.

## 11. Security

We design Knight so that we hold as little as possible. Keys are encrypted on your device and protected by Face ID, fingerprint or passcode. Our servers never receive keys or recovery phrases. Report security issues to security@dyrection.com.

## 12. Changes

We will post changes here and tell you in the app if they are important. The date at the top shows the latest version.
