// Starts the app and switches between screens using the part of the URL after '#'.
const App = (() => {
  const ROUTES = {
    home: { title: 'EduTrack', tab: 'home', show: () => Views.home() },
    students: { title: 'Students', tab: 'students', show: (a, p) => Views.students(p) },
    student: { title: 'Student', tab: 'students', back: true, show: a => Views.student(a) },
    edit: { title: 'Review and correct', tab: 'students', back: true, show: a => DataViews.edit(a) },
    class: { title: 'Class analysis', tab: 'class', show: () => Views.classView() },
    data: { title: 'Data', tab: 'data', show: () => DataViews.data() },
    audit: { title: 'Correction history', tab: 'data', back: true, show: () => DataViews.auditView() },
    model: { title: 'About the model', tab: 'model', show: () => Views.modelView() },
  };

  function render() {
    const [path, query] = (location.hash.slice(2) || 'home').split('?');
    const [name, arg] = path.split('/');
    const route = ROUTES[name] || ROUTES.home;
    Charts.clear();
    UI.$('#title').textContent = route.title;
    UI.$('#back').hidden = !route.back;
    UI.$$('.tabs a').forEach(a => {
      const on = a.dataset.tab === route.tab;
      a.classList.toggle('on', on);
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    route.show(arg && decodeURIComponent(arg), new URLSearchParams(query));
  }

  async function start() {
    try {
      await DB.init();
      await A.loadModel();
      UI.$('#back').onclick = () => history.back();
      addEventListener('hashchange', () => { render(); scrollTo(0, 0); });
      render();
    } catch (e) {
      console.error(e);
      UI.$('#view').innerHTML = `<p class="card error">The app could not start: ${UI.esc(e.message)}</p>`;
    }
  }
  return { start, render };
})();
App.start();
