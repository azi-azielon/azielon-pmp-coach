/**
 * Azielon PMP Coach mail relay for Render Free.
 *
 * Script Property required:
 *   PMP_MAIL_SECRET = a long random secret
 *
 * Deploy as a Web app:
 *   Execute as: Me
 *   Who has access: Anyone
 */
function doPost(e) {
  try {
    const expectedSecret = PropertiesService.getScriptProperties().getProperty('PMP_MAIL_SECRET');
    if (!expectedSecret) {
      return jsonResponse({ ok: false, error: 'PMP_MAIL_SECRET is not configured in Script Properties.' });
    }

    const raw = e && e.postData && e.postData.contents ? e.postData.contents : '{}';
    const data = JSON.parse(raw);

    if (!data.secret || data.secret !== expectedSecret) {
      return jsonResponse({ ok: false, error: 'Unauthorized' });
    }

    const to = String(data.to || '').trim();
    const subject = String(data.subject || '').trim();
    const body = String(data.body || '');

    if (!to || !subject || !body) {
      return jsonResponse({ ok: false, error: 'Missing to, subject, or body.' });
    }

    MailApp.sendEmail({
      to: to,
      subject: subject,
      body: body,
      name: 'Azielon PMP Coach',
      replyTo: 'azi@azielon.com'
    });

    return jsonResponse({ ok: true });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

function doGet() {
  return jsonResponse({ ok: true, service: 'Azielon PMP Coach mail relay' });
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
