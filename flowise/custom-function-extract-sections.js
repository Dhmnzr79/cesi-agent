/**
 * Custom Function Node для AgentFlow V2.
 * Извлекает заголовки ### из выхода Retriever, группирует по теме, возвращает строку через запятую для Flow State (current_topics).
 * В Flowise: Input Variable retrieverOutput = {{ RetrieverId.output }}, Update Flow State: current_topics = output этой ноды.
 * Возвращаем простую строку (не JSON), чтобы избежать двойной упаковки в state.
 */

// Вход: выход одной ноды Retriever (строка или массив документов с pageContent и metadata)
var raw = typeof $retrieverOutput !== 'undefined' ? $retrieverOutput : '';

var currentTopics = {};

function getTopicName(metadata) {
  if (!metadata) return 'Контекст';
  var src = metadata.source || metadata.fileName || metadata.file_path || '';
  if (typeof src !== 'string') return 'Контекст';
  var name = src.split(/[/\\]/).pop().replace(/\.md$/i, '') || 'Контекст';
  // Опционально: человекочитаемые названия по префиксу
  if (name.startsWith('impl__type_all-on-4')) return 'Имплантация All-on-4';
  if (name.startsWith('impl__type_all-on-6')) return 'Имплантация All-on-6';
  if (name.startsWith('impl__type_classic')) return 'Классическая имплантация';
  if (name.startsWith('impl__type_one_stage')) return 'Одномоментная имплантация';
  if (name.startsWith('impl__')) return 'Имплантация';
  if (name.startsWith('clinic__consultation')) return 'Консультация';
  if (name.startsWith('clinic__')) return 'Клиника';
  if (name.startsWith('doctor__')) return 'Врачи';
  if (name.startsWith('faq__')) return 'Вопросы и ответы';
  if (name.startsWith('price')) return 'Стоимость';
  return name.replace(/__/g, ' ');
}

function extractH3(text) {
  if (typeof text !== 'string') return [];
  var re = /^###\s*(.+)$/gm;
  var out = [];
  var m;
  while ((m = re.exec(text)) !== null) {
    var title = m[1].trim();
    if (!title) continue;
    if (/^коротко$/i.test(title)) continue;
    out.push(title);
  }
  return out;
}

function addSections(topic, sections) {
  if (!currentTopics[topic]) currentTopics[topic] = [];
  sections.forEach(function (s) {
    if (currentTopics[topic].indexOf(s) === -1) currentTopics[topic].push(s);
  });
}

try {
  if (raw !== null && raw !== undefined && raw !== '') {
    if (typeof raw === 'string') {
      var sections = extractH3(raw);
      if (sections.length) addSections('Контекст', sections);
    } else if (Array.isArray(raw)) {
      for (var i = 0; i < raw.length; i++) {
        var doc = raw[i];
        var text = doc.pageContent || doc.content || doc.text || (typeof doc === 'string' ? doc : '');
        var meta = doc.metadata || doc.meta || {};
        var topic = getTopicName(meta);
        var sections = extractH3(text);
        if (sections.length) addSections(topic, sections);
      }
    } else {
      var list = raw.documents || raw.chunks || raw.results;
      if (Array.isArray(list)) {
        for (var j = 0; j < list.length; j++) {
          var d = list[j];
          var t = d.pageContent || d.content || d.text || (typeof d === 'string' ? d : '');
          var m = d.metadata || d.meta || {};
          var top = getTopicName(m);
          var sec = extractH3(t);
          if (sec.length) addSections(top, sec);
        }
      }
    }
  }
} catch (e) {
  currentTopics = {};
}

// Одна строка через запятую — без JSON, чтобы не было двойной упаковки в state
var allTitles = [];
for (var key in currentTopics) {
  allTitles = allTitles.concat(currentTopics[key]);
}
if (allTitles.length === 0) {
  return '';
}
return allTitles.join(', ');
