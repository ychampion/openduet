import { createHash } from 'node:crypto';
import type { CustomerThreadSnapshot } from '@openduet/contracts';
import type { MailMessage } from '../connectors/mail-transport.ts';

/** Only parsed addresses establish identity; display names are untrusted content. */
export function customerThreadSnapshot(
  messages: MailMessage[],
  ownAddress: string,
  customer: string,
): CustomerThreadSnapshot {
  if (!messages.length || messages.length > 50)
    throw new Error('The complete thread is unavailable.');
  const own = ownAddress.trim().toLowerCase();
  const target = customer.trim().toLowerCase();
  const rows = messages
    .map((message) => {
      if (!message.message_id || !message.date || !Number.isFinite(Date.parse(message.date)))
        throw new Error('The thread has no reliable message identity or date.');
      const from = message.from_addresses?.map((address) => address.toLowerCase()) ?? [];
      const to = message.to_addresses?.map((address) => address.toLowerCase()) ?? [];
      if (!from.length) throw new Error('The sender identity cannot be checked.');
      return {
        key: message.message_id,
        message_id: message.message_id,
        from: message.from,
        to: message.to,
        subject: message.subject,
        text: message.text.slice(0, 20_000),
        date: new Date(message.date).toISOString(),
        own: from.includes(own),
        customer: from.includes(target),
        toCustomer: to.includes(target),
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date) || a.key.localeCompare(b.key));
  const outgoing = rows.filter((message) => message.own && message.toCustomer).at(-1);
  if (!outgoing) throw new Error('Choose a thread with a message you sent to this customer.');
  const replied = rows.some(
    (message) => message.customer && message.date >= outgoing.date && message.key !== outgoing.key,
  );
  // Full source bytes, including body changes, bind the preparation and later exact-action approval.
  const version = createHash('sha256')
    .update(
      JSON.stringify(
        messages
          .map((message) => ({
            key: message.message_id,
            from: message.from_addresses,
            to: message.to_addresses,
            date: message.date,
            subject: message.subject,
            text: message.text,
            references: message.references,
            in_reply_to: message.in_reply_to,
          }))
          .sort((a, b) => String(a.key).localeCompare(String(b.key))),
      ),
    )
    .digest('hex');
  return {
    version,
    subject: outgoing.subject,
    messages: rows.map(({ customer: _customer, toCustomer: _toCustomer, ...message }) => message),
    latest_outgoing: outgoing.key,
    replied,
  };
}
