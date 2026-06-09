// Pluggable email transport. The default `console` driver writes the
// payload to stdout and reports "sent" so the UAT and local dev can
// observe successful delivery without an SMTP server. To wire a real
// provider set MAIL_DRIVER=smtp (or sendgrid / ses) and add the branch
// keep the return shape identical so notify() doesn't need to know.

export async function sendEmail({ to, subject, body }) {
  const driver = (process.env.MAIL_DRIVER ?? "console").toLowerCase();

  if (driver === "console") {
    // eslint-disable-next-line no-console
    console.log(
      `[mail] to=${to} | subject=${JSON.stringify(subject)} | body=${body.slice(0, 160)}`
    );
    return { status: "sent" };
  }

  if (driver === "off") {
    return { status: "skipped" };
  }

  // Future: SMTP / SendGrid / SES integration goes here.
  return { status: "skipped" };
}
