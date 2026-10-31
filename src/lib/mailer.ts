/**
 * Outgoing mail. The app calls a Mailer from deps; there is no real mail service yet, so the ones here only pretend.
 * Tests swap deps.mailer through makeDeps(env, { mailer })
 */
import { err, ok, type Result } from "hono-kit";

export type Mail = {
  /** The other side keeps the mails it has taken by this key and ignores a second one, so a retry sends nothing twice */
  key: string;
  to: string;
  subject: string;
  body: string;
};

/** The mail service did not take the mail (down, timed out). It may or may not have gone out */
export const MailNotSent = {
  code: "MAIL_NOT_SENT",
  kind: "upstream",
  message: "The mail service did not take the mail",
} as const;

export type Mailer = {
  send: (mail: Mail) => Promise<Result<{ key: string }, typeof MailNotSent.code>>;
};

/** What runs until a real service is wired: writes the mail to the log and says it went */
export const logMailer: Mailer = {
  send: (mail) => {
    console.log(`[mail] to=${mail.to} key=${mail.key} subject=${mail.subject}`);
    return Promise.resolve(ok({ key: mail.key }));
  },
};

/**
 * For tests: puts what was sent in `outbox` (the test's own array; a module-level one is not allowed), once per key
 * as the real service would
 */
export const collectingMailer = (outbox: Mail[]): Mailer => ({
  send: (mail) => {
    if (!outbox.some((sent) => sent.key === mail.key)) outbox.push(mail);
    return Promise.resolve(ok({ key: mail.key }));
  },
});

/** For tests: a service that is down. Every mail is refused */
export const downMailer = (): Mailer => ({
  send: () => Promise.resolve(err(MailNotSent.code)),
});
