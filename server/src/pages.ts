const STYLE = `
  body{margin:0;background:#12121a;color:#f2f0f5;font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
  main{max-width:36rem;margin:0 auto;padding:3rem 1.2rem 4rem}
  h1{font-size:1.8rem;margin:0 0 .3rem}
  h2{font-size:1.05rem;margin-top:1.8rem;color:#f2f0f5}
  p{color:#cfcdd6}
  small{color:#8b8894}
  a{color:#a78bfa}
  .tag{color:#a78bfa;font-size:1.05rem;margin:0 0 1.5rem}
  .cta{display:inline-block;margin-top:1.2rem;padding:.7rem 1.3rem;border-radius:10px;background:#a78bfa;color:#12121a;font-weight:700;text-decoration:none}
`;

function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>${STYLE}</style>
</head><body><main>${body}</main></body></html>`;
}

export function landingHtml(appStoreUrl?: string): string {
  const cta = appStoreUrl ? `<a class="cta" href="${appStoreUrl}">Get the app</a>` : "";
  return page(
    "Aineko",
    `<h1>Aineko</h1>
<p class="tag">Talk to animals who can't actually talk.</p>
<p>Aineko is a chatbot for animals who only reply in their own limited vocabulary -- barks, meows,
quacks, and the rest. They can't form real words, but somehow they always seem to catch your
drift anyway.</p>
${cta}
<h2>Support</h2>
<p>Questions or issues: <a href="mailto:aineko@bromsg.com">aineko@bromsg.com</a></p>
<p><small><a href="/privacy">Privacy Policy</a> &middot; <a href="/terms">Acceptable Use</a></small></p>`,
  );
}

export function privacyHtml(): string {
  return page(
    "Privacy Policy — Aineko",
    `<h1>Privacy Policy</h1>
<p><small>Last updated: 2026-10-23</small></p>
<p>Aineko is a simple chat app. This page describes exactly what happens to your data -- nothing
more is collected than what's listed here.</p>
<h2>What we collect</h2>
<p>Nothing that identifies you personally, and no account or sign-in is required. The app does not
use analytics, advertising, or tracking SDKs of any kind.</p>
<p>To keep usage fair, our server keeps a running count of how much AI processing (measured in
"tokens") has been used by each install of the app, identified by a random ID the app creates the
first time it runs; by each IP address; and, for members, by each subscription, identified by
Apple's transaction ID. These counts contain no message content and expire after about a month.</p>
<h2>What happens to a message you send</h2>
<p>The app asks for your permission before sending anything. The text you type -- along with the
last few messages of that conversation and the short list of things that animal remembers about
you, so it can follow along -- is sent to our server,
which forwards it to <a href="https://openrouter.ai">OpenRouter</a> and an underlying third-party
AI model to generate a reply. We do not log or store the content of your messages. Before a reply
is written, a separate AI model, also through OpenRouter, checks the message for content our <a
href="/terms">Acceptable Use policy</a> prohibits. If it flags the message, the animal doesn't
answer it, and we keep a count against your device or membership (on the oldest app versions, your
network address): the kind of content and when, never the words. Strikes are kept for a day, a
pause's history for 90 days after it ends, and a permanent pause for as long as it lasts. We are
alerted with an anonymized label and the kind of content, never the words, and keep a log of the
last 200 such alerts. OpenRouter and
the model provider handling the request have their own data practices; see <a
href="https://openrouter.ai/privacy">OpenRouter's privacy policy</a> for how they handle a
request while processing it. You can review or withdraw your permission any time in the app under
Settings &rsaquo; AI &amp; privacy.</p>
<h2>Chat history</h2>
<p>Your conversations, and the notes each animal keeps about what it remembers, are stored locally on
your device only. We have no copy of them and cannot see them. You can read or erase the notes any
time under Settings &rsaquo; What they remember.</p>
<h2>Payments</h2>
<p>Subscriptions are handled entirely by Apple's App Store billing (StoreKit). We never see your
payment details or your Apple ID. To confirm a membership is active, the app sends our server
Apple's signed record of the subscription (product, transaction ID, and expiry date).</p>
<h2>Contact</h2>
<p><a href="mailto:aineko@bromsg.com">aineko@bromsg.com</a></p>
<p><small><a href="/terms">Acceptable Use</a></small></p>`,
  );
}

export function termsHtml(): string {
  return page(
    "Acceptable Use — Aineko",
    `<h1>Acceptable Use</h1>
<p><small>Last updated: 2026-10-23</small></p>
<p>Aineko is a novelty chat app for talking to fictional animal personas. By using it, you agree
not to use it to attempt to generate illegal content, including but not limited to child sexual
abuse material, content that facilitates violence or terrorism, or anything else prohibited by
applicable law or by our AI provider's usage policies.</p>
<p>We reserve the right to terminate access for any account or device found violating this policy.
Messages are checked automatically before an animal answers. Three flagged messages in a day pause
chats from that device, membership or (on the oldest app versions) network address for 24 hours,
then 7 days, then for good. Messages are not logged (see our <a href="/privacy">Privacy Policy</a>), but requests are relayed
through a third-party AI provider that may independently detect and act on prohibited content,
including reporting where legally required.</p>
<p>The app is provided "as is," without warranties of any kind. We are not liable for the content
of a reply -- these are AI-generated and can be wrong, nonsensical, or occasionally not funny.</p>
<h2>Contact</h2>
<p><a href="mailto:aineko@bromsg.com">aineko@bromsg.com</a></p>`,
  );
}
