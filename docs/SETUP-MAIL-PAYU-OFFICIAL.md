# Setting up e-mail, PayU and the official WhatsApp API

All three are entered by the platform admin on **Platform Admin → Settings (mail, payment)** (`/admin/settings`).
Passwords and keys are stored encrypted, are never shown again, and work at once (no restart).
The server needs `APP_ENCRYPTION_KEY` (or the existing `QR_CREDENTIAL_ENCRYPTION_KEY`) so that secrets can be encrypted.

## 1. E-mail and OTP (Gmail)
1. In the Google account that will send the mail: turn on **2-step verification**, then create an **App password** (Security → App passwords).
2. On the settings screen press **Fill the Gmail server details**, type the Gmail address and paste the 16-letter app password, **Save**.
3. Press **Send a test e-mail**. If it says the account was not accepted, the app password is wrong.

What it switches on: password reset (link and 6-digit code), e-mail confirmation of new accounts (sending campaigns needs a
confirmed e-mail; existing users are already confirmed) and the 6-digit OTP when a signed-in user changes the password.
A Gmail account sends about 500 mails a day; use a mail service (Brevo, Amazon SES) when there are many customers.

## 2. Online payment (PayU)
1. In the PayU dashboard copy the **Merchant key** and **Salt** (use the *test* ones first).
2. Settings screen → PayU: key, salt, mode **test** → Save. Buy Rs 100 credit on the Billing page with PayU's test card/UPI.
3. When it works, replace key and salt with the live ones and choose mode **live**.

How it is protected: the server signs the amount (SHA-512), PayU sends the customer back to
`/api/payments/payu/return` with a signed reply; the signature, the amount and PayU's own status check must all agree before
credit is added (once), and an invoice is issued. A payment whose browser was closed early is found by the Billing page
(*reconcile*) and credited.

## 3. Official WhatsApp (Meta Cloud API), for very large lists
1. Create a Meta app with the **WhatsApp** product, add the business's phone number, and create a **System User** with a permanent access token.
2. Settings screen → Official WhatsApp: **App secret** and any secret word as **Verify token**. In the Meta app, set the webhook to the address shown on that screen and subscribe to **messages**.
3. Per client number: **Add sender → Official WhatsApp API** with the **Phone number ID**, **WhatsApp Business Account ID** and the token. They are checked with Meta; the token is stored encrypted. **Replace token** on the sender row renews it.
4. Create message templates in Meta Business Manager. When Meta approves them they appear in the campaign page; fill the `{{1}}`, `{{2}}` values from contact fields (`firstName`, `city|there`) or fixed words (`text:Diwali sale`).

Limits to know: a business-started chat needs an approved **text** template (picture/video headers and variable button links are not supported yet);
Meta charges per conversation on its own bill; the daily limit of an official number starts at 1,000 and the admin raises it per sender as Meta raises the tier
(Settings per sender in Platform Admin). A worker sends about one message a second per number; run more worker processes for more speed.
