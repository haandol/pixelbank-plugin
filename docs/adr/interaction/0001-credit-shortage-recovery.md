# ADR 0001: Credit-shortage recovery through the public credit page

[한국어](credit-shortage-recovery.ko.md)

Date: 2026-11-08

## Status

Accepted (2026-11-08)

## Purpose

A creator whose requested operation cannot be funded needs a direct way to add credits and continue. An error that only names insufficient credits leaves the creator to locate the purchase page. The user selected automatic opening in the default browser together with a clickable conversation link.

This decision owns desktop navigation and assistant recovery guidance. The remote service continues to own prices, free uses, balances, cost authority and job acceptance; the existing website owns package selection and payment.

## Decision Drivers

- Credit refusal should lead to a usable recovery destination without searching the site.
- Opening the page must remain separate from purchasing credits and resubmitting processing.
- A failed browser launch must leave the original error and usable link available.
- Navigation must not accept an arbitrary destination or private account data.

## Decision

When a requested operation is refused because credits are insufficient, open the PixelbankStudio credit purchase page in the default browser and include its link in the error outcome and creator-facing reply. The destination is exactly https://www.pixelbankstudio.com/pricing, with no account credentials, order or operation data in the URL.

The assistant may open the same page before submission when current account information and the selected task's price establish insufficient funding after considering eligible free uses. A zero credit balance alone does not establish that condition. A dedicated page-opening control also supports an explicit request to visit the credit page.

### Requirement contract

#### Required guarantees

| Required guarantee | Observable evidence |
| --- | --- |
| A definitive insufficient-credit processing refusal automatically opens the fixed credit page and retains a clickable link — approved user recovery behavior. | A refused image request opens the credit plans page and the reply provides its link. |
| The destination is exactly https://www.pixelbankstudio.com/pricing and is chosen locally rather than from caller or provider input — trusted navigation boundary. | An alternate URL or provider-supplied recovery destination cannot change the opened page. |
| Preflight recovery preserves free-use priority and uses the requested operation's current funding requirements — existing credit contract. | A zero balance with a usable free trial can still continue; an unfunded task can reach the credit page without submitting processing. |
| The reply distinguishes page opening from successful funding — recovery state authority. | Returning an opened page never reports that credits were added. |
| English and Korean guidance describe the same recovery and continuation steps — existing bilingual customer support. | Either language explains the credit page, manual purchase and subsequent balance check. |

#### Prohibitions

| Required guarantee | Observable evidence |
| --- | --- |
| Navigation cannot create a checkout session, select a plan, confirm payment, grant credits or submit another processing request — existing consent boundaries. | Opening the page changes no balance and creates no payment order or processing job. |
| Funding recovery never automatically replays a rejected or uncertain operation or changes its operation key or approved budget — existing operation continuity. | The creator's later continuation retains the original request and requires current balance, price and authorization checks. |
| Free-use lookup failures, changed prices and missing cost approval are not treated as confirmed credit shortage — existing distinct recovery conditions. | Those outcomes retain their own consent or quote guidance without automatically opening the credit page. |

#### Failure guarantees

| Required guarantee | Observable evidence |
| --- | --- |
| Browser unavailability preserves the original credit error, known cost details and fixed recovery link — link fallback. | A failed launch still reports insufficient credits and a usable credit-page link, with opening failure distinguished from funding success. |

## Alternatives

### Conversation link with opening only on request

The link is usable in hosts without desktop control and avoids an automatic browser side effect. It adds a recovery step when the creator is already blocked; the user selected automatic opening plus the link instead.

### Error text without a direct destination

This preserves the smallest bridge surface, but leaves the creator to locate where credits can be added and does not satisfy the requested recovery.

## Consequences

Credit-shortage recovery can open the default browser during a tool call. Repeated explicit requests that independently fail for insufficient credits can produce additional page openings; the bridge does not create those requests through automatic retries.

The link remains useful when desktop opening is unavailable. The creator chooses and completes a purchase on the website, then asks to continue. Page opening provides no evidence that funding changed.
