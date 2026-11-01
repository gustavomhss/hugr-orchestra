# Integrations

Integrations connect a project to outside services such as Slack, Linear or Stripe. You choose which account an agent may use, which resource it may reach, and which actions each session may take. Nothing is shared by default.

## Where it lives

Open **Integrations** in the sidebar's Advanced group. It needs a project. The page shows the project's accounts, and its description reads **Choose explicit accounts, targets, and session bindings for this project.**

The lists are live pages, not a snapshot. Choose **Refresh** to see current accounts and targets, and **Next page** when a list continues.

## Three ideas

- **Account.** A saved login to one provider, made from an access token you paste in.
- **Target.** A specific resource inside an account, for example one project. You name the resource explicitly.
- **Binding.** Permission for one session to use one target, limited to the actions you list.

An agent can use an integration only when a binding allows it. Having an account gives no session access.

## Connect an account

1. Choose **Connect account**.
2. Pick the **Provider**. Key setup is available for Slack, Discord, Cloudflare, Supabase, Neon, Linear, Stripe, OpenAI, Runway and Globalping.
3. Enter an **Account label** and the **Access token**. The field hint names the kind of token each provider needs, for example a bot token for Slack or a restricted key for Stripe.
4. Save. The key is checked with the provider before the account is saved.

Sentry, Vercel, Grafana, Railway, Netlify and Prisma Postgres are listed but marked **Needs browser sign-in, not available yet**. You cannot connect them.

Each account shows **Configured**, **Disconnected locally** or **Revoked**. It also shows whether a credential is stored (**Credential stored** or **Credential missing**) and whether the account is **Verified** or only **Key valid, identity not checked**.

## Add a target

Open an account and choose **Create target**. Pick an **Environment** and enter **Resource JSON** with the provider's explicit resource IDs. The page never shows the contents of an existing resource. **Replace target** changes which resource a target points to.

**Remove target** removes the target and its bindings from Orchestra. It does not delete anything at the provider.

## Bind a session

Under a target, **Current session bindings** lists the sessions that may use it. To add one:

1. Choose a session under **Choose a session**, or type an ID under **Or enter a session ID** if the list cannot load.
2. Under **Actions**, enter one action per line. The hint under the field gives examples: `read`, `channel.send` and `channel.update` for Slack and Discord; `service_discover` and `service_call` for Cloudflare, Supabase, Neon, Linear, Stripe and Globalping; `image_create` for OpenAI; `video_create` for Runway.
3. Choose **Save binding**.

A binding applies to each session's current stored actor. Earlier actors are not shown. **Remove binding** ends that session's access and does not change anything at the provider.

## Disconnect

**Disconnect account** disconnects the local account and removes its bindings. It does not revoke the token at the provider. To make the token useless, revoke it in the provider's own settings.

## When something fails

| Message | What to do |
| --- | --- |
| Host authorization is required or no longer permits this request. | Under **Host authorization**, paste the **Host-issued operator token** and choose **Use token**. The token stays on this page and is discarded when you leave. |
| This server does not provide this integration operation. | The server does not offer this feature. There is nothing to retry. |
| Check the selected account, target, and input fields. | Fix the input. For **Resource JSON**, the page says **The resource is not valid JSON.** |
| The request could not be completed. Refresh before changing the request. | Choose **Refresh**, then repeat. |
| The response was lost. Retry the same request to reconcile its original receipt. | Choose **Retry same request**. It reuses the original request, so it does not create a duplicate. |

After a save the page says **Request saved**, or **Original request receipt reused** when the request matched an earlier try.
