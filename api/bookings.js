function json(res, status, body) {
  res.status(status).json(body);
}

function clean(value, max) {
  return String(value || '').trim().slice(0, max);
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, { error: 'Метод не поддерживается' });
  }

  var data = req.body || {};
  var name = clean(data.name, 120);
  var phone = clean(data.phone, 40);
  if (name.length < 2) return json(res, 400, { error: 'Укажите имя' });
  if (phone.replace(/\D/g, '').length < 11) return json(res, 400, { error: 'Укажите телефон из 11 цифр' });
  if (data.consent !== true) return json(res, 400, { error: 'Требуется согласие на обработку данных' });

  var booking = {
    name: name,
    phone: phone,
    style: clean(data.style, 80),
    size: clean(data.size, 80),
    date: clean(data.date, 20),
    contact: clean(data.contact, 40),
    idea: clean(data.idea, 1000),
    receivedAt: new Date().toISOString()
  };

  if (process.env.BOOKING_WEBHOOK_URL) {
    try {
      await fetch(process.env.BOOKING_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(booking)
      });
    } catch (error) {
      console.error('Booking webhook error:', error.message);
      return json(res, 502, { error: 'Не удалось передать заявку студии' });
    }
  } else {
    console.log('New booking:', JSON.stringify(booking));
  }

  return json(res, 201, { ok: true });
};
