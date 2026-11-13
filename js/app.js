(function () {
  'use strict';

  var root = document.documentElement;
  var themeToggle = document.getElementById('theme-toggle');
  var navToggle = document.getElementById('nav-toggle');
  var mainNav = document.getElementById('main-nav');
  var toTop = document.getElementById('to-top');
  var yearEl = document.getElementById('year');

  function applyTheme(theme) {
    root.dataset.theme = theme;
    themeToggle.setAttribute('aria-pressed', String(theme === 'dark'));
    themeToggle.setAttribute('aria-label', theme === 'dark' ? 'Переключить на светлую тему' : 'Переключить на тёмную тему');
    var themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor) themeColor.setAttribute('content', theme === 'dark' ? '#0d0c0b' : '#f2ede4');
    try { localStorage.setItem('fct-theme', theme); } catch (e) {}
  }

  themeToggle.addEventListener('click', function () {
    applyTheme(root.dataset.theme === 'dark' ? 'light' : 'dark');
  });
  applyTheme(root.dataset.theme || 'dark');

  navToggle.addEventListener('click', function () {
    var open = mainNav.classList.toggle('is-open');
    navToggle.setAttribute('aria-expanded', String(open));
    document.body.classList.toggle('is-locked', open);
  });
  mainNav.addEventListener('click', function (e) {
    if (e.target.closest('a')) {
      mainNav.classList.remove('is-open');
      navToggle.setAttribute('aria-expanded', 'false');
      document.body.classList.remove('is-locked');
    }
  });

  var navLinks = Array.prototype.slice.call(document.querySelectorAll('.main-nav a'));
  var sections = navLinks
    .map(function (a) { return document.querySelector(a.getAttribute('href')); })
    .filter(Boolean);

  function onScroll() {
    var y = window.scrollY;
    toTop.classList.toggle('is-visible', y > 600);

    var current = null;
    sections.forEach(function (sec) {
      if (sec.getBoundingClientRect().top <= 120) current = sec.id;
    });
    navLinks.forEach(function (a) {
      a.classList.toggle('is-active', a.getAttribute('href') === '#' + current);
    });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  toTop.addEventListener('click', function () {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  var calendarGrid = document.getElementById('calendar-grid');
  var calendarMonth = document.getElementById('calendar-month');
  var calendarStatus = document.getElementById('calendar-status');
  var calendarPrev = document.getElementById('calendar-prev');
  var calendarNext = document.getElementById('calendar-next');
  var dateInput = document.getElementById('date');
  var calendarDate = new Date();
  calendarDate.setDate(1);
  var calendarToday = new Date();
  calendarToday.setHours(0, 0, 0, 0);
  var selectedDate = '';
  var schedule = {};
  var weeklySchedule = {};

  function dateKey(year, month, day) {
    return year + '-' + String(month + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0');
  }

  function availability(year, month, day) {
    var date = new Date(year, month, day);
    if (date < calendarToday) return 'past';
    return schedule[dateKey(year, month, day)] || weeklySchedule[String(date.getDay())] || 'unknown';
  }

  function renderCalendar() {
    if (!calendarGrid) return;
    var year = calendarDate.getFullYear();
    var month = calendarDate.getMonth();
    var firstDay = new Date(year, month, 1).getDay();
    var offset = firstDay === 0 ? 6 : firstDay - 1;
    var daysInMonth = new Date(year, month + 1, 0).getDate();
    var monthName = calendarDate.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
    calendarMonth.textContent = monthName;
    calendarGrid.innerHTML = '';

    for (var blank = 0; blank < offset; blank++) {
      var empty = document.createElement('span');
      empty.className = 'calendar-day is-empty';
      empty.setAttribute('aria-hidden', 'true');
      calendarGrid.appendChild(empty);
    }

    for (var day = 1; day <= daysInMonth; day++) {
      var key = dateKey(year, month, day);
      var state = availability(year, month, day);
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'calendar-day is-' + state;
      button.dataset.date = key;
      button.dataset.state = state;
      button.setAttribute('role', 'gridcell');
      button.innerHTML = '<span>' + day + '</span><i class="calendar-day-status" aria-hidden="true"></i>';
      if (state !== 'free') {
        button.disabled = true;
        button.setAttribute('aria-label', day + ' — ' + (state === 'past' ? 'прошедшая дата' : state === 'busy' ? 'занято' : state === 'off' ? 'выходной' : 'расписание не уточнено'));
      } else {
        button.setAttribute('aria-label', day + ' — свободно');
        button.addEventListener('click', function () {
          selectedDate = this.dataset.date;
          dateInput.value = selectedDate;
          calendarGrid.querySelectorAll('.calendar-day').forEach(function (item) { item.classList.remove('is-selected'); });
          this.classList.add('is-selected');
          calendarStatus.textContent = 'Дата ' + new Date(selectedDate + 'T00:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }) + ' выбрана. Заполните заявку ниже.';
          dateInput.dispatchEvent(new Event('change'));
        });
      }
      if (key === selectedDate) button.classList.add('is-selected');
      if (year === calendarToday.getFullYear() && month === calendarToday.getMonth() && day === calendarToday.getDate()) button.classList.add('is-today');
      calendarGrid.appendChild(button);
    }

    calendarPrev.disabled = year === calendarToday.getFullYear() && month === calendarToday.getMonth();
  }

  if (calendarGrid) {
    calendarPrev.addEventListener('click', function () { calendarDate.setMonth(calendarDate.getMonth() - 1); renderCalendar(); });
    calendarNext.addEventListener('click', function () { calendarDate.setMonth(calendarDate.getMonth() + 1); renderCalendar(); });
    renderCalendar();
    fetch('availability.json', { cache: 'no-store' }).then(function (response) {
      if (!response.ok) throw new Error('Schedule unavailable');
      return response.json();
    }).then(function (data) {
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid schedule');
      if (data.weekly && typeof data.weekly === 'object') {
        Object.keys(data.weekly).forEach(function (key) {
          if (/^[0-6]$/.test(key) && ['free', 'busy', 'off'].indexOf(data.weekly[key]) !== -1) weeklySchedule[key] = data.weekly[key];
        });
      }
      Object.keys(data).forEach(function (key) {
        if (/^\d{4}-\d{2}-\d{2}$/.test(key) && ['free', 'busy', 'off'].indexOf(data[key]) !== -1) schedule[key] = data[key];
      });
      calendarStatus.textContent = 'Выберите свободную дату. Для неотмеченных дат расписание ещё не опубликовано.';
      renderCalendar();
    }).catch(function () {
      calendarStatus.textContent = 'Не удалось загрузить расписание. Пожалуйста, уточните доступность у мастера.';
    });
  }

  var galleryPaths = {
    animal: 'assets/real/animal/',
    botanical: 'assets/real/botanical/',
    maori: 'assets/real/maori/',
    lettering: 'assets/real/lettering/',
    oldschool: 'assets/real/oldschool/',
    japan: 'assets/real/japan/'
  };
  var worksGrid = document.getElementById('works-grid');

  function renderGallery() {
    if (!worksGrid || !window.FLARE_GALLERY || !window.FLARE_GALLERY.length) return;
    worksGrid.innerHTML = window.FLARE_GALLERY.map(function (item) {
      var src = galleryPaths[item.cat] + encodeURIComponent(item.file).replace(/%2F/g, '/');
      return '<figure class="work" data-cat="' + item.cat + '">' +
        '<button class="work-btn" type="button" data-full="' + src + '" data-title="' + item.title + '" data-meta="' + item.meta + '">' +
        '<img src="' + src + '" alt="' + item.title + ' — ' + item.meta + '" loading="lazy" width="900" height="1200">' +
        '<span class="work-info"><strong>' + item.title + '</strong><small>' + item.meta.split(' · ')[0] + '</small></span>' +
        '</button></figure>';
    }).join('');
  }

  renderGallery();
  var chips = Array.prototype.slice.call(document.querySelectorAll('.chip'));
  var works = Array.prototype.slice.call(document.querySelectorAll('.work'));
  var worksEmpty = document.getElementById('works-empty');

  chips.forEach(function (chip) {
    chip.addEventListener('click', function () {
      var filter = chip.dataset.filter;
      chips.forEach(function (c) {
        c.classList.toggle('is-active', c === chip);
        c.setAttribute('aria-pressed', String(c === chip));
      });
      var shown = 0;
      works.forEach(function (work) {
        var match = filter === 'all' || work.dataset.cat === filter;
        work.hidden = !match;
        if (match) shown++;
      });
      if (worksEmpty) worksEmpty.hidden = shown !== 0;
    });
  });

  var lightbox = document.getElementById('lightbox');
  var lightboxImg = document.getElementById('lightbox-img');
  var lightboxTitle = document.getElementById('lightbox-title');
  var lightboxMeta = document.getElementById('lightbox-meta');
  var prevBtn = document.getElementById('lightbox-prev');
  var nextBtn = document.getElementById('lightbox-next');
  var workButtons = Array.prototype.slice.call(document.querySelectorAll('.work-btn'));
  var currentIndex = 0;
  var lastFocused = null;

  function visibleWorks() {
    return workButtons.filter(function (btn) {
      var fig = btn.closest('.work');
      return fig && !fig.hidden;
    });
  }

  function openLightbox(index) {
    var list = visibleWorks();
    if (!list.length) return;
    currentIndex = ((index % list.length) + list.length) % list.length;
    var btn = list[currentIndex];
    lastFocused = document.activeElement;
    lightboxImg.src = btn.dataset.full;
    lightboxImg.alt = btn.querySelector('img').alt;
    lightboxTitle.textContent = btn.dataset.title;
    lightboxMeta.textContent = btn.dataset.meta;
    lightbox.hidden = false;
    document.body.classList.add('is-locked');
    lightbox.querySelector('.lightbox-close').focus();
  }

  function closeLightbox() {
    lightbox.hidden = true;
    document.body.classList.remove('is-locked');
    if (lastFocused && lastFocused.focus) lastFocused.focus();
  }

  function stepLightbox(delta) {
    openLightbox(currentIndex + delta);
  }

  workButtons.forEach(function (btn) {
    btn.addEventListener('click', function () {
      openLightbox(visibleWorks().indexOf(btn));
    });
  });
  lightbox.addEventListener('click', function (e) {
    if (e.target.closest('[data-close]')) closeLightbox();
  });
  prevBtn.addEventListener('click', function () { stepLightbox(-1); });
  nextBtn.addEventListener('click', function () { stepLightbox(1); });
  document.addEventListener('keydown', function (e) {
    if (lightbox.hidden) return;
    if (e.key === 'Escape') closeLightbox();
    else if (e.key === 'ArrowLeft') stepLightbox(-1);
    else if (e.key === 'ArrowRight') stepLightbox(1);
    else if (e.key === 'Tab') {
      var focusables = lightbox.querySelectorAll('button');
      var first = focusables[0];
      var last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });

  var form = document.getElementById('booking-form');
  var nameInput = document.getElementById('name');
  var phoneInput = document.getElementById('phone');
  var ideaInput = document.getElementById('idea');
  var ideaCount = document.getElementById('idea-count');
  var consentInput = document.getElementById('consent');
  var submitBtn = document.getElementById('submit-btn');
  var statusEl = document.getElementById('form-status');

  var today = new Date();
  var minDate = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
  dateInput.min = minDate;

  ideaInput.addEventListener('input', function () {
    ideaCount.textContent = String(ideaInput.value.length);
  });

  function digits(value) {
    return (value || '').replace(/\D/g, '');
  }

  function formatPhone(value) {
    var d = digits(value).replace(/^8/, '7');
    if (d.length && d[0] !== '7') d = '7' + d;
    d = d.slice(0, 11);
    var out = '+7';
    if (d.length > 1) out += ' (' + d.slice(1, 4);
    if (d.length >= 4) out += ') ' + d.slice(4, 7);
    if (d.length >= 7) out += '-' + d.slice(7, 9);
    if (d.length >= 9) out += '-' + d.slice(9, 11);
    return out;
  }

  phoneInput.addEventListener('input', function () {
    var pos = phoneInput.selectionStart;
    phoneInput.value = formatPhone(phoneInput.value);
    try { phoneInput.setSelectionRange(pos, pos); } catch (e) {}
  });

  function setError(input, message) {
    var holder = form.querySelector('[data-error-for="' + input.id + '"]');
    if (holder) holder.textContent = message || '';
    if (input.setAttribute) input.setAttribute('aria-invalid', message ? 'true' : 'false');
  }

  function validate() {
    var ok = true;

    var name = nameInput.value.trim();
    if (name.length < 2) {
      setError(nameInput, 'Напишите, как к вам обращаться');
      ok = false;
    } else setError(nameInput, '');

    var phone = digits(phoneInput.value);
    if (phone.length < 11) {
      setError(phoneInput, 'Укажите телефон из 11 цифр');
      ok = false;
    } else setError(phoneInput, '');

    if (dateInput.value && dateInput.value < dateInput.min) {
      setError(dateInput, 'Дата не может быть в прошлом');
      ok = false;
    } else setError(dateInput, '');

    if (!consentInput.checked) {
      setError(consentInput, 'Нужно согласие на обработку данных');
      ok = false;
    } else setError(consentInput, '');

    return ok;
  }

  [nameInput, phoneInput, dateInput].forEach(function (input) {
    input.addEventListener('blur', function () {
      if (input.value) validate();
    });
  });
  consentInput.addEventListener('change', function () {
    setError(consentInput, consentInput.checked ? '' : 'Нужно согласие на обработку данных');
  });

  function serialize() {
    return {
      name: nameInput.value.trim(),
      phone: phoneInput.value.trim(),
      style: document.getElementById('style').value,
      size: document.getElementById('size').value,
      date: dateInput.value || null,
      contact: document.getElementById('contact').value,
      idea: ideaInput.value.trim(),
      consent: consentInput.checked,
      createdAt: new Date().toISOString(),
      page: location.pathname
    };
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    statusEl.className = 'form-status';
    statusEl.textContent = '';

    if (!validate()) {
      statusEl.classList.add('is-err');
      statusEl.textContent = 'Проверьте выделенные поля';
      var firstInvalid = form.querySelector('[aria-invalid="true"]');
      if (firstInvalid) firstInvalid.focus();
      return;
    }

    submitBtn.classList.add('is-loading');
    submitBtn.disabled = true;

    var payload = serialize();

    function finish(message, kind) {
      submitBtn.classList.remove('is-loading');
      submitBtn.disabled = false;
      statusEl.classList.add(kind === 'err' ? 'is-err' : 'is-ok');
      statusEl.textContent = message;
      if (kind !== 'err') {
        form.reset();
        ideaCount.textContent = '0';
      }
    }

    fetch('/api/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(function (res) {
        return res.json().then(function (body) {
          return { status: res.status, body: body };
        });
      })
      .then(function (result) {
        if (result.status >= 200 && result.status < 300) {
          finish('Заявка отправлена. Свяжусь с вами в течение дня — спасибо!', 'ok');
        } else {
          finish(result.body && result.body.error ? result.body.error : 'Не удалось отправить заявку. Попробуйте позже или напишите в Telegram.', 'err');
        }
      })
      .catch(function () {
        finish('Не удалось отправить заявку. Пожалуйста, свяжитесь со студией напрямую.', 'err');
      });
  });
})();
