require('dotenv').config();
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

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
app.post('/api/send-lead', (req, res) => {
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

  // Все валидно
  res.json({ success: true });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
