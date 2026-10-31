/* "More articles" rail for blog article pages. See /css/articles-rail.css. */
(function () {
  var layout = document.querySelector('.blog-layout.has-rail');
  if (!layout || !window.fetch || !window.DOMParser) {
    if (layout) layout.classList.remove('has-rail');
    return;
  }

  var rail = document.createElement('aside');
  rail.className = 'articles-rail';
  rail.setAttribute('aria-labelledby', 'rail-title');
  rail.hidden = true;
  rail.innerHTML =
    '<div class="rail-head">' +
    '<span class="rail-kicker">Keep reading</span>' +
    '<div class="rail-heading"><h2 class="rail-title" id="rail-title">More articles</h2><span class="rail-count"></span></div>' +
    '</div>' +
    '<ul class="rail-list"></ul>' +
    '<a class="rail-all" href="/blog/">Browse all articles <i class="fas fa-arrow-right" aria-hidden="true"></i></a>';
  layout.appendChild(rail);

  var desktop = window.matchMedia('(min-width: 1240px)');
  var started = false;

  function giveUp() {
    rail.remove();
    layout.classList.remove('has-rail');
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function build() {
    if (started) return;
    started = true;

    if (!document.querySelector('link[href*="Fraunces"]')) {
      var fonts = document.createElement('link');
      fonts.rel = 'stylesheet';
      fonts.href = 'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,700&family=JetBrains+Mono:wght@700&display=swap';
      document.head.appendChild(fonts);
    }

    fetch('/components/blog-articles-grid.html')
      .then(function (res) {
        if (!res.ok) throw new Error(res.status);
        return res.text();
      })
      .then(function (html) {
        var doc = new DOMParser().parseFromString(html, 'text/html');
        var list = rail.querySelector('.rail-list');
        var seen = {};
        var count = 0;

        doc.querySelectorAll('a.article-card').forEach(function (card) {
          var href = card.getAttribute('href');
          var img = card.querySelector('img');
          var title = card.querySelector('.article-card-title');
          if (!href || !img || !title) return;
          var path = new URL(href, location.origin).pathname;
          if (path === location.pathname || seen[path]) return;
          seen[path] = true;

          var category = card.querySelector('.article-card-category');
          var time = card.querySelector('.article-card-meta-item');
          var meta = [category && category.textContent.trim(), time && time.textContent.trim()].filter(Boolean).join(' · ');

          var link = el('a', 'rail-item');
          link.href = href;
          var thumb = el('span', 'rail-thumb');
          var image = el('img');
          image.src = img.getAttribute('src');
          image.alt = '';
          image.loading = 'lazy';
          image.decoding = 'async';
          thumb.appendChild(image);
          var text = el('span', 'rail-text');
          if (meta) text.appendChild(el('span', 'rail-meta', meta));
          text.appendChild(el('span', 'rail-name', title.textContent.trim()));
          link.appendChild(thumb);
          link.appendChild(text);
          var item = el('li');
          item.appendChild(link);
          list.appendChild(item);
          count++;
        });

        if (!count) return giveUp();
        rail.querySelector('.rail-count').textContent = count + ' reads';
        rail.hidden = false;
      })
      .catch(giveUp);
  }

  if (desktop.matches) {
    build();
  } else if (desktop.addEventListener) {
    desktop.addEventListener('change', function onChange(e) {
      if (!e.matches) return;
      desktop.removeEventListener('change', onChange);
      build();
    });
  }
})();
