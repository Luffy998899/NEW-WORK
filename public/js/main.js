// Mobile menu
(function () {
  var toggle = document.getElementById('menuToggle');
  var nav = document.getElementById('mainNav');
  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      nav.classList.toggle('open');
    });
  }

  // Mega menu toggle (mobile): tap the Services caret to expand
  document.querySelectorAll('.has-mega .mega-toggle').forEach(function (t) {
    t.addEventListener('click', function (e) {
      if (window.innerWidth <= 900) {
        e.preventDefault();
        t.closest('.has-mega').classList.toggle('open');
      }
    });
  });

  // Accordions
  document.querySelectorAll('.acc-head').forEach(function (head) {
    head.addEventListener('click', function () {
      var item = head.closest('.acc-item');
      var group = head.closest('.accordion');
      if (group) {
        group.querySelectorAll('.acc-item').forEach(function (it) {
          if (it !== item) it.classList.remove('open');
        });
      }
      item.classList.toggle('open');
    });
  });

  // Open first accordion item in each group by default
  document.querySelectorAll('.accordion').forEach(function (group) {
    var first = group.querySelector('.acc-item');
    if (first) first.classList.add('open');
  });
})();
