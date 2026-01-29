require('dotenv').config();
const express = require('express');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 3000;

// Проверка переменных окружения SMTP
console.log('SMTP CHECK', {
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: process.env.SMTP_SECURE,
  user: process.env.SMTP_USER,
  passExists: !!process.env.SMTP_PASS,
  emailTo: process.env.EMAIL_TO
});

// Настройка SMTP транспорта
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

app.use(express.json());

// Health-check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Валидация имени
function validateName(name) {
  if (!name || typeof name !== 'string') {
    return { valid: false, error: 'Имя обязательно' };
  }
  if (name.length < 2) {
    return { valid: false, error: 'Имя должно содержать минимум 2 символа' };
  }
  // Только буквы (кириллица/латиница) и пробелы
  if (!/^[a-zA-Zа-яА-ЯёЁ\s]+$/.test(name)) {
    return { valid: false, error: 'Имя должно содержать только буквы' };
  }
  return { valid: true };
}

// Валидация телефона
function validatePhone(phone) {
  if (!phone || typeof phone !== 'string') {
    return { valid: false, error: 'Телефон обязателен' };
  }
  // Извлекаем только цифры
  const digits = phone.replace(/\D/g, '');
  // Проверяем наличие цифр (минимум 10 для российского номера)
  if (digits.length < 10) {
    return { valid: false, error: 'Телефон должен содержать минимум 10 цифр' };
  }
  return { valid: true };
}

// Endpoint для отправки заявки
app.post('/api/send-lead', async (req, res) => {
  const { name, phone, message } = req.body;

  // Валидация имени
  const nameValidation = validateName(name);
  if (!nameValidation.valid) {
    return res.json({ success: false, error: nameValidation.error });
  }

  // Валидация телефона
  const phoneValidation = validatePhone(phone);
  if (!phoneValidation.valid) {
    return res.json({ success: false, error: phoneValidation.error });
  }

  // Отправка email
  try {
    console.log('>>> ABOUT TO SEND EMAIL');
    
    const mailOptions = {
      from: process.env.SMTP_USER,
      to: process.env.EMAIL_TO,
      subject: '[ЧАТ-БОТ] Новая заявка',
      text: `Новая заявка с сайта\n\nИмя: ${name}\nТелефон: ${phone}${message ? `\nСообщение: ${message}` : ''}\n\nВремя: ${new Date().toLocaleString('ru-RU', { timeZone: 'Asia/Kamchatka' })}`
    };

    await transporter.sendMail(mailOptions);
    console.log('>>> EMAIL SENT');
    res.json({ success: true });
  } catch (error) {
    console.error('Ошибка отправки email:', error);
    res.json({ success: false, error: 'Ошибка отправки заявки' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
